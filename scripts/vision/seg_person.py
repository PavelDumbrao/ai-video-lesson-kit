#!/usr/bin/env python3
"""Вырезание человека из студийного ролика моделями OpenCV Zoo (без хромакея) + трек лица.

PP-HumanSeg (вероятность человека) → уточнение краёв guided filter по кадру → сглаживание во времени;
YuNet → бокс лица на каждый кадр. Модели лежат в scripts/vision/models/ (скачивает setup.sh).

  python seg_person.py in.mp4 out_prefix [--work 1280] [--seg-model P] [--face-model P]
    → out_prefix_matte.mkv  (маска, FFV1 gray без потерь, полный диапазон 0–255)
    → out_prefix_face.json  (fps, w, h, frames: [[x, y, w, h, score] | null])
Обычно вызывается из cutout.sh (он же собирает _cutout.webm с альфой).
"""
import argparse
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from kit_common import MODEL_HUMANSEG, MODEL_YUNET, import_cv, model_path  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description="Вырез человека (PP-HumanSeg + guided filter) и трек лица (YuNet): _matte.mkv + _face.json")
    ap.add_argument("src", help="входной ролик (студийный, человек на фоне)")
    ap.add_argument("out", help="префикс выходных файлов: <out>_matte.mkv, <out>_face.json")
    ap.add_argument("--work", type=int, default=1280, help="ширина рабочего кадра для моделей (по умолчанию 1280)")
    ap.add_argument("--seg-model", help=f"путь к {MODEL_HUMANSEG} (по умолчанию scripts/vision/models/)")
    ap.add_argument("--face-model", help=f"путь к {MODEL_YUNET} (по умолчанию scripts/vision/models/)")
    a = ap.parse_args()

    cv, np = import_cv()
    seg_path = model_path(MODEL_HUMANSEG, a.seg_model)
    face_path = model_path(MODEL_YUNET, a.face_model)
    if not os.path.isfile(a.src):
        sys.exit(f"нет файла: {a.src}")
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)

    cap = cv.VideoCapture(a.src)
    fps = cap.get(cv.CAP_PROP_FPS)
    W, H = int(cap.get(cv.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv.CAP_PROP_FRAME_HEIGHT))
    if not W or not H:
        sys.exit(f"не удалось открыть видео: {a.src}")
    ww, wh = a.work, round(a.work * H / W)
    net = cv.dnn.readNet(seg_path)
    face = cv.FaceDetectorYN.create(face_path, "", (ww, wh), 0.7, 0.3, 50)

    def box(x, r):
        return cv.boxFilter(x, -1, (2 * r + 1, 2 * r + 1), borderType=cv.BORDER_REFLECT)

    def guided(I, p, r=10, eps=2e-3):
        mI, mp = box(I, r), box(p, r)
        vI = box(I * I, r) - mI * mI
        cIp = box(I * p, r) - mI * mp
        k = cIp / (vI + eps)
        b = mp - k * mI
        return box(k, r) * I + box(b, r)

    enc = subprocess.Popen(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{W}x{H}",
                            "-r", f"{fps}", "-i", "-", "-c:v", "ffv1", "-pix_fmt", "gray", f"{a.out}_matte.mkv"], stdin=subprocess.PIPE)
    prev, faces = None, []
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        sm = cv.resize(fr, (ww, wh), interpolation=cv.INTER_AREA)
        # лицо
        _, det = face.detect(sm)
        if det is not None and len(det):
            d = max(det, key=lambda r: r[14])
            k = W / ww
            faces.append([round(float(d[0] * k), 1), round(float(d[1] * k), 1), round(float(d[2] * k), 1), round(float(d[3] * k), 1), round(float(d[14]), 3)])
        else:
            faces.append(None)
        # вероятность человека (PP-HumanSeg, вход 192x192)
        rgb = cv.cvtColor(cv.resize(sm, (192, 192), interpolation=cv.INTER_AREA), cv.COLOR_BGR2RGB).astype(np.float32) / 255.0
        net.setInput(cv.dnn.blobFromImage((rgb - 0.5) / 0.5))
        o = net.forward()[0]  # 2x192x192 логиты
        e = np.exp(o - o.max(axis=0, keepdims=True))
        prob = (e[1] / e.sum(axis=0)).astype(np.float32)
        prob = cv.resize(prob, (ww, wh), interpolation=cv.INTER_LINEAR)
        # сглаживание во времени (меньше мерцания края)
        prob = prob if prev is None else 0.6 * prob + 0.4 * prev
        prev = prob
        # уточнение краёв по самому кадру
        g = cv.cvtColor(sm, cv.COLOR_BGR2GRAY).astype(np.float32) / 255.0
        m = np.clip(guided(g, prob, r=8, eps=1e-3), 0, 1)
        m = np.clip((m - 0.25) / 0.5, 0, 1)  # фон → 0, человек → 1, край — короткий переход
        m = cv.resize(m, (W, H), interpolation=cv.INTER_LINEAR)
        m = cv.erode(m, np.ones((3, 3), np.uint8), iterations=1)  # поджать край: убрать кайму фона
        m = cv.GaussianBlur(m, (0, 0), 1.2)
        enc.stdin.write((m * 255).astype(np.uint8).tobytes())
    enc.stdin.close()
    enc.wait()
    with open(f"{a.out}_face.json", "w", encoding="utf-8") as f:
        json.dump({"fps": fps, "w": W, "h": H, "frames": faces}, f)
    hit = sum(f is not None for f in faces)
    print(f"frames {len(faces)}, face found {hit}, matte {a.out}_matte.mkv")


if __name__ == "__main__":
    main()
