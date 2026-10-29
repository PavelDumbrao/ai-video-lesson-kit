#!/usr/bin/env python3
"""Смотреть видео кадрами: кадр каждые 0,5 с, подпись — секунда и слово, которое звучит; листы кадров (contact sheets).

  python3 scripts/frames_05s.py video.mp4 [out_dir] [--words words_video.json | timeline.json] [--start S] [--end E]
                                [--step 0.5] [--width 270] [--cols 4] [--rows 3]
  python3 scripts/frames_05s.py video.mp4 --around aroll.json [--words …] [--only F01,F02] [--margin 1]
Пишет out_dir/sheet_NN.jpg (cols×rows кадров на лист) и out_dir/index.tsv (t, слова, кадр). out_dir по умолчанию —
<имя видео>_frames рядом с файлом. С --around: по листу на каждую вставку из aroll.json (±margin с вокруг неё) →
out_dir/<id>/sheet_NN.jpg — так проверяют стыки и углы вокруг мест лица.

Часы. Все секунды в подписях — СЕКУНДЫ ГОЛОСА (как в timeline/storyboard/aroll/plan.json). Файл полного рендера
урока начинается за --lead (0,5 с) до голоса: секунда плеера = секунда голоса + 0,5. Если файл — кусок урока
(`npx remotion render … --frames=a-b`), задайте --offset: секунда голоса, с которой начинается файл
(кадр a = LEAD·30 + offset·30 → при a = 15 + 30·V берите --offset V). По умолчанию --offset = −lead (полный рендер).
--start/--end — секунды файла (плеера). --words принимает words_video.json ({"words":[{text,start,end}]}, часы видео)
или timeline.json ({"words":[{t,s,e}]}, часы голоса) либо голый список таких слов.
"""
import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

FONTS = ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf",
         "/Library/Fonts/Arial Unicode.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
         "C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/arial.ttf")


def find_font(arg=None):
    for f in ([arg] if arg else []) + ([os.environ["FRAMES_FONT"]] if os.environ.get("FRAMES_FONT") else []) + list(FONTS):
        if f and os.path.exists(f):
            return f
    return None


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, stdin=subprocess.DEVNULL)
    if r.returncode:
        sys.exit(f"ffmpeg: {r.stderr.decode(errors='replace').strip()[-300:]}")


def probe_duration(video):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video],
                       capture_output=True, text=True, stdin=subprocess.DEVNULL)
    try:
        return float(r.stdout.strip())
    except ValueError:
        sys.exit(f"ffprobe не прочитал {video}: {r.stderr.strip()[:200]}")


def load_words(path, lead=0.5):
    """JSON со словами → [(start, end, text)] в секундах ГОЛОСА."""
    if not path:
        return []
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    ws = d["words"] if isinstance(d, dict) else d
    out = []
    for w in ws:
        if "t" in w and "s" in w:  # timeline.json: секунды голоса
            out.append((float(w["s"]), float(w["e"]), w["t"]))
        elif "start" in w:  # words_video.json: часы видео = голос + lead
            out.append((float(w["start"]) - lead, float(w["end"]) - lead, w["text"]))
    return out


