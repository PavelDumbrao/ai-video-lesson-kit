#!/usr/bin/env python3
"""Параллельный рендер урока Remotion на Hugging Face Jobs (основной путь набора).

Что делает (вся «тяжёлая» логика — в cloud/lib/orchestrator.py и cloud/lib/bundle_isolated.py):
  1. считает число кадров урока (из public/lessonN/timeline.json или --frames) и нарезает на равные куски (fixed-chunks);
  2. собирает изолированный бандл (только нужный урок, 45–55 МБ по замерам автора) и выгружает в приватный датасет HF;
  3. запускает по задаче `cpu-upgrade` на кусок (по умолчанию 72), следит за бюджетом, ведёт ledger (resume после обрыва);
  4. скачивает куски, склеивает `ffmpeg -c copy`, накладывает звук со сдвигом --audio-offset-ms (голос начинается с кадра 15),
     проверяет мастер (число кадров, кодеки).

Без --live работает только план (dry-run): ничего не собирается, не выгружается, не запускается и не стоит денег.

Примеры:
  python3 cloud/hf_render.py --project remotion --lesson 1 --comp Lesson1 --audio public/lesson1/voice.wav \\
      --workers 72 --out out/lesson1_2k.mp4 --budget 0.50 --dry-run
  python3 cloud/hf_render.py --project remotion --lesson 1 --comp Lesson1 --audio public/lesson1/voice.wav \\
      --workers 72 --out out/lesson1_2k.mp4 --budget 0.50 --live
  # обрыв связи / упавший кусок — доделать только недостающее:
  python3 cloud/hf_render.py <те же аргументы> --resume work/hf_render/runs/<run_id>/ledger.json --live

Окружение: HF_TOKEN (токен с правом write; либо `huggingface-cli login`), HF_DATASET (user/video-render-assets),
HF_WORKER_IMAGE (hf.co/spaces/user/remotion-speed-worker). KIT_ROOT — корень набора (иначе вычисляется от файла).
"""
import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
KIT_ROOT = Path(os.environ.get("KIT_ROOT") or HERE.parent).resolve()
sys.path.insert(0, str(HERE / "lib"))

FPS_DEFAULT = 30
LEAD_FRAMES_DEFAULT = 15      # голос начинается с кадра 15 (0,5 с) — LEAD в remotion/src/theme.ts
TAIL_SEC_DEFAULT = 3.0        # финальная карточка после голоса — TAIL в remotion/src/theme.ts
SCALE_2K = "1.3333333333333333"  # 1920×1080 → 2560×1440; «1.3333» даёт нецелую высоту и падение
AUTHOR_COST_PER_FRAME = 0.1315 / 23715  # замер автора: ≈$0.13 за 23 715 кадров, 72 воркера (оценка, не гарантия)
PESSIMISTIC_FPS = 1.5         # наша консервативная скорость воркера для таймаута (у автора 1,94–5,69 кадр/с)
OVERHEAD_SEC = 180            # скачивание бандла, распаковка, старт Chromium, выгрузка (запас)


# ───────────────────────────── утилиты ─────────────────────────────

def say(msg: str = "") -> None:
    print(msg, flush=True)


def find_path(p: str, bases: list[Path]) -> Path:
    """Абсолютный путь — как есть; относительный — первый существующий среди bases, иначе относительно первого."""
    pp = Path(p).expanduser()
    if pp.is_absolute():
        return pp
    for b in bases:
        if (b / pp).exists():
            return (b / pp).resolve()
    return (bases[0] / pp).resolve()


def get_token() -> str | None:
    t = os.environ.get("HF_TOKEN")
    if t and t.strip():
        return t.strip()
    try:
        from huggingface_hub import get_token as _gt
        return _gt()
    except Exception:
        return None


def normalize_image(image: str) -> str:
    """user/name → hf.co/spaces/user/name (принимаем оба вида)."""
    image = (image or "").strip()
    if image and not image.startswith(("hf.co/", "registry.hf.space/", "docker.io/")) and image.count("/") == 1:
        return f"hf.co/spaces/{image}"
    return image


