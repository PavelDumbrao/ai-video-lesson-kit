/**
 * Реестр уроков. Каждый урок N — это данные `public/lessonN/{timeline,storyboard,aroll,screens}.json`
 * и сцены `src/motion/scenes/lN/` (тип сцены → компонент, см. scenes/index.ts). Из записи в LESSONS
 * Root.tsx делает композицию `Lesson<N>` (1920×1080, 30 fps).
 *
 * Формат регулярный (для scripts/skeleton.py): по одной строке импорта на каждый json и по одной
 * строке записи на урок; новые строки вставляются над маркерами `@lessons:*`.
 *
 * Типы проверяет tsc: json урока обязан совпасть с Timeline / Storyboard / Screens. Для aroll нужен
 * `as Aroll` (в json раскладки — строки, а в типе — литералы "full" | "corner" | "hidden").
 */
import t1 from "../public/lesson1/timeline.json";
import s1 from "../public/lesson1/storyboard.json";
import a1 from "../public/lesson1/aroll.json";
import sc1 from "../public/lesson1/screens.json";
// @lessons:imports — новые импорты урока добавляются над этой строкой
import type { Storyboard } from "./motion/types";
import type { Aroll, FaceTrack, Screens, Timeline, TrStyle } from "./theme";

export type LessonEntry = {
  /** Номер урока: композиция `Lesson<n>`, папка `public/lesson<n>/`, ключ в SERIES (theme.ts). */
  n: number;
  timeline: Timeline;
  storyboard?: Storyboard;
  aroll?: Aroll;
  screens?: Screens;
  /** Стиль врезки лица: "corner" (по умолчанию) | "side" | "circle" | "cut" (жёсткие склейки). */
  trStyle?: TrStyle;
  /** Трек лица YuNet (`*_face.json`) — нужен только стилю "circle"; вшивается в каждый `trans` урока. */
  face?: FaceTrack;
};

export const LESSONS: LessonEntry[] = [
  { n: 1, timeline: t1, storyboard: s1, aroll: a1 as Aroll, screens: sc1 },
  // @lessons:entries — новые записи уроков добавляются над этой строкой
];