def make_sheets(video, out, words_file, start=0.0, end=None, step=0.5, width=270, cols=4, rows=3,
                label_offset=0.0, font=None, jobs=4, quiet=False):
    """Листы кадров каждые step секунд. words_file — [(start, end, text)] в секундах ФАЙЛА; label_offset добавляется
    к секунде файла в подписи (секунда голоса). Возвращает (кадров, листов)."""
    font = find_font(font)
    dur = probe_duration(video)
    end = min(end if end is not None else dur, dur)
    os.makedirs(out, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="f05-")
    try:
        times, t = [], start
        while t < end - 1e-6:
            times.append(round(t, 3))
            t += step

        def one(item):
            i, t = item
            spoken = [w for s, e, w in words_file if s - 0.05 <= t <= e + 0.05]
            label = f"{t + label_offset:6.2f}s" + (("  " + " ".join(spoken))[:34] if spoken else ("  —" if words_file else ""))
            lab = os.path.join(tmp, f"l{i:05d}.txt")
            with open(lab, "w", encoding="utf-8") as f:
                f.write(label)
            vf = f"scale={width}:-2"
            if font:  # textfile: нет проблем с кавычками и двоеточиями в словах
                lab_esc = lab.replace("\\", "/").replace(":", "\\:")
                font_esc = font.replace("\\", "/").replace(":", "\\:")
                vf += (f",drawbox=x=0:y=ih-28:w=iw:h=28:color=black@0.72:t=fill,drawtext=fontfile='{font_esc}'"
                       f":textfile='{lab_esc}':x=6:y=h-22:fontsize=15:fontcolor=white")
            run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t}", "-i", video, "-frames:v", "1", "-vf", vf,
                 os.path.join(tmp, f"f{i:05d}.jpg")])
            return (t + label_offset, " ".join(spoken), f"f{i:05d}.jpg")

        with ThreadPoolExecutor(max_workers=max(1, jobs)) as ex:
            rows_ = list(ex.map(one, enumerate(times)))
        per = cols * rows
        for old in glob.glob(os.path.join(out, "sheet_*.jpg")):
            os.remove(old)
        frames = sorted(glob.glob(os.path.join(tmp, "f*.jpg")))
        for n in range(0, len(times), per):
            sub = os.path.join(tmp, f"b{n}")
            os.makedirs(sub)
            for k, f in enumerate(frames[n:n + per]):
                shutil.copy(f, os.path.join(sub, f"{k:03d}.jpg"))
            run(["ffmpeg", "-v", "error", "-y", "-framerate", "1", "-i", os.path.join(sub, "%03d.jpg"),
                 "-vf", f"tile={cols}x{rows}:padding=4:color=black", "-frames:v", "1",
                 os.path.join(out, f"sheet_{n // per:02d}.jpg")])
        with open(os.path.join(out, "index.tsv"), "w", encoding="utf-8") as f:
            f.write("t\twords\tframe\n")
            for t, w, fr in rows_:
                f.write(f"{t:.2f}\t{w}\t{fr}\n")
        nsheets = (len(times) + per - 1) // per
        if not quiet:
            print(f"{len(times)} кадров каждые {step} с ({start:.1f}–{end:.1f} с файла) → {nsheets} лист(ов) в {out}"
                  + ("" if font else " (нет шрифта: без подписей; укажите --font или FRAMES_FONT)"))
        return len(times), nsheets
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser(description="Листы кадров каждые 0,5 с с подписью «секунда + слово»",
                                 formatter_class=argparse.RawDescriptionHelpFormatter, epilog=(__doc__ or "Часы.").split("Часы.", 1)[-1].strip())
    ap.add_argument("video")
    ap.add_argument("out", nargs="?", help="папка листов (по умолчанию <видео>_frames)")
    ap.add_argument("--words", help="words_video.json или timeline.json (слова для подписей)")
    ap.add_argument("--around", help="aroll.json: листы вокруг каждой вставки (±--margin с) в out/<id>/")
    ap.add_argument("--only", help="с --around: только эти id через запятую")
    ap.add_argument("--margin", type=float, default=1.0, help="с --around: запас до и после вставки, с (по умолчанию 1)")
    ap.add_argument("--start", type=float, default=0.0, help="начало, секунды файла")
    ap.add_argument("--end", type=float, help="конец, секунды файла")
    ap.add_argument("--step", type=float, default=0.5, help="шаг кадров, с (по умолчанию 0.5)")
    ap.add_argument("--width", type=int, default=270, help="ширина кадра на листе, px")
    ap.add_argument("--cols", type=int, help="столбцов на листе (по умолчанию 4; с --around 6)")
    ap.add_argument("--rows", type=int, help="строк на листе (по умолчанию 3; с --around 4)")
    ap.add_argument("--lead", type=float, default=0.5, help="вступление композиции до голоса, с (по умолчанию 0.5)")
    ap.add_argument("--offset", type=float, help="секунда голоса, с которой начинается файл (по умолчанию −lead: полный рендер)")
    ap.add_argument("--jobs", type=int, default=4, help="параллельных ffmpeg (по умолчанию 4)")
    ap.add_argument("--font", help="шрифт .ttf для подписей (иначе системный или $FRAMES_FONT)")
    a = ap.parse_args()

    if not os.path.isfile(a.video):
        sys.exit(f"нет файла: {a.video}")
    offset = -a.lead if a.offset is None else a.offset
    voice_words = load_words(a.words, a.lead)
    words_file = [(s - offset, e - offset, w) for s, e, w in voice_words]  # секунды файла
    out = a.out or os.path.splitext(a.video)[0] + "_frames"
    if a.around:
        with open(a.around, encoding="utf-8") as f:
            segs = json.load(f)["segments"]
        only = set(a.only.split(",")) if a.only else None
        dur = probe_duration(a.video)
        n = 0
        for sg in segs:
            if only and sg["id"] not in only:
                continue
            s, e = sg["s"] - a.margin - offset, sg["e"] + a.margin - offset  # секунды файла
            if e <= 0 or s >= dur:
                print(f"{sg['id']}: вне файла ({sg['s']}–{sg['e']} с голоса) — пропуск", file=sys.stderr)
                continue
            print(f"{sg['id']} ({sg.get('mode', '')}, голос {sg['s']}–{sg['e']} с): ", end="", flush=True)
            make_sheets(a.video, os.path.join(out, sg["id"]), words_file, max(0.0, s), e, a.step, a.width,
                        a.cols or 6, a.rows or 4, offset, a.font, a.jobs)
            n += 1
        print(f"{n} вставок → {out}")
    else:
        make_sheets(a.video, out, words_file, a.start, a.end, a.step, a.width, a.cols or 4, a.rows or 3, offset, a.font, a.jobs)


if __name__ == "__main__":
    main()
