# remotion/ — проект графики урока

Универсальный проект Remotion 4 (React 19, TypeScript): караоке по словам, ключевые слова-фон, карточки разделов, верхняя панель с прогрессом, финальная карточка, слой лица автора (A-roll) с переходами и вставки живого экрана. Графика урока — это **сцены**: по одной на раздел, каждая появляется синхронно со словами голоса.

Любой урок N регистрируется **данными** `public/lessonN/*.json` и **папкой сцен** `src/motion/scenes/lN/`. Композиция называется `Lesson<N>`, кадр 1920×1080, 30 fps.

В комплекте уже лежит урок 1 («Как сделано это видео», пример из `examples/how-this-video-is-made/`): готовые данные и 16 настоящих сцен (раздел «Пример» в конце) — по ним удобно и проверять конвейер, и учиться писать сцены.

## Установка и проверка

Нужен `node >= 20` и `npm`.

```bash
cd remotion
npm ci                                         # ровно версии из package-lock.json (npm install на npm 10 переписывает lock-файл)
npx tsc --noEmit                               # типы: 0 ошибок
npx remotion compositions src/index.ts         # должна быть видна Lesson1 (23408 кадров ≈ 780 с)
```

- Первый запуск `remotion compositions/still/render` один раз скачивает Chrome Headless Shell (~170 МБ) в `node_modules/.remotion` — это нормально, ждать 1–2 минуты.
- `npm ci` / `npm install` может написать `npm warn install-scripts … esbuild`. Это предупреждение npm 11; на сборку Remotion оно не влияет.
- Просмотр и покадровая отладка: `npm run studio` (или `npx remotion studio src/index.ts`).

### voice.wav

Голос автора в набор **не входит**: `public/lessonN/voice.wav` появляется после шага «голос» (`scripts/tts_timeline.py`). Без `voice.wav` композиция **не рендерится** (компонент `Audio` не найдёт файл), зато `npx tsc --noEmit` и `npx remotion compositions src/index.ts` работают и без него. Для быстрой проверки макета без голоса можно сделать тишину и потом удалить:

```bash
ffmpeg -y -f lavfi -i anullsrc=r=8000:cl=mono -t 780 public/lesson1/voice.wav
npx remotion still src/index.ts Lesson1 out/check.png --frame=1250
rm public/lesson1/voice.wav
```

`*.wav`, `*.mp4`, `*.webm`, `*.mkv`, `out/` и `node_modules/` исключены через `.gitignore`.

## Структура

```
remotion/
├── package.json, package-lock.json   # remotion/@remotion/cli/@remotion/media 4.0.537, react 19.2.3, typescript 5.9.3
├── tsconfig.json, remotion.config.ts # strict; рендер кадров в jpeg
├── public/
│   ├── fonts/                        # Montserrat и JetBrains Mono (woff2: cyrillic + latin)
│   └── lesson1/                      # данные урока (см. ниже); voice.wav добавляется после озвучки
└── src/
    ├── index.ts                      # registerRoot
    ├── Root.tsx                      # композиции Lesson<N> из LESSONS
    ├── lessons.ts                    # реестр уроков (LESSONS)
    ├── theme.ts                      # палитра C, шрифты, типы, SERIES, тайминги (at, lessonFrames, …)
    ├── Lesson.tsx                    # сборка слоёв урока + финальная карточка
    ├── Captions.tsx                  # караоке, ключевые слова (фон и по центру)
    ├── Sections.tsx                  # карточки разделов, верхняя панель, текстура фона
    ├── Aroll.tsx, Transition.tsx     # лицо автора: жёсткие вставки и непрерывные дубли (corner/side/circle)
    ├── ScreenInsert.tsx              # вставки живого экрана с наездом камеры
    ├── cyrillicFonts.ts              # загрузка woff2 (useCyrillicFonts)
    └── motion/
        ├── types.ts                  # SceneProps, SceneDef, Beat, Storyboard
        ├── SceneLayer.tsx            # диспетчер: тип сцены → компонент, окна входа/выхода
        ├── anim.ts, constants.ts     # пружины, easing, safeExitAlpha, LAYOUT; validate.ts — проверка вёрстки
        ├── ui.tsx, viz.tsx, text.tsx, icons.tsx   # библиотека примитивов (ниже)
        └── scenes/
            ├── index.ts              # SCENES: тип → компонент (…L1_SCENES, …L2_SCENES)
            ├── kit.tsx               # общий помощник сцен (TileRow — ряд пронумерованных плиток)
            └── l1/                   # сцены урока 1 (16 настоящих сцен ролика): index.ts + по файлу на тип
```

