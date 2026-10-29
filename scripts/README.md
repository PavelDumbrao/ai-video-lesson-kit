# scripts/ — инструменты конвейера видеоурока

Переносимые скрипты: никаких серверных путей, всё — через аргументы CLI и переменные окружения. Корень набора
(`KIT_ROOT`) — переменная окружения или папка выше `scripts/`; пути проекта и урока задаются `--project`, `--lesson`, `--lab`.
Документация к командам — `python3 scripts/<имя>.py --help`.

## Установка
```bash
pip install -r scripts/requirements.txt          # numpy, opencv-python (Python ≥ 3.10)
brew install ffmpeg node                         # macOS; Linux: apt install ffmpeg nodejs; нужен ffmpeg с libx265 и libvpx-vp9
bash scripts/vision/setup.sh                     # venv scripts/vision/venv + модели OpenCV Zoo (для выреза человека и jumpcheck)
```
Голос: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` (в `.env`, в чат не печатать; загрузить: `set -a; . ./.env; set +a`).
Необязательно: `WHISPER_URL` (адрес `whisper-asr-webservice` для `qa_lips.py`), `VISION_PY` (python для выреза),
`VISION_MODELS` (папка с `.onnx`), `FRAMES_FONT` (шрифт подписей листов кадров), `KIT_ROOT`.
Без нужного ключа скрипты отвечают понятной ошибкой «нет ключа …» и ничего не запускают.

## Порядок конвейера (рабочие файлы урока N — в `work/lessonN/`, как в `skills/`)
```bash
# 1. Сценарий — script.md (skills/lesson-script): «## Раздел», [теги эмоций], **ключевые** слова
# 2. Голос → voice.wav, voice.mp3, timeline.json, words_video.json  (платный вызов: сначала --dry-run)
python3 scripts/tts_timeline.py work/lessonN/script.md work/lessonN/audio --dry-run
python3 scripts/tts_timeline.py work/lessonN/script.md work/lessonN/audio --stability 0.25
#    (> 9000 знаков скрипт сам режет по «## Раздел», озвучивает части и сшивает; merge_timeline.py — только если части
#     озвучены отдельно:  python3 scripts/merge_timeline.py out part1 part2 [--gap 0.5])
mkdir -p remotion/public/lessonN && cp work/lessonN/audio/{voice.wav,timeline.json,words_video.json} remotion/public/lessonN/

# 3. Раскадровка: слова-якоря → секунды
python3 scripts/resolve_storyboard.py work/lessonN/storyboard.json --timeline work/lessonN/audio/timeline.json \
        --out remotion/public/lessonN/storyboard.json [--lesson КЛЮЧ] [--renumber N]
# 4. Каркас урока: заглушки сцен + регистрация (scenes/index.ts, lessons.ts, theme.ts SERIES)
python3 scripts/skeleton.py N --project remotion --sub "Название урока" --check
# 5. Сцены — код Remotion (skills/motion-remotion, remotion/README.md)

# 6. План лица: места с якорями → секунды (окна, dur 8–12 с, switch_t)
python3 scripts/resolve_face_plan.py work/lessonN/face_plan.json --timeline work/lessonN/audio/timeline.json \
        --out work/face/plan.json --storyboard remotion/public/lessonN/storyboard.json
# 7. Куски голоса с тишиной 0,4 с по краям: <id>.mp3, <id>.txt, пересчитанный plan.json
python3 scripts/make_face_chunks.py --plan work/face/plan.json --voice work/lessonN/audio/voice.wav --out work/face
# 8. Лицо (kie.ai, платно — см. face/README.md): ролики work/face/videos/<id>.mp4
# 9. Проверка каждого ролика (бесплатно)
python3 scripts/qa_lips.py work/face/videos/F01.mp4 work/face/F01.mp3 work/face/F01.txt \
        --plan work/face/plan.json --timeline work/lessonN/audio/timeline.json --sheet-dir work/face/qa/F01
