#!/usr/bin/env python3
"""Проверка сцены урока кадрами в облаке (Hugging Face Jobs, `cpu-upgrade`).

Как работает: код рабочей копии проекта (src + конфиги + все .json из public, ~1–3 МБ) → приватный датасет HF →
одна задача собирает проект Remotion, рендерит отрезок в масштабе 0,5× без звука и стиллы → архив результата в датасет →
скачивание → листы 6×4 кадра, КАЖДЫЕ 0,5 с, с подписью секунды голоса (ffmpeg локально, лёгкая операция).
Во время разработки графики так проверяют каждую сцену, не гоняя тяжёлый рендер на ноутбуке.

  python3 cloud/scene_check_hf.py <проект Remotion> <урок N> <от, с голоса> <до, с голоса> [--stills t1,t2,…] [--tag имя]
  python3 cloud/scene_check_hf.py --sync N [--project remotion]   # медиа урока (всё, кроме .json) → датасет; перед первой проверкой
                                                                  # и после изменения голоса / роликов лица / вырезов в public/lessonN
  python3 cloud/scene_check_hf.py remotion 1 12 24 --stills 12,18 --tag l1_intro --dry-run   # только план, без облака

Время — секунды ГОЛОСА (как в timeline.json): кадр = round((сек + lead/fps) × fps), голос начинается с кадра 15.
Результат: <work>/scene-check/<tag>/sheet_NN.jpg, still_<сек>.png, range.mp4  (work по умолчанию KIT_ROOT/work).
Окружение: HF_TOKEN (или `huggingface-cli login`), HF_DATASET (user/video-render-assets), HF_WORKER_IMAGE
(hf.co/spaces/user/remotion-speed-worker); KIT_ROOT — корень набора.
Стоимость по замерам автора: задача 3–6 мин на cpu-upgrade ($0.03/ч ⇒ $0.0005/мин, минимум 1 минута) ≈ $0.003.
Параллельные вызовы допустимы: коммиты в датасет повторяются при конфликте (409).
"""
import argparse
import io
import os
import random
import shutil
import subprocess
import sys
import tarfile
import time
from pathlib import Path

os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")

HERE = Path(__file__).resolve().parent
KIT_ROOT = Path(os.environ.get("KIT_ROOT") or HERE.parent).resolve()
WORKER = HERE / "scene_check_hf_worker.py"

FONT_CANDIDATES = [  # для подписей времени на листах (drawtext); нет шрифта — листы будут без подписей
    "/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf", "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", "C:/Windows/Fonts/arial.ttf",
]


def retry(fn, tries=8, what=""):
    for i in range(tries):
        try:
            return fn()
        except Exception as e:  # 409 при одновременных коммитах нескольких агентов, сетевые сбои
            if i == tries - 1:
                raise
            d = 2 + random.random() * 4 + i * 3
            print(f"  {what}: {type(e).__name__}: {str(e)[:140]} → повтор через {d:.0f} с", flush=True)
            time.sleep(d)


def code_tar(project: str) -> bytes:
    """src, конфиги и все .json из public (Root импортирует их при сборке) + шрифты и бренд; медиа урока берутся из датасета."""
    def flt(x):
        return None if "/._" in x.name or x.name.endswith(".DS_Store") else x

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as t:
        for n in ("src", "package.json", "tsconfig.json", "remotion.config.ts"):
            if os.path.exists(f"{project}/{n}"):
                t.add(f"{project}/{n}", n, filter=flt)
        pub = os.path.realpath(f"{project}/public")
        for root, _, files in os.walk(pub):
            for f in files:
                if f.endswith(".json") or root.startswith((f"{pub}/fonts", f"{pub}/brand")):
                    t.add(f"{root}/{f}", "public/" + os.path.relpath(f"{root}/{f}", pub), filter=flt)
    return buf.getvalue()


