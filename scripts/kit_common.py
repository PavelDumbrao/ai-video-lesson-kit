"""Общие помощники скриптов набора: корень набора, нормализация слов-якорей, окна лица.

Это библиотека, а не команда: её импортируют resolve_storyboard.py, resolve_face_plan.py, make_face_chunks.py и др.
Здесь живёт единственная формула «окно показа → длина ролика, pad, gen» — чтобы resolve_face_plan.py и
make_face_chunks.py всегда считали одно и то же.
"""
import json
import math
import os
import re
import subprocess
import sys

# Корень набора: переменная окружения KIT_ROOT, иначе папка выше scripts/.
KIT_ROOT = os.environ.get("KIT_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FPS = 30            # fps композиции Remotion
LEAD = 0.5          # голос в ролике начинается с 0,5 с (15 кадров) — как в remotion/src/theme.ts
PAD = 0.4           # тишина по краям куска голоса для модели лица
MAX_WINDOW = 11.2   # максимум окна показа, с (dur ≤ 12 с минус 2·pad)
DUR_MIN, DUR_MAX = 8, 12   # длина ролика лица, с
SENT_END = re.compile(r"[.!?…][\"»”)\]]*$")


# Модели OpenCV Zoo лежат плоско в scripts/vision/models/ (их скачивает scripts/vision/setup.sh).
VISION_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vision")
MODEL_YUNET = "face_detection_yunet_2023mar.onnx"
MODEL_HUMANSEG = "human_segmentation_pphumanseg_2023mar.onnx"


def model_path(name, override=None):
    """Путь к модели: --model/override → $VISION_MODELS/<name> → scripts/vision/models/<name>. Нет файла — понятная ошибка."""
    cands = [override] if override else [os.path.join(os.environ.get("VISION_MODELS", ""), name) if os.environ.get("VISION_MODELS") else None,
                                         os.path.join(VISION_DIR, "models", name)]
    for c in cands:
        if c and os.path.isfile(c):
            return c
    die(f"нет модели {name} ({override or cands[-1]}). Скачайте: bash scripts/vision/setup.sh (или укажите --model / VISION_MODELS)")


def import_cv():
    """Ленивый импорт opencv + numpy с понятной ошибкой (чтобы --help работал без них)."""
    try:
        import cv2
        import numpy as np
    except ImportError as e:
        die(f"нет {e.name}: выполните bash scripts/vision/setup.sh (venv scripts/vision/venv) или pip install -r scripts/requirements.txt")
    return cv2, np


def die(msg, code=1):
    """Сообщение об ошибке в stderr и выход."""
    print(msg, file=sys.stderr)
    sys.exit(code)


def load_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        die(f"нет файла: {path}")
    except json.JSONDecodeError as e:
        die(f"{path}: неверный JSON ({e})")


def save_json(path, data, indent=1):
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=indent)
        f.write("\n")


def norm(s):
    """Нормализация слова для якоря: нижний регистр, ё→е, без пунктуации (дефис внутри слова сохраняется)."""
    return re.sub(r"[^0-9a-zа-я-]", "", s.lower().replace("ё", "е")).strip("-")


def find_anchor(words, anchor, start=0, end=None):
    """Индекс первого слова якоря в words[start:end] или None.

    Якорь — префикс слова («Лиц» найдёт «Лицо,») или фраза из 2–3 слов: каждое слово фразы — префикс
    очередного подряд идущего слова. Слова — словари с ключом "t".
    """
    toks = [norm(x) for x in anchor.split()]
    toks = [x for x in toks if x]
    if not toks:
        return None
    end = len(words) if end is None else end
    for k in range(start, end - len(toks) + 1):
        if all(norm(words[k + n]["t"]).startswith(q) for n, q in enumerate(toks)):
            return k
    return None


def face_timing(display, total, pad=PAD):
    """Окно показа [s, e] (с) → (pad, dur, gen).

    dur = ceil(окно + 2·pad) в пределах 8..12 с; gen = [s, s + dur − 2·pad] — кусок голоса, обрезанный концом озвучки;
    звук ролика = pad тишины + gen + тишина до dur.
    """
    s0, s1 = display
    ln = s1 - s0
    if ln > MAX_WINDOW:  # окно длиннее нормы — pad сжимается, ролик остаётся ≤ 12 с
        pad = round((DUR_MAX - ln) / 2 - 0.01, 2)
        if pad < 0.05:
            die(f"окно показа {ln:.1f} с длиннее {DUR_MAX} с — разбейте место")
    dur = min(DUR_MAX, max(DUR_MIN, math.ceil(round(ln + 2 * pad, 6))))
    a0 = s0
    b0 = min(total, a0 + dur - 2 * pad)
    return pad, dur, [round(a0, 2), round(b0, 2)]


def probe_duration(path):
    """Длительность медиафайла в секундах (ffprobe)."""
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                           capture_output=True, text=True, stdin=subprocess.DEVNULL)
    except FileNotFoundError:
        die("нет ffprobe — установите ffmpeg")
    try:
        return float(r.stdout.strip())
    except ValueError:
        die(f"ffprobe не смог прочитать {path}: {r.stderr.strip()[:200]}")


def need_ffmpeg():
    import shutil
    for b in ("ffmpeg", "ffprobe"):
        if not shutil.which(b):
            die(f"нет {b} в PATH — установите ffmpeg (macOS: brew install ffmpeg; Linux: apt install ffmpeg)")


if __name__ == "__main__":
    print(__doc__)
