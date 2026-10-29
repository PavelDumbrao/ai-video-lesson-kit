#!/usr/bin/env python3
"""Одноразовая подготовка Hugging Face для облачного рендера (делается один раз на аккаунт):
  1) приватный датасет `<user>/video-render-assets` — хранилище бандлов, кусков и результатов проверки сцен;
  2) приватный Space `<user>/remotion-speed-worker` (SDK Docker) — образ воркера: node 22 + Chromium + ffmpeg + шрифты +
     Remotion из ВАШЕГО remotion/package.json + render_chunk.py. Задачи Jobs берут именно этот образ.

  python3 cloud/worker/setup_hf.py --project remotion --dry-run     # что будет создано и загружено (без токена и сети)
  python3 cloud/worker/setup_hf.py --project remotion               # создать и загрузить, дождаться сборки образа
  python3 cloud/worker/setup_hf.py --project remotion --smoke       # + пробная задача `remotion --version` (≈ $0.0005, 1 минута cpu-upgrade)

Нужен токен Hugging Face с правом write: переменная HF_TOKEN или `huggingface-cli login`. Повторный запуск безопасен
(репозитории уже есть — просто перезальются файлы и пересоберётся образ; пересобирайте при смене версии Remotion).
"""
import argparse
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
KIT_ROOT = Path(os.environ.get("KIT_ROOT") or HERE.parent.parent).resolve()

SPACE_README = """---
title: Remotion Speed Worker
emoji: 🎬
colorFrom: blue
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

Образ воркера параллельного рендера Remotion для Hugging Face Jobs. Сам по себе ничего не рендерит:
задачи берут этот образ и запускают `python3 /app/render_chunk.py` (см. cloud/ набора ai-video-lesson-kit).
"""

FAIL_STAGES = {"BUILD_ERROR", "CONFIG_ERROR", "RUNTIME_ERROR", "NO_APP_FILE"}


def stage_name(x) -> str:
    return str(getattr(x, "value", x)).split(".")[-1].upper()


