import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import {
  at, balance, C, CARD_HOLD, CARD_OUT, cardStart, CL, EASE_IN, EASE_OUT, FPS, LEAD, MONO, pad2, parseTitle, SANS,
  keywordPresence, lessonNo, seriesOf, textWidth, Timeline, W,
} from "./theme";

const TITLE_PX = 96;
const TITLE_MAX_W = 1500;

// ── Big section card: centre-left, ~1.6 s, then flies off towards the corner label ───────────
// `skip` — sections that open on an A-roll shot; they get the compact chapter plate (Aroll.tsx) instead.
export const SectionCard: React.FC<{ frame: number; tl: Timeline; skip?: ReadonlySet<number> }> = ({ frame, tl, skip }) => {
  const idx = tl.sections.findIndex((s) => frame >= cardStart(s) && frame < cardStart(s) + CARD_HOLD + CARD_OUT);
  if (idx < 0 || (skip && skip.has(idx))) return null;
  const rel = frame - cardStart(tl.sections[idx]);
  const { kicker, title } = parseTitle(tl.sections[idx].title);
  const font = `900 ${TITLE_PX}px Montserrat`;
  const lines = textWidth(title, font) > TITLE_MAX_W ? balance(title.split(" "), font) : [title];

  const kIn = interpolate(rel, [0, 14], [0, 1], { ...CL, easing: EASE_OUT });
  const out = interpolate(rel, [CARD_HOLD, CARD_HOLD + CARD_OUT], [0, 1], { ...CL, easing: EASE_IN });
  const bar = rel < CARD_HOLD ? interpolate(rel, [8, 28], [0, 1], { ...CL, easing: EASE_OUT }) : 1 - interpolate(rel, [CARD_HOLD, CARD_HOLD + 10], [0, 1], { ...CL, easing: EASE_IN });
  const ghost = interpolate(rel, [0, 24], [0, 1], { ...CL, easing: EASE_OUT }) * (1 - out);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "flex-start", paddingLeft: 160 }}>
      {/* oversized section number behind the card */}
      <div
        style={{
          position: "absolute",
          right: 110,
          top: 540 - 260,
          fontFamily: SANS,
          fontWeight: 900,
          fontSize: 440,
          lineHeight: 1,
          letterSpacing: "-0.04em",
          color: "rgba(243,239,230,0.05)",
          opacity: ghost,
          transform: `translateX(${(1 - ghost) * 60 + out * 40}px)`,
        }}
      >
        {pad2(idx + 1)}
      </div>
      <div style={{ transform: `translate(${out * 48}px, ${-out * 36}px)` }}>
        <div
          style={{
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 28,
            letterSpacing: "0.18em",
            color: C.muted,
            marginBottom: 22,
            opacity: kIn * (1 - out),
            transform: `translateX(${(1 - kIn) * -28}px)`,
          }}
        >
          <span style={{ color: C.accent }}>{pad2(idx + 1)}</span> / {pad2(tl.sections.length)}
          {kicker && <span style={{ color: C.accent }}>{"  ·  " + kicker.toUpperCase()}</span>}
        </div>
        <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: TITLE_PX, lineHeight: 1.08, letterSpacing: "-0.015em", color: C.text }}>
          {lines.map((line, i) => {
            const rise = interpolate(rel, [3 + 4 * i, 23 + 4 * i], [112, 0], { ...CL, easing: EASE_OUT });
            const exit = interpolate(rel, [CARD_HOLD + 2 * i, CARD_HOLD + 12 + 2 * i], [0, -118], { ...CL, easing: EASE_IN });
            return (
              // the mask is padded so Й, Д, Щ, у and р never get clipped
              <div key={i} style={{ overflow: "hidden", padding: "0.12em 0.06em 0.16em", margin: "-0.12em -0.06em -0.16em" }}>
                <div style={{ whiteSpace: "nowrap", transform: `translateY(${rise + exit}%)` }}>{line}</div>
              </div>
            );
          })}
        </div>
        <div
          style={{
            height: 8,
            marginTop: 30,
            background: C.accent,
            borderRadius: 1,
            boxShadow: "0 0 24px rgba(255,179,0,0.35)",
            transformOrigin: rel < CARD_HOLD ? "left center" : "right center",
            transform: `scaleX(${bar})`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

// ── Type texture: the current section title, huge and faint, drifting behind the keyword zone ─
export const SectionTexture: React.FC<{ frame: number; tl: Timeline }> = ({ frame, tl }) => {
  const S = tl.sections;
  const idx = S.findIndex((s, i) => frame >= cardStart(s) + CARD_HOLD && frame < (i + 1 < S.length ? cardStart(S[i + 1]) : Infinity));
  if (idx < 0) return null;
  const from = cardStart(S[idx]) + CARD_HOLD;
  const to = idx + 1 < S.length ? cardStart(S[idx + 1]) : at(tl.duration);
  const o = interpolate(frame, [from, from + 30, to - 10, to], [0, 1, 1, 0], CL) * (1 - keywordPresence(frame, tl));
  const word = S[idx].title.toUpperCase();
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 400 - 150,
        height: 300,
        whiteSpace: "nowrap",
        fontFamily: SANS,
        fontWeight: 900,
        fontSize: 280,
        lineHeight: "300px",
        letterSpacing: "-0.02em",
        color: "rgba(243,239,230,0.02)",
        opacity: o,
        transform: `translateX(${120 - (frame - from) * 0.9}px)`,
      }}
    >
      {`${word} — ${word} — ${word} — ${word}`}
    </div>
  );
};

