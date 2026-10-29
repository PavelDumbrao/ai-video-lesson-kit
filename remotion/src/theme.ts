import { Easing, interpolate } from "remotion";
import type { Storyboard } from "./motion/types";

export const C = {
  bg: "#111318",
  surface: "#232833",
  text: "#F3EFE6",
  accent: "#FFB300",
  muted: "#9AA0AA",
  // motion graphics: inner surfaces, hairlines, and the two spot colours (checks / errors only)
  surface2: "#1A1E26",
  raised: "#2E3442",
  line: "rgba(243,239,230,0.09)",
  ok: "#4ADE80",
  err: "#F87171",
} as const;

export const SANS = '"Montserrat", sans-serif';
export const MONO = '"JetBrains Mono", monospace';
export const W = 1920;
export const H = 1080;
export const FPS = 30;
export const LEAD = 15; // the voice starts at frame 15 (0.5 s)
export const TAIL = 3; // seconds of the final card after the voice

export type Word = { t: string; s: number; e: number; sec: number };
export type Line = { s: number; e: number; w: number[] };
export type Section = { title: string; s: number; e: number };
export type Keyword = { t: string; s: number; e: number; sec: number };
export type Timeline = {
  fps: number;
  duration: number;
  sections: Section[];
  words: Word[];
  lines: Line[];
  keywords: Keyword[];
};
/**
 * A-roll shot (public/lessonN/aroll.json). `s`/`e` are voice seconds; `clipStart` is the clip second that
 * plays at voice second `s`; `src` is relative to public/; the clip's own audio is never used.
 */
export type ArollSegment = {
  id: string;
  s: number;
  e: number;
  clipStart: number;
  scale: number;
  src: string;
  text?: string;
  trans?: TransSpec;
};
export type Aroll = { fps_source?: number; segments: ArollSegment[] };
/** YuNet face boxes, one per source frame: [x, y, w, h, score] in source px. */
export type FaceTrack = { fps: number; w: number; h: number; frames: number[][] };
/** Where a continuous take sits: the whole frame, the miniature (style-dependent), or nowhere. */
export type TransLayout = "full" | "corner" | "hidden";
/**
 * A layout key of a continuous take: from voice second `t` the take travels from the previous layout to `layout`
 * over `dur` seconds (0 or absent = a hard cut). The first key moves from "hidden", i.e. it is the entry.
 */
export type TransKey = { t: number; layout: TransLayout; dur?: number };
/** The person in the take (cutout alpha > 50 %), px of the take shown at 1920×1080; cx/cy is the scaling anchor. */
export type TransBody = { l: number; r: number; t: number; b: number; cx: number; cy: number };
/**
 * A segment played as one continuous take (Transition.tsx) instead of hard cuts. All times are voice seconds;
 * `clip0` is the voice second at clip time 0. `studio` is the full take, `cutout` the same take with only the
 * person (VP9 + alpha). `body`/`cornerK` fit the take into the corner (defaults: the reference take of the example lesson); `side`
 * picks the bottom corner of the corner style (default "right"; "left" = the mirror spot, the face itself is
 * never flipped). `alphaFix` remaps a cutout whose alpha decodes as 43…212 (example lesson). `face` is a YuNet track
 * (circle style), injected in Root; a path string is carried along but not loaded.
 */
export type TransSpec = {
  studio: string;
  cutout: string;
  clip0: number;
  keys: TransKey[];
  body?: TransBody;
  cornerK?: number;
  side?: CornerSide;
  alphaFix?: boolean;
  face?: FaceTrack | string;
};
/** Which bottom corner the corner-style miniature takes (above the karaoke band). */
export type CornerSide = "left" | "right";
/** How a continuous segment turns into a miniature; "cut" keeps the old hard cuts. */
export type TrStyle = "corner" | "side" | "circle" | "cut";
/**
 * Real-screen insert (public/lessonN/screens.json). `s`/`e` are voice seconds; `clipStart` is the clip second
 * shown at `s`; `focus` is a rectangle in clip px (srcW×srcH, default 1920×1080) the camera pushes into.
 */
