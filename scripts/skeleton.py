#!/usr/bin/env python3
"""Каркас урока N в проекте Remotion: заглушки сцен по раскадровке + регистрация урока.

  python3 scripts/skeleton.py N --project remotion [--sub "Название урока"] [--check]

Нужны <project>/public/lessonN/timeline.json и storyboard.json (после resolve_storyboard.py); типы сцен в
раскадровке — с префиксом lN_ (l1_hook, l1_voice …). Делает:
  • src/motion/scenes/lN/<Сцена>.tsx — заглушки `() => null` (существующие файлы НЕ трогает: там уже работа);
  • src/motion/scenes/lN/index.ts — LN_SCENES (тип → компонент), пересоздаётся из раскадровки;
  • src/motion/scenes/index.ts — import { LN_SCENES } и `...LN_SCENES,` в SCENES;
  • src/lessons.ts — 4 строки импорта json и запись урока `{ n: N, … }` над маркерами `@lessons:imports` и
    `@lessons:entries` (Root.tsx не меняется: композиции строятся из массива LESSONS);
  • src/theme.ts — запись SERIES[N] = { ...DEFAULT_SERIES, sub } (название урока на финальной карточке), если задан --sub
    и такой записи ещё нет (--no-theme — не трогать theme.ts);
  • public/lessonN/aroll.json и screens.json — пустые, если их нет.
Повторный запуск безопасен (ничего не дублирует). --check — после этого `npx tsc --noEmit` в проекте.
Формат реестра src/lessons.ts описан в remotion/README.md и в шапке самого файла.
"""
import argparse
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_common import KIT_ROOT, die as _die  # noqa: E402


def die(m):
    _die(f"skeleton: {m}")