def stage_of(info) -> str:
    st = getattr(getattr(info, "status", None), "stage", "") or ""
    return str(getattr(st, "value", st)).split(".")[-1].upper()  # JobStage.X → X (в Python ≥ 3.11 str() даёт 'JobStage.X')


def find_font(user_font: str | None) -> str | None:
    for f in ([user_font] if user_font else []) + FONT_CANDIDATES:
        if f and os.path.exists(f):
            return f
    return None


def make_sheets(od: str, a_frame: int, fps: int, lead: int, font: str | None) -> None:
    """range.mp4 (0,5×) → листы 6×4: кадр каждые 0,5 с, подпись — секунда голоса (если есть шрифт)."""
    off = a_frame / fps - lead / fps
    base = ["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", f"{od}/range.mp4", "-vf"]
    plain = "fps=2,scale=480:-2,tile=6x4"
    if font:
        ff = font.replace("\\", "/").replace(":", "\\:")
        label = (f"fps=2,scale=480:-2,drawtext=fontfile='{ff}':text='%{{pts\\:flt\\:{off:.2f}}}':x=6:y=6:fontsize=18:"
                 f"fontcolor=yellow:box=1:boxcolor=black@0.7,tile=6x4")
        r = subprocess.run(base + [label, f"{od}/sheet_%02d.jpg"], capture_output=True, text=True)
        if r.returncode == 0:
            return
        print("  подписи времени не получились (drawtext):", r.stderr.strip()[-160:], "→ листы без подписей", flush=True)
    else:
        print("  не найден шрифт для подписей времени (флаг --font) → листы без подписей: "
              f"кадр n в листе = {off:.1f} с + n × 0,5 с голоса", flush=True)
    subprocess.run(base + [plain, f"{od}/sheet_%02d.jpg"], check=True)


