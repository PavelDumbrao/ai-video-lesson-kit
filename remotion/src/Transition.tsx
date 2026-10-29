import React from "react";
import { AbsoluteFill, Easing, interpolate, OffthreadVideo, Sequence, staticFile } from "remotion";
import { ArollSegment, at, atSum, C, CL, FaceTrack, FPS, H, LEAD, TransBody, TransLayout, TransSpec, TrStyle, W } from "./theme";

/**
 * Continuous A-roll ↔ B-roll: one uninterrupted take covers the whole stretch, and every transition is a move of
 * that same shot — never a cut. The stretch is a list of layout keys (aroll.json `trans.keys`, voice seconds):
 * each key moves the take from the previous layout to its own over `dur`, the first one starts from "hidden".
 *   full→corner→gone:  {90.20 full 0.4}  {96.34 corner 0.3}  {100.25 hidden 0.35}
 *   corner→full:        {166.12 corner 0.3}  {176.05 full 0.38}  — ends with the segment, at `e`
 * The window runs from the first key to the end of a final "hidden" move, or to the segment end `e` otherwise.
 * A layout is a pose of two numbers: u (0 = full studio frame … 1 = miniature) and v (miniature presence,
 * 0 = gone): full (0, 1), corner (1, 1), hidden (1, 0). A move eases both from pose to pose; a static full pose
 * is phase "a" — the studio take untouched, exactly what a hard-cut A-roll shows.
 * The studio frame and the cutout always share one transform, so the person in the studio frame stays registered
 * under the cutout: nothing doubles while the studio background melts away around him (shrinking soft mask + fade).
 */

type Move = { a: number; b: number; from: TransLayout; to: TransLayout }; // composition frames [a, b)
export type TransWin = { start: number; end: number; f0: number; moves: Move[] };
export type TransState = { phase: "a" | "move" | "hold"; u: number; v: number };

const POSE: Record<TransLayout, { u: number; v: number }> = { full: { u: 0, v: 1 }, corner: { u: 1, v: 1 }, hidden: { u: 1, v: 0 } };

export const transWindow = (seg: ArollSegment, t: TransSpec): TransWin => {
  let prev: TransLayout = "hidden";
  const moves = [...t.keys]
    .sort((x, y) => x.t - y.t)
    .map((k): Move => {
      const m = { a: at(k.t), b: atSum(k.t, k.dur ?? 0), from: prev, to: k.layout };
      prev = k.layout;
      return m;
    });
  const last = moves[moves.length - 1];
  return {
    start: moves.length ? moves[0].a : at(seg.s),
    end: last && last.to === "hidden" ? last.b : at(seg.e),
    f0: LEAD + t.clip0 * FPS, // composition frame (may be fractional) that shows clip second 0
    moves,
  };
};

const MOVE = Easing.bezier(0.5, 0, 0.2, 1); // ease-in-out: quick, with a long soft landing
const APPEAR = Easing.bezier(0.16, 1, 0.3, 1);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Pose at frame f, or null outside the continuous window (the lesson renders exactly as without it). */
export const transState = (f: number, w: TransWin): TransState | null => {
  if (f < w.start || f >= w.end || !w.moves.length) return null;
  let m = w.moves[0];
  for (const x of w.moves) if (f >= x.a) m = x;
  const A = POSE[m.from];
  const B = POSE[m.to];
  if (f >= m.b) return { phase: m.to === "full" ? "a" : "hold", u: B.u, v: B.v };
  const q = interpolate(f, [m.a, m.b], [0, 1], CL);
  const k = MOVE(q);
  // straight into the full frame (B → A, mouth still closed) the miniature is only ever seen small: it appears early
  const kv = m.from === "hidden" && m.to === "full" ? APPEAR(Math.min(1, q / 0.45)) : k;
  return { phase: "move", u: mix(A.u, B.u, k), v: mix(A.v, B.v, kv) };
};

// ── geometry ────────────────────────────────────────────────────────────────────────────────────────
type Xf = { k: number; x: number; y: number }; // screen = (x, y) + k · local; local = the take at 1920×1080
const ID: Xf = { k: 1, x: 0, y: 0 };
const mixXf = (a: Xf, b: Xf, t: number): Xf => ({ k: mix(a.k, b.k, t), x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) });
const scaleAt = (m: Xf, s: number, px: number, py: number): Xf => ({ k: m.k * s, x: px + (m.x - px) * s, y: py + (m.y - py) * s });
const smooth = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