def space_id_of(image: str) -> str | None:
    m = re.match(r"^hf\.co/spaces/([^/]+/[^/]+)$", image or "")
    return m.group(1) if m else None


def wav_duration(path: Path) -> float | None:
    try:
        with wave.open(str(path), "rb") as w:
            return w.getnframes() / float(w.getframerate())
    except Exception:
        return None  # не wav (например mp3) или нестандартный wav — длительность не проверяем


def lesson_frames(duration: float, fps: int, lead: int, tail: float) -> int:
    """Та же формула, что lessonFrames() в remotion/src/theme.ts: ceil((duration + LEAD/FPS + TAIL) * FPS)."""
    return int(math.ceil((duration + lead / fps + tail) * fps))


def parse_comp_frames(output: str, comp: str) -> int | None:
    """Достаёт длительность композиции (кадры) из вывода `remotion compositions`; None, если формат не распознан."""
    m = re.search(rf"^\s*{re.escape(comp)}\s+[\d.]+\s+\d+x\d+\s+(\d+)\s*\(", output, re.M)
    return int(m.group(1)) if m else None


# ───────────────────────────── план ─────────────────────────────

class Plan:
    pass


def apply_chunks_and_money(p: Plan, a: argparse.Namespace) -> str | None:
    """Нарезка на куски, таймаут задачи, пиковый резерв бюджета, оценка цены. Возвращает текст ошибки, если резерв > бюджета."""
    p.workers = max(1, min(a.workers, p.frames)) if p.frames > 0 else a.workers
    p.chunks = []
    if p.frames > 0:
        from orchestrator import FixedChunkScheduler
        p.chunks = FixedChunkScheduler.generate(p.frames, p.workers)
    max_chunk = max((c["frames_count"] for c in p.chunks), default=0)
    auto_timeout = int(min(3600, max(300, math.ceil((max_chunk / PESSIMISTIC_FPS + OVERHEAD_SEC) / 60) * 60))) if max_chunk else 600
    p.timeout = a.job_timeout or auto_timeout
    p.timeout_auto = a.job_timeout is None
    p.reserve_each = max(1, math.ceil(p.timeout / 60)) * 0.0005
    p.reserve_peak = p.reserve_each * p.workers
    p.cost_estimate = p.frames * AUTHOR_COST_PER_FRAME
    if p.workers and p.reserve_peak > p.budget:
        return (f"бюджет ${p.budget:.2f} меньше пикового резерва ${p.reserve_peak:.3f} "
                f"({p.workers} задач × {math.ceil(p.timeout / 60)} мин × $0.0005/мин). "
                "Поднимите --budget или уменьшите --job-timeout / число воркеров.")
    return None