Библиотека примитивов (`src/motion/`): окно-фрейм `Frame`, `Pop`, пузырь чата `Bubble`, `Avatar`, `Chip`, `Stamp`, `CheckBadge`, `Checklist`, `Strike`, печатающийся текст и код `TypeText`/`CodeBlock`/`DiffView`, график и рисование линий `DrawPath`/`Bars`/`Ring`, схема узлов `FlowNode`/`FlowEdge`, календарь, песочные часы, фиксация коммитов `CommitRail` и др., SVG-иконки `Icon` (без логотипов брендов). Всё детерминировано: только `frame`, `interpolate`, `spring`, без `Math.random`, `Date` и таймеров.

## Данные урока `public/lessonN/`

| Файл | Что внутри | Кто создаёт |
|---|---|---|
| `timeline.json` | слова с секундами голоса, строки, разделы, ключевые слова: `{fps, duration, sections[], words[], lines[], keywords[]}` | `scripts/tts_timeline.py` |
| `storyboard.json` | **готовая** раскадровка `{"scenes":[{section, title, type, s, e, beats:[{t, word, label}]}]}`; все времена — секунды голоса | `scripts/resolve_storyboard.py` из плана «слово-якорь → что показать» |
| `aroll.json` | кадры лица: `{"fps_source":24,"segments":[…]}`; пустой список — лица нет | `scripts/make_aroll.py` |
| `screens.json` | вставки живого экрана `{"screens":[…]}`; пустой список — нет | вручную |
| `voice.wav` | голос (в `.gitignore`) | `scripts/tts_timeline.py` |

Пример (так получен `public/lesson1/storyboard.json`; `--renumber` заменяет префикс типов `l29_` на `l1_`):

```bash
python3 scripts/resolve_storyboard.py examples/how-this-video-is-made/storyboard.json \
  --timeline examples/how-this-video-is-made/timeline.json \
  --out remotion/public/lesson1/storyboard.json --renumber 1
```

Важно: `storyboard.json` в `public/lessonN/` — уже разрешённый формат (с `scenes` и секундами `t`), а не исходный план (`{"29": [[слово, подпись], …]}`, как в `examples/`). Исходный план в этом формате Remotion не прочитает; `tsc` поймает несоответствие, потому что `lessons.ts` типизирует json.

Голос стартует на кадре `LEAD = 15` (0,5 с), после голоса идёт `TAIL = 3` с финальной карточки: `durationInFrames = ceil((duration + 0,5 + 3) · 30)` (`lessonFrames` в `theme.ts`). Секунды голоса в кадры переводит `at(sec)`.

## Как добавить урок N

Проще всего — `python3 scripts/skeleton.py N --project remotion --sub "Название урока" --check` (после `scripts/resolve_storyboard.py`): он делает шаги 2–5 сам (заглушки сцен, регистрация в `scenes/index.ts` и `lessons.ts`, запись `SERIES[N]`, пустые `aroll.json`/`screens.json`) и запускает `tsc`. Вручную:

1. Положите `timeline.json` и `storyboard.json` в `public/lessonN/`; создайте `aroll.json` (`{"fps_source":24,"segments":[]}`) и `screens.json` (`{"screens":[]}`).
2. Типы сцен в раскадровке именуйте с префиксом `lN_` (`l2_hook`, `l2_cost`…). Для каждого типа — файл `src/motion/scenes/lN/<Имя>.tsx` (имя = CamelCase части после префикса: `l2_cost` → `Cost`), заглушка:
   ```tsx
   import React from "react";
   import { SceneProps } from "../../types";
   export const Cost: React.FC<SceneProps> = () => null;
   ```
