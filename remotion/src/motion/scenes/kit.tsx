import React, { CSSProperties } from "react";
import { C, MONO, SANS } from "../../theme";
import { ei, eo, lin, mix, sp } from "../anim";
import { Icon, IconName } from "../icons";
import { CheckBadge, Frame, Pop, TX } from "../ui";

// Общие помощники сцен. Всё — чистые функции кадра.
/** Row of numbered tiles (rules / errors). `at[i]` springs tile i in; `done[i]` puts a check on it. */
export const TileRow: React.FC<{
  f: number;
  titles: string[];
  at: number[];
  y: number;
  x0?: number;
  w?: number;
  h?: number;
  gap?: number;
  kicker?: string;
  done?: number[];
  hl?: (i: number) => number;
  dim?: (i: number) => number;
  dy?: (i: number) => number;
}> = ({ f, titles, at, y, x0 = 160, w = 387, h = 188, gap = 24, kicker = "правило", done, hl, dim, dy }) => (
  <>
    {titles.map((t, i) => {
      const p = sp(f, at[i], "pop");
      const g = hl ? hl(i) : 0;
      return (
        <Pop key={i} x={x0 + i * (w + gap)} y={y + (dy ? dy(i) : 0)} w={w} h={h} p={p} d={50} s0={0.9} style={{ perspective: 900 }}>
          <div style={{ width: "100%", height: "100%", transformOrigin: "50% 100%", transform: `rotateX(${-(1 - Math.min(1, p)) * 70}deg)`, opacity: 1 - (dim ? dim(i) : 0) }}>
            <Frame w={w} h={h} kind="plain" glow={g} tone={done && f >= done[i] ? C.ok : C.accent}>
              <div style={{ position: "absolute", left: 26, top: 22, display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 30, color: C.accent }}>{String(i + 1).padStart(2, "0")}</span>
                <span style={{ ...TX.kicker, fontSize: 24 }}>{kicker}</span>
              </div>
              <div style={{ position: "absolute", left: 26, right: 22, top: 76, ...TX.title, fontSize: Math.min(36, w / 10.5), lineHeight: 1.1 }}>{t}</div>
              {done && f >= done[i] && (
                <div style={{ position: "absolute", right: 16, top: 14, width: 56, height: 56 }}>
                  <CheckBadge f={f} start={done[i]} size={56} />
                </div>
              )}
            </Frame>
          </div>
        </Pop>
      );
    })}
  </>
);

/** A group of elements ("page") that leaves together when a later beat replaces it. */
export const Leave: React.FC<{ f: number; at: number; dur?: number; children?: React.ReactNode }> = ({ f, at, dur = 12, children }) => {
  const q = ei(f, at, dur);
  if (q >= 1) return null;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: 1 - q, transform: q > 0 ? `translateY(${-30 * q}px) scale(${1 - 0.02 * q})` : undefined }}>
      {children}
    </div>
  );
};

/** Content inside a card that crossfades in at `a` and out at `z` (frames). */
export const Slide: React.FC<{ f: number; a: number; z?: number; dy?: number; children?: React.ReactNode; style?: CSSProperties }> = ({
  f,
  a,
  z = Infinity,
  dy = 20,
  children,
  style,
}) => {
  const i = eo(f, a, 10);
  const o = ei(f, z, 8);
  if (i <= 0 || o >= 1) return null;
  return <div style={{ position: "absolute", inset: 0, opacity: i * (1 - o), transform: `translateY(${dy * (1 - i) - dy * o}px)`, ...style }}>{children}</div>;
};

/** Absolutely placed block (no animation of its own). */
export const At: React.FC<{ x: number; y: number; w?: number; h?: number; style?: CSSProperties; children?: React.ReactNode }> = ({ x, y, w, h, style, children }) => (
  <div style={{ position: "absolute", left: x, top: y, width: w, height: h, ...style }}>{children}</div>
);

/** Red cross badge: the circle stamps in, the cross draws. */
export const CrossBadge: React.FC<{ f: number; start: number; size?: number }> = ({ f, start, size = 64 }) => {
  if (f < start) return null;
  const p = sp(f, start, "stamp");
  const d = eo(f, start + 4, 10);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: "block", transform: `scale(${p})`, overflow: "visible" }}>
      <circle cx={24} cy={24} r={22} fill={C.err} />
      <path d="M16 16l16 16 M32 16L16 32" fill="none" stroke={C.bg} strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - d} />
    </svg>
  );
};

/** ✓ or ✗ badge. */
export const Mark: React.FC<{ f: number; start: number; ok: boolean; size?: number }> = ({ f, start, ok, size = 56 }) =>
  ok ? <CheckBadge f={f} start={start} size={size} /> : <CrossBadge f={f} start={start} size={size} />;

