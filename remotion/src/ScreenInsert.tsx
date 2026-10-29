import React from "react";
import { AbsoluteFill, interpolate, OffthreadVideo, Sequence, staticFile } from "remotion";
import { at, C, CL, EASE_IN, EASE_IO, EASE_OUT, FPS, LEAD, SANS, ScreenClip, Screens, textWidth } from "./theme";

// ── Real-screen insert: the recording in an app window over the scene, then a camera push into `focus` ──────
// Window: 16:9 viewport inside the scene zone (x 140–1780, y 130–830), centred; the scene under it dims
// (Lesson.tsx), the karaoke band and the top bar stay above it.
const BAR = 46; // window title bar
const VW = 1160; // viewport (video) size in px
const VH = (VW * 9) / 16; // 652.5
const WX = 960 - VW / 2;
const WY = 130 + (700 - (BAR + VH)) / 2;
const R = 18;
const MAX_ZOOM = 2.2; // sources are 720p screen recordings — more than ×2.2 turns to mush
const FILL = 0.6; // after the push the focus takes ~60 % of the viewport (its larger side)
const IN = 10; // ≈0.35 s entrance
const OUT = 9; // ≈0.3 s exit
const CHIP_PX = 26;

/** Composition frames [from, to) and the trim that maps frame `from` to clip second `clipStart` (as Aroll.tsx). */
export const screenWindow = (c: ScreenClip) => {
  const from = at(c.s);
  const to = at(c.e);
  return { from, to, trimBefore: Math.max(0, c.clipStart * FPS + (from - LEAD) - c.s * FPS) };
};

/** 0..1 — how much a screen insert covers the scene right now (the scene dims by it). */
export const screenPresence = (frame: number, sc: Screens) => {
  let p = 0;
  for (const c of sc.screens) {
    const { from, to } = screenWindow(c);
    if (frame < from - 2 || frame > to + 2) continue;
    p = Math.max(p, interpolate(frame, [from - 2, from + IN, to - OUT, to], [0, 1, 1, 0], CL));
  }
  return p;
};

/** Timing of one insert (frames): entrance, the push, the focus frame, the exit. Short inserts compress it. */
const timing = (from: number, to: number) => {
  const zd = Math.round(Math.min(36, Math.max(12, to - from - IN - OUT - 40))); // the push ≈1.2 s
  const z0 = from + IN; // the push starts as the window lands
  return { z0, zd, box: z0 + Math.round(zd * 0.7), pulse: z0 + zd + 4, chip: z0 + Math.round(zd * 0.78) };
};

/** Camera at frame f: zoom k and the visible rect (left, top) in clip px. */
const camera = (c: ScreenClip, f: number, from: number, to: number) => {
  const sw = c.srcW ?? 1920;
  const sh = c.srcH ?? 1080;
  const { x, y, w, h } = c.focus;
  // a focus wider/taller than ~60 % of the frame gets (almost) no push — only the highlight frame
  const K = Math.max(1, Math.min(MAX_ZOOM, (FILL * sw) / w, (FILL * sh) / h));
  const { z0, zd } = timing(from, to);
  const z = interpolate(f, [z0, z0 + zd], [0, 1], { ...CL, easing: EASE_IO });
  // a slow +3 % drift while it holds, so the frame never freezes (still under the cap)
  const drift = interpolate(f, [z0 + zd, to], [0, 1], CL);
  const k = Math.min(MAX_ZOOM, Math.pow(K, z) * (1 + 0.03 * drift));
  // the centre travels in step with the width (a = share of the shrink done) → no lurch at the start
  const a = K > 1.0001 ? Math.min(1, (1 - 1 / Math.pow(K, z)) / (1 - 1 / K)) : z;
  const vw = sw / k;
  const vh = sh / k;
  const cx = Math.max(vw / 2, Math.min(sw - vw / 2, sw / 2 + (x + w / 2 - sw / 2) * a));
  const cy = Math.max(vh / 2, Math.min(sh - vh / 2, sh / 2 + (y + h / 2 - sh / 2) * a));
  return { k, left: cx - vw / 2, top: cy - vh / 2, s0: VW / sw };
};

