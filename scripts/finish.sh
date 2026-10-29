#!/bin/bash
# finish.sh <in.mp4> <out.mp4> [--preview FILE | --no-preview] [--preview-mb 26] — финиш мастера урока:
#   1) громкость −14 LUFS (EBU R128, TP −1.5, LRA 11) в ДВА прохода: замер → применение linear=true;
#      видео копируется без перекодирования (-c:v copy), звук AAC 192k 48 кГц → <out.mp4> (мастер для публикации);
#   2) превью 720p HEVC (libx265, тег hvc1, +faststart) ≤ 30 МБ ОДНИМ проходом по всему ролику (кусками не кодировать —
#      заметен «пульс» качества): битрейт считается из длительности под бюджет --preview-mb (по умолчанию 26 МБ — запас
#      до 30), по умолчанию → <out>_preview.mp4. Если вышло больше 30 МБ — один повтор с пониженным битрейтом.
# Нужны ffmpeg (с libx265 для превью) и python3. Пример:
#   bash scripts/finish.sh out/lesson1_2k.mp4 out/lesson1_final_2k.mp4
set -e
usage() { echo "usage: finish.sh <in.mp4> <out.mp4> [--preview FILE | --no-preview] [--preview-mb 26]"; exit "${1:-2}"; }
IN=""; OUT=""; PREVIEW=""; DO_PREVIEW=1; BUDGET_MB=26; LIMIT_MB=30
while [ $# -gt 0 ]; do
  case "$1" in
    --preview) PREVIEW=$2; shift 2 ;;
    --no-preview) DO_PREVIEW=0; shift ;;
    --preview-mb) BUDGET_MB=$2; shift 2 ;;
    -h|--help) usage 0 ;;
    -*) echo "finish: неизвестный флаг $1" >&2; usage 2 >&2 ;;
    *) if [ -z "$IN" ]; then IN=$1; elif [ -z "$OUT" ]; then OUT=$1; else usage; fi; shift ;;
  esac
done
[ -n "$IN" ] && [ -n "$OUT" ] || usage
[ -f "$IN" ] || { echo "finish: нет файла $IN" >&2; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "finish: нет ffmpeg в PATH (macOS: brew install ffmpeg)" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "finish: нужен python3" >&2; exit 1; }
[ -n "$PREVIEW" ] || PREVIEW="${OUT%.mp4}_preview.mp4"
if [ "$DO_PREVIEW" = 1 ] && ! ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx265; then
  echo "finish: в вашем ffmpeg нет libx265 — превью HEVC не собрать. Поставьте ffmpeg с x265 (macOS: brew install ffmpeg) или запустите с --no-preview" >&2
  exit 1
fi
mkdir -p "$(dirname "$OUT")"
NICE=""; command -v nice >/dev/null 2>&1 && NICE="nice -n 10"

echo "== громкость: проход 1 (замер)"
J=$($NICE ffmpeg -nostdin -hide_banner -i "$IN" -vn -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 </dev/null || true)
read -r MI MTP MLRA MT OFF <<< "$(printf '%s' "$J" | python3 -c '
import sys, json, re
t = sys.stdin.read()
m = list(re.finditer(r"\{[^{}]*\}", t))
if not m:
    sys.exit("в выводе ffmpeg нет JSON замера loudnorm (нет звуковой дорожки?)")
d = json.loads(m[-1].group(0))
print(d["input_i"], d["input_tp"], d["input_lra"], d["input_thresh"], d["target_offset"])
')"
[ -n "$MI" ] || { echo "finish: не удалось замерить громкость $IN" >&2; exit 1; }
echo "   замер: $MI LUFS, TP $MTP, LRA $MLRA"
echo "== громкость: проход 2 (применение, видео копируется) → $OUT"
$NICE ffmpeg -nostdin -v error -y -i "$IN" -c:v copy \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$MI:measured_TP=$MTP:measured_LRA=$MLRA:measured_thresh=$MT:offset=$OFF:linear=true" \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart "$OUT" </dev/null
FINAL=$(ffmpeg -nostdin -hide_banner -nostats -i "$OUT" -vn -af ebur128 -f null - 2>&1 </dev/null | grep -E '^[[:space:]]+I:' | tail -1 | tr -s ' ' || true)
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT" </dev/null)
SIZE_MB=$(python3 -c "import os,sys; print(round(os.path.getsize(sys.argv[1])/1048576,1))" "$OUT")
RES=$(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0 "$OUT" </dev/null)
echo "мастер: $OUT | было $MI LUFS → ${FINAL:-—} | $SIZE_MB МБ | ${DUR} с | $RES"

if [ "$DO_PREVIEW" = 1 ]; then
  echo "== превью 720p HEVC → $PREVIEW (бюджет $BUDGET_MB МБ из $LIMIT_MB)"
  AUDIO_K=96
  encode() {  # $1 = видеобитрейт, кбит/с
    $NICE ffmpeg -nostdin -v error -y -i "$OUT" -vf "scale=-2:720:flags=lanczos" -c:v libx265 -preset medium \
      -b:v "${1}k" -maxrate "$((${1} * 3 / 2))k" -bufsize "$((${1} * 3))k" -pix_fmt yuv420p -tag:v hvc1 \
      -x265-params log-level=error -c:a aac -b:a "${AUDIO_K}k" -ar 48000 -movflags +faststart "$PREVIEW" </dev/null
  }
  VK=$(python3 -c "
import sys
dur, mb, ak = float(sys.argv[1]), float(sys.argv[2]), int(sys.argv[3])
print(max(150, int(mb * 8192 / dur * 0.97) - ak))  # МБ → кбит, минус ~3 % контейнера и звук
" "$DUR" "$BUDGET_MB" "$AUDIO_K")
  encode "$VK"
  PSIZE=$(python3 -c "import os,sys; print(round(os.path.getsize(sys.argv[1])/1048576,1))" "$PREVIEW")
  if python3 -c "import sys; sys.exit(0 if float(sys.argv[1]) > float(sys.argv[2]) else 1)" "$PSIZE" "$LIMIT_MB"; then
    VK2=$(python3 -c "import sys; print(max(150, int(int(sys.argv[1]) * float(sys.argv[2]) / float(sys.argv[3]) * 0.92)))" "$VK" "$LIMIT_MB" "$PSIZE")
    echo "   превью $PSIZE МБ > $LIMIT_MB МБ — повтор одним проходом с битрейтом ${VK2}k"
    encode "$VK2"
    PSIZE=$(python3 -c "import os,sys; print(round(os.path.getsize(sys.argv[1])/1048576,1))" "$PREVIEW")
  fi
  echo "превью: $PREVIEW | $PSIZE МБ | видео ${VK}k"
  if python3 -c "import sys; sys.exit(0 if float(sys.argv[1]) > float(sys.argv[2]) else 1)" "$PSIZE" "$LIMIT_MB"; then
    echo "ВНИМАНИЕ: превью больше $LIMIT_MB МБ — уменьшите --preview-mb" >&2
    exit 1
  fi
fi
