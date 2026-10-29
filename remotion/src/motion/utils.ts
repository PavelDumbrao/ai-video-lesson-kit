import React, { CSSProperties } from "react";
import { C } from "../theme";
import { clamp01, eo, lin, sp, SprName } from "./anim";
import { Icon, IconName } from "./icons";
import { Dots, Stamp, TX } from "./ui";

// Shared scene helpers: element exits, sequential «pages», waiting slots, stamps that stay inside their card.
// Everything is a pure function of the frame (deterministic, no hooks, no DOM measuring). How to use: README-helpers.md.
// Plain .ts on purpose (React.createElement instead of JSX), so the path stays `src/motion/utils.ts`.

const el = React.createElement;

// ── 1. Exit of an element on the next beat ───────────────────────────────────────────────────────────────

/**
 * Opacity of an element that lives until the next beat `bNext`: 1 up to `bNext − fadeFrames`, then a linear fade
 * that reaches exactly 0 AT `bNext` (0 after it). Never negative, never above 1. `bNext` undefined / NaN / ±Infinity
 * → always 1: the last beat never fades into a black hole (lesson 27 rule — do not hide graphics on the edge of a face
 * window; the scene itself leaves at t1 in SceneLayer). `fadeFrames ≤ 0` → hard cut at `bNext`.
 * Linear on purpose: the last visible frame keeps 1/fadeFrames of opacity (no flat invisible tail that reads as an
 * empty frame on 0.5 s stills, no 0.5 → 0 snap of ease-in).
 * NB: the local copies in l29 Leadgen / Frames / Control / Motion / Forums / Harness / Hook / Outro START fading at
 * `bNext`; this one has ENDED by `bNext` (as in Cost / Voice) — the next element may enter on its beat.
 */
export const safeExitAlpha = (f: number, bNext?: number, fadeFrames = 10): number => {
  if (bNext === undefined || !Number.isFinite(bNext)) return 1;
  if (fadeFrames <= 0) return f >= bNext ? 0 : 1;
  return clamp01(1 - lin(f, bNext - fadeFrames, fadeFrames));
};

// ── 2. Sequential pages of a scene ───────────────────────────────────────────────────────────────────────

export type PageOpts = {
  fadeOut?: number; // frames the old page fades (linear) and lifts; default 8
  gap?: number; // empty frames between the old page's last visible frame and the new page's first; default 2, 0 = back to back
  fadeIn?: number; // frames of the new page's entry (expo-out, first visible frame = its start); default 10
  dyIn?: number; // px the new page rises from; default 20
  dyOut?: number; // px the old page lifts by while leaving; default 24
};
/** alpha = p·(1−q): p — entry progress 0..1, q — exit progress 0..1; y — translateY in px. */
export type PageLook = { alpha: number; y: number; p: number; q: number };
export type PageState = PageLook & { i: number };

const NONE: PageLook = { alpha: 0, y: 0, p: 0, q: 0 };

/** Index of the page that owns frame `f`: the last i with starts[i] ≤ f (−1 before the first). `starts` ascending. */
export const pageIndex = (f: number, starts: readonly number[]): number => {
  let i = -1;
  for (let k = 0; k < starts.length; k++) if (f >= starts[k]) i = k;
  return i;
};

/**
 * Look of page `i`. Page i is visible on frames [starts[i], starts[i+1] − gap − 1]; page i+1 from starts[i+1]. So two
 * pages are NEVER visible on the same frame (titles never overlap) and the blank between them is exactly `gap`
 * frames. The last page never leaves (the scene leaves at t1). A page shorter than fadeIn + fadeOut + gap simply
 * never reaches full opacity — keep pages ≥ ~20 frames.
 */
export const pageLook = (f: number, starts: readonly number[], i: number, opts: PageOpts = {}): PageLook => {
  const { fadeOut = 8, gap = 2, fadeIn = 10, dyIn = 20, dyOut = 24 } = opts;
  const a = starts[i];
  if (a === undefined || f < a) return NONE;
  const next = starts[i + 1];
  const p = fadeIn > 0 ? eo(f, a - 1, fadeIn) : 1;
  const q = 1 - safeExitAlpha(f, next === undefined ? undefined : next - Math.max(0, Math.round(gap)), fadeOut);
  return { alpha: clamp01(p * (1 - q)), y: dyIn * (1 - p) - dyOut * q, p, q };
};

/** The page that owns frame `f` and its look (during the `gap` frames: still the old page, alpha 0). */
export const pageState = (f: number, starts: readonly number[], opts: PageOpts = {}): PageState => {
  const i = pageIndex(f, starts);
  return { i, ...(i < 0 ? NONE : pageLook(f, starts, i, opts)) };
};

type PagesProps = PageOpts & {
  f: number;
  starts: readonly number[];
  style?: CSSProperties;
  children: (i: number, st: PageState) => React.ReactNode;
};
/**
 * Renders only the page that owns the frame: `<Pages f={f} starts={[t0, b[4], b[8]]}>{(i, st) => …}</Pages>`.
 * The wrapper is `position:absolute; inset:0` of its nearest positioned parent — whole frame for scene pages,
 * a header box for swapping titles.
 */