def rd(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def wr(p, s):
    with open(p, "w", encoding="utf-8") as f:
        f.write(s)


def camel(t):
    return "".join(w[:1].upper() + w[1:] for w in t.split("_") if w)


def insert_before_marker(src, marker, text):
    """Вставляет строки text над строкой с маркером (с её отступом)."""
    m = re.search(rf"^([ \t]*)(.*{re.escape(marker)}.*)$", src, re.M)
    if not m:
        die(f"в файле нет маркера «{marker}» — формат реестра нарушен (см. remotion/src/lessons.ts)")
    ind = m.group(1)
    block = "".join(f"{ind}{ln}\n" for ln in text.splitlines())
    return src[:m.start()] + block + src[m.start():]


def add_import(src, line, after_re):
    """Вставляет строку импорта после последней строки, подходящей под after_re (если её ещё нет)."""
    if line in src:
        return src
    last = None
    for m in re.finditer(after_re, src, re.M):
        last = m
    if not last:
        return line + "\n" + src
    i = src.index("\n", last.end()) + 1
    return src[:i] + line + "\n" + src[i:]


def register_scenes_index(path, n, sub, pre):
    s = rd(path)
    key = f"{pre.upper()}_SCENES"
    s = add_import(s, f'import {{ {key} }} from "./{pre}";', r'^import .*$')
    if f"...{key}," not in s:
        m = re.search(r"export const SCENES\b[^=]*=\s*\{.*?(^\};)", s, re.S | re.M)
        if not m:
            die(f"{path}: не нашёл конец объекта SCENES")
        note = f"  // урок {n}" + (f": {sub}" if sub else "") + "\n"
        s = s[:m.start(1)] + note + f"  ...{key},\n" + s[m.start(1):]
    wr(path, s)


def register_lessons_ts(path, n):
    s = rd(path)
    imports = [
        f'import t{n} from "../public/lesson{n}/timeline.json";',
        f'import s{n} from "../public/lesson{n}/storyboard.json";',
        f'import a{n} from "../public/lesson{n}/aroll.json";',
        f'import sc{n} from "../public/lesson{n}/screens.json";',
    ]
    new_imports = [ln for ln in imports if ln not in s]
    if new_imports:
        s = insert_before_marker(s, "@lessons:imports", "\n".join(new_imports))
    if not re.search(rf"\{{\s*n:\s*{n}\s*,", s):
        entry = f"{{ n: {n}, timeline: t{n}, storyboard: s{n}, aroll: a{n} as Aroll, screens: sc{n} }},"
        s = insert_before_marker(s, "@lessons:entries", entry)
    wr(path, s)


def register_series(path, n, sub):
    """SERIES[N] = { ...DEFAULT_SERIES, sub } — только если блок SERIES в theme.ts стандартный. Возвращает текст-подсказку или None."""
    s = rd(path)
    m = re.search(r"(export const SERIES\b[^=]*=\s*\{)(.*?)(^\};)", s, re.S | re.M)
    if not m or "DEFAULT_SERIES" not in s:
        return f'в theme.ts не нашёл стандартный блок SERIES — добавьте вручную: {n}: {{ tag: "…", title: "…", hideNo: true, sub: {json.dumps(sub, ensure_ascii=False)} }}'
    if re.search(rf"^\s*{n}\s*:", m.group(2), re.M):
        return None  # запись уже есть — не перезаписываем
    line = f"  {n}: {{ ...DEFAULT_SERIES, sub: {json.dumps(sub, ensure_ascii=False)} }},\n"
    wr(path, s[:m.start(3)] + line + s[m.start(3):])
    return None


def main():
    ap = argparse.ArgumentParser(description="Каркас урока N в проекте Remotion: заглушки сцен + регистрация (scenes/index.ts, lessons.ts)")
    ap.add_argument("n", type=int, help="номер урока (композиция LessonN, папка public/lessonN)")
    ap.add_argument("--project", default=os.path.join(KIT_ROOT, "remotion"), help="папка проекта Remotion (по умолчанию <KIT_ROOT>/remotion)")
    ap.add_argument("--sub", help="название урока (финальная карточка серии); без него SERIES[N] не создаётся")
    ap.add_argument("--no-theme", action="store_true", help="не трогать src/theme.ts")
    ap.add_argument("--check", action="store_true", help="после каркаса запустить npx tsc --noEmit")
    a = ap.parse_args()

    n, pre = a.n, f"l{a.n}"
    repo = os.path.abspath(a.project)
    src, pub = os.path.join(repo, "src"), os.path.join(repo, "public", f"lesson{n}")
    for f in ("timeline.json", "storyboard.json"):
        if not os.path.exists(os.path.join(pub, f)):
            die(f"нет {os.path.join(pub, f)} — сначала tts_timeline.py и resolve_storyboard.py")
    for f in ("src/lessons.ts", "src/motion/scenes/index.ts"):
        if not os.path.exists(os.path.join(repo, f)):
            die(f"{repo} не похож на проект Remotion набора: нет {f}")
    types = []
    for s in json.loads(rd(os.path.join(pub, "storyboard.json")))["scenes"]:
        if s["type"] not in types:
            types.append(s["type"])
    bad = [t for t in types if not t.startswith(pre + "_")]
    if bad:
        die(f"типы сцен без префикса {pre}_: {bad} (resolve_storyboard.py --renumber {n} переименует l<число>_ → {pre}_)")
    comps = {t: camel(t[len(pre) + 1:]) for t in types}
    if len(set(comps.values())) != len(comps):
        die(f"совпали имена компонентов: {comps}")
    if any(not re.match(r"^[A-Za-z_]\w*$", c) for c in comps.values()):
        die(f"тип сцены даёт неверное имя компонента: {comps}")

    d = os.path.join(src, "motion", "scenes", pre)
    os.makedirs(d, exist_ok=True)
    made = []
    for t, c in comps.items():
        p = os.path.join(d, f"{c}.tsx")
        if not os.path.exists(p):
            wr(p, 'import React from "react";\nimport { SceneProps } from "../../types";\n\n'
                  f'// ЗАГЛУШКА: сцену пишет отдельный агент (тип {t})\nexport const {c}: React.FC<SceneProps> = () => null;\n')
            made.append(c)
    imp = "".join(f'import {{ {c} }} from "./{c}";\n' for c in sorted(comps.values()))
    reg = "".join(f"  {t}: {c},\n" for t, c in comps.items())
    title = f", «{a.sub}»" if a.sub else ""
    wr(os.path.join(d, "index.ts"),
       f'import React from "react";\nimport {{ SceneProps }} from "../../types";\n{imp}\n'
       f'/** Урок {n} (композиция Lesson{n}{title}): тип сцены → компонент. Файл собирает scripts/skeleton.py. */\n'
       f"export const {pre.upper()}_SCENES: Record<string, React.FC<SceneProps>> = {{\n{reg}}};\n")

    register_scenes_index(os.path.join(src, "motion", "scenes", "index.ts"), n, a.sub, pre)
    for fn, body in (("aroll.json", {"fps_source": 24, "segments": []}), ("screens.json", {"screens": []})):
        if not os.path.exists(os.path.join(pub, fn)):
            wr(os.path.join(pub, fn), json.dumps(body) + "\n")
    register_lessons_ts(os.path.join(src, "lessons.ts"), n)
    hint = None
    if a.sub and not a.no_theme and os.path.exists(os.path.join(src, "theme.ts")):
        hint = register_series(os.path.join(src, "theme.ts"), n, a.sub)

    print(f"Lesson{n}: {len(types)} сцен, новых заглушек {len(made)} → src/motion/scenes/{pre}/; lessons.ts и scenes/index.ts обновлены")
    if hint:
        print("ВНИМАНИЕ:", hint)
    if not a.sub:
        print(f"подсказка: название урока для финальной карточки — SERIES[{n}] в src/theme.ts (или повторите с --sub)")
    if a.check:
        if not os.path.isdir(os.path.join(repo, "node_modules")):
            die(f"нет {repo}/node_modules — выполните `npm install` в {repo}")
        r = subprocess.run(["npx", "tsc", "--noEmit"], cwd=repo, capture_output=True, text=True, stdin=subprocess.DEVNULL)
        out = (r.stdout + r.stderr).strip()
        print("tsc: ошибок нет" if r.returncode == 0 else "tsc: ОШИБКИ\n" + "\n".join(out.splitlines()[:30]))
        if r.returncode:
            sys.exit(1)


if __name__ == "__main__":
    main()