def build_plan(a: argparse.Namespace) -> tuple[Plan, list[str], list[str]]:
    """Собирает план без обращения к сети и внешним программам. Возвращает (plan, errors, warnings)."""
    errors: list[str] = []
    warns: list[str] = []
    p = Plan()
    p.lesson = a.lesson
    p.comp = a.comp or f"Lesson{a.lesson}"
    p.project = find_path(a.project, [Path.cwd(), KIT_ROOT])
    p.public = p.project / "public" / f"lesson{a.lesson}"
    p.fps, p.lead, p.tail = a.fps, a.lead_frames, a.tail_sec
    p.scale = a.scale
    p.provider = a.provider

    # проект Remotion
    if not p.project.is_dir():
        errors.append(f"нет папки проекта Remotion: {p.project} (флаг --project)")
    elif not (p.project / a.entry).is_file():
        errors.append(f"нет входного файла Remotion: {p.project / a.entry}")
    if p.project.is_dir() and not (p.public / "storyboard.json").is_file():
        errors.append(f"нет {p.public / 'storyboard.json'} — без раскадровки бандл не соберётся")

    # звук
    audio_bases = [Path.cwd(), p.project, KIT_ROOT]
    p.audio = find_path(a.audio, audio_bases) if a.audio else p.public / "voice.wav"
    p.audio_dur = None
    if not p.audio.is_file():
        tried = "" if not a.audio or Path(a.audio).is_absolute() else " (искал в: " + ", ".join(str(b / a.audio) for b in audio_bases) + ")"
        errors.append(f"нет файла голоса: {p.audio}{tried} — флаг --audio; без голоса мастер получится без звука")
    elif p.audio.stat().st_size == 0:
        errors.append(f"файл голоса пустой: {p.audio}")
    else:
        p.audio_dur = wav_duration(p.audio)

    # число кадров
    tl_path = p.public / "timeline.json"
    p.timeline_duration = None
    p.frames_explicit = a.frames is not None
    if a.frames is not None:
        p.frames = a.frames
        p.frames_source = "флаг --frames"
    elif tl_path.is_file():
        try:
            tl = json.loads(tl_path.read_text(encoding="utf-8"))
            p.timeline_duration = float(tl["duration"])
            if tl.get("fps") and int(tl["fps"]) != a.fps:
                warns.append(f"в timeline.json fps={tl['fps']}, а расчёт идёт по --fps {a.fps}")
            p.frames = lesson_frames(p.timeline_duration, a.fps, a.lead_frames, a.tail_sec)
            p.frames_source = (f"timeline.json: ceil(({p.timeline_duration:g} + {a.lead_frames}/{a.fps} + {a.tail_sec:g}) × {a.fps}), "
                               "как lessonFrames() в theme.ts")
        except Exception as e:
            p.frames = 0
            p.frames_source = ""
            errors.append(f"не удалось прочитать длительность из {tl_path}: {e} (укажите --frames)")
    else:
        p.frames = 0
        p.frames_source = ""
        errors.append(f"нет {tl_path} и не задан --frames — число кадров неизвестно")
    if p.audio_dur is not None and p.timeline_duration is not None and abs(p.audio_dur - p.timeline_duration) > 0.5:
        warns.append(f"длительность голоса ({p.audio_dur:.1f} с) расходится с timeline.json ({p.timeline_duration:.1f} с) — "
                     "голос переозвучен после сборки таймлайна?")

    # нарезка и деньги
    p.budget = a.budget
    err = apply_chunks_and_money(p, a)
    if err:
        errors.append(err)

    # облако
    p.dataset = (a.dataset or "").strip()
    p.image = normalize_image(a.image)
    p.flavor = a.flavor
    p.bundle_remote = f"bundles/bundle_l{a.lesson}.tar.gz"
    p.work = find_path(a.work, [Path.cwd()]) if a.work else (KIT_ROOT / "work" / "hf_render")
    p.out = find_path(a.out, [Path.cwd()]) if a.out else (KIT_ROOT / "out" / f"lesson{a.lesson}_2k.mp4")
    p.offset_ms = a.audio_offset_ms if a.audio_offset_ms is not None else int(round(a.lead_frames * 1000 / a.fps))
    p.concurrency, p.retries, p.entry = a.concurrency, a.retries, a.entry
    return p, errors, warns


def environment_checks(p: Plan, live: bool, need_build: bool = True) -> tuple[list[str], list[str]]:
    """Проверки окружения: в dry-run это предупреждения, в --live — ошибки. need_build=False — бандл не собираем (resume / skip-bundle)."""
    problems: list[str] = []
    if p.provider != "mock":
        if not get_token():
            problems.append("нет ключа HF_TOKEN (токен Hugging Face с правом write; переменная окружения или `huggingface-cli login`)")
        if not p.dataset:
            problems.append("не задан датасет: переменная HF_DATASET=user/video-render-assets или флаг --dataset")
        if not p.image:
            problems.append("не задан образ воркера: переменная HF_WORKER_IMAGE=hf.co/spaces/user/remotion-speed-worker или флаг --image")
        elif not space_id_of(p.image):
            problems.append(f"образ должен иметь вид hf.co/spaces/user/name, получено: {p.image}")
        if need_build and not p.project.joinpath("node_modules").is_dir():
            problems.append(f"в {p.project} нет node_modules — выполните `cd {p.project} && npm install` (нужно для сборки бандла)")
        if need_build and not shutil.which("npx"):
            problems.append("не найден npx — установите Node.js ≥ 20")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        problems.append("не найдены ffmpeg/ffprobe в PATH (нужны для склейки и звука)")
    return (problems, []) if live else ([], problems)