export const Pages: React.FC<PagesProps> = ({ f, starts, style, children, ...opts }) => {
  const st = pageState(f, starts, opts);
  if (st.i < 0 || st.alpha <= 0.001) return null;
  return el("div", { style: { position: "absolute", inset: 0, opacity: st.alpha, transform: st.y ? `translateY(${st.y}px)` : undefined, ...style } }, children(st.i, st));
};

type PageProps = PageOpts & { f: number; starts: readonly number[]; i: number; style?: CSSProperties; children?: React.ReactNode };
/** One page as a JSX block: `<Page f={f} starts={P} i={1}>…</Page>` — same timing as <Pages>, never overlaps its neighbours. */
export const Page: React.FC<PageProps> = ({ f, starts, i, style, children, ...opts }) => {
  const st = pageLook(f, starts, i, opts);
  if (st.alpha <= 0.001) return null;
  return el("div", { style: { position: "absolute", inset: 0, opacity: st.alpha, transform: st.y ? `translateY(${st.y}px)` : undefined, ...style } }, children);
};

// ── 3. Slot: a dashed «waiting» placeholder that the real element replaces on its beat ──────────────────

type SlotProps = {
  f: number;
  at: number; // beat of the real element
  w: number;
  h: number;
  x?: number; // with x / y the slot is absolutely placed; without — an in-flow w×h block (flex rows)
  y?: number;
  label?: string; // e.g. «модель 2» — one short line
  icon?: IconName;
  from?: number; // the placeholder fades in from here (default: visible as soon as it is mounted, e.g. with its page)
  enter?: SprName | false; // entry spring of the child (default "pop"); false — the child animates itself from `at`
  radius?: number; // default 22 = Frame
  style?: CSSProperties;
  children?: React.ReactNode;
};
/**
 * `<Slot f={f} at={b[3]} x={…} y={…} w={520} h={570} label="модель 2"><Frame …/></Slot>` — until `at` the place
 * holds a dashed plate (label + soft dots), then it cross-fades into the child (rise, no scale — text never scales).
 * The child is mounted only from `at`. Same box for both, so the layout never jumps.
 */
export const Slot: React.FC<SlotProps> = ({ f, at, w, h, x, y, label, icon, from, enter = "pop", radius = 22, style, children }) => {
  const ghost = (from === undefined ? 1 : eo(f, from, 10)) * (1 - eo(f, at, 8));
  const p = enter === false ? (f >= at ? 1 : 0) : sp(f, at, enter);
  const pos: CSSProperties = x === undefined && y === undefined ? { position: "relative", flex: "none" } : { position: "absolute", left: x ?? 0, top: y ?? 0 };
  const row = h < 130;
  const breathe = 0.34 + 0.12 * (0.5 + 0.5 * Math.sin(f / 22));
  return el(
    "div",
    { style: { ...pos, width: w, height: h, ...style } },
    ghost > 0.002 &&
      el(
        "div",
        {
          style: {
            position: "absolute",
            inset: 0,
            boxSizing: "border-box",
            borderRadius: radius,
            border: `2px dashed rgba(154,160,170,${breathe})`,
            background: "rgba(35,40,51,0.28)",
            opacity: ghost,
            display: "flex",
            flexDirection: row ? "row" : "column",
            alignItems: "center",
            justifyContent: "center",
            gap: row ? 14 : 12,
            padding: "0 20px",
          },
        },
        icon && el(Icon, { name: icon, size: row ? 34 : 44, color: "rgba(154,160,170,0.5)", sw: 3.4 }),
        label &&
          el(
            "div",
            { style: { ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: w - 40 } },
            label,
          ),
        el(Dots, { f, size: 9 }),
      ),
    p > 0.002 &&
      el(
        "div",
        { style: enter === false ? { position: "absolute", inset: 0 } : { position: "absolute", inset: 0, opacity: clamp01(p * 1.6), transform: `translateY(${(1 - p) * 18}px)` } },
        children,
      ),
  );
};

// ── 4. Stamps and badges that stay inside their card ────────────────────────────────────────────────────

/** x clamped to [lo, hi]; when the element is wider than the room (hi < lo) → lo. `x = clampIn(want, 24, cardW − 24 − elW)`. */
export const clampIn = (x: number, lo: number, hi: number) => (hi < lo ? lo : Math.max(lo, Math.min(hi, x)));

