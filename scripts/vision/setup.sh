#!/bin/bash
# setup.sh — окружение для выреза человека и проверки лица:
#   1) venv scripts/vision/venv с opencv-python и numpy (пропустить: --models-only — тогда нужны они в вашем python);
#   2) модели OpenCV Zoo в scripts/vision/models/ (плоско, без подпапок):
#        face_detection_yunet_2023mar.onnx            — YuNet, детектор лица (jumpcheck.py, seg_person.py)
#        human_segmentation_pphumanseg_2023mar.onnx   — PP-HumanSeg, вырез человека (seg_person.py)
# Использование: bash scripts/vision/setup.sh [--models-only]
# Переменные: PYTHON (интерпретатор для venv, по умолчанию python3), OPENCV_ZOO_REF (ветка/тег opencv_zoo, по умолчанию main).
# ПРОВЕРИТЬ: пути файлов внутри репозитория opencv/opencv_zoo (models/<имя>/<файл>.onnx) взяты по имени моделей из
# рабочего пайплайна; модели лежат в Git LFS, поэтому ниже проверяется размер (> 100 КБ) — «указатель LFS» весит ~130 байт.
set -e
D=$(cd "$(dirname "$0")" && pwd)
PYBIN=${PYTHON:-python3}
REF=${OPENCV_ZOO_REF:-main}
MODELS="$D/models"
mkdir -p "$MODELS"

if [ "$1" != "--models-only" ]; then
  if [ ! -x "$D/venv/bin/python" ]; then
    echo "== venv: $D/venv"
    "$PYBIN" -m venv "$D/venv"
  fi
  echo "== pip install opencv-python numpy"
  "$D/venv/bin/python" -m pip install --quiet --upgrade pip
  "$D/venv/bin/python" -m pip install --quiet -r "$D/requirements.txt"
  PY="$D/venv/bin/python"
else
  PY="$PYBIN"
fi

echo "== модели → $MODELS"
"$PY" - "$MODELS" "$REF" <<'PYEOF'
import hashlib, os, sys, urllib.request

models_dir, ref = sys.argv[1], sys.argv[2]
# (файл, путь в репозитории opencv_zoo, ожидаемый sha256 или None)
ITEMS = [
    ("face_detection_yunet_2023mar.onnx", "models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
     "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"),
    ("human_segmentation_pphumanseg_2023mar.onnx", "models/human_segmentation_pphumanseg/human_segmentation_pphumanseg_2023mar.onnx", None),
]
BASES = [  # github.com/…/raw/… отдаёт содержимое LFS-файла редиректом; media.githubusercontent.com — запасной адрес
    "https://github.com/opencv/opencv_zoo/raw/{ref}/{path}",
    "https://media.githubusercontent.com/media/opencv/opencv_zoo/{ref}/{path}",
]
MIN_SIZE = 100 * 1024
bad = 0
for name, path, sha in ITEMS:
    dst = os.path.join(models_dir, name)
    if os.path.isfile(dst) and os.path.getsize(dst) > MIN_SIZE:
        print(f"  {name}: уже есть")
        continue
    ok = False
    for base in BASES:
        url = base.format(ref=ref, path=path)
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                data = r.read()
        except Exception as e:
            print(f"  {name}: {url} → {e}")
            continue
        if len(data) <= MIN_SIZE:
            print(f"  {name}: {url} вернул {len(data)} байт — похоже на указатель Git LFS, пробую следующий адрес")
            continue
        open(dst, "wb").write(data)
        got = hashlib.sha256(data).hexdigest()
        note = "" if sha is None else (" sha256 совпал" if got == sha else f" ВНИМАНИЕ: sha256 {got} ≠ ожидаемого {sha} (файл в opencv_zoo мог обновиться) — проверить")
        print(f"  {name}: {len(data) // 1024} КБ{note}")
        ok = True
        break
    if not ok:
        bad += 1
        print(f"  ОШИБКА: {name} не скачан. Скачайте вручную из https://github.com/opencv/opencv_zoo (папка {os.path.dirname(path)}) и положите в {models_dir}")
sys.exit(1 if bad else 0)
PYEOF
echo "готово. Проверка: $PY -c 'import cv2; print(cv2.__version__)'"
