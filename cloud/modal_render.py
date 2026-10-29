#!/usr/bin/env python3
"""ЗАПАСНОЙ путь: параллельный рендер урока Remotion на Modal (основной путь набора — cloud/hf_render.py на Hugging Face).

Когда нужен: нет Hugging Face PRO, либо нужен самый быстрый рендер (по замерам автора ~2–3 мин на 14-минутный 2K-урок,
но дороже: ≈ $1 за урок против ≈ $0.13 на HF). Modal Starter — $0 + расчёт за вычисления, «$30 in monthly free credits»
(официальная страница Modal на 29.10.2026). Цены и лимиты на момент чтения — проверьте на modal.com/pricing.

Порядок: изолированный бандл (cloud/lib/bundle_isolated.py: только нужный урок) → Volume Modal → N контейнеров рендерят
--frames=a-b без звука → куски склеиваются без перекодирования → звук = голос со сдвигом LEAD (как <Audio> в Lesson.tsx) → mp4.
Дальше обычный финиш (scripts/finish.sh).

Подготовка (один раз):   pip install modal   →   modal token new   (карта и нюансы — guides/modal.md)
Запуск (обёртка):        python3 cloud/modal_render.py --project remotion --lesson 1 --out out/lesson1_2k.mp4 --chunks 72
План без запуска:        python3 cloud/modal_render.py --project remotion --lesson 1 --dry-run
То же напрямую:          modal run cloud/modal_render.py --project remotion --lesson 1 --out out/lesson1_2k.mp4 --chunks 72
Секретов в коде нет: токен Modal хранится в ~/.modal.toml (создаётся `modal token new`).
"""
import json
import math
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
KIT_ROOT = Path(os.environ.get("KIT_ROOT") or HERE.parent).resolve()
FPS, LEAD, TAIL = 30, 15, 3  # remotion/src/theme.ts: голос с кадра 15, финальная карточка 3 с после голоса
SCALE = "1.3333333333333333"  # 1920×1080 → 2560×1440; «1.3333» даёт нецелую высоту и падение


def _resolve(p: str, bases) -> Path:
    pp = Path(p).expanduser()
    if pp.is_absolute():
        return pp
    for b in bases:
        if (b / pp).exists():
            return (b / pp).resolve()
    return (bases[0] / pp).resolve()


def _project_dir() -> Path:
    """Проект Remotion нужен уже при описании образа Modal (package.json) — до разбора аргументов modal run,
    поэтому: переменная MODAL_RENDER_PROJECT → флаг --project из sys.argv → KIT_ROOT/remotion."""
    p = os.environ.get("MODAL_RENDER_PROJECT")
    argv = sys.argv
    for i, a in enumerate(argv):
        if a == "--project" and i + 1 < len(argv):
            p = argv[i + 1]
        elif a.startswith("--project="):
            p = a.split("=", 1)[1]
    return _resolve(p, [Path.cwd(), KIT_ROOT]) if p else (KIT_ROOT / "remotion")


def lesson_frames_for(project: Path, lesson: int, voice: Path | None) -> int:
    """Число кадров как lessonFrames() в theme.ts: из timeline.json урока, иначе по длительности голоса (ffprobe)."""
    tl = project / "public" / f"lesson{lesson}" / "timeline.json"
    if tl.is_file():
        dur = float(json.loads(tl.read_text(encoding="utf-8"))["duration"])
    elif voice and voice.is_file():
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(voice)],
                                   check=True, text=True, capture_output=True).stdout)
    else:
        raise FileNotFoundError(f"нет {tl} и файла голоса — число кадров неизвестно")
    return int(math.ceil((dur + LEAD / FPS + TAIL) * FPS))


