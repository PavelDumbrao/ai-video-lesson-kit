import React from "react";
import { interpolate, interpolateColors, spring } from "remotion";
import { at, balance, C, CL, EASE_IN, EASE_OUT, FPS, Keyword, keywordWindows, LEAD, POP, SANS, textWidth, Timeline } from "./theme";

// ── Kinetic keyword: one phrase at a time, centre zone y≈380 ────────────────────────────────
const KW_Y = 380;
const KW_MAX_W = 1560; // 1600 minus a little air for the per-word gaps
const kwFont = (px: number) => `900 ${px}px Montserrat`;
const kwWidth = (s: string) => textWidth(s, kwFont(100)) - 0.01 * 100 * s.length; // −0.01em tracking

const fitKeyword = (text: string) => {
  const single = (KW_MAX_W / kwWidth(text)) * 100;
  const words = text.split(" ");
  if (single >= 90 || words.length < 2) return { lines: [text], size: Math.floor(Math.min(160, single)) };
  const lines = balance(words, kwFont(100));
  return { lines, size: Math.floor(Math.min(140, (KW_MAX_W / Math.max(...lines.map(kwWidth))) * 100)) };
};

const clean = (t: string) => t.replace(/^[«"„(]+|[.,!?:;…»")]+$/g, "");