// The person in the reference take (cutout alpha > 50 %, local px): shoulders x 372–1500, head top y 76, frame
// bottom. Other takes bring their own `body` (and `cornerK`), measured the same way.
const BODY = { l: 372, r: 1500, t: 76, b: 1076, cx: 936, cy: 600, faceX: 945 };
const bodyOf = (spec: TransSpec): TransBody => spec.body ?? BODY;

// corner: bust ≈ 630×560 (reference take at 0.56), right edge x 1900, bottom y 846 — just above the karaoke band.
// `side: "left"` is the mirror spot: the bust's left edge at x 20 (W − 1900), same size and bottom. Only the box
// is mirrored — the take itself is never flipped (a real person), so the move simply runs to the left instead.
const CORNER_K = 0.56;
const cornerLeft = (spec: TransSpec) => spec.side === "left";
const cornerXf = (spec: TransSpec): Xf => {
  const B = bodyOf(spec);
  const k = spec.cornerK ?? CORNER_K;
  return { k, x: cornerLeft(spec) ? W - 1900 - B.l * k : 1900 - B.r * k, y: 846 - B.b * k };
};
// side: a big bust on the left, 820 px tall from the bottom edge, face at x ≈ 500 (geometry of the reference take)
const SIDE_K = 820 / (H - BODY.t);
const SIDE: Xf = { k: SIDE_K, x: 500 - BODY.faceX * SIDE_K, y: H - H * SIDE_K };

const presenterPose = (style: TrStyle, spec: TransSpec, u: number, v: number): Xf => {
  if (style === "side") {
    // leaving, he steps out over the left edge while the lesson grows back to full frame (no ghost over it)
    const s = scaleAt(SIDE, 0.9 + 0.1 * v, 500, H);
    return mixXf(ID, { ...s, x: s.x - 620 * (1 - v) }, u);
  }
  const B = bodyOf(spec);
  const c = cornerXf(spec);
  return mixXf(ID, scaleAt(c, 0.78 + 0.22 * v, c.x + B.cx * c.k, c.y + B.cy * c.k), u);
};

/** Studio background: fully there until u 0.03, gone by u 0.45. */
const studioAlpha = (u: number) => 1 - smooth((u - 0.03) / 0.42);
/**
 * The cutout switches on over its own registered copy inside the studio frame. Remotion decodes both to the same
 * source frame and the same colours (probe: mean difference ≈ 3/255 on the face), so the switch is invisible.
 */
const cutAlpha = (u: number) => smooth(u / 0.03);
/**
 * The studio frame melts away as it travels with the presenter: a soft ellipse around him shrinks, and the frame's own
 * edges feather out as soon as it moves, so no straight edge ever slides over the lesson. Gradients only, no blur.
 */
const melt = (u: number, cx: number): React.CSSProperties => {
  if (u <= 0.0005) return {};
  const g = Math.exp(mix(Math.log(2.6), Math.log(0.8), smooth(u / 0.45)));
  const fe = 560 * smooth(u / 0.15);
  const m = [
    `radial-gradient(${960 * g}px ${760 * g}px at ${cx}px 640px, #000 55%, rgba(0,0,0,0) 100%)`,
    `linear-gradient(90deg, rgba(0,0,0,0) 0px, #000 ${fe}px, #000 ${W - fe}px, rgba(0,0,0,0) ${W}px)`,
    `linear-gradient(180deg, rgba(0,0,0,0) 0px, #000 ${fe}px, #000 ${H - fe}px, rgba(0,0,0,0) ${H}px)`,
  ].join(", ");
  return { WebkitMaskImage: m, maskImage: m, WebkitMaskComposite: "source-in", maskComposite: "intersect" };
};

// ── media ───────────────────────────────────────────────────────────────────────────────────────────
// The webm's timestamps are rounded to 1 ms (0.042 vs 0.041667), and every 5th composition frame falls exactly on a
// 24 fps frame boundary. Asking 0.05 source frame later keeps studio and cutout on the same source frame whichever
// way the extractor rounds; 2 ms is nothing for lip sync.
const SYNC_NUDGE = (0.05 / 24) * FPS;

