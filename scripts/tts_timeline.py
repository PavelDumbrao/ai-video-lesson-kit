#!/usr/bin/env python3
"""Сценарий урока (## раздел / **ключевое** / [тег]) → голос ElevenLabs с таймингами слов → voice.wav + timeline.json.

  python3 scripts/tts_timeline.py script.md outdir [--stability 0.25] [--model eleven_v4_turbo] [--dry-run]

Ключ и голос — только из переменных окружения: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID (без них — ошибка
«нет ключа …»; значения нигде не печатаются). Запрос — `with-timestamps` (формат wav_48000, язык ru).
Выход в outdir: voice.wav (48 кГц), voice.mp3 (192k), timeline.json (fps, duration, sections, words, lines,
keywords), words_video.json (слова со сдвигом +0,5 с для листов кадров), tts_text.txt (текст, ушедший в озвучку).
Текст длиннее --max-chars (по умолчанию 9000 знаков с тегами) скрипт сам режет на части по границам `## Раздел`,
озвучивает части (до --jobs одновременно) и сшивает в один voice.wav + timeline.json паузой --gap (0,5 с).
Готовые части лежат в outdir/parts/partNN и при повторном запуске с тем же текстом не озвучиваются заново
(не платите дважды); --force озвучит всё заново. --dry-run — только разбор сценария и план частей, без сети и ключей.
"""
import argparse
import base64
import difflib
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_common import need_ffmpeg, probe_duration  # noqa: E402
from merge_timeline import merge, write_words_video  # noqa: E402

END_PUNCT = re.compile(r"[.!?…»]$")
SOFT = (",", ":", ";")
HANGING = {"в", "во", "и", "а", "но", "на", "о", "об", "к", "ко", "с", "со", "у", "за", "по", "из", "от", "до", "не", "ни", "для", "при", "про", "без", "над", "под", "что", "как", "или", "это", "я", "мы", "вы", "ты"}  # предпочтительные места разреза строки караоке
API_BASE = "https://api.elevenlabs.io/v1"
OUTPUT_FORMAT = "wav_48000"
CHARS_PER_SEC = 16.5  # ≈ 16–17 знаков/с у Eleven v4 Turbo (skills/lesson-script) — только для оценки в --dry-run


def die(msg):
    sys.exit(msg)


def split_blocks(md):
    """Сценарий → список разделов [(заголовок, тело)]. Файл должен начинаться с `## `; текст до первого `##` — ошибка."""
    md = md.strip()
    head, *rest = re.split(r"(?m)^## ", md)
    if head.strip():
        die("сценарий должен начинаться с «## Название раздела» (найден текст до первого ##: "
            f"«{head.strip()[:50]}…»)")
    blocks = []
    for block in rest:
        if not block.strip():
            continue
        title, _, body = block.partition("\n")
        blocks.append((title.strip(), body))
    if not blocks:
        die("в сценарии нет ни одного раздела «## …»")
    return blocks


def parse_blocks(blocks):
    """Разделы [(title, body)] → текст для TTS, разделы [(title, char_start, char_end)] и ключевые [(text, start, end)]."""
    tts, sections, keywords = "", [], []
    for title, body in blocks:
        body = " ".join(body.split())
        if tts:
            tts += "\n\n"
        start = len(tts)
        out = ""
        for part in re.split(r"(\*\*[^*]+\*\*)", body):
            if part.startswith("**") and part.endswith("**"):
                word = part[2:-2]
                keywords.append((word, start + len(out), start + len(out) + len(word)))
                out += word
            else:
                out += part
        tts += out
        sections.append((title.strip(), start, len(tts)))
    return tts, sections, keywords


def parse(md):
    """Возвращает текст для TTS, разделы [(title, char_start, char_end)] и ключевые [(text, start, end)]."""
    return parse_blocks(split_blocks(md))


def plan_parts(blocks, max_chars):
    """Делит разделы на части ≤ max_chars знаков (с тегами) по границам разделов. Возвращает список списков блоков."""
    parts, cur, cur_len = [], [], 0
    for b in blocks:
        n = len(parse_blocks([b])[0])
        if n > max_chars:
            die(f"раздел «{b[0]}» — {n} знаков, больше --max-chars {max_chars}: разбейте его на два раздела")
        add = n + (2 if cur else 0)  # «\n\n» между разделами
        if cur and cur_len + add > max_chars:
            parts.append(cur)
            cur, cur_len, add = [], 0, n
        cur.append(b)
        cur_len += add
    if cur:
        parts.append(cur)
    return parts