export type ScreenClip = {
  id: string;
  src: string;
  s: number;
  e: number;
  clipStart: number;
  focus: { x: number; y: number; w: number; h: number };
  label: string;
  srcW?: number;
  srcH?: number;
  test?: boolean;
};
export type Screens = { screens: ScreenClip[] };
export type LessonProps = {
  lesson: number;
  timeline: Timeline;
  storyboard?: Storyboard;
  aroll?: Aroll;
  trStyle?: TrStyle;
  screens?: Screens;
};

/**
 * Серия (бренд) по номеру композиции `Lesson<N>`. `tag` — в верхней панели («TAG · УРОК no»), `title` — крупное
 * слово финальной карточки, `total` добавляет «из N» под ним, `author` — строка автора под ним (нет поля — нет строки).
 * `hideNo` убирает номер урока с экрана: в панели только `tag`, на финальной карточке вместо «Урок no» — `sub`
 * (название урока). `no` — номер урока в серии (по умолчанию номер композиции).
 * `logo` (путь внутри public/, например "brand/logo.png") — знак серии: рисуется самой композицией, статичный,
 * справа внизу поверх всех слоёв (Lesson.tsx → SeriesLogo, геометрия LOGO). По умолчанию логотипа нет.
 * Если задан `logo`, не накладывайте его ещё раз ffmpeg-ом на финише — см. `drawsLogo`.
 */
export type Series = { tag: string; title: string; no?: number; total?: number; hideNo?: boolean; sub?: string; author?: string; logo?: string };
/** Серия по умолчанию (для уроков, которых нет в SERIES). */
const DEFAULT_SERIES: Series = { tag: "ВАША СЕРИЯ", title: "Ваша серия", hideNo: true };
/**
 * ЗАПОЛНИТЕ СВОЁ. Ключ — номер урока (композиция `Lesson<ключ>`), значение — бренд серии. Примеры:
 *   1: { tag: "МОЯ СЕРИЯ", title: "Моя серия", no: 1, total: 5, author: "Имя Фамилия" },
 *   2: { tag: "МОЯ СЕРИЯ", title: "Моя серия", hideNo: true, sub: "Название урока", logo: "brand/logo.png" },
 * Уроки без записи берут DEFAULT_SERIES.
 */
export const SERIES: Record<number, Series> = {
  1: { ...DEFAULT_SERIES },
};
export const seriesOf = (lesson: number): Series => SERIES[lesson] ?? DEFAULT_SERIES;
/** Номер урока на экране: `no` серии, иначе номер композиции. */
export const lessonNo = (lesson: number): number => seriesOf(lesson).no ?? lesson;
/** True, если композиция `Lesson<lesson>` сама рисует логотип серии (поверх ролика ffmpeg-ом логотип не клеить). */
export const drawsLogo = (lesson: number) => !!seriesOf(lesson).logo;
/**
 * Геометрия логотипа серии в кадре 1920×1080: высота, правый и нижний отступы в px, прозрачность.
 * При рендере с --scale=4/3 это 92 px высотой и 60/48 px от краёв при 85 %.
 */
export const LOGO = { h: 69, right: 45, bottom: 36, opacity: 0.85 } as const;

export const lessonFrames = (tl: Timeline) => Math.ceil((tl.duration + LEAD / FPS + TAIL) * FPS);

/** Audio seconds → video frame (integer, so springs and ranges stay frame-exact). */
export const at = (sec: number) => LEAD + Math.round(sec * FPS);
/** `at` for a sum of seconds: drops float noise (90.2 + 0.4 = 90.60000000000001) before rounding to a frame. */
export const atSum = (a: number, b: number) => at(Math.round((a + b) * 1e6) / 1e6);