def main() -> int:
    ap = argparse.ArgumentParser(description="Создать на Hugging Face приватный датасет и Space-образ воркера рендера",
                                 formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__.split("\n\n")[1] if "\n\n" in __doc__ else None)
    ap.add_argument("--project", default=str(KIT_ROOT / "remotion"), help="папка проекта Remotion (откуда берутся package.json и package-lock.json)")
    ap.add_argument("--namespace", default=None, help="пользователь или организация HF (по умолчанию — владелец токена)")
    ap.add_argument("--space-name", default="remotion-speed-worker", help="имя Space (по умолчанию remotion-speed-worker)")
    ap.add_argument("--dataset-name", default="video-render-assets", help="имя датасета (по умолчанию video-render-assets)")
    ap.add_argument("--no-wait", action="store_true", help="не ждать окончания сборки образа")
    ap.add_argument("--wait-timeout", type=int, default=1800, help="сколько ждать сборку, с (по умолчанию 1800)")
    ap.add_argument("--smoke", action="store_true", help="после сборки запустить пробную задачу (платно, ≈ $0.0005)")
    ap.add_argument("--dry-run", action="store_true", help="только показать, что будет сделано")
    a = ap.parse_args()

    project = Path(a.project).expanduser()
    if not project.is_absolute() and not project.exists():
        project = KIT_ROOT / project
    project = project.resolve()
    pkg = project / "package.json"
    lock = project / "package-lock.json"
    errors = []
    if not pkg.is_file():
        errors.append(f"нет {pkg} — нужен проект Remotion (флаг --project)")
    if pkg.is_file() and not lock.is_file():
        print(f"⚠ нет {lock}: образ соберётся через `npm install` (версии могут разойтись с локальными). Лучше сделать `npm install` в проекте.")
    for f in ("Dockerfile", "render_chunk.py", "app.py"):
        if not (HERE / f).is_file():
            errors.append(f"нет {HERE / f}")
    if errors:
        for e in errors:
            print("✗", e)
        return 2

    token = None
    ns = a.namespace
    if not a.dry_run:
        from huggingface_hub import HfApi, get_token
        token = os.environ.get("HF_TOKEN") or get_token()
        if not token:
            print("✗ нет ключа HF_TOKEN: задайте переменную окружения HF_TOKEN (токен с правом write) или выполните `huggingface-cli login`")
            return 2
        api = HfApi(token=token)
        if not ns:
            try:
                ns = api.whoami()["name"]
            except Exception as e:
                print(f"✗ токен не принят Hugging Face ({type(e).__name__}: {str(e)[:120]})")
                return 2
    ns = ns or "<user>"
    dataset_id = f"{ns}/{a.dataset_name}"
    space_id = f"{ns}/{a.space_name}"

    files = {"Dockerfile": HERE / "Dockerfile", "render_chunk.py": HERE / "render_chunk.py", "app.py": HERE / "app.py",
             "package.json": pkg}
    if lock.is_file():
        files["package-lock.json"] = lock
    print(f"датасет (приватный): {dataset_id}")
    print(f"Space   (приватный, SDK Docker): {space_id}")
    print("файлы Space: README.md (служебный) + " + ", ".join(f"{k} ({v.stat().st_size / 1024:.0f} КБ)" for k, v in files.items()))
    if a.dry_run:
        print("dry-run: ничего не создано и не загружено. Уберите --dry-run, чтобы выполнить.")
        return 0

    api.create_repo(dataset_id, repo_type="dataset", private=True, exist_ok=True)
    print(f"✓ датасет {dataset_id} готов")
    api.create_repo(space_id, repo_type="space", space_sdk="docker", private=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="space_stage_") as tmp:
        for name, src in files.items():
            shutil.copy2(src, Path(tmp) / name)
        (Path(tmp) / "README.md").write_text(SPACE_README, encoding="utf-8")
        api.upload_folder(folder_path=tmp, repo_id=space_id, repo_type="space", commit_message="remotion-speed-worker: Dockerfile, worker, package.json")
    print(f"✓ файлы загружены в Space {space_id}: сборка образа запущена (логи: https://huggingface.co/spaces/{space_id})")

    ok = True
    if not a.no_wait:
        t0, last = time.time(), ""
        while time.time() - t0 < a.wait_timeout:
            try:
                st = stage_name(api.get_space_runtime(space_id).stage)
            except Exception as e:
                st = f"? ({type(e).__name__})"
            if st != last:
                print(f"  [{time.time() - t0:5.0f} с] стадия Space: {st}", flush=True)
                last = st
            if st in ("RUNNING", "RUNNING_BUILDING"):
                break
            if st in FAIL_STAGES:
                print(f"✗ сборка не удалась ({st}). Откройте логи сборки: https://huggingface.co/spaces/{space_id}")
                return 1
            time.sleep(15)
        else:
            print(f"⚠ за {a.wait_timeout} с сборка не завершилась — проверьте вкладку Logs Space, затем запускайте рендер")
            ok = False
    if ok and a.smoke:
        print("пробная задача: remotion --version (платно, ≈ $0.0005)…")
        job = api.run_job(image=f"hf.co/spaces/{space_id}", command=["/rt/node_modules/.bin/remotion", "--version"], flavor="cpu-upgrade", timeout=600)
        stage = ""
        for _ in range(80):
            stage = stage_name(api.inspect_job(job_id=job.id).status.stage)
            if stage in ("COMPLETED", "ERROR", "CANCELED", "DELETED"):
                break
            time.sleep(8)
        print("\n".join(list(api.fetch_job_logs(job_id=job.id))[-15:]))
        print(("✓ образ рабочий" if stage == "COMPLETED" else f"✗ задача закончилась стадией {stage}"))
        ok = stage == "COMPLETED"

    print("\nДальше — переменные окружения для рендера (положите в .env, который в .gitignore):")
    print(f"  HF_DATASET={dataset_id}")
    print(f"  HF_WORKER_IMAGE=hf.co/spaces/{space_id}")
    print("  HF_TOKEN=<ваш токен — не печатайте и не коммитьте>")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