/** Bounding box of a w×h box rotated by `deg` (around its centre). */
export const rotBox = (w: number, h: number, deg: number) => {
  const r = (Math.abs(deg) * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { w: w * c + h * s, h: w * s + h * c };
};

// Montserrat 900 advance widths, em ×100 (rounded up), read from public/fonts/montserrat/*-900-normal.woff2.
// Kerning is ignored (it only narrows); unknown characters count as 0.9 em.
const W900: Record<string, number> = {};
const put = (chars: string, ws: number[]) => ws.forEach((v, i) => (W900[chars[i]] = v / 100));
put("АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ", [85, 75, 75, 62, 87, 68, 68, 114, 68, 82, 82, 77, 81, 97, 82, 84, 81, 74, 74, 68, 77, 98, 79, 86, 75, 111, 115, 87, 107, 74, 73, 114, 74]);
put("абвгдеёжзийклмнопрстуфхцчшщъыьэюя", [63, 69, 63, 55, 75, 66, 66, 99, 59, 73, 73, 70, 70, 84, 71, 67, 70, 71, 62, 59, 67, 90, 66, 73, 67, 101, 101, 73, 92, 64, 61, 94, 65]);
put("ABCDEFGHIJKLMNOPQRSTUVWXYZ", [81, 78, 74, 83, 68, 65, 77, 81, 35, 58, 77, 62, 96, 81, 85, 75, 85, 75, 66, 66, 79, 79, 121, 77, 71, 69]);
put("abcdefghijklmnopqrstuvwxyz", [64, 70, 62, 71, 66, 43, 72, 71, 33, 34, 71, 33, 104, 71, 68, 70, 70, 46, 57, 46, 70, 65, 98, 65, 65, 57]);
put("0123456789", [70, 42, 61, 62, 72, 62, 67, 65, 68, 67]);
put(' .,:;!?%+-—«»"()/×', [30, 31, 31, 31, 31, 32, 61, 92, 62, 39, 100, 65, 65, 49, 39, 39, 44, 62]);
/** Text width in em at weight 900 with `ls` em of letter-spacing after every character. */
const textEm = (text: string, ls: number) => {
  let em = 0;
  for (let i = 0; i < text.length; i++) em += (W900[text[i]] ?? 0.9) + ls;
  return em;
};

/**
 * Rest-size box (scale 1, rotation included) of ui.tsx `<Stamp text size rot>`: text + padding 0.6/0.32 em + border 5
 * + outline 7 + the dust ring's base (−10 px) on each side. The ring's short 1.25× fade-out is not counted.
 */
export const stampBox = (text: string, size = 44, rot = -7) => rotBox(size * (textEm(text, 0.1) + 1.2) + 30, size * 1.64 + 30, rot);

/** Largest font size ≤ `size` (≥ 12) at which `<Stamp>` with `text` / `rot` fits into maxW × maxH. */
export const stampFitSize = (text: string, maxW: number, maxH: number, size = 44, rot = -7) => {
  const r = (Math.abs(rot) * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const k = textEm(text, 0.1) + 1.2; // box = (k·size + 30) × (1.64·size + 30), then rotated
  const byW = (maxW - 30 * (c + s)) / (k * c + 1.64 * s);
  const byH = (maxH - 30 * (s + c)) / (k * s + 1.64 * c);
  return Math.max(12, Math.min(size, Math.floor(Math.min(byW, byH) * 10) / 10));
};

/**
 * Slam-in style for any badge / stamp of rest size w×h placed in the centre of a maxW × maxH box (flex-centre it):
 * it hits from `from`× like a stamp, but neither the slam nor the rest size ever leaves the box (the rest size
 * shrinks if it has to). Spread it on the element's own style: `<div style={{ ...stampStyle(f, at, {...}) }}>`.
 */
export const stampStyle = (
  f: number,
  at: number,
  o: { w: number; h: number; maxW: number; maxH: number; rot?: number; from?: number; spr?: SprName },
): CSSProperties => {
  const { w, h, maxW, maxH, rot = 0, from = 1.6, spr = "stamp" } = o;
  const b = rotBox(w, h, rot);
  const fit = Math.min(maxW / b.w, maxH / b.h);
  const k = from - (from - 1) * sp(f, at, spr);
  return { transform: `rotate(${rot}deg) scale(${Math.min(k, fit)})`, transformOrigin: "50% 50%", opacity: f < at ? 0 : clamp01((f - at) / 3) };
};

type StampFitProps = { f: number; start: number; text: string; maxW: number; maxH: number; x?: number; y?: number; size?: number; rot?: number; color?: string };
/**
 * ui.tsx `<Stamp>` that never leaves its maxW × maxH box (card inner area minus padding): the font size shrinks to fit
 * at rest, and the 2.1× slam is capped at the box. With x / y the box is absolutely placed, otherwise in flow.
 */
export const StampFit: React.FC<StampFitProps> = ({ f, start, text, maxW, maxH, x, y, size = 44, rot = -7, color }) => {
  if (f < start) return null;
  const s = stampFitSize(text, maxW, maxH, size, rot);
  const b = stampBox(text, s, rot);
  const room = Math.min(maxW / b.w, maxH / b.h); // ≥ 1 when the rest size fits
  const k = 2.1 - 1.1 * sp(f, start, "stamp"); // the same slam scale <Stamp> applies inside
  const cap = k > room ? room / k : 1;
  const pos: CSSProperties = x === undefined && y === undefined ? { position: "relative", flex: "none" } : { position: "absolute", left: x ?? 0, top: y ?? 0 };
  return el(
    "div",
    { style: { ...pos, width: maxW, height: maxH, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" } },
    el("div", { style: { transform: cap < 1 ? `scale(${cap})` : undefined } }, el(Stamp, { text, f, start, size: s, rot, color })),
  );
};
