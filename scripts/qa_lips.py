#!/usr/bin/env python3
"""Автопроверка ролика лица: в ролике звучит НАША запись, нет склеек и наездов; лист кадров 0,5 с.

  python3 scripts/qa_lips.py video.mp4 ref_audio.mp3 [ref_text.txt] [--plan plan.json --timeline timeline.json]
                             [--sheet-dir DIR] [--whisper-url URL] [--no-jump] [--strict]

video.mp4 — ролик от модели лица (face_kie.py), ref_audio.mp3 / ref_text.txt — <id>.mp3 / <id>.txt от make_face_chunks.py.
Проверки (печатает одну строку JSON с verdict PASS/FAIL):
  • форма волны: корреляция звука ролика и эталона по окнам 1 с (шаг 0,5 с) ≥ 0,7; окно с низкой корреляцией прощается,
    если совпала огибающая (окна 20 мс, сдвиг ±60 мс, ≥ 0,85); тишина эталона (rms < 0,003) не оценивается;
  • склейки: резкий скачок кадра (порог max(18, 6·медиана)) — смена плана/фона;
  • скачок размера лица YuNet > 18 % (наезд на крупный план) — нужны opencv и модель (scripts/vision/setup.sh), иначе пропуск;
  • Whisper — по желанию: --whisper-url http://localhost:9000 (локальный whisper-asr-webservice); text_ratio — только справка,
    в вердикт не входит (Whisper путает слова, корреляция звука надёжнее). Без --whisper-url распознавание пропускается.
С --plan вердикт считается только в окне показа ролика (clipStart … clipStart + окно; id места — из имени файла: F01_b.mp4 → F01,
или --id); хвост после речи не в счёт. С --plan и --timeline (+ --sheet-dir) строится лист кадров каждые 0,5 с со словами.
"""
import argparse
import difflib
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_common import MODEL_YUNET, import_cv, load_json, model_path, need_ffmpeg  # noqa: E402

SR = 16000


def pcm(np, path):
    r = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                       capture_output=True, stdin=subprocess.DEVNULL)
    if r.returncode:
        sys.exit(f"ffmpeg не прочитал звук {path}: {r.stderr.decode(errors='replace').strip()[-200:]}")
    return np.frombuffer(r.stdout, np.int16).astype(np.float32) / 32768


def env(np, x, hop=320):
    n = len(x) // hop
    return np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-9)


def audio_check(np, video, ref_audio):
    """Окна 1 с (шаг 0,5 с): корреляция формы волны; возвращает (список (t, corr), плохие окна t)."""
    ref, vid = pcm(np, ref_audio), pcm(np, video)
    W = SR
    wins = []
    for i in range(0, len(ref) - W + 1, W // 2):
        a, b = ref[i:i + W], vid[i:i + W]
        if len(b) < W or np.sqrt((a * a).mean()) < 0.003:  # тишину не оцениваем
            continue
        wins.append((i / SR, float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-9))))
    ea, eb = env(np, ref), env(np, vid)

    def env_ok(t):  # огибающая 20 мс в окне 1 с, сдвиг ±60 мс
        i, j = int(t / 0.02), int((t + 1.0) / 0.02)
        m = min(len(ea), len(eb))
        cs = [np.corrcoef(ea[i:j], eb[i + k:j + k])[0, 1] for k in range(-3, 4) if i + k >= 0 and j + k <= m and j - i > 5]
        return bool(cs) and max(cs) >= 0.85

    return wins, [t for t, c in wins if c < 0.7 and not env_ok(t)]


def video_fps(video):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=avg_frame_rate",
                        "-of", "csv=p=0", video], capture_output=True, text=True, stdin=subprocess.DEVNULL)
    try:
        n, _, d = r.stdout.strip().partition("/")
        return float(n) / float(d or 1)
    except (ValueError, ZeroDivisionError):
        return 24.0


def cuts_check(np, video):
    """Секунды резких скачков кадра (склейка / смена плана)."""
    fps = video_fps(video)
    r = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", video, "-vf", "scale=64:36", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                       capture_output=True, stdin=subprocess.DEVNULL)
    fr = np.frombuffer(r.stdout, np.uint8).reshape(-1, 36, 64, 3).astype(np.int16)
    if len(fr) < 2:
        return []
    d = np.abs(np.diff(fr.mean(axis=3), axis=0)).mean(axis=(1, 2))
    return [round((k + 1) / fps, 2) for k in np.where(d > max(18, 6 * np.median(d)))[0]]


def whisper(url, video, lang="ru"):
    """Распознавание речи через локальный whisper-asr-webservice (POST /asr, поле audio_file). Возвращает текст."""
    if "/asr" not in url:
        url = url.rstrip("/") + "/asr"
    if "?" not in url:
        url += f"?task=transcribe&language={lang}&output=txt"
    with tempfile.TemporaryDirectory(prefix="qa_lips_") as tmp:
        wav = os.path.join(tmp, "a.wav")
        subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", video, "-vn", "-ac", "1", "-ar", "16000", wav],
                       check=True, stdin=subprocess.DEVNULL)
        bnd = uuid.uuid4().hex
        body = (f'--{bnd}\r\nContent-Disposition: form-data; name="audio_file"; filename="a.wav"\r\n'
                "Content-Type: audio/wav\r\n\r\n").encode() + open(wav, "rb").read() + f"\r\n--{bnd}--\r\n".encode()
        req = urllib.request.Request(url, data=body, headers={"Content-Type": f"multipart/form-data; boundary={bnd}"})
        return urllib.request.urlopen(req, timeout=180).read().decode().strip()


