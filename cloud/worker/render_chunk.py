#!/usr/bin/env python3
"""Воркер: рендерит один кусок урока внутри задачи Hugging Face Jobs (образ Space `remotion-speed-worker`).

Лежит в образе как /app/render_chunk.py; оркестратор (`cloud/hf_render.py`) запускает его командой
  python3 /app/render_chunk.py --comp Lesson1 --bundle bundles/bundle_l1.tar.gz --frames 0-328 \
      --scale 1.3333333333333333 --concurrency 4 --out chunk_000_0_328.mp4 --upload-prefix renders/<run_id> --repo user/video-render-assets

Этапы: 1) скачать бандл из датасета → 2) распаковать → 3) `remotion render --frames=a-b --muted` → 4) загрузить кусок в датасет
(с повтором и случайной паузой: десятки воркеров коммитят одновременно, возможен конфликт 409).
Токен — переменная окружения HF_TOKEN (секрет задачи). Печатает BENCHMARK_RESULT_JSON — оркестратор читает его из логов.
"""
import argparse
import json
import os
import random
import shutil
import subprocess
import sys
import time

from huggingface_hub import HfApi, hf_hub_download

COST_PER_HOUR = 0.03  # cpu-upgrade, $/час (официальная цена Spaces/Jobs «CPU Upgrade: $0.03 per hour»)


def parse_args(args=None):
    p = argparse.ArgumentParser(description="Remotion worker: render one chunk of a lesson and upload it to a HF dataset")
    p.add_argument("--repo", default=os.environ.get("HF_DATASET", ""), help="датасет с ассетами (user/video-render-assets); по умолчанию $HF_DATASET")
    p.add_argument("--bundle", default="bundles/bundle.tar.gz", help="путь tar.gz-бандла внутри датасета")
    p.add_argument("--comp", required=True, help="ID композиции Remotion, например Lesson1")
    p.add_argument("--frames", default="0-450", help="диапазон кадров a-b (включительно)")
    p.add_argument("--scale", default="1.3333333333333333", help="масштаб вывода: 1920×1080 → 2560×1440 = 1.3333333333333333")
    p.add_argument("--concurrency", default="4", help="число вкладок Chromium (4 — оптимум для 8 vCPU)")
    p.add_argument("--out", default="chunk.mp4", help="имя mp4-куска")
    p.add_argument("--upload-prefix", default="renders", help="папка в датасете для результата")
    p.add_argument("--run-id", default=None, help="не используется (совместимость)")
    return p.parse_args(args)


def find_bundle_dir(root: str) -> str:
    if os.path.exists(os.path.join(root, "index.html")):
        return root
    for cur, _dirs, files in os.walk(root):
        if "index.html" in files and "bundle.js" in files:
            return cur
    raise FileNotFoundError(f"в распакованном бандле нет index.html ({root})")


def main():
    t_start = time.time()
    args = parse_args()
    if not args.repo:
        sys.exit("нет датасета: передайте --repo или переменную HF_DATASET")
    token = os.environ.get("HF_TOKEN") or None
    api = HfApi(token=token)

    work_dir = "/tmp/render_work"
    bundle_root = os.path.join(work_dir, "bundle")
    shutil.rmtree(bundle_root, ignore_errors=True)
    os.makedirs(bundle_root, exist_ok=True)
    out_mp4 = os.path.join(work_dir, args.out)

    # 1) бандл
    print(f"[1/4] скачиваю {args.bundle} из {args.repo}…", flush=True)
    t0 = time.time()
    archive_path = hf_hub_download(repo_id=args.repo, repo_type="dataset", filename=args.bundle, local_dir=work_dir, token=token)
    t_dl = round(time.time() - t0, 2)
    dl_mb = round(os.path.getsize(archive_path) / (1024 * 1024), 2)
    print(f"скачано {dl_mb} МБ за {t_dl} с", flush=True)

    # 2) распаковка в отдельную папку (архив плоский: index.html в корне)
    print("[2/4] распаковываю…", flush=True)
    t0 = time.time()
    subprocess.run(["tar", "-xzf", archive_path, "-C", bundle_root], check=True)
    bundle_dir = find_bundle_dir(bundle_root)
    t_unpack = round(time.time() - t0, 2)
    print(f"распаковано за {t_unpack} с: {bundle_dir}", flush=True)

    # 3) рендер куска без звука (звук склеивается на хосте)
    remotion_bin = "/rt/node_modules/.bin/remotion"
    a, b = (int(x) for x in args.frames.split("-"))
    total_frames = b - a + 1
    print(f"[3/4] рендер кадров {args.frames} композиции '{args.comp}' (scale={args.scale}, concurrency={args.concurrency})…", flush=True)
    t0 = time.time()
    cmd = [
        remotion_bin, "render", bundle_dir, args.comp, out_mp4,
        f"--frames={args.frames}",
        f"--scale={args.scale}",
        f"--concurrency={args.concurrency}",
        "--chromium-options=--no-sandbox --disable-dev-shm-usage",
        "--muted",
        "--log=info",
    ]
    proc = subprocess.run(cmd, cwd="/rt", capture_output=True, text=True)
    t_render = round(time.time() - t0, 2)
    if proc.returncode != 0:
        print("REMOTION RENDER FAILED!", flush=True)
        print("STDOUT:", proc.stdout[-2500:], flush=True)
        print("STDERR:", proc.stderr[-2500:], flush=True)
        sys.exit(proc.returncode)
    fps = round(total_frames / max(t_render, 0.01), 2)
    out_size_mb = round(os.path.getsize(out_mp4) / (1024 * 1024), 2)
    print(f"отрендерено {total_frames} кадров ({out_size_mb} МБ) за {t_render} с → {fps} кадр/с", flush=True)

    # 4) загрузка куска с повтором (конфликт коммитов 409 при одновременном финише воркеров)
    dest_path = f"{args.upload_prefix}/{args.out}"
    print(f"[4/4] загружаю {args.out} → {args.repo}:{dest_path}…", flush=True)
    t0 = time.time()
    max_retries = 8
    for attempt in range(max_retries):
        try:
            api.upload_file(path_or_fileobj=out_mp4, path_in_repo=dest_path, repo_id=args.repo, repo_type="dataset", token=token)
            break
        except Exception as e:
            if attempt == max_retries - 1:
                print(f"CRITICAL: не удалось загрузить за {max_retries} попыток: {e}", flush=True)
                raise
            sleep_time = (2 ** attempt) * 0.5 + random.uniform(1.0, 3.0)
            print(f"загрузка, попытка {attempt + 1} не удалась ({e}); повтор через {round(sleep_time, 2)} с…", flush=True)
            time.sleep(sleep_time)
    t_upload = round(time.time() - t0, 2)
    print(f"загружено за {t_upload} с", flush=True)

    t_total = round(time.time() - t_start, 2)
    result = {
        "status": "SUCCESS",
        "comp": args.comp,
        "frames": args.frames,
        "total_frames": total_frames,
        "scale": args.scale,
        "concurrency": int(args.concurrency),
        "download_sec": t_dl,
        "unpack_sec": t_unpack,
        "render_sec": t_render,
        "fps": fps,
        "upload_sec": t_upload,
        "total_wall_sec": t_total,
        "out_size_mb": out_size_mb,
        "cost_usd": round((t_total / 3600.0) * COST_PER_HOUR, 5),
    }
    print("\n=== BENCHMARK_RESULT_JSON ===")
    print(json.dumps(result, indent=2))
    print("============================\n")


if __name__ == "__main__":
    main()