def print_plan(p: Plan, errors: list[str], warns: list[str], live: bool) -> None:
    sizes = [c["frames_count"] for c in p.chunks]
    say("═" * 72)
    say(f"План рендера: урок {p.lesson}, композиция {p.comp}, режим {'БОЕВОЙ (--live)' if live else 'dry-run (ничего не запускается)'}")
    say("═" * 72)
    say(f"проект Remotion : {p.project}")
    say(f"голос           : {p.audio}" + (f" ({p.audio_dur:.1f} с)" if p.audio_dur else ""))
    if p.frames:
        say(f"кадров          : {p.frames} ({p.frames / p.fps:.1f} с при {p.fps} fps) ← {p.frames_source}")
        say(f"нарезка         : fixed-chunks, {len(p.chunks)} кусков по {min(sizes)}–{max(sizes)} кадров "
            f"(первый 0–{p.chunks[0]['end']}, последний {p.chunks[-1]['start']}–{p.chunks[-1]['end']})")
    say(f"вывод           : масштаб {p.scale} (2560×1440 из 1920×1080), --concurrency {p.concurrency}")
    say(f"железо          : {p.flavor}, таймаут задачи {p.timeout} с" + (" (подобран по размеру куска)" if p.timeout_auto else ""))
    say(f"датасет         : {p.dataset or '— не задан —'}")
    say(f"образ воркера   : {p.image or '— не задан —'}")
    say(f"бандл в датасете: {p.bundle_remote}")
    say(f"звук            : сдвиг {p.offset_ms} мс (adelay), AAC 192k")
    say(f"результат       : {p.out}")
    say(f"рабочая папка   : {p.work}")
    say("деньги          : $0.03/ч за задачу cpu-upgrade, минимум 1 минута на задачу;")
    say(f"                  оценка по замерам автора ≈ ${p.cost_estimate:.2f} (линейно от $0.13 за 23 715 кадров при 72 воркерах; на своём ролике проверить)")
    say(f"                  предохранитель --budget ${p.budget:.2f}; пиковый резерв ${p.reserve_peak:.3f} "
        f"({p.workers} × {math.ceil(p.timeout / 60)} мин × $0.0005) — это программный лимит оркестратора, не лимит биллинга HF")
    for w in warns:
        say(f"⚠  {w}")
    for e in errors:
        say(f"✗  {e}")
    say("")


# ───────────────────────────── боевой запуск ─────────────────────────────

def write_config(p: Plan, cfg: dict) -> Path:
    p.work.mkdir(parents=True, exist_ok=True)
    try:
        import yaml
        path = p.work / f"lesson{p.lesson}_config.yaml"
        path.write_text(yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False), encoding="utf-8")
    except ImportError:
        path = p.work / f"lesson{p.lesson}_config.json"
        path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def check_composition_frames(p: Plan, bundle_dir: Path) -> int | None:
    """Спрашивает у собранного бандла реальную длительность композиции (`remotion compositions`)."""
    try:
        r = subprocess.run([shutil.which("npx") or "npx", "remotion", "compositions", str(bundle_dir)],
                           cwd=p.project, capture_output=True, text=True, timeout=180)
        return parse_comp_frames(r.stdout + "\n" + r.stderr, p.comp)
    except Exception:
        return None