// The take has no picture before its second 0: when the first key rounds to a frame a fraction before it
// (e.g. key 100.14 → frame 3019, clip 0 at 3019.2) the video starts one frame later — v is 0 there anyway.
const Take: React.FC<{ w: TransWin; src: string; transparent?: boolean }> = ({ w, src, transparent }) => {
  const from = Math.max(w.start, Math.ceil(w.f0 - SYNC_NUDGE));
  return (
    <Sequence from={from} durationInFrames={w.end - from} layout="none">
      <OffthreadVideo
        src={staticFile(src)}
        muted
        transparent={transparent}
        trimBefore={from - w.f0 + SYNC_NUDGE}
        style={{ display: "block", width: W, height: H, objectFit: "cover" }}
      />
    </Sequence>
  );
};

const Layer: React.FC<{ m: Xf; style?: React.CSSProperties; children: React.ReactNode }> = ({ m, style, children }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      width: W,
      height: H,
      transformOrigin: "0 0",
      transform: m === ID ? undefined : `translate(${m.x}px, ${m.y}px) scale(${m.k})`,
      ...style,
    }}
  >
    {children}
  </div>
);

// Some cutouts: the alpha plane decodes as 43…212 instead of 0…255 (background ≈ 17 % opaque, the person
// ≈ 83 %): `alphaFix` remaps it so the background is fully clear and the person fully solid. Cutouts that are
// already full-range skip the filter.
const A_LO = 46 / 255;
const A_HI = 208 / 255;
const AlphaFix: React.FC = () => (
  <svg width={0} height={0} style={{ position: "absolute" }}>
    <filter id="tr-alpha" x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
      <feComponentTransfer>
        <feFuncA type="linear" slope={1 / (A_HI - A_LO)} intercept={-A_LO / (A_HI - A_LO)} />
      </feComponentTransfer>
    </filter>
  </svg>
);

// A hand that reaches the take's side edge (a goodbye wave) would end in a straight vertical cut on the
// miniature: the outer EDGE px of the take fade out (local px; the reference bodies stay ≥ 330 px inside).
const EDGE = 240;

const Cutout: React.FC<{
  w: TransWin;
  src: string;
  m: Xf;
  opacity: number;
  fade: number;
  shadow: number;
  dx: number;
  alphaFix?: boolean;
}> = ({ w, src, m, opacity, fade, shadow, dx, alphaFix }) => {
  // the bust's lower edge (the frame bottom of the take) dissolves softly instead of ending in a straight cut
  const e = EDGE * fade;
  const mask =
    fade > 0.001
      ? `linear-gradient(180deg, #000 ${H - 330 * fade}px, rgba(0,0,0,0) ${H}px), ` +
        `linear-gradient(90deg, rgba(0,0,0,0) 0px, #000 ${e}px, #000 ${W - e}px, rgba(0,0,0,0) ${W}px)`
      : undefined;
  const sh = shadow > 0.01 ? ` drop-shadow(${dx}px 22px 26px rgba(0,0,0,${0.55 * shadow}))` : "";
  const filter = (alphaFix ? `url(#tr-alpha)${sh}` : sh.trim()) || undefined;
  return (
    <>
      {alphaFix && <AlphaFix />}
      <Layer
        m={m}
        style={{
          opacity,
          filter,
          WebkitMaskImage: mask,
          maskImage: mask,
          ...(mask ? { WebkitMaskComposite: "source-in", maskComposite: "intersect" } : {}),
        }}
      >
        <Take w={w} src={src} transparent />
      </Layer>
    </>
  );
};

// ── side: the lesson frame as a panel ─────────────────────────────────────────────────────────────
export type PanelPose = { x: number; y: number; w: number; r: number; chrome: number };
const DOCK = { x: 596, y: 172, w: 1300 };
const OFF_X = W + 60;

export const lessonPanel = (style: TrStyle, ts: TransState | null): PanelPose | null => {
  if (!ts || style !== "side") return null;
  const { u, v } = ts;
  const x = mix(OFF_X, DOCK.x, u); // slides in from the right, behind the presenter
  return { x: mix(0, x, v), y: mix(0, DOCK.y, v), w: mix(W, DOCK.w, v), r: 18 * v, chrome: v };
};