def main():
    ap = argparse.ArgumentParser(description="Проверка сцены урока кадрами каждые 0,5 с в облаке (Hugging Face Jobs)",
                                 epilog="Примеры:\n  python3 cloud/scene_check_hf.py --sync 1\n"
                                        "  python3 cloud/scene_check_hf.py remotion 1 12 24 --stills 12,18 --tag l1_intro",
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("wt", nargs="?", help="папка проекта Remotion (рабочая копия), например remotion")
    ap.add_argument("lesson", nargs="?", type=int, help="номер урока")
    ap.add_argument("start", nargs="?", type=float, help="от, секунды голоса")
    ap.add_argument("end", nargs="?", type=float, help="до, секунды голоса (≤ от — только стиллы)")
    ap.add_argument("--stills", default="", help="секунды голоса для стиллов 1920×1080, через запятую")
    ap.add_argument("--tag", default="", help="имя результата (папка <work>/scene-check/<tag>)")
    ap.add_argument("--sync", type=int, metavar="N", help="выгрузить медиа урока N (всё, кроме .json) в датасет")
    ap.add_argument("--project", default=None, help="проект Remotion для --sync (по умолчанию KIT_ROOT/remotion)")
    ap.add_argument("--work", default=str(KIT_ROOT / "work"), help="рабочая папка; результат — <work>/scene-check/<tag>/")
    ap.add_argument("--dataset", default=os.environ.get("HF_DATASET", ""), help="датасет user/video-render-assets (или HF_DATASET)")
    ap.add_argument("--image", default=os.environ.get("HF_WORKER_IMAGE", ""), help="образ воркера hf.co/spaces/user/remotion-speed-worker")
    ap.add_argument("--flavor", default="cpu-upgrade", help="железо задачи (cpu-upgrade)")
    ap.add_argument("--timeout", type=int, default=1500, help="таймаут задачи, с")
    ap.add_argument("--fps", type=int, default=30, help="кадров в секунду композиции")
    ap.add_argument("--lead-frames", type=int, default=15, help="кадров до начала голоса (LEAD в theme.ts)")
    ap.add_argument("--font", default=None, help="файл шрифта .ttf для подписей времени на листах")
    ap.add_argument("--dry-run", action="store_true", help="только план: без токена, без облака, без затрат")
    a = ap.parse_args()
    FPS, LEAD = a.fps, a.lead_frames

    ds = a.dataset.strip()
    image = a.image.strip()
    if image and not image.startswith(("hf.co/", "registry.hf.space/")) and image.count("/") == 1:
        image = f"hf.co/spaces/{image}"

    # ── --sync: медиа урока → датасет
    if a.sync:
        project = Path(a.project or a.wt or KIT_ROOT / "remotion").expanduser().resolve()
        src = os.path.realpath(f"{project}/public/lesson{a.sync}")
        if not os.path.isdir(src):
            sys.exit(f"нет папки {src}")
        n_files = sum(1 for r, _, fs in os.walk(src) for f in fs if not f.endswith(".json"))
        if a.dry_run:
            print(f"[dry-run] --sync {a.sync}: {n_files} файлов медиа из {src} → {ds or '<HF_DATASET не задан>'}:scenecheck/lesson{a.sync}/media")
            return
        need_cloud(ds, image=None)
        from huggingface_hub import HfApi
        api = HfApi(token=need_token())
        t0 = time.time()
        retry(lambda: api.upload_folder(folder_path=src, path_in_repo=f"scenecheck/lesson{a.sync}/media", repo_id=ds, repo_type="dataset",
                                        ignore_patterns=["*.json"], delete_patterns=["*"], commit_message=f"scenecheck media lesson{a.sync}"),
              what="upload media")
        print(f"медиа lesson{a.sync} → {ds}:scenecheck/lesson{a.sync}/media за {time.time() - t0:.0f} с", flush=True)
        return

    if not (a.wt and a.lesson is not None and a.start is not None and a.end is not None):
        ap.error("нужно: <проект> <урок> <от> <до> или --sync N")
    project = str(Path(a.wt).expanduser().resolve())
    if not os.path.isdir(f"{project}/src"):
        sys.exit(f"{project} не похож на проект Remotion (нет папки src)")
    fr = lambda s: int(round((s + LEAD / FPS) * FPS))
    A, B = (fr(a.start), fr(a.end)) if a.end > a.start else (0, 0)
    st = [fr(float(x)) for x in a.stills.split(",") if x.strip()]
    tag = a.tag or f"{os.path.basename(project.rstrip('/'))}_l{a.lesson}_{int(a.start)}"
    od = f"{a.work}/scene-check/{tag}"
    base = f"scenecheck/{tag}"
    code = code_tar(project)

    if a.dry_run:
        print(f"[dry-run] проверка сцены: урок {a.lesson}, голос {a.start:g}–{a.end:g} с → кадры {A}-{B} "
              f"({(B - A + 1) / FPS:.1f} с видео, листов ≈ {max(0, -(-((B - A + 1) // 15) // 24))})" if B > A else
              f"[dry-run] проверка сцены: урок {a.lesson}, только стиллы")
        print(f"[dry-run] стиллы (кадры): {st}; код {len(code) / 1e6:.1f} МБ → {ds or '<HF_DATASET не задан>'}:{base}")
        print(f"[dry-run] образ: {image or '<HF_WORKER_IMAGE не задан>'}, железо {a.flavor}, таймаут {a.timeout} с; результат: {od}")
        print(f"[dry-run] шрифт для подписей: {find_font(a.font) or 'не найден (листы будут без подписей)'}")
        print("[dry-run] облако не вызывалось, $0.00")
        return

    need_cloud(ds, image)
    token = need_token()
    from huggingface_hub import CommitOperationAdd, HfApi, hf_hub_download
    api = HfApi(token=token)
    os.makedirs(od, exist_ok=True)
    for f in os.listdir(od):
        os.remove(f"{od}/{f}")
    t0 = time.time()
    print(f"код {len(code) / 1e6:.1f} МБ → {ds}:{base}", flush=True)
    retry(lambda: api.create_commit(repo_id=ds, repo_type="dataset", commit_message=f"scenecheck {tag}: code + worker",
                                    operations=[CommitOperationAdd(path_in_repo=f"{base}/code.tar.gz", path_or_fileobj=code),
                                                CommitOperationAdd(path_in_repo=f"{base}/worker.py", path_or_fileobj=str(WORKER))]),
          what="upload code")
    wrapper = ("from huggingface_hub import hf_hub_download; import subprocess, sys; "
               f"p = hf_hub_download('{ds}', '{base}/worker.py', repo_type='dataset'); "
               "sys.exit(subprocess.run([sys.executable, p] + sys.argv[1:]).returncode)")
    cmd = ["python3", "-c", wrapper, "--repo", ds, "--base", base, "--lesson", str(a.lesson), "--frames", f"{A}-{B}",
           "--stills", ",".join(map(str, st))]
    job = retry(lambda: api.run_job(image=image, command=cmd, secrets={"HF_TOKEN": token}, flavor=a.flavor, timeout=a.timeout),
                what="run_job")
    print(f"job {job.id} запущен ({a.flavor}), кадры {A}-{B}, стиллы {st}. Жду…", flush=True)
    t1 = time.time()
    stage = ""
    net = 0
    while time.time() - t1 < a.timeout + 180:
        try:
            stage = stage_of(api.inspect_job(job_id=job.id))
            net = 0
        except Exception as e:
            net += 1
            print(f"  inspect: {str(e)[:120]}", flush=True)
            if net >= 6:
                break
            time.sleep(10)
            continue
        if stage in ("COMPLETED", "ERROR", "FAILED", "CANCELED", "CANCELLED", "DELETED"):
            break
        time.sleep(8)
    print(f"job {stage or 'UNKNOWN'} за {time.time() - t1:.0f} с", flush=True)
    if stage != "COMPLETED":
        try:
            logs = list(api.fetch_job_logs(job_id=job.id))
            print("\n".join(logs[-60:]))
        except Exception as e:
            print("логи недоступны:", str(e)[:120])
        sys.exit(1)
    p = retry(lambda: hf_hub_download(ds, f"{base}/out.tar.gz", repo_type="dataset", force_download=True,
                                      local_dir=f"{a.work}/scene-check/.dl_{tag}", token=token), what="download out")
    with tarfile.open(p) as t:
        t.extractall(od)
    shutil.rmtree(f"{a.work}/scene-check/.dl_{tag}", ignore_errors=True)
    if os.path.exists(f"{od}/range.mp4"):
        make_sheets(od, A, FPS, LEAD, find_font(a.font))
    for f in list(os.listdir(od)):
        if f.startswith("still_") and f.endswith(".png") and f[6:-4].isdigit():
            os.rename(f"{od}/{f}", f"{od}/still_{(int(f[6:-4]) / FPS - LEAD / FPS):.1f}.png")
    try:  # уборка: код и результат в датасете больше не нужны
        api.delete_folder(path_in_repo=base, repo_id=ds, repo_type="dataset", commit_message=f"scenecheck {tag}: cleanup")
    except Exception as e:
        print("уборка датасета:", str(e)[:100])
    files = sorted(os.listdir(od))
    print(f"готово за {time.time() - t0:.0f} с → {od}: {' '.join(files)}", flush=True)


def need_token() -> str:
    from huggingface_hub import get_token
    token = get_token()
    if not token:
        sys.exit("нет ключа HF_TOKEN: задайте переменную окружения HF_TOKEN (токен с правом write) или выполните `huggingface-cli login`")
    return token


def need_cloud(ds: str, image: str | None) -> None:
    if not ds:
        sys.exit("не задан датасет: переменная HF_DATASET=user/video-render-assets или флаг --dataset (создаётся cloud/worker/setup_hf.py)")
    if image is not None and not image:
        sys.exit("не задан образ воркера: переменная HF_WORKER_IMAGE=hf.co/spaces/user/remotion-speed-worker или флаг --image")


if __name__ == "__main__":
    main()