def main():
    ap = argparse.ArgumentParser(description="QA ролика лица: звук = наша запись (корреляция волны), склейки, скачки лица, лист кадров")
    ap.add_argument("video", help="ролик лица .mp4")
    ap.add_argument("ref_audio", help="эталон <id>.mp3 (make_face_chunks.py)")
    ap.add_argument("ref_text", nargs="?", help="эталонный текст <id>.txt (нужен только для text_ratio с Whisper)")
    ap.add_argument("--plan", help="plan.json: считать вердикт только в окне показа")
    ap.add_argument("--id", help="id места в plan.json (по умолчанию из имени файла: F01_b.mp4 → F01)")
    ap.add_argument("--timeline", help="timeline.json: слова для листа кадров (нужен --plan)")
    ap.add_argument("--sheet-dir", help="папка листа кадров 0,5 с (нужны --plan и --timeline)")
    ap.add_argument("--whisper-url", default=os.environ.get("WHISPER_URL", ""),
                    help="адрес whisper-asr-webservice, например http://localhost:9000 (по умолчанию пусто = без Whisper; env WHISPER_URL)")
    ap.add_argument("--language", default="ru", help="язык для Whisper (по умолчанию ru)")
    ap.add_argument("--model", help=f"путь к {MODEL_YUNET} для проверки скачков лица")
    ap.add_argument("--no-jump", action="store_true", help="не проверять скачки размера лица (без opencv)")
    ap.add_argument("--strict", action="store_true", help="код возврата 1 при FAIL")
    a = ap.parse_args()

    try:
        import numpy as np
    except ImportError:
        sys.exit("нет numpy: pip install -r scripts/requirements.txt")
    need_ffmpeg()
    for f in (a.video, a.ref_audio):
        if not os.path.isfile(f):
            sys.exit(f"нет файла: {f}")

    wins, bad = audio_check(np, a.video, a.ref_audio)
    cuts = cuts_check(np, a.video)

    jumps, jump_note = [], None
    if not a.no_jump:
        try:
            import jumpcheck
            cv, _ = import_cv()
            model = model_path(MODEL_YUNET, a.model)
            n, med, jumps = jumpcheck.face_jumps(a.video, jumpcheck.make_detector(cv, model), cv, np)
        except SystemExit:  # нет opencv / модели (причина уже напечатана) — проверку звука не валим
            jump_note = "skipped"
            print("скачки размера лица не проверены (нет opencv или модели): bash scripts/vision/setup.sh", file=sys.stderr)

    hyp, ratio = None, None
    if a.whisper_url:
        try:
            hyp = whisper(a.whisper_url, a.video, a.language)
            if a.ref_text and os.path.isfile(a.ref_text):
                nm = lambda s: re.sub(r"[^а-яёa-z0-9 ]", " ", s.lower().replace("ё", "е")).split()  # noqa: E731
                ratio = round(difflib.SequenceMatcher(None, nm(open(a.ref_text, encoding="utf-8").read()), nm(hyp)).ratio(), 2)
        except (urllib.error.URLError, OSError) as e:
            print(f"Whisper недоступен ({e}) — пропуск", file=sys.stderr)

    res = {"video": os.path.basename(a.video)}
    in_bad, in_cuts, in_jumps = bad, cuts, jumps
    if a.plan:
        plan = {x["id"]: x for x in load_json(a.plan)}
        sid = a.id or os.path.splitext(os.path.basename(a.video))[0].split("_")[0]
        if sid not in plan:
            sys.exit(f"в {a.plan} нет места {sid}")
        x = plan[sid]
        s, e = x["display"]
        w0 = x["clipStart"]
        w1 = w0 + (e - s)
        in_bad = [t for t in bad if t + 1 > w0 and t < w1]
        in_cuts = [c for c in cuts if w0 <= c <= w1]
        in_jumps = [t for t in jumps if w0 - 0.2 <= t <= w1 + 0.2]
        res["window"] = [round(w0, 2), round(w1, 2)]
        if a.sheet_dir and a.timeline:
            import frames_05s
            o = x["gen"][0] - x["pad"]  # секунда голоса, с которой начинается ролик
            words = [(w["s"] - o, w["e"] - o, w["t"]) for w in load_json(a.timeline)["words"]
                     if x["gen"][0] - 0.01 <= w["s"] and w["e"] <= x["gen"][1] + 0.05]
            frames_05s.make_sheets(a.video, a.sheet_dir, words, width=300, cols=6, rows=4, quiet=True)
            res["sheet"] = os.path.join(a.sheet_dir, "sheet_00.jpg")
    ok = not in_bad and not in_cuts and not in_jumps
    res.update({"verdict": "PASS" if ok else "FAIL", "bad_windows_s": in_bad, "cuts_s": in_cuts, "jumps_s": in_jumps,
                "audio_min": round(min(c for _, c in wins), 2) if wins else None})
    if a.plan:
        res["bad_all"] = bad
    if ratio is not None:
        res["text_ratio"] = ratio
    if hyp is not None:
        res["whisper"] = hyp[:160]
    if jump_note:
        res["jump_check"] = "skipped"
    print(json.dumps(res, ensure_ascii=False))
    if a.strict and not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
