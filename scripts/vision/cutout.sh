#!/bin/bash
# cutout.sh <studio.mp4> <out_prefix> — вырез человека моделями OpenCV Zoo + трек лица:
#   <prefix>_matte.mkv (FFV1 gray), <prefix>_face.json (YuNet), <prefix>_cutout.webm (VP9 с альфой 0–255, 1920×1080)
# Python: $VISION_PY, иначе scripts/vision/venv/bin/python (создаёт setup.sh), иначе python3 (нужны opencv-python и numpy).
# Модели: scripts/vision/models/ (setup.sh) или $VISION_MODELS. ≈ 1 мин на ролик.
set -e
case "$1" in -h|--help) echo "usage: cutout.sh <studio.mp4> <out_prefix>  → <prefix>_matte.mkv, _face.json, _cutout.webm"; exit 0 ;; esac
if [ $# -lt 2 ]; then
  echo "usage: cutout.sh <studio.mp4> <out_prefix>" >&2
  exit 2
fi
SRC=$1; P=$2
D=$(cd "$(dirname "$0")" && pwd)
[ -f "$SRC" ] || { echo "cutout: нет файла $SRC" >&2; exit 1; }
if [ -n "$VISION_PY" ]; then PY=$VISION_PY
elif [ -x "$D/venv/bin/python" ]; then PY="$D/venv/bin/python"
else PY=python3; fi
NICE=""; command -v nice >/dev/null 2>&1 && NICE="nice -n 10"
mkdir -p "$(dirname "$P")"
$NICE "$PY" "$D/seg_person.py" "$SRC" "$P"
$NICE ffmpeg -nostdin -loglevel error -y -i "$SRC" -i "${P}_matte.mkv" -filter_complex \
  "[1:v]format=gray,lut=y='clip((val-24)*255/206,0,255)'[m];[0:v]format=rgba[c];[c][m]alphamerge,scale=1920:1080:flags=lanczos,format=yuva420p[o]" \
  -map "[o]" -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -b:v 6M -deadline good -cpu-used 4 -row-mt 1 "${P}_cutout.webm"
echo "alpha: $(ffmpeg -nostdin -loglevel info -c:v libvpx-vp9 -i "${P}_cutout.webm" -vf alphaextract,signalstats,metadata=print -frames:v 1 -f null - 2>&1 | grep -oE "YMIN=[0-9]+|YMAX=[0-9]+" | tr "\n" " " || true)"
echo "готово: ${P}_cutout.webm ${P}_face.json ${P}_matte.mkv"