def chunk_ranges(frames: int, chunks: int):
    step = -(-frames // chunks)
    return [(a, min(a + step, frames) - 1) for a in range(0, frames, step)]


# ───────────── прямой запуск (python3 cloud/modal_render.py …): обёртка без обязательного пакета modal ─────────────
_DIRECT = __name__ == "__main__" and os.path.basename(sys.argv[0]) == os.path.basename(__file__)


def _direct_main() -> int:
    import argparse
    ap = argparse.ArgumentParser(
        description="Запасной рендер на Modal: план и запуск `modal run` (основной путь — cloud/hf_render.py).",
        epilog="Нужны: pip install modal  и  modal token new. Без --dry-run запуск платный (кредиты Modal).")
    ap.add_argument("--project", default=str(KIT_ROOT / "remotion"), help="папка проекта Remotion (по умолчанию KIT_ROOT/remotion)")
    ap.add_argument("--lesson", type=int, required=True, help="номер урока N")
    ap.add_argument("--out", default=None, help="итоговый mp4; относительный путь — от текущей папки (по умолчанию KIT_ROOT/out/lessonN_2k.mp4)")
    ap.add_argument("--chunks", type=int, default=72, help="число кусков = контейнеров Modal (по умолчанию 72)")
    ap.add_argument("--cpu", type=int, default=8, help="ядер на контейнер (по умолчанию 8)")
    ap.add_argument("--audio", default=None, help="голос (по умолчанию public/lessonN/voice.wav проекта)")
    ap.add_argument("--dry-run", action="store_true", help="только план и проверки, без вызова Modal")
    a = ap.parse_args()

    project = _resolve(a.project, [Path.cwd(), KIT_ROOT])
    voice = _resolve(a.audio, [Path.cwd(), project, KIT_ROOT]) if a.audio else project / "public" / f"lesson{a.lesson}" / "voice.wav"
    out = _resolve(a.out, [Path.cwd()]) if a.out else KIT_ROOT / "out" / f"lesson{a.lesson}_2k.mp4"
    errors = []   # блокируют и dry-run
    env_problems = []   # блокируют только боевой запуск (в dry-run — предупреждения)
    if not (project / "src" / "index.ts").is_file():
        errors.append(f"нет {project / 'src' / 'index.ts'} — это не проект Remotion (флаг --project)")
    if not (project / "package.json").is_file():
        errors.append(f"нет {project / 'package.json'} — он нужен для образа Modal")
    if not (project / "node_modules").is_dir():
        env_problems.append(f"в {project} нет node_modules — `cd {project} && npm install` (нужно для сборки бандла)")
    if not (project / "public" / f"lesson{a.lesson}" / "storyboard.json").is_file():
        errors.append(f"нет public/lesson{a.lesson}/storyboard.json в проекте")
    if not voice.is_file():
        errors.append(f"нет файла голоса: {voice} (флаг --audio)")
    frames = 0
    try:
        frames = lesson_frames_for(project, a.lesson, voice)
    except Exception as e:
        errors.append(str(e))
    print(f"Modal-рендер (запасной путь): урок {a.lesson}, проект {project}")
    if frames:
        r = chunk_ranges(frames, a.chunks)
        print(f"кадров {frames} ({frames / FPS:.1f} с), кусков {len(r)} по ≤{r[0][1] - r[0][0] + 1}, {a.cpu} ядер на контейнер")
    print(f"голос {voice}, результат {out}")
    print("цена: по замерам автора ≈ $1 за 13-минутный урок (72×8 ядер); реальный расход смотрите в Modal → Usage")
    modal_exe = shutil.which("modal")
    if not modal_exe:
        env_problems.append("не найдена команда modal: pip install modal && modal token new")
    if not shutil.which("ffmpeg"):
        env_problems.append("не найден ffmpeg в PATH (нужен для звука и склейки)")
    for e in errors:
        print(f"✗ {e}")
    for e in env_problems:
        print(f"{'⚠' if a.dry_run else '✗'} {e}")
    if a.dry_run:
        print("dry-run: Modal не вызывался, $0.00." + (" Исправьте пункты ✗ перед запуском." if errors else ""))
        return 2 if errors else 0
    if errors or env_problems:
        return 2
    cmd = [modal_exe, "run", str(Path(__file__).resolve()), "--project", str(project), "--lesson", str(a.lesson),
           "--out", str(out), "--chunks", str(a.chunks), "--cpu", str(a.cpu), "--audio", str(voice)]
    print("запускаю:", " ".join(cmd), flush=True)
    return subprocess.call(cmd, env=dict(os.environ, MODAL_RENDER_PROJECT=str(project)))


if _DIRECT:
    sys.exit(_direct_main())

# ───────────────────────── описание приложения Modal (выполняется в `modal run`) ─────────────────────────
import modal  # noqa: E402  (импорт после обёртки: --help и --dry-run работают без пакета modal)

PROJECT = _project_dir()
WORK = KIT_ROOT / "work" / "modal_render"

app = modal.App("kit-lesson-render")
vol = modal.Volume.from_name("kit-lesson-render", create_if_missing=True)

# системные библиотеки для headless Chromium (Remotion) и те же системные шрифты, что у автора:
# запасные глифы (стрелки, символы) должны совпасть с локальным рендером
CHROME_DEPS = ["libnss3", "libdbus-1-3", "libatk1.0-0", "libgbm-dev", "libasound2", "libxrandr2", "libxkbcommon-dev",
               "libxfixes3", "libxcomposite1", "libxdamage1", "libatk-bridge2.0-0", "libpango-1.0-0", "libcairo2", "libcups2"]
FONTS = ["fontconfig", "fonts-dejavu-core", "fonts-liberation", "fonts-freefont-ttf", "fonts-noto-color-emoji", "fonts-noto-mono",
         "fonts-urw-base35", "fonts-droid-fallback", "fonts-wqy-zenhei", "fonts-ipafont-gothic", "fonts-opensymbol", "fonts-unifont"]

_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("curl", "ca-certificates", "gnupg", *CHROME_DEPS, *FONTS)
    .run_commands("curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs")
    .add_local_file(f"{PROJECT}/package.json", "/rt/package.json", copy=True)
)
if (PROJECT / "package-lock.json").is_file():
    _image = _image.add_local_file(f"{PROJECT}/package-lock.json", "/rt/package-lock.json", copy=True)
