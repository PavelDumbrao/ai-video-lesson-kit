#!/usr/bin/env python3
"""Генерация говорящего лица по plan.json и voice.wav через API kie.ai.

Поддерживаемые модели:
  - kling-avatar (kling/ai-avatar-standard 720p, kling/ai-avatar-pro 1080p)
  - infinitalk (infinitalk/from-audio, 480p / 720p)
  - omnihuman-1.5 (omnihuman-1-5, 720 / 1080)

Использование:
  python3 face_kie.py --plan plan.json --voice voice.wav --photo portrait.jpg --out videos/ [опции]

Режим проверки без вызова API:
  python3 face_kie.py --plan plan.json --voice voice.wav --photo portrait.jpg --out videos/ --dry-run
"""

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Any, Dict, List, Optional, Tuple

import requests

DEFAULT_PROMPT = (
    "A person talking directly to the camera in a calm studio, "
    "natural facial expressions, slight nods, lips in sync with the audio, "
    "no text or captions"
)

DEFAULT_UPLOAD_BASE = "https://kieai.redpandaai.co"
API_BASE_URL = "https://api.kie.ai"


def check_ffmpeg() -> None:
    """Проверка наличия ffmpeg и ffprobe в системе."""
    for tool in ("ffmpeg", "ffprobe"):
        if shutil.which(tool) is None:
            sys.exit(f"Ошибка: утилита '{tool}' не найдена в PATH. Установите её для работы со звуком.")


