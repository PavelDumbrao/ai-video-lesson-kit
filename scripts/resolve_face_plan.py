#!/usr/bin/env python3
"""face_plan.json (места лица со словами-якорями) + timeline.json → plan.json (секунды).

  python3 scripts/resolve_face_plan.py face_plan.json --timeline timeline.json --out plan.json

Место: {"id": "F01", "section": 0, "from": "То что", "to": "стоял", "mode": "full|full→corner|corner→full",
        "switch": "Лицо", "side": "left|right", "why": "…"}
  • якорь — слово-префикс или фраза из 2–3 слов (нижний регистр, ё=е, без пунктуации);
  • окно показа — от слова `from` до конца предложения со словом `to` (внутри раздела `section`);
    предложение кончается словом на . ! ? … или концом раздела; окно > 11,2 с — ошибка;
  • switch — слово переключения (full→corner / corner→full): switch_t = секунда его начала;
  • окна разных мест не должны пересекаться.
Результат (список по местам): id, display [s, e], gen [s, e], switch_t, pad, dur, mode, clipStart, side, why.
  gen — кусок голоса для модели лица; dur — длина ролика (8–12 с); pad — тишина по краям (0,4 с).
Код возврата 1, если есть ошибки (окно длиннее нормы, якорь не найден, пересечения).
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_common import SENT_END, find_anchor, face_timing, load_json, save_json, MAX_WINDOW  # noqa: E402

MODES = ("full", "full→corner", "corner→full", "corner")


def resolve(places, timeline, storyboard=None):
    """Возвращает (plan, errors, warnings)."""
    words, total = timeline["words"], timeline["duration"]
    plan, errors, warns = [], [], []
    seen = set()
    for p in places:
        pid = p.get("id", "?")
        err = lambda m: errors.append(f"{pid}: {m}")  # noqa: E731
        if pid in seen:
            err("повтор id")
        seen.add(pid)
        mode = p.get("mode", "full")
        if mode not in MODES:
            err(f"неизвестный mode «{mode}» (full | full→corner | corner→full)")
            continue
        if "section" not in p or "from" not in p or "to" not in p:
            err("нужны поля section, from, to")
            continue
        side = p.get("side", "right")
        if side not in ("left", "right"):
            err(f"side «{side}» — нужно left или right")
            continue
        sec = [w for w in words if w["sec"] == p["section"]]
        if not sec:
            err(f"в timeline нет слов раздела {p['section']}")
            continue
        i = find_anchor(sec, p["from"])
        if i is None:
            err(f"якорь from «{p['from']}» не найден в разделе {p['section']}")
            continue
        j = find_anchor(sec, p["to"], start=i)
        if j is None:
            err(f"якорь to «{p['to']}» не найден после «{p['from']}» в разделе {p['section']}")
            continue
        k = j  # конец предложения со словом `to`
        while k < len(sec) - 1 and not SENT_END.search(sec[k]["t"]):
            k += 1
        s, e = round(sec[i]["s"], 2), round(sec[k]["e"], 2)
        ln = e - s
        if ln > MAX_WINDOW:
            err(f"окно {s:.2f}–{e:.2f} = {ln:.1f} с длиннее {MAX_WINDOW} с — сократите (to раньше) или разбейте место")
            continue
        pad, dur, gen = face_timing((s, e), total)
        switch_t = None
        if mode in ("full→corner", "corner→full"):
            if not p.get("switch"):
                err(f"режим {mode} требует поле switch (слово переключения)")
                continue
            m = find_anchor(sec, p["switch"], start=i, end=k + 1)
            if m is None:
                err(f"switch «{p['switch']}» не найден внутри окна {s:.2f}–{e:.2f}")
                continue
            switch_t = round(sec[m]["s"], 2)
            if not (s < switch_t < e):
                err(f"switch_t {switch_t} вне окна {s}–{e}")
                continue
        if gen[1] - gen[0] < 5:
            warns.append(f"{pid}: речи в куске голоса {gen[1] - gen[0]:.1f} с (< 5 с) — модели лица мало звука, возьмите соседнюю фразу")
        plan.append({"id": pid, "display": [s, e], "gen": gen, "switch_t": switch_t, "pad": pad, "dur": dur,
                     "mode": mode, "clipStart": pad, "side": side, "why": p.get("why", "")})
    # пересечения окон
    ordered = sorted(plan, key=lambda x: x["display"][0])
    for a, b in zip(ordered, ordered[1:]):
        if b["display"][0] < a["display"][1]:
            errors.append(f"{a['id']} и {b['id']}: окна пересекаются ({a['display']} / {b['display']})")
    # правило «первые 10 секунд ролика — с лицом» (skills/video-lesson-studio, правило 8): предупреждение
    if ordered and words and len(ordered) == len(places):  # при ошибках разрешения правило не проверяем: «первым» оказалось бы не то место
        first, w0 = ordered[0], words[0]["s"]
        if first["display"][0] > w0 + 0.5:
            warns.append(f"{first['id']}: первое место начинается на {first['display'][0]:.2f} с, а речь — на {w0:.2f} с; "
                         "ролик должен открываться лицом с первого слова (from = первое слово раздела 0)")
        elif first["display"][1] - first["display"][0] < 10 - 0.05:
            warns.append(f"{first['id']}: первое место {first['display'][1] - first['display'][0]:.1f} с — короче 10 с; "
                         "продлите `to` до конца следующего предложения (окно ≤ 11,2 с)")
    # биты графики внутри окон «во весь экран» (предупреждение)
    if storyboard:
        for x in plan:
            s, e = x["display"]
            sw = x["switch_t"]
            full = {"full": (s, e), "full→corner": (s, sw), "corner→full": (sw, e)}.get(x["mode"])
            if not full:
                continue
            for sc in storyboard.get("scenes", []):
                for b in sc.get("beats", []):
                    if full[0] + 0.05 < b["t"] < full[1] - 0.05:  # бит ровно на границе (слово переключения) — норма
                        warns.append(f"{x['id']}: бит «{b.get('word', '')}» ({b['t']:.2f} с) внутри окна «во весь экран» {full[0]}–{full[1]}")
    return plan, errors, warns


def main():
    ap = argparse.ArgumentParser(description="face_plan.json + timeline.json → plan.json (места лица в секундах)")
    ap.add_argument("face_plan", help="face_plan.json — места лица со словами-якорями")
    ap.add_argument("--timeline", required=True, help="timeline.json (tts_timeline.py / merge_timeline.py)")
    ap.add_argument("--out", required=True, help="куда записать plan.json")
    ap.add_argument("--storyboard", help="разрешённый storyboard.json (из resolve_storyboard.py) — предупредить о битах внутри окон «во весь экран»")
    a = ap.parse_args()

    fp = load_json(a.face_plan)
    places = fp["places"] if isinstance(fp, dict) else fp
    tl = load_json(a.timeline)
    sb = load_json(a.storyboard) if a.storyboard else None
    plan, errors, warns = resolve(places, tl, sb)
    for w in warns:
        print("ВНИМАНИЕ:", w, file=sys.stderr)
    for e in errors:
        print("ОШИБКА:", e, file=sys.stderr)
    if errors:
        print(f"{len(plan)} мест из {len(places)} разрешено, ошибок {len(errors)} — plan.json не записан", file=sys.stderr)
        sys.exit(1)
    save_json(a.out, plan)
    total = sum(x["dur"] for x in plan)
    for x in plan:
        sw = f", switch {x['switch_t']}" if x["switch_t"] is not None else ""
        print(f"{x['id']} {x['mode']:12} показ {x['display'][0]:.2f}–{x['display'][1]:.2f} ({x['display'][1] - x['display'][0]:.1f} с), "
              f"ролик {x['dur']} с, голос {x['gen'][0]}–{x['gen'][1]}{sw}, угол {x['side']}")
    print(f"{len(plan)} мест лица, ошибок 0, предупреждений {len(warns)}; суммарно роликов {total} с → {a.out}")


if __name__ == "__main__":
    main()