def words_of(tts):
    """Слова вне [тегов] с позициями символов: [(text, start, end)]."""
    masked = re.sub(r"\[[^\]]*\]", lambda m: " " * len(m.group(0)), tts)
    return [(m.group(0), m.start(), m.end()) for m in re.finditer(r"\S+", masked)
            if re.search(r"[0-9A-Za-zА-Яа-яЁё]", m.group(0))]


def get_credentials():
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    voice = os.environ.get("ELEVENLABS_VOICE_ID", "").strip()
    miss = [n for n, v in (("ELEVENLABS_API_KEY", key), ("ELEVENLABS_VOICE_ID", voice)) if not v]
    if miss:
        die("нет ключа/голоса: не заданы " + ", ".join(miss) + ". Положите их в .env и загрузите в окружение "
            "(например: set -a; . ./.env; set +a). Значения не печатаются.")
    return key, voice


def synth(text, stability, model, key, voice, similarity=0.8):
    body = {"text": text, "model_id": model, "language_code": "ru",
            "voice_settings": {"stability": stability, "similarity_boost": similarity}}
    url = f"{API_BASE}/text-to-speech/{urllib.parse.quote(voice, safe='')}/with-timestamps?output_format={OUTPUT_FORMAT}"
    for attempt in range(4):
        req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                     headers={"xi-api-key": key, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3:  # слишком много одновременных запросов — подождать (отказ 429 не списывает кредиты)
                time.sleep(15 * (attempt + 1))
                continue
            sys.exit(f"ElevenLabs HTTP {e.code}: {e.read()[:300].decode(errors='replace')}")
        except urllib.error.URLError as e:
            sys.exit(f"ElevenLabs: нет связи ({e.reason})")


def char_times(tts, alignment):
    """Время начала/конца для каждого символа входного текста (None, если символ не озвучен)."""
    chars = alignment["characters"]
    st, en = alignment["character_start_times_seconds"], alignment["character_end_times_seconds"]
    got = "".join(chars)
    starts, ends = [None] * len(tts), [None] * len(tts)
    if got == tts:
        return st, en
    sm = difflib.SequenceMatcher(None, tts, got, autojunk=False)
    for a, b, n in sm.get_matching_blocks():
        for k in range(n):
            starts[a + k], ends[a + k] = st[b + k], en[b + k]
    return starts, ends


def span_time(starts, ends, a, b):
    s = next((starts[i] for i in range(a, b) if starts[i] is not None), None)
    e = next((ends[i] for i in range(b - 1, a - 1, -1) if ends[i] is not None), None)
    return s, e


def _split_balanced(idx, words, max_words, max_chars, nobreak=frozenset()):
    """Делит фразу на минимум строк одинаковой длины; разрез — по возможности после запятой. Без висящих одиночных слов.
    nobreak — индексы слов, после которых резать нельзя (внутри ключевой фразы)."""
    clen = lambda part: sum(len(words[j]["t"]) for j in part) + len(part) - 1
    k = 1
    while True:
        target = clen(idx) / k
        parts, cur = [], []
        for n, j in enumerate(idx):
            cur.append(j)
            left = len(idx) - n - 1
            if len(parts) < k - 1 and left and clen(cur) >= target * 0.85:
                if j in nobreak:
                    continue
                nxt = idx[n + 1:n + 3]  # если через 1–2 слова запятая — режем там
                if not words[j]["t"].endswith(SOFT) and any(words[x]["t"].endswith(SOFT) for x in nxt) \
                        and clen(cur + nxt) <= target * 1.25:
                    continue
                carry = []  # запятая/двоеточие на слово раньше — режем там
                if not words[j]["t"].endswith(SOFT) and len(cur) > 2 and words[cur[-2]]["t"].endswith(SOFT) \
                        and cur[-2] not in nobreak and clen(cur[:-1]) >= target * 0.6:
                    carry = [cur.pop()]
                parts.append(cur)
                cur = carry
        parts.append(cur)
        ok = all(len(p) <= max_words and clen(p) <= max_chars for p in parts) and all(len(p) > 1 for p in parts if len(idx) > 2)
        if ok or k >= len(idx):
            return [p for p in parts if p]
        k += 1


def build_lines(words, keywords=(), max_words=8, max_chars=34, gap=0.45):
    """Строки караоке: фраза (до точки/паузы/смены раздела) целиком, если влезает, иначе ровными частями.
    34 знака ≈ 1600 px при Montserrat 700 64px; ключевые фразы не разрываются между строками."""
    inside = lambda i, k: k["s"] - 0.01 <= words[i]["s"] and words[i]["e"] <= k["e"] + 0.01
    nobreak = frozenset(i for i in range(len(words) - 1) for k in keywords if inside(i, k) and inside(i + 1, k))
    nobreak |= {i for i, w in enumerate(words) if w["t"].lower() in HANGING}  # предлог/союз не оставлять в конце строки
    phrases, cur = [], []
    for i, w in enumerate(words):
        if cur:
            prev = words[cur[-1]]
            if w["sec"] != prev["sec"] or END_PUNCT.search(prev["t"]) or w["s"] - prev["e"] > gap:
                phrases.append(cur)
                cur = []
        cur.append(i)
    if cur:
        phrases.append(cur)
    lines = [part for ph in phrases for part in _split_balanced(ph, words, max_words, max_chars, nobreak)]
    return [{"s": words[l[0]]["s"], "e": words[l[-1]]["e"], "w": l} for l in lines]


def synth_part(blocks, outdir, a, key, voice, label="голос"):
    """Озвучивает набор разделов → outdir/{voice.wav, voice.mp3, timeline.json, tts_text.txt}. Возвращает сводку."""
    tts, sections, keywords = parse_blocks(blocks)
    os.makedirs(outdir, exist_ok=True)
    sig = hashlib.sha256(f"{tts}|{a.model}|{a.stability}|{voice}".encode()).hexdigest()
    sigf = os.path.join(outdir, "tts_sig.txt")
    wav = os.path.join(outdir, "voice.wav")
    tlf = os.path.join(outdir, "timeline.json")
    if not a.force and os.path.exists(wav) and os.path.exists(tlf) and os.path.exists(sigf) \
            and open(sigf, encoding="utf-8").read().strip() == sig:
        tl = json.load(open(tlf, encoding="utf-8"))
        print(f"{label}: уже озвучено тем же текстом — пропуск (--force озвучит заново)", file=sys.stderr)
        return {"duration": tl["duration"], "chars": len(tts), "words": len(tl["words"]), "lines": len(tl["lines"]),
                "sections": len(tl["sections"]), "keywords": len(tl["keywords"]), "reused": True}
    with open(os.path.join(outdir, "tts_text.txt"), "w", encoding="utf-8") as f:
        f.write(tts)
    print(f"{label}: озвучка {len(tts)} знаков…", file=sys.stderr, flush=True)
    res = synth(tts, a.stability, a.model, key, voice)
    with open(wav, "wb") as f:
        f.write(base64.b64decode(res["audio_base64"]))
    starts, ends = char_times(tts, res["alignment"])

    def sec_of(pos):
        return next(i for i, (_, s, e) in enumerate(sections) if s <= pos <= e)

    words = []
    for t, s0, e0 in words_of(tts):
        s, e = span_time(starts, ends, s0, e0)
        if s is None or e is None:
            print(f"WARN: нет тайминга для слова {t!r}", file=sys.stderr)
            continue
        words.append({"t": t, "s": round(s, 3), "e": round(e, 3), "sec": sec_of(s0)})

    dur = probe_duration(wav)
    secs = []
    for i, (title, s0, e0) in enumerate(sections):
        ws = [w for w in words if w["sec"] == i]
        secs.append({"title": title, "s": ws[0]["s"] if ws else 0, "e": ws[-1]["e"] if ws else 0})
    kws = []
    for text, s0, e0 in keywords:
        s, e = span_time(starts, ends, s0, e0)
        if s is not None:
            kws.append({"t": text, "s": round(s, 3), "e": round(e, 3), "sec": sec_of(s0)})

    timeline = {"fps": 30, "duration": round(dur, 3), "sections": secs, "words": words,
                "lines": build_lines(words, kws), "keywords": kws}
    with open(tlf, "w", encoding="utf-8") as f:
        json.dump(timeline, f, ensure_ascii=False, indent=1)
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", wav, "-c:a", "libmp3lame", "-b:a", "192k",
                    os.path.join(outdir, "voice.mp3")], check=True)
    with open(sigf, "w", encoding="utf-8") as f:  # подпись пишем последней: часть считается готовой только целиком
        f.write(sig)
    return {"duration": timeline["duration"], "chars": len(tts), "words": len(words), "lines": len(timeline["lines"]),
            "sections": len(secs), "keywords": len(kws),
            "exact_alignment": "".join(res["alignment"]["characters"]) == tts}