/** Wraps Backdrop + content; with a panel pose the whole lesson frame becomes a framed panel. */
export const LessonFrame: React.FC<{ panel: PanelPose | null; children: React.ReactNode }> = ({ panel, children }) => {
  if (!panel) return <>{children}</>;
  const s = panel.w / W;
  const box: React.CSSProperties = { position: "absolute", left: panel.x, top: panel.y, width: panel.w, height: panel.w * (H / W), borderRadius: panel.r };
  return (
    <>
      {panel.chrome > 0.004 && <div style={{ ...box, background: C.bg, boxShadow: `0 28px 70px rgba(0,0,0,${0.5 * panel.chrome})` }} />}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: W,
          height: H,
          background: C.bg,
          overflow: "hidden",
          transformOrigin: "0 0",
          transform: `translate(${panel.x}px, ${panel.y}px) scale(${s})`,
          borderRadius: panel.r / s,
        }}
      >
        {children}
      </div>
      {panel.chrome > 0.004 && <div style={{ ...box, boxShadow: `inset 0 0 0 2px rgba(43,48,59,${panel.chrome})` }} />}
    </>
  );
};

/** Brand ground around the panel: #111318 with a warm light behind the presenter and a cool one behind the panel. */
const SideGround: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <AbsoluteFill style={{ background: "radial-gradient(1100px circle at 430px 760px, rgba(255,179,0,0.11), rgba(255,179,0,0) 70%)" }} />
    <AbsoluteFill style={{ background: "radial-gradient(1000px circle at 1300px 480px, rgba(35,40,51,0.85), rgba(35,40,51,0) 70%)" }} />
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 85% 85% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.42) 100%)" }} />
  </AbsoluteFill>
);

// ── circle: an iris on the face ─────────────────────────────────────────────────────────────────────
// Ø400 docked right; the face sits 10 px below its centre at 0.64× — the take then still covers the circle's top
// (the smoothed face is ≥ 349 px below the take's top edge: 0.64 · 349 − 10 ≥ 213 > 200) and the head clears the ring.
const CIRCLE = { x: 1660, y: 626, r: 200, k: 0.64, drop: 10 };
// Stage 1 closes the iris to this radius around the face with the take untouched; only then may the circle travel,
// since a take that moved while the iris is still wider than the face's distance to its top edge would show that edge.
const IRIS_R = 330;
const RING = 6.5;
const SIGMA = 8; // source frames (≈ 0.33 s): YuNet jitters by ±10 px from frame to frame

const faceCache = new WeakMap<FaceTrack, { x: number; y: number }[]>();
const smoothTrack = (tr: FaceTrack) => {
  const hit = faceCache.get(tr);
  if (hit) return hit;
  const k = W / tr.w; // track px → composition px (the take is shown 'cover' at 1920×1080)
  const raw = tr.frames.map(([x, y, fw, fh]) => ({ x: (x + fw / 2) * k, y: (y + fh / 2) * k }));
  const res = raw.map((_, i) => {
    let sw = 0;
    let sx = 0;
    let sy = 0;
    for (let j = Math.max(0, i - 3 * SIGMA); j <= Math.min(raw.length - 1, i + 3 * SIGMA); j++) {
      const wt = Math.exp(-((j - i) ** 2) / (2 * SIGMA * SIGMA));
      sw += wt;
      sx += wt * raw[j].x;
      sy += wt * raw[j].y;
    }
    return { x: sx / sw, y: sy / sw };
  });
  faceCache.set(tr, res);
  return res;
};

/** Smoothed face centre (composition px of the full-frame take) at clip second t. */
const facePoint = (spec: TransSpec, t: number) => {
  const tr = spec.face;
  if (!tr || typeof tr === "string" || tr.frames.length === 0) return { x: BODY.faceX, y: 360 };
  const s = smoothTrack(tr);
  const q = Math.max(0, Math.min(s.length - 1, t * tr.fps));
  const i = Math.floor(q);
  const j = Math.min(s.length - 1, i + 1);
  return { x: mix(s[i].x, s[j].x, q - i), y: mix(s[i].y, s[j].y, q - i) };
};