def load_json(path: str) -> Any:
    """Безопасное чтение JSON файла."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, data: Any) -> None:
    """Атомарная запись JSON файла."""
    tmp_path = f"{path}.tmp_{os.getpid()}"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, path)


def get_audio_duration(path: str) -> float:
    """Определение длительности аудиофайла в секундах через ffprobe."""
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        path,
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(res.stdout.strip())


def make_audio_chunk(
    voice_wav: str,
    voice_dur: float,
    sid: str,
    a0: float,
    b0: float,
    pad: float,
    dur: float,
    tail: float,
    out_mp3: str,
) -> None:
    """Вырезка отрезка голоса [a0; b0] с тишиной pad в начале и tail в конце."""
    os.makedirs(os.path.dirname(os.path.abspath(out_mp3)), exist_ok=True)

    # Если исходный голос заканчивается до начала отрезка (например, в синтетических тестах)
    if voice_dur <= a0:
        cmd = [
            "ffmpeg",
            "-nostdin",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-t",
            f"{dur:.3f}",
            "-i",
            "anullsrc=r=44100:cl=mono",
            "-b:a",
            "128k",
            out_mp3,
        ]
        subprocess.run(cmd, check=True)
        return

    # Если голос обрывается раньше b0
    actual_b0 = min(b0, voice_dur)
    speech_len = max(0.0, actual_b0 - a0)
    actual_tail = round(dur - pad - speech_len, 3)
    if actual_tail < 0:
        actual_tail = pad

    with tempfile.NamedTemporaryFile(suffix=f"_{sid}.wav", delete=False) as tmp_f:
        tmp_wav = tmp_f.name

    try:
        # Шаг 1: срез голоса
        cmd_slice = [
            "ffmpeg",
            "-nostdin",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            f"{a0:.3f}",
            "-to",
            f"{actual_b0:.3f}",
            "-i",
            voice_wav,
            "-ac",
            "1",
            "-ar",
            "44100",
            tmp_wav,
        ]
        subprocess.run(cmd_slice, check=True)

        # Шаг 2: склейка с тишиной pad в начале и actual_tail в конце
        cmd_concat = [
            "ffmpeg",
            "-nostdin",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-t",
            f"{pad:.3f}",
            "-i",
            "anullsrc=r=44100:cl=mono",
            "-i",
            tmp_wav,
            "-f",
            "lavfi",
            "-t",
            f"{actual_tail:.3f}",
            "-i",
            "anullsrc=r=44100:cl=mono",
            "-filter_complex",
            "[0][1][2]concat=n=3:v=0:a=1",
            "-b:a",
            "128k",
            out_mp3,
        ]
        subprocess.run(cmd_concat, check=True)
    finally:
        if os.path.exists(tmp_wav):
            try:
                os.remove(tmp_wav)
            except OSError:
                pass


def build_task_payload(
    model: str,
    quality: str,
    resolution: Optional[str],
    prompt: str,
    image_url: str,
    audio_url: str,
) -> Dict[str, Any]:
    """Сборка точного JSON-пейлоада для POST /api/v1/jobs/createTask по спецификации docs.kie.ai."""
    model_lower = model.lower()

    if model_lower in ("kling-avatar", "kling"):
        if quality.lower() == "pro":
            kie_model = "kling/ai-avatar-pro"
        else:
            kie_model = "kling/ai-avatar-standard"
        input_data = {
            "image_url": image_url,
            "audio_url": audio_url,
            "prompt": prompt,
        }
    elif model_lower in ("kling/ai-avatar-standard", "kling/ai-avatar-pro"):
        kie_model = model
        input_data = {
            "image_url": image_url,
            "audio_url": audio_url,
            "prompt": prompt,
        }
    elif model_lower in ("infinitalk", "infinitalk/from-audio"):
        kie_model = "infinitalk/from-audio"
        res = (resolution or "720p").lower()
        if res not in ("480p", "720p"):
            res = "720p"
        input_data = {
            "image_url": image_url,
            "audio_url": audio_url,
            "prompt": prompt,
            "resolution": res,
        }
    elif model_lower in ("omnihuman-1.5", "omnihuman-1-5", "omnihuman"):
        kie_model = "omnihuman-1-5"
        res = (resolution or "1080").lower().rstrip("p")
        if res not in ("720", "1080"):
            res = "1080"
        input_data = {
            "image_url": image_url,
            "audio_url": audio_url,
            "prompt": prompt,
            "output_resolution": res,
        }
    else:
        raise ValueError(
            f"Неизвестная модель: '{model}'. Допустимые: kling-avatar, infinitalk, omnihuman-1.5"
        )

    return {
        "model": kie_model,
        "input": input_data,
    }


def upload_to_kie(
    file_path: str,
    api_key: str,
    upload_base: str,
    upload_path: str,
    file_name: str,
) -> str:
    """Загрузка файла через POST /api/file-stream-upload на kieai.redpandaai.co."""
    url = f"{upload_base.rstrip('/')}/api/file-stream-upload"
    headers = {"Authorization": f"Bearer {api_key}"}

    with open(file_path, "rb") as f:
        files = {"file": (file_name, f)}
        data = {"uploadPath": upload_path, "fileName": file_name}
        try:
            resp = requests.post(url, headers=headers, files=files, data=data, timeout=60)
        except requests.RequestException as e:
            raise RuntimeError(f"Сетевой сбой при загрузке {file_name} в {url}: {e}")

    if resp.status_code != 200:
        raise RuntimeError(
            f"HTTP ошибка загрузки файла {file_name} (HTTP {resp.status_code}): {resp.text[:300]}"
        )

    try:
        res_json = resp.json()
    except Exception:
        raise RuntimeError(f"Некорректный JSON при загрузке {file_name}: {resp.text[:300]}")

    if res_json.get("code") != 200:
        code = res_json.get("code")
        msg = res_json.get("msg", "ошибка сервиса")
        raise RuntimeError(f"Ошибка загрузки файла {file_name} в kie.ai (code {code}): {msg}")

    download_url = res_json.get("data", {}).get("downloadUrl")
    if not download_url:
        raise RuntimeError(f"downloadUrl отсутствует в ответе загрузки {file_name}: {res_json}")

    return download_url


def create_kie_task(api_key: str, payload: Dict[str, Any]) -> str:
    """Создание задачи через POST /api/v1/jobs/createTask с обработкой 429."""
    url = f"{API_BASE_URL}/api/v1/jobs/createTask"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    # Правило: createTask не повторять автоматически, кроме 429 (один повтор)
    for attempt in range(2):
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=60)
        except requests.RequestException as e:
            if attempt == 0:
                print(f"Временная сетевая ошибка createTask: {e}. Повтор через 5 с...")
                time.sleep(5)
                continue
            raise RuntimeError(f"Сетевая ошибка при вызове createTask: {e}")

        if resp.status_code == 429:
            if attempt == 0:
                print("Получен HTTP 429 (Rate Limit). Ожидание 5 с перед повтором...")
                time.sleep(5)
                continue
            raise RuntimeError("Превышен лимит запросов createTask (HTTP 429 Rate Limit).")

        try:
            res_json = resp.json()
        except Exception:
            raise RuntimeError(
                f"Некорректный JSON в ответе createTask (HTTP {resp.status_code}): {resp.text[:300]}"
            )

        code = res_json.get("code")
        if code == 429:
            if attempt == 0:
                print("Получен код 429 в ответе kie.ai createTask. Ожидание 5 с перед повтором...")
                time.sleep(5)
                continue
            raise RuntimeError(f"Превышен лимит запросов kie.ai (код 429): {res_json.get('msg')}")

        if code != 200:
            msg = res_json.get("msg", "Неизвестная ошибка")
            raise RuntimeError(f"Ошибка kie.ai createTask (код {code}): {msg}")

        task_id = res_json.get("data", {}).get("taskId")
        if not task_id:
            raise RuntimeError(f"createTask вернул 200, но taskId отсутствует: {res_json}")

        return task_id

    raise RuntimeError("Не удалось создать задачу в kie.ai.")


# ── Кадр 16:9 ───────────────────────────────────────────────────────────────────────────────
# Весь конвейер после лица (Aroll.tsx — «cover» на 1920×1080, cutout.sh, measure_body.py, Transition.tsx) считает,
# что ролик лица горизонтальный 16:9. Kling Avatar / InfiniTalk / OmniHuman возвращают ролик в пропорциях ФОТО:
# с вертикального портрета (например 956×1280) приходит вертикальный ролик 816×1104 — во весь экран лицо обрезается
# по лбу и подбородку, а вырез для угла растягивается в 2,6 раза. Поэтому фото до загрузки приводится к 16:9
# (портрет по центру по высоте кадра, по бокам — размытое продолжение того же фото), а скачанный ролик, если он
# всё же не 16:9, приводится так же (оригинал остаётся рядом как <id>_raw.mp4).
WIDE = 16 / 9
PAD_16x9 = (
    "split[a][b];[a]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=40:3[bg];"
    "[b]scale=-2:1080[fg];[bg][fg]overlay=(W-w)/2:0,setsar=1"
)


def media_size(path: str) -> Tuple[int, int]:
    """Ширина и высота первого видеопотока / картинки через ffprobe."""
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True,
    )
    w, h = r.stdout.strip().split("\n")[0].split(",")[:2]
    return int(w), int(h)


def is_wide(path: str) -> bool:
    w, h = media_size(path)
    return abs(w / h - WIDE) < 0.02


def photo_to_16x9(photo: str, out_dir: str) -> str:
    """Фото не 16:9 → <out>/<имя>_16x9.jpg 1920×1080 (портрет по центру, края — размытое продолжение)."""
    if is_wide(photo):
        return photo
    dst = os.path.join(out_dir, os.path.splitext(os.path.basename(photo))[0] + "_16x9.jpg")
    if not (os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(photo)):
        subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", photo, "-filter_complex", PAD_16x9,
                        "-frames:v", "1", "-q:v", "2", dst], check=True)
    w, h = media_size(photo)
    print(f"Фото {w}×{h} не 16:9 → {dst} (1920×1080): ролик лица должен быть горизонтальным, как кадр урока.")
    return dst


def video_to_16x9(mp4: str) -> None:
    """Скачанный ролик не 16:9 → привести к 1920×1080 на месте (оригинал → <id>_raw.mp4), звук без изменений."""
    if is_wide(mp4):
        return
    w, h = media_size(mp4)
    raw = mp4[:-4] + "_raw.mp4"
    os.replace(mp4, raw)
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", raw, "-filter_complex", f"[0:v]{PAD_16x9},format=yuv420p[v]",
                    "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-c:a", "copy", mp4], check=True)
    print(f"Ролик {os.path.basename(raw)} {w}×{h} не 16:9 → {os.path.basename(mp4)} 1920×1080 (края — размытое продолжение кадра).")


def download_video_file(url: str, dest_path: str, api_key: str) -> None:
    """Скачивание сгенерированного видеофайла во временный файл с последующим переименованием."""
    tmp_dest = f"{dest_path}.part_{os.getpid()}"
    headers = {}

    try:
        resp = requests.get(url, headers=headers, stream=True, timeout=120)
        # Если ссылка требует авторизации или выдаёт 403, пробуем получить прямую временную ссылку
        if resp.status_code == 403:
            try:
                dl_req = requests.post(
                    f"{API_BASE_URL}/api/v1/common/download-url",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={"url": url},
                    timeout=30,
                )
                if dl_req.status_code == 200:
                    dl_json = dl_req.json()
                    if dl_json.get("code") == 200 and dl_json.get("data"):
                        resp = requests.get(dl_json["data"], stream=True, timeout=120)
            except Exception:
                pass

        resp.raise_for_status()

        with open(tmp_dest, "wb") as f:
            for chunk in resp.iter_content(chunk_size=65536):
                if chunk:
                    f.write(chunk)

        os.replace(tmp_dest, dest_path)
    finally:
        if os.path.exists(tmp_dest):
            try:
                os.remove(tmp_dest)
            except OSError:
                pass


def poll_task_record(
    api_key: str,
    task_id: str,
    sid: str,
    dest_mp4: str,
    poll_interval: float,
    max_wait: float,
    tasks: Dict[str, Any],
    tasks_path: str,
    report: Dict[str, Any],
    report_path: str,
    audio_dur: float,
) -> bool:
    """Опрос статуса задачи через GET /api/v1/jobs/recordInfo до success/fail/таймаута."""
    url = f"{API_BASE_URL}/api/v1/jobs/recordInfo?taskId={task_id}"
    headers = {"Authorization": f"Bearer {api_key}"}
    start_time = time.time()

    while True:
        elapsed = time.time() - start_time
        if elapsed > max_wait:
            print(
                f"[{sid}] Таймаут ожидания ({int(max_wait)} с). Задача {task_id} всё ещё выполняется.",
                file=sys.stderr,
            )
            print(
                f"[{sid}] taskId сохранён в {tasks_path}. Перезапустите скрипт позже для продолжения опроса.",
                file=sys.stderr,
            )
            return False

        try:
            resp = requests.get(url, headers=headers, timeout=30)
        except requests.RequestException as e:
            print(f"[{sid}] Временный сбой сети при опросе: {e}. Повтор через {poll_interval} с...")
            time.sleep(poll_interval)
            continue

        if resp.status_code != 200:
            print(f"[{sid}] HTTP {resp.status_code} при recordInfo. Повтор через {poll_interval} с...")
            time.sleep(poll_interval)
            continue

        try:
            res_json = resp.json()
        except Exception:
            print(f"[{sid}] Некорректный JSON ответа recordInfo. Повтор через {poll_interval} с...")
            time.sleep(poll_interval)
            continue

        code = res_json.get("code")
        if code != 200:
            msg = res_json.get("msg", "")
            # Временные ошибки сервиса не должны прерывать опрос
            if code in (429, 455, 500, 501, 502, 503, 504, 505):
                print(f"[{sid}] Временный статус kie.ai ({code}: {msg}). Повтор через {poll_interval} с...")
                time.sleep(poll_interval)
                continue
            raise RuntimeError(f"[{sid}] Фатальная ошибка recordInfo (код {code}): {msg}")

        data = res_json.get("data") or {}
        state = data.get("state")

        if sid in tasks and isinstance(tasks[sid], dict):
            tasks[sid]["state"] = state
            tasks[sid]["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            save_json(tasks_path, tasks)

        if state in ("waiting", "queuing", "generating"):
            print(f"[{sid}] Статус: {state} ({int(elapsed)} с / {int(max_wait)} с)...")
            time.sleep(poll_interval)
            continue

        if state == "success":
            result_json = data.get("resultJson")
            if isinstance(result_json, str):
                try:
                    result_obj = json.loads(result_json)
                except Exception:
                    result_obj = {}
            elif isinstance(result_json, dict):
                result_obj = result_json
            else:
                result_obj = {}

            result_urls = result_obj.get("resultUrls", [])
            if not result_urls and isinstance(data.get("resultUrls"), list):
                result_urls = data["resultUrls"]

            if not result_urls:
                raise RuntimeError(f"[{sid}] Успех задачи, но resultUrls пуст: {data}")

            video_url = result_urls[0]
            credits_consumed = data.get("creditsConsumed", 0)
            cost_time = data.get("costTime", int(elapsed))

            print(f"[{sid}] Успех генерации! Списано кредитов: {credits_consumed}, время: {cost_time} с.")
            print(f"[{sid}] Скачивание готового видео: {dest_mp4}...")
            download_video_file(video_url, dest_mp4, api_key=api_key)
            video_to_16x9(dest_mp4)

            report.setdefault("items", {})[sid] = {
                "taskId": task_id,
                "state": "success",
                "video": os.path.basename(dest_mp4),
                "creditsConsumed": credits_consumed,
                "costTime": cost_time,
                "audioDuration": audio_dur,
            }
            report["totalCreditsConsumed"] = sum(
                item.get("creditsConsumed", 0) for item in report["items"].values()
            )
            report["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            save_json(report_path, report)
            print(f"[{sid}] Видео сохранено в {dest_mp4}")
            return True

        if state == "fail":
            fail_code = data.get("failCode")
            fail_msg = data.get("failMsg")
            credits_consumed = data.get("creditsConsumed", 0)
            print(f"[{sid}] Ошибка генерации: code={fail_code}, msg={fail_msg}", file=sys.stderr)

            report.setdefault("items", {})[sid] = {
                "taskId": task_id,
                "state": "fail",
                "failCode": fail_code,
                "failMsg": fail_msg,
                "creditsConsumed": credits_consumed,
                "audioDuration": audio_dur,
            }
            report["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            save_json(report_path, report)
            return False

        print(f"[{sid}] Неизвестный статус задачи '{state}'. Ожидание {poll_interval} с...")
        time.sleep(poll_interval)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Генерация видео говорящего лица через API kie.ai по plan.json и voice.wav.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--plan", required=True, help="Путь к файлу разметки plan.json")
    parser.add_argument("--voice", required=True, help="Путь к аудиофайлу записи голоса voice.wav")
    parser.add_argument("--photo", required=True, help="Путь к эталонному портрету автора (portrait.jpg)")
    parser.add_argument("--out", default="videos", help="Папка для результатов генерации, кэша и отчётов")
    parser.add_argument(
        "--model",
        default="kling-avatar",
        choices=[
            "kling-avatar",
            "infinitalk",
            "omnihuman-1.5",
            "kling/ai-avatar-standard",
            "kling/ai-avatar-pro",
            "infinitalk/from-audio",
            "omnihuman-1-5",
        ],
        help="Модель генерации говорящего лица",
    )
    parser.add_argument(
        "--quality",
        default="standard",
        choices=["standard", "pro"],
        help="Качество для kling-avatar (standard=720p, pro=1080p)",
    )
    parser.add_argument(
        "--resolution",
        default=None,
        help="Разрешение для infinitalk (480p, 720p) или omnihuman-1.5 (720, 1080)",
    )
    parser.add_argument(
        "--prompt",
        default=DEFAULT_PROMPT,
        help="Текстовый промпт описания сцены (без текста произносимой реплики)",
    )
    parser.add_argument(
        "--only",
        default=None,
        help="Список идентификаторов мест через запятую для выборочной генерации (например, F01,F02)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Тестовый запуск: нарезать аудио mp3 и показать точные JSON-пейлоады createTask без сетевых вызовов",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=15.0,
        help="Интервал опроса статуса задачи в секундах",
    )
    parser.add_argument(
        "--max-wait",
        type=float,
        default=1200.0,
        help="Максимальное время ожидания генерации одной задачи в секундах",
    )
    return parser.parse_args()


def main() -> None:
    # Прогресс опроса виден и при запуске в фоне с выводом в файл (nohup … > face.log): без этого Python
    # буферизует stdout и лог пуст до конца генерации.
    sys.stdout.reconfigure(line_buffering=True)
    check_ffmpeg()
    args = parse_args()

    # Проверка существования входных файлов
    if not os.path.exists(args.plan):
        sys.exit(f"Ошибка: файл плана не найден: {args.plan}")
    if not os.path.exists(args.voice):
        sys.exit(f"Ошибка: файл голоса не найден: {args.voice}")
    if not os.path.exists(args.photo):
        sys.exit(f"Ошибка: файл портрета не найден: {args.photo}")

    # Проверка ключа API в боевом режиме
    api_key = None
    if not args.dry_run:
        api_key = os.environ.get("KIE_AI_API_KEY") or os.environ.get("KIE_API_KEY")
        if not api_key:
            print("Ошибка: переменная окружения KIE_AI_API_KEY не задана.", file=sys.stderr)
            print("Задайте ключ окружения перед запуском:", file=sys.stderr)
            print("  export KIE_AI_API_KEY=your_key_here", file=sys.stderr)
            print("Для тестирования нарезки без вызова API используйте флаг --dry-run.", file=sys.stderr)
            sys.exit(1)

    upload_base = os.environ.get("KIE_UPLOAD_BASE", DEFAULT_UPLOAD_BASE)
    out_dir = os.path.abspath(args.out)
    os.makedirs(out_dir, exist_ok=True)

    plan_data = load_json(args.plan)
    if not isinstance(plan_data, list):
        sys.exit("Ошибка: содержимое plan.json должно быть списком объектов.")

    # Фильтр --only
    if args.only:
        allowed = {x.strip() for x in args.only.split(",") if x.strip()}
        plan_data = [item for item in plan_data if item.get("id") in allowed]
        if not plan_data:
            sys.exit(f"Ошибка: ни одно место из плана не соответствует фильтру --only '{args.only}'.")

    # Инициализация кэшей и файлов состояния
    upload_cache_path = os.path.join(out_dir, "upload_cache.json")
    tasks_path = os.path.join(out_dir, "tasks.json")
    report_path = os.path.join(out_dir, "report.json")

    upload_cache = load_json(upload_cache_path) if os.path.exists(upload_cache_path) else {}
    tasks = load_json(tasks_path) if os.path.exists(tasks_path) else {}
    report = load_json(report_path) if os.path.exists(report_path) else {"items": {}}

    voice_dur = get_audio_duration(args.voice)
    photo_abs = os.path.abspath(photo_to_16x9(os.path.abspath(args.photo), out_dir))

    # Загрузка фото портрета (только в боевом режиме)
    photo_url = upload_cache.get(photo_abs)
    if not args.dry_run:
        if not photo_url:
            print(f"Загрузка фото {os.path.basename(photo_abs)} в kie.ai...")
            photo_url = upload_to_kie(
                file_path=photo_abs,
                api_key=api_key,  # type: ignore
                upload_base=upload_base,
                upload_path="face/portrait",
                file_name=os.path.basename(photo_abs),
            )
            upload_cache[photo_abs] = photo_url
            save_json(upload_cache_path, upload_cache)
            print(f"Фото загружено: {photo_url}")
        else:
            print(f"Используем кэшированный URL фото: {photo_url}")
    else:
        if not photo_url:
            photo_url = f"https://tempfile.redpandaai.co/mock/{os.path.basename(photo_abs)}"

    print(f"\nВсего мест в обработке: {len(plan_data)}.")

    # Основной цикл по местам
    for idx, item in enumerate(plan_data, 1):
        sid = item.get("id")
        if not sid:
            continue

        gen = item.get("gen") or item.get("display")
        if not gen or len(gen) < 2:
            sys.exit(f"Ошибка: у места '{sid}' отсутствует интервал 'gen' или 'display'.")

        a0 = float(gen[0])
        b0 = float(gen[1])
        pad = float(item.get("pad", 0.4))
        speech_len = max(0.0, b0 - a0)

        # Вычисление dur и tail (в точности как в make_face.py)
        if "dur" in item and item["dur"] is not None:
            dur = float(item["dur"])
            tail = round(dur - pad - speech_len, 3)
            if tail < 0:
                tail = pad
                dur = round(pad + speech_len + tail, 3)
        else:
            tail = pad
            dur = round(pad + speech_len + tail, 3)

        # Проверка лимита 15 секунд для моделей говорящего лица kie.ai
        if dur > 15.0:
            sys.exit(
                f"Ошибка: длительность места '{sid}' ({dur:.2f} с) превышает лимит 15 с kie.ai.\n"
                f"Разбей место '{sid}' на несколько более коротких фраз в face_plan.json."
            )

        mp3_path = os.path.join(out_dir, f"{sid}.mp3")
        mp4_path = os.path.join(out_dir, f"{sid}.mp4")

        # 1. Нарезка mp3 (выполняется и в dry-run, и в боевом режиме)
        make_audio_chunk(
            voice_wav=args.voice,
            voice_dur=voice_dur,
            sid=sid,
            a0=a0,
            b0=b0,
            pad=pad,
            dur=dur,
            tail=tail,
            out_mp3=mp3_path,
        )

        # Подготовка URL аудио
        audio_url = upload_cache.get(mp3_path)
        if args.dry_run:
            if not audio_url:
                audio_url = f"https://tempfile.redpandaai.co/mock/{os.path.basename(mp3_path)}"
        else:
            if not audio_url:
                print(f"[{sid}] Загрузка аудио {os.path.basename(mp3_path)} в kie.ai...")
                audio_url = upload_to_kie(
                    file_path=mp3_path,
                    api_key=api_key,  # type: ignore
                    upload_base=upload_base,
                    upload_path="face/audio",
                    file_name=f"{sid}.mp3",
                )
                upload_cache[mp3_path] = audio_url
                save_json(upload_cache_path, upload_cache)

        # Сборка точного пейлоада
        payload = build_task_payload(
            model=args.model,
            quality=args.quality,
            resolution=args.resolution,
            prompt=args.prompt,
            image_url=photo_url,
            audio_url=audio_url,
        )

        # В режиме dry-run просто выводим JSON-пейлоад
        if args.dry_run:
            print(f"[{idx}/{len(plan_data)}] Место {sid} (длительность {dur:.2f} с, речь {speech_len:.2f} с):")
            print(json.dumps(payload, indent=2, ensure_ascii=False))
            print()
            continue

        # В боевом режиме:
        # Проверяем, есть ли уже готовый mp4
        if os.path.exists(mp4_path) and os.path.getsize(mp4_path) > 1000:
            video_to_16x9(mp4_path)  # ролики, скачанные до появления этой проверки
            print(f"[{sid}] Видео {sid}.mp4 уже готово, пропускаем.")
            continue

        # Проверяем tasks.json: создана ли уже задача ранее
        task_info = tasks.get(sid)
        task_id = None
        if isinstance(task_info, dict):
            task_id = task_info.get("taskId")
        elif isinstance(task_info, str):
            task_id = task_info

        if not task_id:
            print(f"[{sid}] Создание задачи kie.ai (модель {payload['model']})...")
            task_id = create_kie_task(api_key, payload)  # type: ignore
            tasks[sid] = {
                "taskId": task_id,
                "model": payload["model"],
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "state": "waiting",
            }
            save_json(tasks_path, tasks)
            print(f"[{sid}] Задача создана: taskId={task_id}")
        else:
            print(f"[{sid}] Найдена ранее созданная задача: taskId={task_id}, продолжаем опрос...")

        # Опрос recordInfo и скачивание
        poll_task_record(
            api_key=api_key,  # type: ignore
            task_id=task_id,
            sid=sid,
            dest_mp4=mp4_path,
            poll_interval=args.poll_interval,
            max_wait=args.max_wait,
            tasks=tasks,
            tasks_path=tasks_path,
            report=report,
            report_path=report_path,
            audio_dur=dur,
        )

    if args.dry_run:
        print(f"Dry-run успешно завершён. Обработано {len(plan_data)} мест. MP3 файлы сохранены в '{out_dir}'.")
    else:
        print(f"\nОбработка завершена. Отчёт сохранён в '{report_path}'.")


if __name__ == "__main__":
    main()