export const KeywordLayer: React.FC<{ frame: number; tl: Timeline; filter?: (k: Keyword) => boolean }> = ({ frame, tl, filter }) => {
  const win = keywordWindows(tl).find((w) => frame >= w.start && frame < w.end && (!filter || filter(w.k)));
  if (!win) return null;
  const { k, start, end } = win;
  const { lines, size } = fitKeyword(clean(k.t).toUpperCase());

  const out = interpolate(frame, [end - 8, end], [0, 1], { ...CL, easing: EASE_IN });
  const drift = interpolate(frame, [start, end], [1, 1.035], CL); // the type keeps breathing while it holds
  const glow = interpolate(frame, [start, start + 10], [0, 1], { ...CL, easing: EASE_OUT }) * (1 - out);

  let n = 0;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 960 - 800,
          top: KW_Y - 300,
          width: 1600,
          height: 600,
          background: "radial-gradient(closest-side, rgba(255,179,0,0.13), rgba(255,179,0,0) 100%)",
          opacity: glow,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: KW_Y - 250,
          height: 500,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: SANS,
          fontWeight: 900,
          fontSize: size,
          lineHeight: 1.02,
          letterSpacing: "-0.01em",
          color: C.accent,
          textShadow: "0 0 48px rgba(255,179,0,0.28)",
          opacity: 1 - out,
          // the phrase as a whole springs 0.6 → 1; words cascade in inside it
          transform: `scale(${drift * (0.6 + 0.4 * spring({ frame: frame - start, fps: FPS, config: POP })) * (1 + 0.08 * out)})`,
          filter: out > 0 ? `blur(${out * 6}px)` : undefined,
        }}
      >
        {lines.map((line, li) => (
          <div key={li} style={{ whiteSpace: "nowrap" }}>
            {line.split(" ").map((w, wi) => {
              const p = spring({ frame: frame - start - 3 * n++, fps: FPS, config: POP });
              const a = Math.min(1, p * 1.6);
              return (
                <span
                  key={wi}
                  style={{
                    display: "inline-block",
                    margin: "0 0.13em",
                    opacity: a,
                    transform: `translateY(${(1 - p) * 0.4}em)`,
                    filter: a < 1 ? `blur(${(1 - a) * 10}px)` : undefined,
                  }}
                >
                  {w}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
};

// ── Karaoke line: the phrase being spoken. v1: y≈760, 64px; motion layout: bottom band, 52px ──
export const KaraokeLayer: React.FC<{ frame: number; tl: Timeline; y?: number; size?: number }> = ({ frame, tl, y: KA_Y = 760, size = 64 }) => {
  const ta = (frame - LEAD) / FPS;
  const L = tl.lines;
  const inAt = (i: number) => at(L[i].s - 0.15);
  // A line holds until the next one comes in, but never more than 1.2 s into a pause.
  const endAt = (i: number) => Math.min(i + 1 < L.length ? inAt(i + 1) : Infinity, at(L[i].e + 1.2));
  const cut = (i: number) => i + 1 < L.length && endAt(i) === inAt(i + 1);

  let cur = -1;
  for (let i = 0; i < L.length && inAt(i) <= frame; i++) cur = i;
  const shown = [cur - 1, cur].filter((i) => i >= 0);

  return (
    <>
      {shown.map((i) => {
        const s = inAt(i);
        const e = endAt(i);
        let opacity: number;
        let y: number;
        if (frame < e) {
          const p = interpolate(frame, [s + 1, s + 7], [0, 1], { ...CL, easing: EASE_OUT }); // 1 frame after the old line clears
          const fade = cut(i) ? 1 : interpolate(frame, [e - 8, e], [1, 0], CL);
          opacity = p * fade;
          y = (1 - p) * 12;
        } else if (cut(i) && frame < e + 3) {
          // hand-off: the old line clears in ~2 frames so two lines never sit on top of each other
          const q = interpolate(frame, [e, e + 3], [0, 1], { ...CL, easing: EASE_OUT });
          opacity = 1 - q;
          y = -14 * q;
        } else return null;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 160,
              width: 1600,
              top: KA_Y - 100,
              height: 200,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              alignContent: "center",
              justifyContent: "center",
              fontFamily: SANS,
              fontWeight: 700,
              fontSize: size,
              lineHeight: 1.25,
              color: C.text,
              opacity,
              transform: `translateY(${Math.round(y)}px)`,
              textRendering: "geometricPrecision",
              WebkitFontSmoothing: "antialiased",
            }}
          >
            {L[i].w.map((wi) => {
              const w = tl.words[wi];
              const on = Math.min(
                interpolate(ta, [w.s - 0.04, w.s + 0.05], [0, 1], CL),
                interpolate(ta, [w.e - 0.03, w.e + 0.07], [1, 0], CL),
              );
              return (
                <span
                  key={wi}
                  style={{
                    display: "inline-block",
                    verticalAlign: "baseline",
                    margin: "0 0.19em",
                    opacity: interpolate(ta, [w.s - 0.06, w.s + 0.04], [0.3, 1], CL),
                    color: interpolateColors(on, [0, 1], [C.text, C.accent]),
                    textShadow: on > 0 ? `0 0 26px rgba(255,179,0,${0.45 * on})` : undefined,
                  }}
                >
                  {w.t}
                </span>
              );
            })}
          </div>
        );
      })}
    </>
  );
};

// ── Background keywords (motion layout): huge, faint, outlined, drifting behind the scene ────
const BK_MAX_W = 1720;
const bkWidth = (s: string) => textWidth(s, kwFont(100)) - 0.01 * 100 * s.length;

export const KeywordBackdrop: React.FC<{ frame: number; tl: Timeline; filter: (k: Keyword) => boolean; until: (k: Keyword) => number }> = ({
  frame,
  tl,
  filter,
  until,
}) => {
  const ks = tl.keywords.filter(filter);
  return (
    <>
      {ks.map((k, j) => {
        const start = at(k.s) - 2;
        const next = j + 1 < ks.length ? at(ks[j + 1].s) - 2 - 24 : Infinity; // fade-out ends as the next word starts
        const end = Math.max(start + 20, Math.min(next, until(k), at(k.s + 6)));
        if (frame < start || frame > end + 24) return null;
        const text = clean(k.t).toUpperCase();
        const single = (BK_MAX_W / bkWidth(text)) * 100;
        const lines = single >= 200 || !text.includes(" ") ? [text] : balance(text.split(" "), kwFont(100));
        const size = Math.floor(Math.max(180, Math.min(300, (BK_MAX_W / Math.max(...lines.map(bkWidth))) * 100)));
        const a = interpolate(frame, [start, start + 18], [0, 1], { ...CL, easing: EASE_OUT });
        const out = interpolate(frame, [end, end + 24], [0, 1], { ...CL, easing: EASE_IN });
        const life = interpolate(frame, [start, end + 24], [0, 1], CL);
        return (
          <div
            key={j}
            style={{
              position: "absolute",
              left: -400,
              right: -400,
              top: 480 - 300,
              height: 600,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: SANS,
              fontWeight: 900,
              fontSize: size,
              lineHeight: 0.98,
              letterSpacing: `${-0.01 + 0.08 * (1 - a)}em`,
              whiteSpace: "nowrap",
              color: "rgba(243,239,230,0.03)",
              WebkitTextStroke: "2px rgba(255,179,0,0.1)",
              opacity: a * (1 - out),
              transform: `translateX(${70 - 140 * life}px) scale(${1.04 - 0.04 * a})`,
            }}
          >
            {lines.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        );
      })}
    </>
  );
};