def run_live(a: argparse.Namespace, p: Plan) -> int:
    from orchestrator import (HuggingFaceJobsProvider, MockComputeProvider, OrchestratorConfig, OrchestratorError,
                              ProductionOrchestrator)
    mock = p.provider == "mock"
    token = None if mock else get_token()
    resume = a.resume and Path(a.resume).expanduser().resolve()
    if a.resume and not resume.is_file():
        say(f"✗ нет ledger для --resume: {a.resume}")
        return 2

    if not mock:
        from huggingface_hub import HfApi
        api = HfApi(token=token)
        try:
            if not api.repo_exists(p.dataset, repo_type="dataset"):
                say(f"✗ датасет {p.dataset} не найден. Создайте его: python3 cloud/worker/setup_hf.py (см. cloud/worker/README.md)")
                return 2
            sid = space_id_of(p.image)
            if not api.repo_exists(sid, repo_type="space"):
                say(f"✗ Space {sid} не найден. Создайте его: python3 cloud/worker/setup_hf.py (см. cloud/worker/README.md)")
                return 2
        except Exception as e:
            say(f"✗ не удалось обратиться к Hugging Face ({type(e).__name__}: {str(e)[:160]}). Проверьте токен и сеть.")
            return 2

        # бандл: собрать и выгрузить (при --resume / --skip-bundle берём уже выгруженный)
        if resume or a.skip_bundle:
            if not api.file_exists(p.dataset, p.bundle_remote, repo_type="dataset"):
                say(f"✗ в датасете нет {p.bundle_remote}: запустите без --resume/--skip-bundle, чтобы собрать и выгрузить бандл")
                return 2
            say(f"бандл {p.bundle_remote} уже в датасете — пропускаю сборку")
        else:
            from bundle_isolated import build_isolated_bundle, upload_bundle
            bdir = p.work / "bundle"
            tar_path = str(bdir / f"bundle_l{p.lesson}.tar.gz")
            try:
                build_isolated_bundle(p.lesson, str(p.project), str(bdir), tar_path, entry=p.entry, max_mb=a.max_bundle_mb)
            except (subprocess.CalledProcessError, OSError, ValueError, RuntimeError) as e:
                say(f"✗ сборка бандла не удалась: {e}")
                say("  Проверьте `cd <проект> && npx tsc --noEmit` и `npx remotion compositions src/index.ts` — ошибка обычно в коде сцен.")
                return 1
            actual = check_composition_frames(p, bdir / f"bundle_l{p.lesson}")
            if actual is None:
                say("⚠ не удалось проверить длительность композиции через `remotion compositions` — полагаюсь на расчёт "
                    f"({p.frames} кадров). Если число неверно, последний кусок упадёт.")
            elif actual != p.frames:
                if p.frames_explicit:
                    say(f"✗ в композиции {p.comp} {actual} кадров, а --frames {p.frames}. Исправьте --frames или уберите флаг.")
                    return 2
                say(f"⚠ расчёт по timeline.json ({p.frames}) ≠ композиция ({actual}); верю композиции: {actual} кадров")
                p.frames = actual
                err = apply_chunks_and_money(p, a)  # нарезка, таймаут и резерв бюджета зависят от числа кадров
                if err:
                    say(f"✗ {err}")
                    return 2
            else:
                say(f"✓ длительность композиции {p.comp} подтверждена бандлом: {actual} кадров")
            try:
                upload_bundle(tar_path, p.dataset, p.bundle_remote, token=token)
            except Exception as e:
                say(f"✗ выгрузка бандла в датасет не удалась: {type(e).__name__}: {str(e)[:200]}")
                return 1

    cfg_dict = dict(
        composition_id=p.comp, total_frames=p.frames, fps=float(p.fps), scale=float(p.scale),
        provider=p.provider, num_workers=p.workers, worker_concurrency=int(p.concurrency), flavor=p.flavor,
        cost_per_hour=0.03, job_timeout_sec=p.timeout, max_concurrency_limit=max(p.workers, 1),
        docker_image=p.image, dataset_repo=p.dataset, bundle_name=p.bundle_remote,
        scheduler_type="fixed-chunks", complexity_profile_path=None,
        budget_limit_usd=p.budget, max_retries=p.retries,
        audio_path=str(p.audio), audio_offset_ms=p.offset_ms,
        work_dir=str(p.work), output_master_path=str(p.out), dry_run=False,
    )
    cfg_path = write_config(p, cfg_dict)
    say(f"конфиг записан: {cfg_path}")
    p.out.parent.mkdir(parents=True, exist_ok=True)

    cfg = OrchestratorConfig.from_dict(cfg_dict)
    provider = MockComputeProvider() if mock else HuggingFaceJobsProvider(token=token)
    try:
        orch = ProductionOrchestrator(cfg, resume_ledger_path=str(resume) if resume else None, provider=provider)
        say(f"ledger: {orch.ledger_path}")
        say("запускаю задачи… (Ctrl+C отменит задачи в облаке; продолжить можно через --resume)")
        t0 = time.time()
        summary = orch.run()
    except OrchestratorError as e:
        say(f"✗ рендер не завершён: {e}")
        say("  Что делать: python3 cloud/lib/orchestrator.py status --ledger <ledger.json> — состояние кусков; "
            "доделать — тот же запуск с --resume <ledger.json> --live (повторятся только недостающие куски).")
        return 1
    except KeyboardInterrupt:
        say("прервано пользователем")
        return 130

    qc = summary.get("qc", {})
    say("")
    say(f"✓ готово: {summary.get('master_path')}")
    say(f"  {qc.get('resolution')}, {qc.get('actual_frames')} кадров, {qc.get('duration_sec', 0):.1f} с, "
        f"{qc.get('file_size_mb')} МБ, видео {qc.get('video_codec')}, звук {qc.get('audio_codec')}")
    say(f"  время {time.time() - t0:.0f} с, потрачено по учёту оркестратора ≈ ${summary.get('budget_spent_usd', 0):.4f} из ${p.budget:.2f}")
    say("  Липсинк машинными метриками не проверяется — посмотрите листы кадров вокруг мест с лицом (scripts/frames_05s.py).")
    if a.cleanup_remote and not mock:
        try:
            from huggingface_hub import HfApi
            HfApi(token=token).delete_folder(path_in_repo=f"renders/{summary['run_id']}", repo_id=p.dataset, repo_type="dataset",
                                             commit_message=f"cleanup {summary['run_id']}")
            say(f"  куски renders/{summary['run_id']} удалены из датасета")
        except Exception as e:
            say(f"  уборка датасета не удалась: {str(e)[:120]}")
    return 0


