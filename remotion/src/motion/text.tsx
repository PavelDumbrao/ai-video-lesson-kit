import React, { CSSProperties } from "react";
import { C, FPS, MONO } from "../theme";
import { blink, smooth } from "./anim";

// ── Caret + typing text ──────────────────────────────────────────────────────────────────────
export const Caret: React.FC<{ f: number; on?: boolean; color?: string; block?: boolean; solid?: boolean }> = ({
  f,
  on = true,
  color = C.accent,
  block = false,
  solid = false,
}) =>
  on ? (
    <span
      style={{
        display: "inline-block",
        width: block ? "0.58em" : "0.09em",
        height: block ? "1.05em" : "1.05em",
        marginLeft: block ? "0.08em" : "0.06em",
        verticalAlign: "-0.16em",
        borderRadius: 2,
        background: color,
        opacity: solid ? 1 : blink(f),
      }}
    />
  ) : null;

/** Types `text` from `start` at `cps`; the caret stays solid while typing, then blinks softly. */
export const TypeText: React.FC<{
  text: string;
  f: number;
  start: number;
  cps?: number;
  caret?: boolean;
  caretColor?: string;
  caretUntil?: number;
  style?: CSSProperties;
}> = ({ text, f, start, cps = 24, caret = true, caretColor, caretUntil = Infinity, style }) => {
  if (f < start) return null;
  const n = Math.min(text.length, Math.floor(((f - start) * cps) / FPS));
  const typing = n < text.length;
  return (
    <span style={style}>
      {text.slice(0, n)}
      <Caret f={f} on={caret && f < caretUntil} color={caretColor} solid={typing} />
    </span>
  );
};

// ── Code block that writes itself ────────────────────────────────────────────────────────────
export type TokKind = "k" | "s" | "f" | "p" | "c" | "t" | "n";
export type Tok = [string, TokKind];
const TOK: Record<TokKind, string> = {
  k: C.accent, // keyword
  s: "#F3D9A4", // string — a warm tint of the text colour
  f: "#FFD27A", // function / decorator
  p: C.muted, // punctuation
  c: "rgba(154,160,170,0.75)", // comment
  t: C.text, // plain
  n: "#FFC94D", // number
};

/** Shorthand: "k:def |f:save|p:(|t:msg|p:):" → tokens. Segments split by "|", kind before ":". */
export const code = (src: string): Tok[] =>
  src.split("|").map((seg) => {
    const i = seg.indexOf(":");
    return [seg.slice(i + 1), seg.slice(0, i) as TokKind];
  });

