import React from "react";
import { AbsoluteFill, interpolate, OffthreadVideo, Sequence, staticFile } from "remotion";
import {
  Aroll, ArollSegment, at, balance, C, CARD_HOLD, cardStart, CL, EASE_IN, EASE_OUT, FPS, LEAD, MONO, pad2,
  parseTitle, SANS, textWidth, Timeline,
} from "./theme";

/**
 * Composition frames [from, to) of an A-roll shot and the trim that keeps the lips on the voice.
 * Frame f must show clip second clipStart + ((f − LEAD) / FPS − s). Inside the Sequence, OffthreadVideo shows
 * second (f − from + trimBefore) / FPS, so trimBefore = clipStart·FPS + (from − LEAD) − s·FPS. It absorbs the
 * rounding of `from` (fractional trims are valid), so the mapping is exact. Media time is in seconds, so the
 * 24 fps source just shows whichever clip frame is current at that second.
 */
export const arollWindow = (seg: ArollSegment) => {
  const from = at(seg.s);
  const to = at(seg.e);
  return { from, to, trimBefore: seg.clipStart * FPS + (from - LEAD) - seg.s * FPS };
};

/**
 * Index of the section this shot opens, or −1: the shot starts while that section's big card would still be
 * holding and is still on screen when the card would end. A shot that starts later (e.g. 57 frames into the
 * card) keeps the card; it cuts in over the card's fly-off, which runs under the A-roll layer (Lesson.tsx).
 * A shot that ends inside the hold (e.g. 5 frames past the card's start) belongs to the previous
 * section — the card plays as usual.
 */
const chapterOf = (tl: Timeline, seg: ArollSegment) => {
  const { from, to } = arollWindow(seg);
  return tl.sections.findIndex((s) => {
    const c = cardStart(s);
    return from < c + CARD_HOLD && to > c + CARD_HOLD;
  });
};

/** Sections that open on an A-roll shot: no big card and no content dim for them — the shot carries a chapter plate. */
export const arollChapters = (tl: Timeline, aroll?: Aroll): ReadonlySet<number> => {
  const res = new Set<number>();
  if (aroll) {
    for (const seg of aroll.segments) {
      const i = chapterOf(tl, seg);
      if (i >= 0) res.add(i);
    }
  }
  return res;
};

// ── Chapter plate: compact «03 / 08 + title» under the TopBar, left of the head, ~1.8 s ────────
const PLATE_PX = 44;
const PLATE_MAX_W = 520; // with 44 px the plate ends at x ≈ 600, clear of the head even on the 1.15 shots
const PLATE_IN = 10;
const PLATE_OUT = 9;
const LABEL_IN = CARD_HOLD + 4; // TopBar's corner label starts entering here, relative to cardStart (Sections.tsx)

const ChapterPlate: React.FC<{ rel: number; hold: number; idx: number; tl: Timeline }> = ({ rel, hold, idx, tl }) => {
  if (rel < 0 || rel >= hold + PLATE_OUT) return null;
  const { kicker, title } = parseTitle(tl.sections[idx].title);
  const font = `900 ${PLATE_PX}px Montserrat`;
  const lines = textWidth(title, font) > PLATE_MAX_W ? balance(title.split(" "), font) : [title];

  const open = interpolate(rel, [0, PLATE_IN], [0, 1], { ...CL, easing: EASE_OUT });
  const close = interpolate(rel, [hold, hold + PLATE_OUT], [0, 1], { ...CL, easing: EASE_IN });
  const shown = open * (1 - close); // the plate unrolls from its accent edge and rolls back into it
  const kIn = interpolate(rel, [3, 14], [0, 1], { ...CL, easing: EASE_OUT });

  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        top: 120,
        display: "flex",
        clipPath: `inset(0 ${(1 - shown) * 100}% 0 0)`,
      }}
    >
      <div style={{ width: 6, background: C.accent, borderRadius: "2px 0 0 2px" }} />
      <div style={{ background: "rgba(17,19,24,0.84)", padding: "16px 30px 20px 24px", borderRadius: "0 4px 4px 0" }}>
        <div
          style={{
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 22,
            letterSpacing: "0.18em",
            color: C.muted,
            marginBottom: 8,
            opacity: kIn,
            transform: `translateX(${(1 - kIn) * -16}px)`,
          }}
        >
          <span style={{ color: C.accent }}>{pad2(idx + 1)}</span> / {pad2(tl.sections.length)}
          {kicker && <span style={{ color: C.accent }}>{"  ·  " + kicker.toUpperCase()}</span>}
        </div>
        <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: PLATE_PX, lineHeight: 1.08, letterSpacing: "-0.015em", color: C.text }}>
          {lines.map((line, i) => {
            const rise = interpolate(rel, [2 + 3 * i, 18 + 3 * i], [112, 0], { ...CL, easing: EASE_OUT });
            return (
              // padded mask so Й, Д, Щ, у and р never get clipped
              <div key={i} style={{ overflow: "hidden", padding: "0.12em 0.06em 0.16em", margin: "-0.12em -0.06em -0.16em" }}>
                <div style={{ whiteSpace: "nowrap", transform: `translateY(${rise}%)` }}>{line}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/** The chapter plate of a shot that opens a section (nothing otherwise); it starts with the shot at `seg.s`. */
export const ArollPlate: React.FC<{ frame: number; tl: Timeline; seg: ArollSegment }> = ({ frame, tl, seg }) => {
  const ch = chapterOf(tl, seg);
  if (ch < 0) return null;
  const from = at(seg.s);
  // the plate rolls back exactly as the TopBar label for this section slides in — a hand-off, not a duplicate
  return <ChapterPlate rel={frame - from} hold={Math.max(PLATE_IN + 20, cardStart(tl.sections[ch]) + LABEL_IN - from)} idx={ch} tl={tl} />;
};

/**
 * Presenter full frame (1920×1080, cover) inside each segment window — hard cut in and out: the Sequence just mounts
 * and unmounts, no fades or blur. Whatever is under it (scenes, keywords) keeps running on its own clock.
 * `children` (BottomBand + karaoke) are drawn over the video; the chapter plate goes on top.
 * The clip's own audio is muted. Frames come from the compositor as uncompressed BMP at the source's 2560×1440,
 * so a `--scale=1.3333` render maps them 1:1. `skip` names the segments that play as continuous takes instead.
 */
export const ArollLayer: React.FC<{ frame: number; tl: Timeline; aroll: Aroll; skip?: ReadonlySet<string>; children?: React.ReactNode }> = ({
  frame,
  tl,
  aroll,
  skip,
  children,
}) => (
  <>
    {aroll.segments.filter((seg) => !skip?.has(seg.id)).map((seg) => {
      const { from, to, trimBefore } = arollWindow(seg);
      return (
        <Sequence key={seg.id} from={from} durationInFrames={to - from} name={`A-roll ${seg.id}`}>
          <AbsoluteFill style={{ background: C.bg, overflow: "hidden" }}>
            <OffthreadVideo
              src={staticFile(seg.src)}
              muted
              trimBefore={trimBefore}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transformOrigin: "50% 30%", // scale around the face
                transform: seg.scale !== 1 ? `scale(${seg.scale})` : undefined,
              }}
            />
          </AbsoluteFill>
          {children}
          <ArollPlate frame={frame} tl={tl} seg={seg} />
        </Sequence>
      );
    })}
  </>
);