const CircleShot: React.FC<{ frame: number; spec: TransSpec; w: TransWin; ts: TransState }> = ({ frame, spec, w, ts }) => {
  const { u, v } = ts;
  const F = facePoint(spec, (frame - w.f0) / FPS);
  const r0 = Math.max(Math.hypot(F.x, F.y), Math.hypot(W - F.x, F.y), Math.hypot(F.x, H - F.y), Math.hypot(W - F.x, H - F.y)) + 24;
  const t1 = Math.min(1, u / 0.5); // stage 1: the iris closes on the face
  const t2 = Math.max(0, (u - 0.5) / 0.5); // stage 2: the closed circle travels to the dock, shrinking
  const r = u <= 0.5 ? r0 * Math.pow(IRIS_R / r0, t1) : IRIS_R * Math.pow(CIRCLE.r / IRIS_R, t2); // geometric = even pace
  const cx = mix(F.x, CIRCLE.x, t2);
  const cy = mix(F.y, CIRCLE.y, t2);
  const k = Math.pow(CIRCLE.k, t2);
  const m: Xf = { k, x: cx - k * F.x, y: cy + CIRCLE.drop * t2 - k * F.y }; // the face rides the circle's centre
  const ring = smooth((u - 0.3) / 0.45);
  const s = 0.72 + 0.28 * v;
  const disc: React.CSSProperties = { position: "absolute", left: cx - r, top: cy - r, width: 2 * r, height: 2 * r, borderRadius: "50%" };
  return (
    <AbsoluteFill style={{ opacity: v, transformOrigin: `${cx}px ${cy}px`, transform: s < 1 ? `scale(${s})` : undefined }}>
      {ring > 0.004 && <div style={{ ...disc, boxShadow: `0 18px 44px rgba(0,0,0,${0.5 * ring})` }} />}
      {/* backing in the take's own near-black, so a rounding sliver can never show the lesson through the circle */}
      <AbsoluteFill style={{ clipPath: `circle(${r}px at ${cx}px ${cy}px)`, background: "#06080c" }}>
        <Layer m={m}>
          <Take w={w} src={spec.studio} />
        </Layer>
      </AbsoluteFill>
      {ring > 0.004 && (
        <div
          style={{
            ...disc,
            left: cx - r - RING / 2,
            top: cy - r - RING / 2,
            width: 2 * r + RING,
            height: 2 * r + RING,
            boxSizing: "border-box",
            border: `${RING}px solid rgba(255,179,0,${ring})`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

// ── layers ──────────────────────────────────────────────────────────────────────────────────────────
type LayerProps = { frame: number; spec: TransSpec; w: TransWin; ts: TransState; style: TrStyle };

/** Under the lesson frame (side only): brand ground + the studio frame melting away as it travels with the presenter. */
export const TransUnder: React.FC<LayerProps> = ({ spec, w, ts, style }) => {
  if (style !== "side" || ts.phase === "a") return null;
  const so = studioAlpha(ts.u);
  return (
    <>
      <SideGround />
      {so > 0.004 && (
        <Layer m={presenterPose(style, spec, ts.u, ts.v)} style={{ opacity: so, ...melt(ts.u, bodyOf(spec).cx) }}>
          <Take w={w} src={spec.studio} />
        </Layer>
      )}
    </>
  );
};

/** Over the lesson: the full studio take (phase a), the iris (circle) or the travelling cutout (corner, side). */
export const TransOver: React.FC<LayerProps> = ({ frame, spec, w, ts, style }) => {
  if (ts.phase === "a") {
    return (
      <AbsoluteFill style={{ background: C.bg }}>
        <Take w={w} src={spec.studio} />
      </AbsoluteFill>
    );
  }
  if (style === "circle") return <CircleShot frame={frame} spec={spec} w={w} ts={ts} />;
  const m = presenterPose(style, spec, ts.u, ts.v);
  const so = studioAlpha(ts.u);
  const co = ts.v * cutAlpha(ts.u);
  return (
    <>
      {style === "corner" && so > 0.004 && (
        <Layer m={m} style={{ opacity: so, ...melt(ts.u, bodyOf(spec).cx) }}>
          <Take w={w} src={spec.studio} />
        </Layer>
      )}
      {co > 0.004 && (
        <Cutout
          w={w}
          src={spec.cutout}
          m={m}
          opacity={co}
          fade={style === "corner" ? ts.u : 0}
          alphaFix={spec.alphaFix}
          shadow={ts.u * ts.v}
          // the shadow falls towards the frame centre: right of the bust in the left corner
          dx={style === "side" ? 26 : cornerLeft(spec) ? 14 : -14}
        />
      )}
    </>
  );
};