export const CodeBlock: React.FC<{
  lines: Tok[][];
  f: number;
  start: number;
  cps?: number;
  size?: number;
  lh?: number;
  gutter?: boolean;
  /** extra per-line offset (px) and highlight 0..1 — e.g. lines “playing” in rhythm */
  lineFx?: (i: number) => { dy?: number; hl?: number };
  caretUntil?: number;
}> = ({ lines, f, start, cps = 30, size = 24, lh = 1.6, gutter = true, lineFx, caretUntil = Infinity }) => {
  let budget = f < start ? -1 : Math.floor(((f - start) * cps) / FPS);
  const rows = lines.map((toks) => {
    const len = toks.reduce((a, t) => a + t[0].length, 0);
    const show = Math.max(0, Math.min(len, budget));
    const res = { toks, show, len, reached: budget >= 0 };
    budget -= len + 4; // a short beat between lines
    return res;
  });
  // caret goes on the last line that has started
  let cl = -1;
  rows.forEach((r, i) => {
    if (r.reached) cl = i;
  });
  const typingDone = rows.length > 0 && rows[rows.length - 1].show >= rows[rows.length - 1].len;
  return (
    <div style={{ fontFamily: MONO, fontWeight: 400, fontSize: size, lineHeight: lh, whiteSpace: "pre" }}>
      {rows.map((r, i) => {
        const fx = lineFx ? lineFx(i) : {};
        let left = r.show;
        return (
          <div key={i} style={{ position: "relative", display: "flex", transform: `translateY(${fx.dy ?? 0}px)`, height: `${lh}em` }}>
            {fx.hl ? (
              <div
                style={{
                  position: "absolute",
                  left: gutter ? "2.2em" : 0,
                  right: 0,
                  top: "0.12em",
                  bottom: "0.12em",
                  borderRadius: 8,
                  background: `rgba(255,179,0,${0.16 * fx.hl})`,
                  boxShadow: `inset 3px 0 0 rgba(255,179,0,${0.9 * fx.hl})`,
                }}
              />
            ) : null}
            {gutter && (
              <span style={{ width: "2.2em", flex: "none", color: "rgba(154,160,170,0.45)", opacity: r.reached ? 1 : 0.4 }}>
                {String(i + 1).padStart(2, " ")}
              </span>
            )}
            <span style={{ position: "relative", paddingLeft: "0.3em" }}>
              {r.toks.map((t, j) => {
                if (left <= 0) return null;
                const txt = t[0].slice(0, left);
                left -= t[0].length;
                return (
                  <span key={j} style={{ color: TOK[t[1]], fontWeight: t[1] === "k" ? 700 : 400 }}>
                    {txt}
                  </span>
                );
              })}
              {i === cl && f < caretUntil && <Caret f={f} solid={!typingDone} />}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ── Rolling number: digits roll like an odometer between integer values ─────────────────────
export const Roll: React.FC<{ v: number; style?: CSSProperties }> = ({ v, style }) => {
  const n = Math.floor(v);
  const fr = smooth((v - n) * 1.25 - 0.25 > 0 ? (v - n) * 1.25 - 0.25 : 0);
  return (
    <span style={{ display: "inline-block", position: "relative", overflow: "hidden", verticalAlign: "bottom", height: "1.1em", lineHeight: 1.1, ...style }}>
      <span style={{ display: "block", transform: `translateY(${-fr * 1.1}em)` }}>
        <span style={{ display: "block" }}>{n}</span>
        <span style={{ display: "block" }}>{n + 1}</span>
      </span>
    </span>
  );
};

// ── Diff view: + / − lines appear one by one; added lines can pulse; one line can be flagged ─
export type DiffLine = { k: "+" | "-" | " "; t: string };
export const DiffView: React.FC<{
  lines: DiffLine[];
  f: number;
  start: number;
  size?: number;
  stagger?: number;
  addHl?: number; // 0..1 extra highlight on added lines
  flag?: number; // index of a suspicious line
  flagP?: number; // 0..1
}> = ({ lines, f, start, size = 24, stagger = 3, addHl = 0, flag = -1, flagP = 0 }) => (
  <div style={{ fontFamily: MONO, fontSize: size, lineHeight: 1.75, whiteSpace: "pre" }}>
    {lines.map((l, i) => {
      const p = Math.max(0, Math.min(1, (f - start - i * stagger) / 6));
      const add = l.k === "+";
      const del = l.k === "-";
      const flagged = i === flag && flagP > 0;
      return (
        <div
          key={i}
          style={{
            position: "relative",
            display: "flex",
            opacity: p,
            transform: `translateX(${(1 - p) * 16}px)`,
            background: flagged
              ? `rgba(255,179,0,${0.22 * flagP})`
              : add
                ? `rgba(74,222,128,${0.08 + 0.14 * addHl})`
                : del
                  ? "rgba(248,113,113,0.1)"
                  : "transparent",
            boxShadow: flagged ? `inset 0 0 0 2px rgba(255,179,0,${flagP})` : undefined,
            borderRadius: 6,
          }}
        >
          <span style={{ width: "1.8em", flex: "none", textAlign: "center", color: add ? C.ok : del ? C.err : "rgba(154,160,170,0.5)", fontWeight: 700 }}>{l.k}</span>
          <span style={{ color: del ? "rgba(243,239,230,0.55)" : C.text, textDecoration: del ? "line-through" : undefined }}>{l.t}</span>
        </div>
      );
    })}
  </div>
);
