#!/usr/bin/env python3
"""Поиск скачков плана (наплыв/склейка на крупный план) в роликах лица: размер лица YuNet по кадрам,
скачок > 18 % за 1–3 кадра.

  python3 scripts/jumpcheck.py video.mp4 [video2.mp4 …] [--model P] [--threshold 0.18]

Печатает по строке на ролик: «<файл> кадров N лицо(медиана, px из 320) M скачки: [секунды…]».
Модель face_detection_yunet_2023mar.onnx — по --model, $VISION_MODELS или scripts/vision/models/ (bash scripts/vision/setup.sh).
Нужны opencv-python и numpy (venv scripts/vision/venv: `scripts/vision/venv/bin/python scripts/jumpcheck.py …`).
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_common import MODEL_YUNET, import_cv, model_path  # noqa: E402


def make_detector(cv, model):
    return cv.FaceDetectorYN.create(model, "", (320, 180), 0.6)


def face_jumps(video, detector, cv, np, threshold=0.18):
    """Возвращает (число кадров, медиана размера лица в px из 320, список секунд скачков)."""
    cap = cv.VideoCapture(video)
    fps = cap.get(cv.CAP_PROP_FPS) or 24
    ws = []
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        sm = cv.resize(fr, (320, 180))
        detector.setInputSize((320, 180))
        _, f = detector.detect(sm)
        ws.append(float(f[0][2]) if f is not None and len(f) else np.nan)
    w = np.array(ws)
    jumps = []
    for k in range(3, len(w)):
        a, b = w[k - 3], w[k]
        if np.isfinite(a) and np.isfinite(b) and abs(b - a) / a > threshold:
            jumps.append(round(k / fps, 2))
    med = float(np.nanmedian(w)) if len(w) and np.isfinite(w).any() else float("nan")
    return len(w), med, sorted(set(round(j, 1) for j in jumps))[:12]


def main():
    ap = argparse.ArgumentParser(description="Скачки размера лица (YuNet) в роликах лица: наезд/склейка на крупный план")
    ap.add_argument("videos", nargs="+", help="ролики mp4")
    ap.add_argument("--model", help=f"путь к {MODEL_YUNET} (по умолчанию scripts/vision/models/)")
    ap.add_argument("--threshold", type=float, default=0.18, help="порог скачка размера лица за 1–3 кадра (по умолчанию 0.18 = 18 %%)")
    a = ap.parse_args()
    cv, np = import_cv()
    det = make_detector(cv, model_path(MODEL_YUNET, a.model))
    for v in a.videos:
        if not os.path.isfile(v):
            print(os.path.basename(v), "нет файла")
            continue
        n, med, jumps = face_jumps(v, det, cv, np, a.threshold)
        print(os.path.basename(v), "кадров", n, "лицо(медиана, px из 320)", round(med, 1), "скачки:", jumps)


if __name__ == "__main__":
    main()