/** Inline verdict: «text ✓» / «text ✗» (the ✗ one gets struck through). */
export const Verdict: React.FC<{ f: number; start: number; text: string; ok: boolean; size?: number; style?: CSSProperties }> = ({
  f,
  start,
  text,
  ok,
  size = 28,
  style,
}) => {
  const p = sp(f, start, "snap");
  if (p <= 0.002) return null;
  const strike = ok ? 0 : eo(f, start + 8, 10);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.45,
        height: size * 1.9,
        padding: `0 ${size * 0.7}px 0 ${size * 0.3}px`,
        borderRadius: size,
        background: ok ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.1)",
        border: `2px solid ${ok ? "rgba(74,222,128,0.55)" : "rgba(248,113,113,0.5)"}`,
        opacity: Math.min(1, p * 1.6),
        transform: `translateY(${(1 - p) * 14}px)`,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <Mark f={f} start={start + 2} ok={ok} size={size * 1.25} />
      <span style={{ position: "relative", fontFamily: SANS, fontWeight: 700, fontSize: size, color: ok ? C.text : C.muted }}>
        {text}
        {!ok && (
          <span
            style={{
              position: "absolute",
              left: -4,
              right: -4,
              top: "54%",
              height: 3,
              borderRadius: 2,
              background: C.err,
              transformOrigin: "0 50%",
              transform: `scaleX(${strike})`,
            }}
          />
        )}
      </span>
    </div>
  );
};

/** Arrow drawn from (x1,y1) to (x2,y2) by p, optional bend; place inside a full-frame <svg>. */
export const ArrowPath: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  p: number;
  color?: string;
  width?: number;
  bend?: number;
  dash?: boolean;
  head?: boolean;
  opacity?: number;
}> = ({ x1, y1, x2, y2, p, color = C.accent, width = 4, bend = 0, dash = false, head = true, opacity = 1 }) => {
  if (p <= 0.001) return null;
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const cx = (x1 + x2) / 2 + (-(y2 - y1) / len) * bend;
  const cy = (y1 + y2) / 2 + ((x2 - x1) / len) * bend;
  const d = `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`;
  const ang = Math.atan2(y2 - cy, x2 - cx);
  const hp = lin(p, 0.85, 0.15);
  return (
    <g opacity={opacity}>
      {dash ? (
        <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray="2 14" opacity={Math.min(1, p * 1.5)} />
      ) : (
        <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - Math.min(1, p)} />
      )}
      {head && hp > 0 && (
        <path
          d={`M${x2 - 18 * Math.cos(ang - 0.5)} ${y2 - 18 * Math.sin(ang - 0.5)} L${x2} ${y2} L${x2 - 18 * Math.cos(ang + 0.5)} ${y2 - 18 * Math.sin(ang + 0.5)}`}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={hp}
        />
      )}
    </g>
  );
};

/** Full-frame SVG overlay for arrows and lines. */
export const Overlay: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
    {children}
  </svg>
);

/** Icon in a rounded tile. */
export const IconTile: React.FC<{ icon: IconName; size?: number; color?: string; bg?: string; ring?: string; style?: CSSProperties }> = ({
  icon,
  size = 84,
  color = C.accent,
  bg = "rgba(255,179,0,0.14)",
  ring,
  style,
}) => (
  <div
    style={{
      width: size,
      height: size,
      flex: "none",
      borderRadius: size * 0.28,
      background: bg,
      border: ring ? `2px solid ${ring}` : undefined,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      ...style,
    }}
  >
    <Icon name={icon} size={size * 0.6} color={color} sw={3.6} />
  </div>
);

/** Rolling counter text (integer). */
export const Count: React.FC<{ v: number; style?: CSSProperties; suffix?: string; prefix?: string }> = ({ v, style, suffix = "", prefix = "" }) => (
  <span style={{ fontFamily: MONO, fontWeight: 700, fontVariantNumeric: "tabular-nums", ...style }}>
    {prefix}
    {Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}
    {suffix}
  </span>
);

/** A dot that flies along an arc from a to b while 0 < t < 1 (handoffs between elements). */
export const Flyer: React.FC<{ t: number; ax: number; ay: number; bx: number; by: number; arc?: number; children?: React.ReactNode }> = ({
  t,
  ax,
  ay,
  bx,
  by,
  arc = 120,
  children,
}) => {
  if (t <= 0 || t >= 1) return null;
  return (
    <div style={{ position: "absolute", left: mix(ax, bx, t), top: mix(ay, by, t) - arc * Math.sin(Math.PI * t), transform: "translate(-50%, -50%)" }}>
      {children}
    </div>
  );
};