export const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1); // expo-out: fast start, long soft landing
export const EASE_IN = Easing.bezier(0.7, 0, 0.84, 0);
export const EASE_IO = Easing.bezier(0.65, 0, 0.35, 1);
export const POP = { damping: 13, stiffness: 170, mass: 0.8 }; // one soft overshoot

// Section card timing, frames relative to the card start (section.s − 0.3 s).
export const CARD_HOLD = 48; // big card on screen ~1.6 s
export const CARD_OUT = 16; // fly-out to the corner label
export const cardStart = (s: Section) => at(s.s - 0.3);

/** 1 = content fully visible; dips to 0.1 while a big section card is on screen. */
export const contentDim = (frame: number, sections: Section[]) => {
  let d = 1;
  for (const s of sections) {
    const c = cardStart(s);
    if (frame < c || frame > c + CARD_HOLD + CARD_OUT) continue;
    d = Math.min(d, interpolate(frame, [c, c + 8, c + CARD_HOLD, c + CARD_HOLD + 10], [1, 0.1, 0.1, 1], CL));
  }
  return d;
};

/**
 * Keyword on-screen windows [start, end) in frames. A keyword never overlaps the next one, and one
 * that would pop while a big section card covers the screen waits for the card to fly off.
 */
export type KwWindow = { k: Keyword; start: number; end: number };
const kwCache = new WeakMap<Timeline, KwWindow[]>();
export const keywordWindows = (tl: Timeline): KwWindow[] => {
  const hit = kwCache.get(tl);
  if (hit) return hit;
  const ks = tl.keywords;
  const res = ks
    .map((k, j) => {
      let start = at(k.s - 0.05);
      const next = j + 1 < ks.length ? at(ks[j + 1].s - 0.05) : Infinity;
      const end = Math.min(at(Math.max(k.e + 1.2, k.s + 1.8)), next);
      for (const s of tl.sections) {
        const c = cardStart(s);
        if (start >= c - 10 && start < c + CARD_HOLD + 8) start = c + CARD_HOLD + 8;
      }
      return { k, start, end };
    })
    .filter((w) => w.end - w.start >= 16);
  kwCache.set(tl, res);
  return res;
};

/** 0..1 — how much a keyword occupies the centre zone right now. */
export const keywordPresence = (frame: number, tl: Timeline) => {
  let p = 0;
  for (const w of keywordWindows(tl)) {
    if (frame < w.start - 2 || frame > w.end + 6) continue;
    p = Math.max(p, interpolate(frame, [w.start - 2, w.start + 6, w.end - 8, w.end + 6], [0, 1, 1, 0], CL));
  }
  return p;
};

/** «Правило 2. Маленькие шаги» → kicker «Правило 2» + title «Маленькие шаги». */
export const parseTitle = (raw: string) => {
  const m = raw.match(/^((?:Правило|Ошибка|Шаг|Часть)\s+\d+)\.\s*(.+)$/);
  return m ? { kicker: m[1], title: m[2] } : { kicker: "", title: raw };
};

export const pad2 = (n: number) => String(n).padStart(2, "0");

// Canvas text measurement. Called only after useCyrillicFonts resolved; a width is cached
// only when document.fonts confirms the face is ready, so a fallback width never sticks.
let ctx: CanvasRenderingContext2D | null = null;
const widths = new Map<string, number>();
export const textWidth = (text: string, font: string): number => {
  const key = `${font}|${text}`;
  const hit = widths.get(key);
  if (hit !== undefined) return hit;
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * 0.7 * parseFloat(font.split(" ")[1]);
  ctx.font = font;
  const w = ctx.measureText(text).width;
  if (document.fonts.check(font, text)) widths.set(key, w);
  return w;
};

/** Splits words into at most two lines with the smallest possible widest line. */
export const balance = (words: string[], font: string): string[] => {
  if (words.length < 2) return [words.join(" ")];
  let best = [words.join(" ")];
  let bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const w = Math.max(textWidth(a, font), textWidth(b, font));
    if (w < bestW) {
      bestW = w;
      best = [a, b];
    }
  }
  return best;
};
