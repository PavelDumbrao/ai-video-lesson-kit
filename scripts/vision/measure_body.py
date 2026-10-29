#!/usr/bin/env python3
"""Геометрия фигуры в ролике для угла (Transition.tsx: body, cornerK) по матту cutout.sh: альфа > 50 %, координаты 1920×1080.

  python3 scripts/vision/measure_body.py <prefix>_matte.mkv > <prefix>_body.json
  → JSON {"body": {l, r, t, b, cx, cy}, "cornerK": число, "frames": сколько кадров измерено}
Берётся каждый 4-й кадр матта, границы фигуры — медиана по кадрам; cornerK — масштаб бюста для угла
(бюст ≈ 630×560 px, не больше 0,56).
"""
import argparse
import json
import subprocess
import sys


def read_frames(path):
    """Каждый 4-й кадр матта 1920×1080 (gray) одним потоком; -fps_mode passthrough, для старого ffmpeg — -vsync 0."""
    base = ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", path, "-vf", "select='not(mod(n,4))',scale=1920:1080"]
    tail = ["-f", "rawvideo", "-pix_fmt", "gray", "-"]
    for sync in (["-fps_mode", "passthrough"], ["-vsync", "0"]):
        r = subprocess.run(base + sync + tail, capture_output=True, stdin=subprocess.DEVNULL)
        if r.returncode == 0:
            return r.stdout
        err = r.stderr.decode(errors="replace")
        if "fps_mode" not in err and "Unrecognized option" not in err:
            break
    sys.exit(f"ffmpeg не прочитал {path}: {err.strip()[-300:]}")


def main():
    ap = argparse.ArgumentParser(description="Геометрия фигуры (body, cornerK) по _matte.mkv для угловой врезки")
    ap.add_argument("matte", help="<prefix>_matte.mkv от cutout.sh / seg_person.py")
    a = ap.parse_args()
    try:
        import numpy as np
    except ImportError:
        sys.exit("нет numpy: bash scripts/vision/setup.sh или pip install -r scripts/requirements.txt")
    raw = read_frames(a.matte)
    fr = np.frombuffer(raw, np.uint8).reshape(-1, 1080, 1920) > 127
    ls, rs, ts = [], [], []
    for m in fr:
        cols = np.where(m.any(0))[0]
        rows = np.where(m.any(1))[0]
        if len(cols) < 50:
            continue
        ls.append(cols[0])
        rs.append(cols[-1])
        ts.append(rows[0])
    if not ls:
        sys.exit("в матте не найден человек (пустая маска) — проверьте вырез cutout.sh")
    l, r, t = int(np.median(ls)), int(np.median(rs)), int(np.median(ts))
    b = 1076
    k = round(min(0.56, 630 / (r - l), 560 / (b - t)), 2)
    print(json.dumps({"body": {"l": l, "r": r, "t": t, "b": b, "cx": (l + r) // 2, "cy": (t + b) // 2 + 24}, "cornerK": k, "frames": len(ls)}))


if __name__ == "__main__":
    main()