# ───────────────────────────── CLI ─────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        description="Параллельный рендер урока Remotion на Hugging Face Jobs (по умолчанию — dry-run; боевой запуск — только с --live).",
        epilog="Примеры:" + __doc__.split("Примеры:")[1].split("Окружение:")[0].rstrip(),
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project", default=str(KIT_ROOT / "remotion"), help="папка проекта Remotion (по умолчанию KIT_ROOT/remotion)")
    ap.add_argument("--lesson", type=int, required=True, help="номер урока N (папка public/lessonN)")
    ap.add_argument("--comp", default=None, help="ID композиции (по умолчанию LessonN)")
    ap.add_argument("--audio", default=None,
                    help="голос; путь ищется как есть, затем от проекта, затем от KIT_ROOT (по умолчанию public/lessonN/voice.wav проекта)")
    ap.add_argument("--workers", type=int, default=72, help="число параллельных задач (по умолчанию 72 — подтверждённый оптимум автора)")
    ap.add_argument("--out", default=None, help="итоговый mp4; относительный путь — от текущей папки (по умолчанию KIT_ROOT/out/lessonN_2k.mp4)")
    ap.add_argument("--budget", type=float, default=0.50, help="программный предохранитель, $ (по умолчанию 0.50)")
    ap.add_argument("--live", action="store_true", help="БОЕВОЙ запуск (платные задачи в облаке). Без флага — только план")
    ap.add_argument("--dry-run", action="store_true", help="только план и проверки, без сборки и запуска (поведение по умолчанию)")
    ap.add_argument("--resume", default=None, metavar="LEDGER", help="доделать прерванный запуск по ledger.json (нужен --live)")
    ap.add_argument("--frames", type=int, default=None, help="число кадров (по умолчанию из public/lessonN/timeline.json)")
    ap.add_argument("--fps", type=int, default=FPS_DEFAULT, help="кадров в секунду композиции (30)")
    ap.add_argument("--lead-frames", type=int, default=LEAD_FRAMES_DEFAULT, help="кадров до начала голоса (LEAD, 15)")
    ap.add_argument("--tail-sec", type=float, default=TAIL_SEC_DEFAULT, help="секунд финальной карточки после голоса (TAIL, 3)")
    ap.add_argument("--audio-offset-ms", type=int, default=None, help="сдвиг голоса, мс (по умолчанию lead-frames/fps = 500)")
    ap.add_argument("--scale", default=SCALE_2K, help=f"масштаб вывода (по умолчанию {SCALE_2K} = 2K из 1080p)")
    ap.add_argument("--concurrency", type=int, default=4, help="вкладок Chromium на задачу (4 для 8 vCPU)")
    ap.add_argument("--job-timeout", type=int, default=None, help="таймаут задачи, с (по умолчанию подбирается по размеру куска)")
    ap.add_argument("--retries", type=int, default=2, help="повторов упавшего куска (по умолчанию 2)")
    ap.add_argument("--flavor", default="cpu-upgrade", help="железо задач (cpu-upgrade: 8 vCPU, 32 GB)")
    ap.add_argument("--dataset", default=os.environ.get("HF_DATASET", ""), help="датасет user/video-render-assets (или HF_DATASET)")
    ap.add_argument("--image", default=os.environ.get("HF_WORKER_IMAGE", ""),
                    help="образ воркера hf.co/spaces/user/remotion-speed-worker (или HF_WORKER_IMAGE)")
    ap.add_argument("--work", default=None, help="рабочая папка (по умолчанию KIT_ROOT/work/hf_render)")
    ap.add_argument("--entry", default="src/index.ts", help="входной файл Remotion внутри проекта")
    ap.add_argument("--max-bundle-mb", type=float, default=150.0, help="порог размера бандла: защита от выгрузки лишних гигабайт")
    ap.add_argument("--skip-bundle", action="store_true", help="не собирать бандл: взять уже выгруженный bundles/bundle_lN.tar.gz")
    ap.add_argument("--cleanup-remote", action="store_true", help="после успеха удалить куски renders/<run_id> из датасета")
    ap.add_argument("--provider", choices=["huggingface", "mock"], default="huggingface",
                    help="mock — офлайн-проверка конвейера без облака (синтетические куски, нужен ffmpeg)")
    return ap


def main() -> int:
    a = build_parser().parse_args()
    if a.live and a.dry_run:
        say("✗ --live и --dry-run вместе не имеют смысла: выберите одно")
        return 2
    live = bool(a.live or a.resume)
    if a.resume and not a.live:
        say("✗ --resume запускает платные задачи — добавьте --live")
        return 2

    p, errors, warns = build_plan(a)
    env_errors, env_warns = environment_checks(p, live, need_build=not (a.resume or a.skip_bundle))
    errors += env_errors
    warns += env_warns
    print_plan(p, errors, warns, live)

    if errors:
        say("План не выполнен: исправьте пункты ✗ выше." + ("" if live else " (dry-run: это то, что остановило бы боевой запуск)"))
        return 2
    if not live:
        say("dry-run пройден: облако не вызывалось, $0.00. Боевой запуск — то же самое с флагом --live.")
        return 0
    return run_live(a, p)


if __name__ == "__main__":
    sys.exit(main())