3. `src/motion/scenes/lN/index.ts` экспортирует `LN_SCENES: Record<string, React.FC<SceneProps>>` (тип → компонент; образец — `l1/index.ts`), а `src/motion/scenes/index.ts` добавляет `...LN_SCENES` в `SCENES`.
4. `src/lessons.ts`: по строке импорта на каждый json (над маркером `@lessons:imports`) и строка записи в `LESSONS` (над `@lessons:entries`):
   ```ts
   import t2 from "../public/lesson2/timeline.json";
   import s2 from "../public/lesson2/storyboard.json";
   import a2 from "../public/lesson2/aroll.json";
   import sc2 from "../public/lesson2/screens.json";
   // …
   { n: 2, timeline: t2, storyboard: s2, aroll: a2 as Aroll, screens: sc2 },
   ```
   Необязательные поля записи: `trStyle` (`"corner"` по умолчанию, `"side"`, `"circle"`, `"cut"`) и `face` (трек лица YuNet, нужен только стилю `circle`).
5. Бренд серии для урока — `SERIES[N]` в `src/theme.ts` (см. ниже).
6. Проверка: `npx tsc --noEmit` и `npx remotion compositions src/index.ts` — должна появиться `LessonN`.

Раздел без нарисованной сцены (тип неизвестен или не зарегистрирован) показывается запасным макетом: ключевое слово по центру, караоке внизу. Если нарисована хотя бы одна сцена, урок идёт в «motion»-макете: ключевые слова становятся фоном за сценой, караоке уходит вниз (базовая линия y ≈ 936, 52 px).

## Как писать сцену

Сцена — React-компонент `React.FC<SceneProps>`; все значения — **абсолютные кадры композиции**:

- `f` — текущий кадр;
- `b[i]` — кадр бита `i` (момент слова из `beats[i].word` минус 3 кадра, но не раньше `t0`): элемент бита должен появиться на `b[i]`;
- `t0` — карточка раздела улетает, сцена может входить; `t1` — сцена начинает уходить (за ~14 кадров до следующего раздела), диспетчер сам плавно её гасит;
- `w(prefix, after?)` — кадр первого слова раздела, начинающегося с `prefix`;
- `scene` (`section`, `title`, `type`, `s`, `e`, `beats[].label` — это ТЗ на анимацию), `tl` — вся временная шкала.

Каждый бит — элемент, который появляется на слове и остаётся до следующего бита или конца сцены.

## Палитра и шрифты

- Палитра — объект `C` в `src/theme.ts`: фон `#111318`, поверхность `#232833`, текст `#F3EFE6`, акцент `#FFB300`, приглушённый `#9AA0AA`; точечно успех `#4ADE80` и ошибка `#F87171` (только галочки и ошибки). Чтобы сменить стиль, правьте `C` (акцент в виде `rgba(255,179,0,…)` встречается и в слоях — `Lesson.tsx`, `Sections.tsx`, `Captions.tsx`, `Transition.tsx`, `motion/*`: при смене цвета замените `255,179,0` поиском).
- Шрифты — `SANS` (Montserrat) и `MONO` (JetBrains Mono). Файлы — `public/fonts/<id>/{cyrillic,latin}-<weight>-normal.woff2`; грузит их `useCyrillicFonts` (список в `Lesson.tsx`: Montserrat 700/900, JetBrains Mono 400/700). В сценах всегда берите `SANS`/`MONO` из `theme.ts`, не системные шрифты. Обе гарнитуры распространяются под SIL Open Font License (при публикации набора проверьте лицензии).
- Серия: `SERIES` в `src/theme.ts` — «заполните своё». По умолчанию `{ tag: "ВАША СЕРИЯ", title: "Ваша серия", hideNo: true }`. Поля: `tag` (в верхней панели), `title` (крупно на финальной карточке), `no`/`total`/`hideNo`/`sub` (номер урока или его название), `author` (строка автора на финальной карточке, по умолчанию нет), `logo` (путь в `public/`, например `brand/logo.png`; по умолчанию не задан — логотипа нет; геометрия — `LOGO`).

## Правила вёрстки сцен (грабли прошлых уроков)

