import { interpolate, spring } from "remotion";
import { CL, EASE_IN, EASE_IO, EASE_OUT, FPS } from "../theme";
import { ANIM_TIMING } from "./constants";

/** Spring characters. Every element picks one on purpose — they should not all move alike. */
export const SPR = {
  pop: { damping: 13, stiffness: 170, mass: 0.8 }, // one soft overshoot — default entrance
  snap: { damping: 22, stiffness: 260, mass: 0.7 }, // fast and exact, no overshoot
  soft: { damping: 24, stiffness: 80, mass: 1 }, // slow glide — layout moves, camera-like shifts
  bouncy: { damping: 8, stiffness: 190, mass: 0.7 }, // playful double bounce — badges, checks
  heavy: { damping: 15, stiffness: 120, mass: 1.6 }, // falling weight — bricks, sheets
  stamp: { damping: 10, stiffness: 330, mass: 0.9 }, // hard hit
} as const;
export type SprName = keyof typeof SPR;

/** Spring 0→1 (with the preset's overshoot) that starts at absolute frame `start`. */
export const sp = (f: number, start: number, cfg: SprName = "pop") =>
  f <= start ? 0 : spring({ frame: f - start, fps: FPS, config: SPR[cfg] });

// A start of +Infinity means "never" (0), −Infinity means "always" (1) — handy for open-ended stages.
const never = (start: number) => (start > 0 ? 0 : 1);

/** Eased 0→1 over [start, start + dur] frames. */
export const eo = (f: number, start: number, dur: number) =>
  Number.isFinite(start) ? interpolate(f, [start, start + dur], [0, 1], { ...CL, easing: EASE_OUT }) : never(start);
export const ei = (f: number, start: number, dur: number) =>
  Number.isFinite(start) ? interpolate(f, [start, start + dur], [0, 1], { ...CL, easing: EASE_IN }) : never(start);
export const eio = (f: number, start: number, dur: number) =>
  Number.isFinite(start) ? interpolate(f, [start, start + dur], [0, 1], { ...CL, easing: EASE_IO }) : never(start);
export const lin = (f: number, start: number, dur: number) =>
  Number.isFinite(start) ? interpolate(f, [start, start + dur], [0, 1], CL) : never(start);

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/**
 * Safe exit opacity calculation (anti-black-hole rule):
 * - If bNext === undefined (last beat of scene), remains visible (1.0).
 * - If remaining frames < dur, cleanly cuts without negative interpolation.
 * - Otherwise smoothly fades out over `dur` frames ending at bNext.
 */
export const safeExitAlpha = (f: number, bNext: number | undefined, dur = ANIM_TIMING.EXIT_DURATION) => {
  if (bNext === undefined) return 1;
  const remaining = bNext - f;
  if (remaining <= 0) return 0;
  if (remaining < dur) {
    return f >= bNext - 2 ? 0 : 1;
  }
  return 1 - sp(f, bNext - dur, "soft");
};

/** One smooth bump 0→1→0 over `dur` frames — pulses, flashes. */
export const bump = (f: number, start: number, dur = 16) => {
  const t = (f - start) / dur;
  return t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t);
};

/** Decaying shake (px) — errors, impacts. */
export const shake = (f: number, start: number, amp = 10, dur = 18) => {
  const t = f - start;
  if (t < 0 || t > dur) return 0;
  return amp * Math.sin(t * 1.9) * (1 - t / dur) ** 2;
};

/** Soft caret blink: holds, eases out, eases back. Never a hard on/off flicker. */
export const blink = (f: number, period = 32) => {
  const ph = (((f % period) + period) % period) / period;
  return interpolate(ph, [0, 0.5, 0.6, 0.9, 1], [1, 1, 0.1, 0.1, 1]);
};

/** The visible prefix of `text` typed at `cps` characters per second from frame `start`. */
export const typed = (text: string, f: number, start: number, cps = 24) => {
  const n = Math.floor(((f - start) * cps) / FPS);
  return n <= 0 ? "" : text.slice(0, n);
};
export const typeDone = (text: string, start: number, cps = 24) => start + Math.ceil((text.length * FPS) / cps);

/** Deterministic pseudo-random in [0, 1). */
export const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Gentle idle float (px) so held elements never look frozen. */
export const float = (f: number, seed: number, amp = 4, period = 90) =>
  amp * Math.sin((f / period) * 2 * Math.PI + seed * 1.7);

/** 12 345 → "12 345" with a thin space. */
export const fmtNum = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
