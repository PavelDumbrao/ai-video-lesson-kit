#!/usr/bin/env python3
"""storyboard.json (слова-якоря) + timeline.json → storyboard.json в секундах (public/lessonN/storyboard.json).

  python3 scripts/resolve_storyboard.py storyboard.json --timeline audio/timeline.json \\
          --out remotion/public/lesson1/storyboard.json [--lesson 29] [--renumber 1]

Вход: {"<номер урока>": [{"section": 0, "type": "l1_hook", "beats": [["слово-якорь", "что показать"], …]}, …]}
(ключи, начинающиеся с «_», — комментарии, пропускаются). Если в файле один урок — он берётся сам,
иначе укажите --lesson.
Сцена длится от начала раздела до начала следующего (последняя — до конца голоса). Каждый бит получает
{"t": секунда начала слова-якоря, "word": слово, "label": что показать}. Якорь — префикс слова
(нижний регистр, ё=е, без пунктуации); биты ищутся по порядку внутри раздела.
--renumber N переименовывает префикс типов сцен l<число>_ в lN_ (пример: l29_hook → l1_hook).
Код возврата 1, если хоть один якорь не найден (файл при этом не пишется).
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_common import die, load_json, norm, save_json  # noqa: E402


def resolve(scenes, timeline, label="", renumber=None):
    """Возвращает (список сцен в секундах, число ошибок)."""
    secs, words = timeline["sections"], timeline["words"]
    out, errors = [], 0
    for sc in scenes:
        i = sc["section"]
        if not (0 <= i < len(secs)):
            print(f"{label} section{i}: в timeline нет такого раздела (всего {len(secs)})", file=sys.stderr)
            errors += 1
            continue
        start = secs[i]["s"]
        end = secs[i + 1]["s"] if i + 1 < len(secs) else timeline["duration"]
        sw = [w for w in words if w["sec"] == i]
        pos, beats = 0, []
        for anchor, text in sc["beats"]:
            a = norm(anchor)
            k = next((k for k in range(pos, len(sw)) if norm(sw[k]["t"]).startswith(a)), None) if a else None
            if k is None:
                print(f"{label} section{i} {sc['type']}: якорь '{anchor}' не найден после слова #{pos}", file=sys.stderr)
                errors += 1
                continue
            beats.append({"t": sw[k]["s"], "word": sw[k]["t"], "label": text})
            pos = k + 1
        typ = sc["type"]
        if renumber is not None:
            typ = re.sub(r"^l\d+_", f"l{renumber}_", typ)
        out.append({"section": i, "title": secs[i]["title"], "type": typ, "s": start, "e": end, "beats": beats})
    return out, errors


def main():
    ap = argparse.ArgumentParser(description="storyboard.json (якоря) + timeline.json → storyboard.json (секунды)")
    ap.add_argument("storyboard", help="storyboard.json со словами-якорями")
    ap.add_argument("--timeline", required=True, help="timeline.json урока")
    ap.add_argument("--out", required=True, help="куда записать разрешённый storyboard.json (например remotion/public/lessonN/storyboard.json)")
    ap.add_argument("--lesson", help="ключ урока в storyboard.json (если уроков несколько)")
    ap.add_argument("--renumber", type=int, help="заменить префикс типов сцен l<число>_ на l<N>_")
    a = ap.parse_args()

    sb = load_json(a.storyboard)
    keys = [k for k in sb if not k.startswith("_")]
    if a.lesson is None:
        if len(keys) != 1:
            die(f"в {a.storyboard} уроки {keys}: укажите --lesson")
        a.lesson = keys[0]
    if a.lesson not in sb:
        die(f"в {a.storyboard} нет урока «{a.lesson}» (есть: {keys})")
    tl = load_json(a.timeline)
    out, errors = resolve(sb[a.lesson], tl, label=f"lesson{a.lesson}", renumber=a.renumber)
    if errors:
        die(f"lesson{a.lesson}: ошибок {errors} — {a.out} не записан (поправьте якорь в раскадровке, не текст)")
    save_json(a.out, {"scenes": out})
    print(f"lesson{a.lesson}: {len(out)} scenes, {sum(len(s['beats']) for s in out)} beats → {a.out}")


if __name__ == "__main__":
    main()
