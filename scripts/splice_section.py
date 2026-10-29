#!/usr/bin/env python3
"""Замена ОДНОГО раздела k в голосе урока новой озвучкой (tts_timeline.py, сценарий из одного раздела).

  python3 scripts/splice_section.py <old_dir> <new_sec_dir> <k> <out_dir> [--pause 0.30] [--from T]

old_dir — папка текущего голоса (voice.wav + timeline.json), new_sec_dir — результат tts_timeline.py для нового текста
раздела k (сценарий из одного `## Раздела`), k — номер раздела с нуля, out_dir — куда записать новый voice.wav,
voice.mp3, timeline.json, words_video.json.
--from T — заменить только хвост раздела k, начиная со слова, которое звучит с секунды T (начало раздела, лицо и т. п. не трогаются).
Если новый раздел короче старого — добивается тишиной до прежней длины: delta = 0, всё после раздела (лицо, вставки экрана,
сцены) остаётся на своих секундах, ролики лица не перегенерируются. Если длиннее — всё после сдвигается на delta (печатается):
тогда plan.json и раскадровку пересчитать (resolve_face_plan.py, resolve_storyboard.py).
"""
import argparse
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_common import load_json, need_ffmpeg, probe_duration  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description="Заменить один раздел в голосе урока новой озвучкой (voice.wav + timeline.json)",
                                 formatter_class=argparse.RawDescriptionHelpFormatter, epilog=(__doc__ or "").split("\n\n", 1)[-1])
    ap.add_argument("old_dir", help="папка текущего голоса (voice.wav, timeline.json)")
    ap.add_argument("new_dir", help="папка озвучки нового раздела (tts_timeline.py с одним разделом)")
    ap.add_argument("k", type=int, help="номер заменяемого раздела (с нуля)")
    ap.add_argument("out", help="папка результата")
    ap.add_argument("--pause", type=float, default=0.30, help="пауза после нового текста, с (по умолчанию 0.30)")
    ap.add_argument("--from", dest="frm", type=float, help="заменить только хвост раздела с секунды T")
    a = ap.parse_args()

    need_ffmpeg()
    import tts_timeline as TT  # build_lines для строк караоке (ленивый импорт: тянет merge_timeline)
    old_d, new_d, k, out = a.old_dir, a.new_dir, a.k, a.out
    O, N = load_json(f"{old_d}/timeline.json"), load_json(f"{new_d}/timeline.json")
    if not 0 <= k < len(O["sections"]):
        sys.exit(f"в {old_d}/timeline.json нет раздела {k} (всего {len(O['sections'])})")
    t0 = (a.frm if a.frm is not None else O["sections"][k]["s"]) - 0.03
    t1 = O["sections"][k + 1]["s"] - 0.03 if k + 1 < len(O["sections"]) else O["duration"]
    span = t1 - t0
    L = N["words"][-1]["e"] + a.pause
    Lp = max(L, span)
    d = round(Lp - span, 3)

    def inn(x):
        return {**x, "s": round(x["s"] + t0, 3), "e": round(x["e"] + t0, 3)}

    def sh(x):
        return {**x, "s": round(x["s"] + d, 3), "e": round(x["e"] + d, 3)}

    def keep(w):
        return w["sec"] < k or (w["sec"] == k and w["s"] < t0 + 0.02)

    before = [w for w in O["words"] if keep(w)]
    after = [w for w in O["words"] if w["sec"] > k]
    words = before + [{**inn(w), "sec": k} for w in N["words"]] + [sh(w) for w in after]
    k0 = next(i for i, w in enumerate(words) if w["sec"] == k)  # первое слово раздела k в новом списке
    kw = ([x for x in O["keywords"] if x["sec"] < k] + [x for x in O["keywords"] if x["sec"] == k and x.get("s", 0) < t0 + 0.02] +
          [{**inn(x), "sec": k} for x in N["keywords"]] + [sh(x) for x in O["keywords"] if x["sec"] > k])
    sec_words = [w for w in words if w["sec"] == k]
    sec_kw = [x for x in kw if x["sec"] == k]
    n_old_k = sum(1 for w in O["words"] if w["sec"] == k)
    k0_old = next(i for i, w in enumerate(O["words"]) if w["sec"] == k)
    remap = lambda i: i - n_old_k + len(sec_words)  # noqa: E731
    lines = ([ln for ln in O["lines"] if max(ln["w"]) < k0_old] +
             [{**ln, "w": [i + k0 for i in ln["w"]]} for ln in TT.build_lines(sec_words, sec_kw)] +
             [{**sh(ln), "w": [remap(i) for i in ln["w"]]} for ln in O["lines"] if min(ln["w"]) >= k0_old + n_old_k])
    sec_new = {**O["sections"][k], "e": round(t0 + Lp, 3)}
    T = {"fps": O["fps"], "duration": round(O["duration"] + d, 3),
         "sections": O["sections"][:k] + [sec_new] + [sh(s) for s in O["sections"][k + 1:]],
         "words": words, "lines": lines, "keywords": kw}
    assert sorted(i for ln in T["lines"] for i in ln["w"]) == list(range(len(words))), "строки караоке не покрывают все слова"
    os.makedirs(out, exist_ok=True)
    fc = (f"[0:a]aresample=48000,atrim=0:{t0},asetpts=PTS-STARTPTS[a];"
          f"[1:a]aresample=48000,apad=whole_dur={Lp},atrim=0:{Lp},asetpts=PTS-STARTPTS[b];"
          f"[0:a]aresample=48000,atrim=start={t1},asetpts=PTS-STARTPTS[c];[a][b][c]concat=n=3:v=0:a=1[o]")
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", f"{old_d}/voice.wav", "-i", f"{new_d}/voice.wav",
                    "-filter_complex", fc, "-map", "[o]", "-ac", "1", "-c:a", "pcm_s16le", f"{out}/voice.wav"], check=True)
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", f"{out}/voice.wav", "-c:a", "libmp3lame", "-b:a", "192k",
                    f"{out}/voice.mp3"], check=True)
    with open(f"{out}/timeline.json", "w", encoding="utf-8") as f:
        json.dump(T, f, ensure_ascii=False)
    with open(f"{out}/words_video.json", "w", encoding="utf-8") as f:
        json.dump({"words": [{"text": w["t"], "start": round(w["s"] + 0.5, 3), "end": round(w["e"] + 0.5, 3)} for w in T["words"]]},
                  f, ensure_ascii=False)
    wav = probe_duration(f"{out}/voice.wav")
    print(json.dumps({"section": k, "from": a.frm, "old_span": round(span, 3), "new_speech": round(L, 3), "pad": round(Lp - L, 3),
                      "delta": d, "duration": T["duration"], "wav": round(wav, 3), "words": len(words), "lines": len(lines)}))


if __name__ == "__main__":
    main()