Эти числа зашиты в `src/motion/constants.ts` (`LAYOUT`); `validateSceneLayout()` из `src/motion/validate.ts` печатает предупреждение, если сцена их нарушает.

1. **Зона сцены**: x 140–1780, y 130–830. Ниже y ≈ 860 — только караоке, графика туда не заходит.
2. **Заголовок сцены ≤ 38 px.** Контейнер карточек контента начинается строго с **y 250** (высота 570), зазор заголовок → карточки ≥ 35 px.
3. Шапка сцены (заголовок + чипы): `display: "flex"`, `justifyContent: "space-between"`, **`alignItems: "flex-start"`**. `flex-end` запрещён: при переносе заголовка чипы врезаются в карточки.
4. Отступы карточек `26px 34px`, внутренних плашек `14px 20px` (защита от обрезки скруглением).
5. **Никаких микро-скейлов текста** (текст не «дышит» масштабом); текст в графике короткий, ≥ 24 px, заголовки карточек ≥ 32 px, ключевые числа 48–72 px.
6. **Нет «чёрных дыр»**: элемент живёт до следующего бита — `safeExitAlpha(f, bNext)` (нет следующего бита — не гаснет, уход плавный ~10 кадров). Пустой фон дольше ~3 с — брак.
7. Ничего не лежит друг на друге: новый бит не ставится поверх старого — место освобождается или идёт ниже.
8. Детерминированность и скорость: только `frame`/`interpolate`/`spring`; без тяжёлых `filter: blur` на больших площадях.
9. Названия продуктов — обычным текстом, без логотипов брендов; цен и дат на экране нет.
10. Окна лица автора: на весь экран графика под ним не видна (биты не нужны, но элементы, появившиеся до окна, должны его пережить); в углу зона бюста (≈ x 1220–1920 или x 0–700, y 280–850) должна быть свободна с первого кадра окна.

## Рендер

Локально (2K из композиции 1080p; нужен `voice.wav`):

```bash
npx remotion render src/index.ts Lesson1 ../out/lesson1_2k.mp4 --scale=1.3333333333333333 --concurrency 6
```

Файл кладётся в `out/` **в корне набора** (`../out/`), как у облачного рендера: дальше `scripts/finish.sh` и `scripts/frames_05s.py` запускаются из корня с путями `out/…`. Замер на 8 ядрах (VPS, `--concurrency 6`): минута 2K с одним местом лица ≈ 7 мин (первые 10 с с лицом — ≈ 5 из них: кадры с вырезом VP9 с альфой считаются в разы медленнее графики).

Проверка отдельных кусков: `npx remotion still src/index.ts Lesson1 out/f.png --frame=1250`, `npx remotion render src/index.ts Lesson1 out/part.mp4 --frames=600-900 --scale=0.5 --muted`; листы кадров каждые 0,5 с — `scripts/frames_05s.py`.

Параллельный рендер (десятки задач в облаке, склейка кусков) — см. папку `cloud/` и `skills/cloud-render/SKILL.md`: облачный воркер собирает этот проект (`npx remotion bundle src/index.ts`) и рендерит диапазоны кадров с теми же `--scale` и `--muted`.

## Пример: сцены ролика «Как сделано это видео»

`src/motion/scenes/l1/` — не заглушки, а 16 настоящих сцен 13-минутного урока «Как сделано это видео» (Hook, Leadgen, Layers, Script, Voice, Face, Motion, Frames, Forums, Axe, Harness, Parallel, Cost, Control, Repeat, Outro; карта типов `l1_*` — в `scenes/l1/index.ts`). Их тайминги и тексты берутся из `public/lesson1/{timeline,storyboard,aroll,screens}.json`, общие помощники — из `src/motion/scenes/kit.tsx`. Это образец того, как выглядит готовая сцена: пишите свои по тому же устройству. Смотреть: `npx remotion studio` → композиция `Lesson1` (23 408 кадров, 30 fps). Голос автора в набор не входит, поэтому без `public/lesson1/voice.wav` рендер и стиллы не пойдут — для просмотра макета положите тишину (см. раздел «voice.wav» выше) и удалите её после проверки.
