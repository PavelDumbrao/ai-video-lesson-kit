#!/usr/bin/env python3
"""Склейка озвучки урока из частей: voice.wav + voice.mp3 + timeline.json + words_video.json.

  python3 scripts/merge_timeline.py <out_dir> <part_dir1> <part_dir2> ... [--gap 0.5]

Каждая часть — папка, где tts_timeline.py оставил voice.wav и timeline.json (озвучка ≤ 9 000 знаков за раз,
части начинаются с `## Раздел`). Между частями вставляется тишина --gap секунд (по умолчанию 0,5), голос — 48 кГц моно.
Номера разделов (`sec`) и индексы слов в `lines` сдвигаются; времена — на длительность предыдущих частей + пауз.
tts_timeline.py сам вызывает merge() для длинных сценариев; эту команду нужно запускать руками только если
части озвучивались отдельно (например, переозвучен один раздел).
"""
import argparse
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_common import die, load_json, need_ffmpeg, probe_duration  # noqa: E402


def merge(out, parts, gap=0.5):
    """Склеивает части parts (список папок) в папку out. Возвращает сводку (dict)."""
    need_ffmpeg()
    os.makedirs(out, exist_ok=True)
    T = {"fps": 30, "duration": 0, "sections": [], "words": [], "lines": [], "keywords": []}
    wavs, off, nsec = [], 0.0, 0
    for k, p in enumerate(parts):
        t = load_json(os.path.join(p, "timeline.json"))
        nw = len(T["words"])
        for s in t["sections"]:
            T["sections"].append({**s, "s": round(s["s"] + off, 3), "e": round(s["e"] + off, 3)})
        for w in t["words"]:
            T["words"].append({**w, "s": round(w["s"] + off, 3), "e": round(w["e"] + off, 3), "sec": w["sec"] + nsec})
        for ln in t["lines"]:
            T["lines"].append({**ln, "s": round(ln["s"] + off, 3), "e": round(ln["e"] + off, 3), "w": [i + nw for i in ln["w"]]})
        for kw in t["keywords"]:
            T["keywords"].append({**kw, "s": round(kw["s"] + off, 3), "e": round(kw["e"] + off, 3), "sec": kw["sec"] + nsec})
        wav = os.path.join(p, "voice.wav")
        if not os.path.exists(wav):
            die(f"нет {wav}")
        wavs.append(wav)
        nsec += len(t["sections"])
        off += t["duration"] + (gap if k < len(parts) - 1 else 0)
    T["duration"] = round(off, 3)
    # голос: части + тишина gap между ними, 48 кГц
    inp, fc = [], ""
    for i, w in enumerate(wavs):
        inp += ["-i", w]
        fc += f"[{i}:a]aresample=48000" + (f",apad=pad_dur={gap}" if i < len(wavs) - 1 else "") + f"[a{i}];"
    fc += "".join(f"[a{i}]" for i in range(len(wavs))) + f"concat=n={len(wavs)}:v=0:a=1[o]"
    wav_out = os.path.join(out, "voice.wav")
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", *inp, "-filter_complex", fc, "-map", "[o]", "-ac", "1",
                    "-c:a", "pcm_s16le", wav_out], check=True)
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", wav_out, "-c:a", "libmp3lame", "-b:a", "192k",
                    os.path.join(out, "voice.mp3")], check=True)
    write_timeline(out, T)
    d = probe_duration(wav_out)
    return {"duration": T["duration"], "wav": round(d, 3), "sections": len(T["sections"]), "words": len(T["words"]),
            "lines": len(T["lines"]), "keywords": len(T["keywords"])}


def write_timeline(out, T):
    """timeline.json и words_video.json."""
    with open(os.path.join(out, "timeline.json"), "w", encoding="utf-8") as f:
        json.dump(T, f, ensure_ascii=False)
    write_words_video(out, T)


def write_words_video(out, T):
    """words_video.json: слова в секундах видео (секунды голоса + 0,5 с вступления композиции) — для листов кадров."""
    with open(os.path.join(out, "words_video.json"), "w", encoding="utf-8") as f:
        json.dump({"words": [{"text": w["t"], "start": round(w["s"] + 0.5, 3), "end": round(w["e"] + 0.5, 3)} for w in T["words"]]},
                  f, ensure_ascii=False)


def main():
    ap = argparse.ArgumentParser(description="Склейка частей озвучки (tts_timeline.py) в один voice.wav + timeline.json")
    ap.add_argument("out", help="папка результата")
    ap.add_argument("parts", nargs="+", help="папки частей (voice.wav + timeline.json) по порядку")
    ap.add_argument("--gap", type=float, default=0.5, help="пауза между частями, с (по умолчанию 0.5)")
    a = ap.parse_args()
    print(json.dumps(merge(a.out, a.parts, a.gap)))


if __name__ == "__main__":
    main()