# версии Remotion в образе = версии проекта (ставим из того же package.json); Chromium прогревается при сборке образа
image = _image.run_commands(
    "cd /rt && (if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi)"
    " && npx remotion browser ensure")


@app.function(image=image, cpu=8.0, memory=16384, volumes={"/data": vol}, timeout=1800, retries=1)
def render_chunk(bundle: str, comp: str, a: int, b: int, conc: int) -> dict:
    if not os.path.exists(f"/data/{bundle}"):
        try:
            vol.reload()
        except Exception:
            pass
    t = time.time()
    out = f"/tmp/c_{a}.mp4"
    subprocess.run(["npx", "remotion", "render", f"/data/{bundle}", comp, out, f"--frames={a}-{b}", f"--scale={SCALE}",
                    f"--concurrency={conc}", "--muted", "--log=error"], cwd="/rt", check=True)
    return {"a": a, "b": b, "sec": round(time.time() - t, 1), "data": open(out, "rb").read()}


def sh(cmd, **kw):
    return subprocess.run(cmd, check=True, text=True, **kw)


@app.local_entrypoint()
def main(lesson: int, out: str = "", chunks: int = 72, cpu: int = 8, project: str = "", audio: str = ""):
    sys.path.insert(0, str(HERE / "lib"))
    from bundle_isolated import build_isolated_bundle  # только локально; в контейнер модуль не попадает

    t0 = time.time()
    comp = f"Lesson{lesson}"
    proj = _resolve(project, [Path.cwd(), KIT_ROOT]) if project else PROJECT
    voice = _resolve(audio, [Path.cwd(), proj, KIT_ROOT]) if audio else proj / "public" / f"lesson{lesson}" / "voice.wav"
    outp = _resolve(out, [Path.cwd()]) if out else KIT_ROOT / "out" / f"lesson{lesson}_2k.mp4"
    outp.parent.mkdir(parents=True, exist_ok=True)
    if proj != PROJECT:
        raise SystemExit(f"--project {proj} расходится с проектом, из которого собран образ ({PROJECT}); "
                         "запускайте через `python3 cloud/modal_render.py --project …` или задайте MODAL_RENDER_PROJECT")
    frames = lesson_frames_for(proj, lesson, voice)
    bdir = build_isolated_bundle(lesson, str(proj), str(WORK), None)  # папка бандла: <WORK>/bundle_l<N>
    t_bundle = time.time() - t0
    remote = f"bundles/l{lesson}"
    try:
        vol.remove_file(remote, recursive=True)
    except Exception:
        pass
    with vol.batch_upload(force=True) as batch:
        batch.put_directory(bdir, remote)
    t_upload = time.time() - t0 - t_bundle
    ranges = chunk_ranges(frames, chunks)
    step = ranges[0][1] - ranges[0][0] + 1
    print(f"{comp}: {frames} кадров, {len(ranges)} кусков по ≤{step}; бандл {t_bundle:.0f} с, загрузка {t_upload:.0f} с", flush=True)
    cdir = WORK / f"chunks_l{lesson}"
    shutil.rmtree(cdir, ignore_errors=True)
    cdir.mkdir(parents=True)
    total = frames / FPS
    aud = f"{cdir}/audio.m4a"
    # звук = <Audio> из Lesson.tsx: голос с кадра LEAD, тишина до конца; кодируется, пока Modal рендерит видео
    ap = subprocess.Popen(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(voice), "-af",
                           f"aresample=48000,adelay={LEAD * 1000 // FPS}:all=1,apad", "-t", f"{total:.3f}", "-c:a", "aac", "-b:a", "320k", aud])
    secs = []
    # замеры автора, урок 13 мин: 72×8 ядер — рендер 134 с, ≈$0,92 (инвойс Modal) | 72×16 — 241 с, ≈$1,63 (очередь контейнеров, кусок не быстрее) |
    # 24×8 — 353 с, ≈$0,78. Скорость контейнера плавает до 3× от машины к машине, поэтому больше кусков, а не больше ядер.
    fn = render_chunk.with_options(cpu=float(cpu), memory=max(16384, cpu * 1536))
    for r in fn.starmap([(remote, comp, a, b, cpu) for a, b in ranges], order_outputs=False):
        (cdir / f"c{r['a']:06d}.mp4").write_bytes(r["data"])
        secs.append(r["sec"])
    t_render = time.time() - t0 - t_bundle - t_upload
    with open(f"{cdir}/list.txt", "w", encoding="utf-8") as f:
        for a, _ in ranges:
            f.write(f"file 'c{a:06d}.mp4'\n")
    # Превью кусками НЕ делать: на малом битрейте каждый кусок начинается мутным («пульс» качества). Мастер кусками (CRF) такого не имеет.
    if ap.wait():
        raise RuntimeError("звук: ffmpeg завершился с ошибкой")
    sh(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", f"{cdir}/list.txt", "-i", aud,
        "-map", "0:v", "-map", "1:a", "-c", "copy", "-t", f"{total:.3f}", "-movflags", "+faststart", str(outp)])
    core_s = sum(secs) * cpu
    print(f"готово {outp}: рендер {t_render:.0f} с (кусок {min(secs):.0f}–{max(secs):.0f} с), всего {time.time() - t0:.0f} с; "
          f"≈{core_s:.0f} ядро·с. Стоимость смотрите в Modal → Usage (по замерам автора ≈ $1 за 13-минутный урок при 72×8 ядер).", flush=True)