const Insert: React.FC<{ frame: number; c: ScreenClip }> = ({ frame: f, c }) => {
  const { from, to, trimBefore } = screenWindow(c);
  const T = timing(from, to);
  const p = interpolate(f, [from, from + IN], [0, 1], { ...CL, easing: EASE_OUT });
  const q = interpolate(f, [to - OUT, to], [0, 1], { ...CL, easing: EASE_IN });
  const { k, left, top, s0 } = camera(c, f, from, to);
  const m = s0 * k; // clip px → viewport px

  // focus frame in viewport px
  const pad = 6;
  const bx = (c.focus.x - left) * m - pad;
  const by = (c.focus.y - top) * m - pad;
  const bw = c.focus.w * m + 2 * pad;
  const bh = c.focus.h * m + 2 * pad;
  const draw = interpolate(f, [T.box, T.box + 14], [0, 1], { ...CL, easing: EASE_OUT });
  const pulse = f > T.pulse && f < T.pulse + 18 ? Math.sin((Math.PI * (f - T.pulse)) / 18) : 0;
  const shade = interpolate(f, [T.box, T.box + 16], [0, 0.32], CL);

  // label chip next to the frame: above it, else below it, else inside its top edge; kept inside the viewport
  const label = c.label.length > 40 ? c.label.slice(0, 39) + "…" : c.label;
  const chipH = CHIP_PX * 1.9;
  const chipW = textWidth(label, `700 ${CHIP_PX}px Montserrat`) + CHIP_PX * 1.44 + 4;
  let cy = by - chipH - 12;
  if (cy < 12) cy = by + bh + 12;
  if (cy > VH - chipH - 12) cy = Math.max(12, by + 12);
  const cx = Math.max(12, Math.min(VW - chipW - 12, bx));
  const chip = interpolate(f - T.chip, [0, 8], [0, 1], { ...CL, easing: EASE_OUT });
  const chipPop = f >= T.chip ? 1 + 0.08 * Math.sin(Math.min(1, (f - T.chip) / 10) * Math.PI) : 1;

  return (
    <AbsoluteFill
      style={{
        opacity: p * (1 - q),
        transform: `scale(${(0.96 + 0.04 * p) * (1 - 0.03 * q)})`,
        transformOrigin: `960px ${WY + (BAR + VH) / 2}px`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: WX,
          top: WY,
          width: VW,
          height: BAR + VH,
          borderRadius: R,
          background: C.surface,
          border: `1px solid ${C.line}`,
          boxShadow: "0 22px 54px rgba(0,0,0,0.5), 0 2px 0 rgba(243,239,230,0.04) inset",
          overflow: "hidden",
        }}
      >
        {/* title bar */}
        <div style={{ position: "absolute", left: 0, top: 0, right: 0, height: BAR, display: "flex", alignItems: "center", gap: 10, padding: "0 18px" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: 12, height: 12, borderRadius: 6, background: "rgba(243,239,230,0.16)" }} />
          ))}
        </div>
        {/* viewport */}
        <div style={{ position: "absolute", left: 0, top: BAR, width: VW, height: VH, overflow: "hidden", background: C.bg }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: VW,
              height: VH,
              transformOrigin: "0 0",
              transform: `translate(${-left * m}px, ${-top * m}px) scale(${k})`,
            }}
          >
            <Sequence from={from} durationInFrames={to - from} layout="none" name={`Screen ${c.id}`}>
              <OffthreadVideo src={staticFile(c.src)} muted trimBefore={trimBefore} style={{ width: VW, height: VH, display: "block" }} />
            </Sequence>
          </div>
          {draw > 0 && (
            <>
              {/* soft spotlight: the rest of the screen steps back a little */}
              <div
                style={{
                  position: "absolute",
                  left: bx,
                  top: by,
                  width: bw,
                  height: bh,
                  borderRadius: 12,
                  boxShadow: `0 0 0 2400px rgba(17,19,24,${shade})`,
                }}
              />
              <svg
                width={VW}
                height={VH}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  overflow: "visible",
                  transformOrigin: `${bx + bw / 2}px ${by + bh / 2}px`,
                  transform: `scale(${1 + 0.025 * pulse})`,
                }}
              >
                <rect
                  x={bx}
                  y={by}
                  width={bw}
                  height={bh}
                  rx={12}
                  fill="none"
                  stroke={C.accent}
                  strokeWidth={3}
                  pathLength={1}
                  strokeDasharray="1 1"
                  strokeDashoffset={1 - draw}
                  style={{ filter: `drop-shadow(0 0 ${8 + 14 * pulse}px rgba(255,179,0,${0.45 + 0.4 * pulse}))` }}
                />
              </svg>
            </>
          )}
          {chip > 0 && (
            <div
              style={{
                position: "absolute",
                left: cx,
                top: cy,
                height: chipH,
                display: "flex",
                alignItems: "center",
                padding: `0 ${CHIP_PX * 0.72}px`,
                borderRadius: CHIP_PX,
                background: C.accent,
                color: C.bg,
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: CHIP_PX,
                whiteSpace: "nowrap",
                boxShadow: "0 10px 26px rgba(0,0,0,0.4)",
                opacity: chip,
                transform: `translateY(${(1 - chip) * 10}px) scale(${chipPop})`,
                transformOrigin: "0% 50%",
              }}
            >
              {label}
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** All screen inserts live at this frame (they never overlap in practice; later ones draw on top). */
export const ScreenLayer: React.FC<{ frame: number; screens: Screens }> = ({ frame, screens }) => (
  <>
    {screens.screens.map((c) => {
      const { from, to } = screenWindow(c);
      if (frame < from || frame >= to) return null;
      return <Insert key={c.id} frame={frame} c={c} />;
    })}
  </>
);