def main():
    ap = argparse.ArgumentParser(description="Сценарий (## раздел, [тег], **ключевое**) → voice.wav + timeline.json через ElevenLabs")
    ap.add_argument("lesson", help="script.md сценария")
    ap.add_argument("outdir", help="папка результата (voice.wav, voice.mp3, timeline.json, …)")
    ap.add_argument("--stability", type=float, default=0.25, help="stability голоса, по умолчанию 0.25")
    ap.add_argument("--model", default="eleven_v4_turbo", help="model_id ElevenLabs, по умолчанию eleven_v4_turbo (проверить по документации ElevenLabs)")
    ap.add_argument("--max-chars", type=int, default=9000, help="максимум знаков (с тегами) в одном запросе; длиннее — части по разделам (по умолчанию 9000)")
    ap.add_argument("--gap", type=float, default=0.5, help="пауза между частями при сшивке, с (по умолчанию 0.5)")
    ap.add_argument("--jobs", type=int, default=2, help="сколько частей озвучивать одновременно (лимит одновременных запросов зависит от тарифа — проверить)")
    ap.add_argument("--force", action="store_true", help="озвучить заново, даже если части уже готовы")
    ap.add_argument("--dry-run", action="store_true", help="только разбор сценария и план частей (без сети и ключей)")
    a = ap.parse_args()

    if not os.path.isfile(a.lesson):
        die(f"нет файла сценария: {a.lesson}")
    with open(a.lesson, encoding="utf-8") as f:
        blocks = split_blocks(f.read())
    parts = plan_parts(blocks, a.max_chars)
    tts_all, _, kw_all = parse_blocks(blocks)
    spoken = len(re.sub(r"\[[^\]]*\]", "", tts_all).replace("\n", ""))
    print(f"сценарий: {len(blocks)} разделов, {len(tts_all)} знаков в озвучку (с тегами), {spoken} знаков речи, "
          f"ключевых слов {len(kw_all)}, ≈ {spoken / CHARS_PER_SEC / 60:.1f} мин при {CHARS_PER_SEC} знаков/с")
    print(f"запросов к ElevenLabs: {len(parts)} (лимит части {a.max_chars} знаков; режем по границам разделов)")
    for k, p in enumerate(parts, 1):
        n = len(parse_blocks(p)[0])
        print(f"  часть {k}: разделы «{p[0][0]}» … «{p[-1][0]}» ({len(p)} шт.), {n} знаков")
    if a.dry_run:
        print("dry-run: озвучка не запускалась")
        return

    need_ffmpeg()
    key, voice = get_credentials()
    os.makedirs(a.outdir, exist_ok=True)
    if len(parts) == 1:
        info = synth_part(parts[0], a.outdir, a, key, voice)
        tl = json.load(open(os.path.join(a.outdir, "timeline.json"), encoding="utf-8"))
        write_words_video(a.outdir, tl)
    else:
        dirs = [os.path.join(a.outdir, "parts", f"part{k:02d}") for k in range(1, len(parts) + 1)]
        with ThreadPoolExecutor(max_workers=max(1, a.jobs)) as ex:
            futs = [ex.submit(synth_part, p, d, a, key, voice, f"часть {k}/{len(parts)}")
                    for k, (p, d) in enumerate(zip(parts, dirs), 1)]
            infos = [f.result() for f in futs]
        info = merge(a.outdir, dirs, a.gap)
        info.update({"chars": len(tts_all), "parts": len(parts), "reused_parts": sum(bool(i.get("reused")) for i in infos)})
        with open(os.path.join(a.outdir, "tts_text.txt"), "w", encoding="utf-8") as f:
            f.write(tts_all)
    print(json.dumps(info, ensure_ascii=False))


if __name__ == "__main__":
    main()
