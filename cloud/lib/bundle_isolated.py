#!/usr/bin/env python3
"""Изолированный бандл Remotion для облачного рендера.

Проблема: `npx remotion bundle` по умолчанию кладёт в бандл ВСЮ папку `public/` — со всеми уроками
(видео, голос, вырезы). За десяток уроков это гигабайты, и выгрузка убивает смысл параллельного рендера.

Решение (так сделано у автора, бандл 45–55 МБ вместо 6,8 ГБ):
  1. Во временной папке собирается свой `public_l<N>`.
  2. Папка текущего урока `public/lesson<N>` и все «глобальные» папки (`fonts/`, `brand/`, …) подключаются
     жёсткими ссылками (мгновенно, без копии на диск; если ссылки нельзя — обычная копия).
  3. Папки остальных уроков (`lesson1…`) воссоздаются, но копируются ТОЛЬКО `.json` (раскадровка, таймлайн —
     `Root.tsx` импортирует их при сборке); видео и звук чужих уроков не попадают.
  4. `npx remotion bundle src/index.ts --out-dir=… --public-dir=…` → компактный бандл.
  5. Бандл упаковывается в `tar.gz` (плоский: `index.html` в корне архива) и, по флагу, уходит в датасет HF.

Работает на macOS, Linux и Windows (без `cp -al`, `tar` и `fcntl` как обязательных зависимостей).
Запуск напрямую (обычно вызывается из `cloud/hf_render.py`):
  python3 cloud/lib/bundle_isolated.py --project remotion --lesson 1 [--upload --dataset user/video-render-assets]
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
import tarfile
import time
from pathlib import Path

try:  # блокировка от параллельной сборки одного урока; на Windows модуля нет — тогда без блокировки
    import fcntl  # type: ignore
except ImportError:  # pragma: no cover
    fcntl = None

JUNK_NAMES = {".DS_Store", "Thumbs.db"}


def log(msg: str):
    print(f"[{time.strftime('%H:%M:%S')}] [bundle] {msg}", flush=True)


def _is_junk(name: str) -> bool:
    return name in JUNK_NAMES or name.startswith("._")  # ._* — «ресурсные вилки» macOS


def link_tree(src: str, dst: str) -> None:
    """Копия дерева жёсткими ссылками; если ссылка невозможна (другой диск, права) — обычная копия файла."""
    if os.path.isfile(src):
        _link_file(src, dst)
        return
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if not _is_junk(d)]
        rel = os.path.relpath(root, src)
        out_dir = dst if rel == "." else os.path.join(dst, rel)
        os.makedirs(out_dir, exist_ok=True)
        for f in files:
            if not _is_junk(f):
                _link_file(os.path.join(root, f), os.path.join(out_dir, f))


def _link_file(src: str, dst: str) -> None:
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    try:
        os.link(src, dst)
    except OSError:
        shutil.copy2(src, dst)


def copy_json_only(src: str, dst: str) -> int:
    """Из чужой папки урока переносит только .json (с сохранением вложенных папок)."""
    n = 0
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if not _is_junk(d)]
        for f in files:
            if f.endswith(".json") and not _is_junk(f):
                rel = os.path.relpath(os.path.join(root, f), src)
                target = os.path.join(dst, rel)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                shutil.copy2(os.path.join(root, f), target)
                n += 1
    return n


def stage_public(public_src: str, staging_pub: str, lesson: int) -> None:
    """Собирает изолированный public: свой урок + глобальные папки целиком, чужие уроки — только json."""
    target = f"lesson{lesson}"
    for name in sorted(os.listdir(public_src)):
        if _is_junk(name):
            continue
        src_item = os.path.realpath(os.path.join(public_src, name))
        dst_item = os.path.join(staging_pub, name)
        if name == target or not re.fullmatch(r"lesson\d+", name):
            link_tree(src_item, dst_item)
        elif os.path.isdir(src_item):
            os.makedirs(dst_item, exist_ok=True)
            copy_json_only(src_item, dst_item)


def verify_staging_integrity(staging_pub: str, lesson: int) -> None:
    """Дешёвая проверка до долгой сборки: раскадровка урока на месте."""
    required = [f"lesson{lesson}/storyboard.json"]
    missing = [r for r in required if not os.path.exists(os.path.join(staging_pub, r))]
    if missing:
        raise FileNotFoundError(
            f"В изолированном public нет файлов: {missing}. Проверьте, что public/lesson{lesson}/ содержит раскадровку и таймлайн."
        )
    log(f"проверка пройдена: данные урока {lesson} на месте")


def _npx() -> str:
    exe = shutil.which("npx")
    if not exe:
        raise RuntimeError("не найден npx (нужен Node.js ≥ 20): поставьте Node и выполните `npm install` в папке проекта Remotion")
    return exe


def _tar_flat(src_dir: str, out_tar: str) -> None:
    """tar.gz без верхней папки: index.html лежит в корне архива (воркер распаковывает в свою папку)."""
    def flt(ti: tarfile.TarInfo):
        return None if _is_junk(os.path.basename(ti.name)) else ti

    with tarfile.open(out_tar, "w:gz") as tf:
        for name in sorted(os.listdir(src_dir)):
            tf.add(os.path.join(src_dir, name), arcname=name, filter=flt)


def build_isolated_bundle(lesson: int, project: str, work_dir: str, out_tar: str | None,
                          entry: str = "src/index.ts", max_mb: float = 150.0) -> str:
    """Собирает бандл. Возвращает путь к tar.gz; если out_tar=None — архив не делается, возвращается папка бандла
    (<work_dir>/bundle_l<N>; так её берёт cloud/modal_render.py)."""
    project = os.path.abspath(project)
    public_src = os.path.join(project, "public")
    if not os.path.isdir(public_src):
        raise FileNotFoundError(f"Нет папки public у проекта Remotion: {public_src}")
    if not os.path.isfile(os.path.join(project, entry)):
        raise FileNotFoundError(f"Нет входного файла Remotion: {os.path.join(project, entry)}")

    work_dir = os.path.abspath(work_dir)
    os.makedirs(work_dir, exist_ok=True)
    lock_path = os.path.join(work_dir, f".bundle_lock_l{lesson}")
    with open(lock_path, "w") as lock_file:
        if fcntl is not None:
            try:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise RuntimeError(f"Бандл урока {lesson} уже собирается другим процессом")
        try:
            staging_pub = os.path.join(work_dir, f"public_l{lesson}")
            staging_bundle = os.path.join(work_dir, f"bundle_l{lesson}")
            for d in (staging_pub, staging_bundle):
                shutil.rmtree(d, ignore_errors=True)
            os.makedirs(staging_pub, exist_ok=True)

            log(f"изолированный public для урока {lesson}…")
            stage_public(public_src, staging_pub, lesson)
            verify_staging_integrity(staging_pub, lesson)

            log("remotion bundle (webpack) — может занять 0,5–2 минуты…")
            cmd = [_npx(), "remotion", "bundle", entry, f"--out-dir={staging_bundle}",
                   f"--public-dir={staging_pub}", "--log=error"]
            log("CMD: " + " ".join(cmd))
            subprocess.run(cmd, cwd=project, check=True)

            if out_tar is None:
                log(f"бандл собран (без архива): {staging_bundle}")
                return staging_bundle
            os.makedirs(os.path.dirname(os.path.abspath(out_tar)), exist_ok=True)
            log(f"архив {out_tar}…")
            _tar_flat(staging_bundle, out_tar)
            size_mb = os.path.getsize(out_tar) / (1024 * 1024)
            log(f"бандл готов: {out_tar} ({size_mb:.1f} МБ)")
            if size_mb > max_mb:
                raise ValueError(
                    f"Бандл {size_mb:.0f} МБ больше порога {max_mb:.0f} МБ. Возможно, в public/lesson{lesson} лежит лишнее "
                    f"(черновики видео, дубли). Уберите лишнее или поднимите порог флагом --max-bundle-mb."
                )
            return out_tar
        finally:
            if fcntl is not None:
                try:
                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
                except Exception:
                    pass
    # (файл блокировки остаётся в рабочей папке — это безвредно)


def upload_bundle(tar_path: str, dataset_repo: str, remote_path: str, token: str | None = None) -> str:
    """Выгружает бандл в приватный датасет HF (с повтором при конфликте коммитов / сбое сети)."""
    import random
    from huggingface_hub import HfApi

    api = HfApi(token=token or os.environ.get("HF_TOKEN") or None)
    size_mb = os.path.getsize(tar_path) / (1024 * 1024)
    log(f"выгрузка {size_mb:.1f} МБ → датасет {dataset_repo}:{remote_path}…")
    t0 = time.time()
    for attempt in range(6):
        try:
            api.upload_file(path_or_fileobj=tar_path, path_in_repo=remote_path, repo_id=dataset_repo, repo_type="dataset",
                            commit_message=f"bundle {os.path.basename(remote_path)}")
            break
        except Exception as e:
            if attempt == 5:
                raise
            delay = 2 + random.random() * 3 + attempt * 3
            log(f"  выгрузка не удалась ({type(e).__name__}: {str(e)[:120]}) → повтор через {delay:.0f} с")
            time.sleep(delay)
    log(f"выгружено за {time.time() - t0:.1f} с")
    return remote_path


def main() -> None:
    kit_root = Path(os.environ.get("KIT_ROOT") or Path(__file__).resolve().parents[2])
    ap = argparse.ArgumentParser(description="Изолированный бандл Remotion для облачного рендера")
    ap.add_argument("--project", default=str(kit_root / "remotion"), help="папка проекта Remotion (по умолчанию KIT_ROOT/remotion)")
    ap.add_argument("--lesson", type=int, required=True, help="номер урока")
    ap.add_argument("--work-dir", default=str(kit_root / "work" / "bundle"), help="рабочая папка сборки")
    ap.add_argument("--out-tar", default=None, help="куда положить tar.gz (по умолчанию <work-dir>/bundle_l<N>.tar.gz)")
    ap.add_argument("--entry", default="src/index.ts", help="входной файл Remotion")
    ap.add_argument("--max-bundle-mb", type=float, default=150.0, help="порог размера бандла (защита от раздувания)")
    ap.add_argument("--upload", action="store_true", help="выгрузить в датасет HF (нужны HF_TOKEN и --dataset/HF_DATASET)")
    ap.add_argument("--dataset", default=os.environ.get("HF_DATASET", ""), help="датасет user/video-render-assets")
    args = ap.parse_args()

    out_tar = args.out_tar or os.path.join(args.work_dir, f"bundle_l{args.lesson}.tar.gz")
    t0 = time.time()
    build_isolated_bundle(args.lesson, args.project, args.work_dir, out_tar, entry=args.entry, max_mb=args.max_bundle_mb)
    if args.upload:
        if not args.dataset:
            sys.exit("нет датасета: задайте HF_DATASET=user/video-render-assets или --dataset")
        upload_bundle(out_tar, args.dataset, f"bundles/bundle_l{args.lesson}.tar.gz")
    log(f"готово за {time.time() - t0:.1f} с")


if __name__ == "__main__":
    main()
