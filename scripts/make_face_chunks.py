#!/usr/bin/env python3
"""plan.json (resolve_face_plan.py) + voice.wav → куски голоса для модели лица: <id>.mp3, <id>.txt, обновлённый plan.json.

  python3 scripts/make_face_chunks.py --plan plan.json --voice voice.wav --out work/face [--timeline timeline.json] [--only F01,F03]

Для каждого места: кусок голоса gen[0]…gen[1] (моно, 44,1 кГц) + тишина pad с обеих сторон, всего ровно dur секунд
(8–12) → <out>/<id>.mp3; произнесённые слова куска → <out>/<id>.txt (эталон для qa_lips.py). plan.json переписывается
в <out>/plan.json: gen, pad, dur, clipStart пересчитаны по общей формуле (scripts/kit_common.py::face_timing).
Ничего никуда не отправляет и ничего не платит: ролики лица делает face/face_kie.py по <out>/plan.json.
Слова для <id>.txt берутся из timeline.json: --timeline или timeline.json рядом с voice.wav (нет — .txt не пишется).
"""
import argparse
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_common import PAD, die, face_timing, load_json, need_ffmpeg, probe_duration, save_json  # noqa: E402


def sh(*cmd):
    r = subprocess.run(list(cmd), capture_output=True, text=True, stdin=subprocess.DEVNULL)
    if r.returncode:
        die(f"ffmpeg завершился с ошибкой: {' '.join(cmd[:6])} …\n{r.stderr.strip()[-400:]}")


def main():
    ap = argparse.ArgumentParser(description="plan.json + voice.wav → <id>.mp3 (голос с тишиной по краям), <id>.txt, plan.json")
    ap.add_argument("--plan", required=True, help="plan.json от resolve_face_plan.py")
    ap.add_argument("--voice", required=True, help="voice.wav урока (сплошная дорожка)")
    ap.add_argument("--out", required=True, help="папка результата (например work/face)")
    ap.add_argument("--timeline", help="timeline.json (по умолчанию — рядом с voice.wav, если есть)")
    ap.add_argument("--only", help="только эти места через запятую (F01,F03); plan.json пересчитывается целиком")
    ap.add_argument("--pad", type=float, default=PAD, help=f"тишина по краям куска, с (по умолчанию {PAD})")
    a = ap.parse_args()

    need_ffmpeg()
    if not os.path.exists(a.voice):
        die(f"нет файла голоса: {a.voice}")
    plan = load_json(a.plan)
    total = probe_duration(a.voice)
    tl_path = a.timeline or os.path.join(os.path.dirname(os.path.abspath(a.voice)), "timeline.json")
    words = load_json(tl_path)["words"] if os.path.exists(tl_path) else None
    if words is None:
        print(f"ВНИМАНИЕ: нет timeline.json ({tl_path}) — файлы <id>.txt не пишутся (qa_lips.py сверит только форму волны)", file=sys.stderr)
    only = set(a.only.split(",")) if a.only else None
    unknown = (only or set()) - {x["id"] for x in plan}
    if unknown:
        die(f"в plan.json нет мест: {sorted(unknown)}")
    os.makedirs(a.out, exist_ok=True)

    total_s = 0
    with tempfile.TemporaryDirectory(prefix="face_chunks_") as tmp:
        for x in plan:
            sid = x["id"]
            s0, s1 = x["display"]
            pad, dur, gen = face_timing((s0, s1), total, a.pad)
            a0, b0 = gen
            tail = round(dur - pad - (b0 - a0), 3)  # тишина в конце: pad или больше, если голос кончился раньше
            if only is None or sid in only:
                cut = os.path.join(tmp, f"{sid}.wav")
                sh("ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-ss", f"{a0}", "-to", f"{b0}", "-i", a.voice,
                   "-ac", "1", "-ar", "44100", cut)
                sh("ffmpeg", "-nostdin", "-loglevel", "error", "-y",
                   "-f", "lavfi", "-t", f"{pad}", "-i", "anullsrc=r=44100:cl=mono", "-i", cut,
                   "-f", "lavfi", "-t", f"{tail}", "-i", "anullsrc=r=44100:cl=mono",
                   "-filter_complex", "[0][1][2]concat=n=3:v=0:a=1", "-b:a", "128k", os.path.join(a.out, f"{sid}.mp3"))
                if words is not None:
                    spoken = " ".join(w["t"] for w in words if a0 - 0.02 <= w["s"] < b0 - 0.02)
                    with open(os.path.join(a.out, f"{sid}.txt"), "w", encoding="utf-8") as f:
                        f.write(spoken)
                print(f"{sid} {x['mode']:12} показ {s0:.2f}–{s1:.2f} ({s1 - s0:.1f} с), ролик {dur} с, речь {b0 - a0:.1f} с")
            x.update({"gen": gen, "pad": pad, "dur": dur, "clipStart": pad})
            total_s += dur
    save_json(os.path.join(a.out, "plan.json"), plan)
    print(f"итого {len(plan)} мест, {total_s} с роликов → {a.out}/plan.json (цена генерации — по тарифу провайдера лица, см. face/README.md)")


if __name__ == "__main__":
    main()