python3 scripts/jumpcheck.py work/face/videos/F01.mp4
# 10. Вырезы для переходов «в угол» (только места full→corner / corner→full) — вручную или флагом --cutouts в make_aroll.py
bash scripts/vision/cutout.sh work/face/videos/F01.mp4 remotion/public/lessonN/trans/F01
python3 scripts/vision/measure_body.py remotion/public/lessonN/trans/F01_matte.mkv > remotion/public/lessonN/trans/F01_body.json
# 11. Слой лица: aroll.json (дубли: F02=F02_b, без лица: F03=-)
python3 scripts/make_aroll.py --project remotion --lesson N --lab work/face [--cutouts | --cut-only] [F02=F02_b …]
# 12. Рендер — cloud/ (или локально, remotion/README.md), затем финиш и приёмка кадрами
bash scripts/finish.sh out/lessonN_2k.mp4 out/lessonN_final_2k.mp4
python3 scripts/frames_05s.py out/lessonN_final_2k.mp4 --around remotion/public/lessonN/aroll.json \
        --words work/lessonN/audio/timeline.json
```

## Что делает каждый скрипт
| Скрипт | Вход → выход |
|---|---|
| `tts_timeline.py` | `script.md` → `voice.wav` (48 кГц), `voice.mp3`, `timeline.json` (fps, duration, sections, words, lines, keywords), `words_video.json`, `tts_text.txt`. Длинный сценарий — частями в `outdir/parts/partNN` (готовые части не озвучиваются повторно, `--force` — заново). `--dry-run` — только разбор и план частей |
| `merge_timeline.py` | папки частей → один `voice.wav` + `timeline.json` (пауза `--gap` 0,5 с, номера разделов и строк сдвигаются) |
| `splice_section.py` | заменить один раздел в готовом голосе (короче старого — добивается тишиной, остальное остаётся на своих секундах) |
| `resolve_storyboard.py` | `storyboard.json` (якоря) + `timeline.json` → `public/lessonN/storyboard.json` (секунды); код 1, если якорь не найден |
| `skeleton.py` | каркас урока в проекте Remotion (идемпотентно): `scenes/lN/*.tsx`, `lN/index.ts`, `scenes/index.ts`, `lessons.ts`, `SERIES[N]`, пустые `aroll.json`/`screens.json` |
| `resolve_face_plan.py` | `face_plan.json` + `timeline.json` → `plan.json` (display, gen, switch_t, pad, dur, clipStart, side) |
| `make_face_chunks.py` | `plan.json` + `voice.wav` → `<id>.mp3` (pad + голос + тишина = dur), `<id>.txt`, `plan.json` |
| `qa_lips.py` | ролик + эталон → JSON PASS/FAIL: корреляция волны по окнам 1 с ≥ 0,7 (+ огибающая), склейки, скачки лица; лист кадров; Whisper — по `--whisper-url` |
| `jumpcheck.py` | скачки размера лица YuNet > 18 % за 1–3 кадра (наезд/склейка на крупный план) |
| `vision/cutout.sh`, `seg_person.py`, `measure_body.py` | вырез человека (PP-HumanSeg + guided filter + YuNet) → `_cutout.webm` (VP9 с альфой), `_face.json`, `_matte.mkv`; геометрия бюста `body`, `cornerK` |
| `vision/setup.sh` | venv `scripts/vision/venv` (opencv-python, numpy) + модели в `scripts/vision/models/` |
| `make_aroll.py` | `plan.json` + ролики → `public/lessonN/aroll.json` (вставки `cut` с масштабом 1.0/1.15 по очереди, переходы `trans` с ключами full/corner/hidden, `side`) |
| `frames_05s.py` | листы кадров каждые 0,5 с с секундой и словом; `--around aroll.json` — по листу вокруг каждого места лица |
| `finish.sh` | −14 LUFS двухпроходно (видео `-c:v copy`) → мастер; превью 720p HEVC ≤ 30 МБ одним проходом |
| `kit_common.py` | общие помощники (не команда): `KIT_ROOT`, нормализация якорей, формула окна лица |

## Форматы
- **storyboard.json** (вход): `{"<урок>": [{"section": 0, "type": "lN_hook", "beats": [["слово-якорь", "что показать"], …]}]}`; якорь — префикс слова
  (нижний регистр, ё = е, без пунктуации), биты идут по порядку внутри раздела. `--renumber N` меняет префикс типов `l29_` → `lN_`.
- **face_plan.json** (вход): `{"places": [{"id": "F01", "section": 0, "from": "То что", "to": "стоял", "mode": "full|full→corner|corner→full",
  "switch": "Лицо", "side": "left|right", "why": "…"}]}`. Окно показа — от слова `from` до конца предложения со словом `to`
  (в пределах раздела); якорь — слово-префикс или фраза из 2–3 слов. Окно > 11,2 с — ошибка (сократите `to` или разбейте место),
  пересечение окон — ошибка. `switch` обязателен для переходных режимов. Формула: `dur = ceil(окно + 2·pad)` в пределах 8–12 с,
  `pad = 0,4`, `gen = [начало окна, начало + dur − 2·pad]`, обрезанный концом озвучки; `clipStart = pad`.
- **plan.json** (выход): `[{"id", "display": [s, e], "gen": [s, e], "switch_t", "pad", "dur", "mode", "clipStart", "side", "why"}]`, секунды голоса.
- **Реестр уроков** `remotion/src/lessons.ts`: по одной строке импорта на каждый json и по одной записи на урок; `skeleton.py` вставляет новые
  строки над маркерами `// @lessons:imports` и `// @lessons:entries`:
  `{ n: N, timeline: tN, storyboard: sN, aroll: aN as Aroll, screens: scN },`. Если маркеров нет — `skeleton.py` останавливается с понятной ошибкой.
- Секунды везде — **секунды голоса**. В готовом ролике голос начинается с 0,5 с: секунда плеера = секунда голоса + 0,5
  (`frames_05s.py --lead/--offset` учитывает это).

## Проверка набора без платных вызовов
```bash
python3 -m py_compile scripts/*.py scripts/vision/*.py
python3 scripts/resolve_storyboard.py examples/how-this-video-is-made/storyboard.json --timeline examples/how-this-video-is-made/timeline.json --out /tmp/sb.json --renumber 1   # 16 сцен, 129 битов
python3 scripts/resolve_face_plan.py examples/how-this-video-is-made/face_plan.json --timeline examples/how-this-video-is-made/timeline.json --out /tmp/plan.json            # 13 мест, ошибок 0
python3 scripts/tts_timeline.py examples/how-this-video-is-made/script.md /tmp/tts --dry-run                                                                                  # 2 части, без сети
```

## Проверить / оговорки
- ElevenLabs: идентификатор модели `eleven_v4_turbo`, формат `wav_48000`, эндпоинт `…/text-to-speech/{voice}/with-timestamps`, предел 9 000 знаков
  на запрос и число одновременных запросов (`--jobs`, по умолчанию 2) взяты из рабочего конвейера автора, не из публичной документации:
  при ошибке HTTP 4xx сверьте значения с документацией ElevenLabs (`--model`, `--max-chars`, `--jobs` меняются флагами). Цены и кредиты скрипты не называют.
- Модели OpenCV Zoo: адреса `github.com/opencv/opencv_zoo/raw/<ref>/models/<папка>/<файл>.onnx` и имена файлов (`face_detection_yunet_2023mar.onnx`,
  `human_segmentation_pphumanseg_2023mar.onnx`) — по структуре репозитория; сеть при сборке набора не проверялась. Файлы лежат в Git LFS, `setup.sh`
  отбраковывает «указатели» (< 100 КБ) и сверяет sha256 YuNet с эталоном из рабочей установки автора (несовпадение — предупреждение).
  Если загрузка не удалась — скачайте оба `.onnx` вручную в `scripts/vision/models/`.
- `qa_lips.py`: Whisper — только через ваш локальный `whisper-asr-webservice` (`POST /asr`); `text_ratio` справочный. Проверка скачков лица
  требует opencv и модель, без них пропускается с пометкой `jump_check: skipped`.
- Склейку/наезд на крупный план проверяют только `jumpcheck.py` и лист кадров глазами; провал на последнем окне у конца речи часто ложный (окно показа
  режется по `plan.json` автоматически).