// ── Top bar: lesson tag left, current section right, progress on the very top edge ───────────
export const TopBar: React.FC<{ frame: number; tl: Timeline; lesson: number; fade: number }> = ({ frame, tl, lesson, fade }) => {
  const S = tl.sections;
  const series = seriesOf(lesson);
  const progress = Math.max(0, Math.min(1, (frame - LEAD) / FPS / tl.duration));

  const idx = S.findIndex((s, i) => {
    const from = cardStart(s) + CARD_HOLD + 4;
    const to = Math.min(at(s.e), i + 1 < S.length ? cardStart(S[i + 1]) : Infinity);
    return frame >= from && frame < to;
  });
  let label: React.ReactNode = null;
  if (idx >= 0) {
    const from = cardStart(S[idx]) + CARD_HOLD + 4;
    const to = Math.min(at(S[idx].e), idx + 1 < S.length ? cardStart(S[idx + 1]) : Infinity);
    const p = interpolate(frame, [from, from + 14], [0, 1], { ...CL, easing: EASE_OUT });
    const q = interpolate(frame, [to - 8, to], [0, 1], { ...CL, easing: EASE_IN });
    label = (
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 16,
          opacity: p * (1 - q),
          transform: `translate(${(1 - p) * -40}px, ${(1 - p) * 26 - q * 10}px)`,
        }}
      >
        <span style={{ fontFamily: MONO, fontWeight: 400, fontSize: 22, color: C.muted, letterSpacing: "0.08em" }}>
          {pad2(idx + 1)}/{pad2(S.length)}
        </span>
        <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 28, color: C.accent }}>{S[idx].title}</span>
      </div>
    );
  }

  return (
    <>
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: 4, background: "rgba(243,239,230,0.08)" }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: progress * W,
          height: 4,
          background: C.accent,
          boxShadow: "0 0 14px rgba(255,179,0,0.6)",
        }}
      />
      {/* chapter notches */}
      {S.slice(1).map((s, i) => (
        <div key={i} style={{ position: "absolute", top: 0, left: (s.s / tl.duration) * W - 2, width: 4, height: 4, background: C.bg }} />
      ))}
      <div
        style={{
          position: "absolute",
          left: 64,
          right: 64,
          top: 56,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          opacity: fade,
        }}
      >
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, letterSpacing: "0.12em", color: C.muted }}>
          {series.hideNo ? (
            series.tag
          ) : (
            <>
              {series.tag} <span style={{ color: C.accent }}>·</span> УРОК {lessonNo(lesson)}
            </>
          )}
        </div>
        {label}
      </div>
    </>
  );
};
