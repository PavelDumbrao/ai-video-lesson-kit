import React, { CSSProperties } from "react";
import { C, MONO, SANS } from "../theme";
import { eo, hash, lin, mix, smooth, sp } from "./anim";
import { Icon, IconName } from "./icons";

// ── Lines that draw themselves (strokeDashoffset on a normalised path length) ────────────────
export const DrawPath: React.FC<{
  d: string;
  p: number;
  color?: string;
  width?: number;
  opacity?: number;
  fill?: string;
  dash?: string;
  cap?: "round" | "butt" | "square";
  style?: CSSProperties;
}> = ({ d, p, color = C.accent, width = 4, opacity = 1, fill = "none", dash, cap = "round", style }) => {
  if (p <= 0.001) return null;
  // a dashed construction line reveals by opacity; a solid one draws on
  if (dash)
    return <path d={d} fill={fill} stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinecap={cap} opacity={opacity * Math.min(1, p)} style={style} />;
  return (
    <path
      d={d}
      fill={fill}
      stroke={color}
      strokeWidth={width}
      strokeLinecap={cap}
      strokeLinejoin="round"
      pathLength={1}
      strokeDasharray="1 1"
      strokeDashoffset={1 - Math.min(1, p)}
      opacity={opacity}
      style={style}
    />
  );
};

/** Samples y = fn(x) into an SVG path from x0 up to x1. */
export const fnPath = (fn: (x: number) => number, x0: number, x1: number, step = 6) => {
  if (x1 <= x0) return "";
  const pts: string[] = [];
  for (let x = x0; x < x1; x += step) pts.push(`${x.toFixed(1)} ${fn(x).toFixed(1)}`);
  pts.push(`${x1.toFixed(1)} ${fn(x1).toFixed(1)}`);
  return `M${pts.join(" L")}`;
};

// ── Progress ring ────────────────────────────────────────────────────────────────────────────
export const Ring: React.FC<{ size: number; p: number; width?: number; color?: string; track?: string }> = ({
  size,
  p,
  width = 12,
  color = C.accent,
  track = "rgba(243,239,230,0.08)",
}) => {
  const r = size / 2 - width / 2 - 2;
  return (
    <svg width={size} height={size} style={{ position: "absolute", left: 0, top: 0, transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={width} />
      {p > 0.002 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${Math.min(1, p)} 1`}
        />
      )}
    </svg>
  );
};

// ── Bars ─────────────────────────────────────────────────────────────────────────────────────
export const Bars: React.FC<{
  values: number[];
  labels?: string[];
  f: number;
  start: number;
  h: number;
  barW?: number;
  gap?: number;
  stagger?: number;
  hi?: number;
}> = ({ values, labels, f, start, h, barW = 44, gap = 22, stagger = 3, hi = -1 }) => (
  <div style={{ display: "flex", alignItems: "flex-end", gap }}>
    {values.map((v, i) => {
      const p = sp(f, start + i * stagger, "pop");
      return (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ height: h, display: "flex", alignItems: "flex-end" }}>
            <div
              style={{
                width: barW,
                height: Math.max(0, v * h * p),
                borderRadius: "8px 8px 3px 3px",
                background: i === hi ? C.accent : "rgba(255,179,0,0.45)",
                boxShadow: i === hi ? "0 0 24px rgba(255,179,0,0.35)" : undefined,
              }}
            />
          </div>
          {labels && (
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 24, color: C.muted, opacity: Math.min(1, p * 2), lineHeight: 1 }}>
              {labels[i]}
            </div>
          )}
        </div>
      );
    })}
  </div>
);

// ── Wall calendar: pages flip up around the binding (v = 1.0 → 4.0 flips three times) ────────
export const Calendar: React.FC<{ v: number; w?: number; h?: number; label?: string }> = ({ v, w = 300, h = 330, label = "НЕДЕЛЯ" }) => {
  const n = Math.floor(v);
  const t = smooth((v - n) * 1.4);
  const page = (k: number, extra?: CSSProperties) => (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 74,
        bottom: 0,
        borderRadius: "0 0 22px 22px",
        background: C.surface,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        borderTop: `1px solid ${C.line}`,
        ...extra,
      }}
    >
      <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 24, letterSpacing: "0.18em", color: C.muted }}>{label}</div>
      <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 150, lineHeight: 1, color: C.text, marginTop: 6 }}>{k}</div>
    </div>
  );
  return (
    <div style={{ position: "relative", width: w, height: h, perspective: 900 }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 22, background: C.surface, boxShadow: "0 30px 70px rgba(0,0,0,0.42)" }} />
      {page(n + 1)}
      {t < 1 &&
        page(n, {
          transformOrigin: "50% 0%",
          transform: `rotateX(${t * 105}deg)`,
          opacity: 1 - smooth((t - 0.55) / 0.45),
          background: `linear-gradient(180deg, ${C.surface}, ${t > 0.05 ? "#2A303C" : C.surface})`,
        })}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 74,
          borderRadius: "22px 22px 0 0",
          background: "rgba(255,179,0,0.9)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          padding: "0 40px",
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ width: 14, height: 30, borderRadius: 7, background: C.bg, marginTop: -40, border: `3px solid ${C.surface}` }} />
        ))}
      </div>
    </div>
  );
};

// ── Hourglass: sand drains top → bottom (t 0..1) ─────────────────────────────────────────────
export const Hourglass: React.FC<{ t: number; size?: number; f: number }> = ({ t, size = 150, f }) => {
  const top = 1 - t;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: "block", overflow: "visible" }}>
      {/* top sand: triangle shrinking towards the neck */}
      <path d={`M${24 - 9 * top} ${23 - 13 * top} L${24 + 9 * top} ${23 - 13 * top} L24 23.5 Z`} fill={C.accent} opacity={0.9} />
      {/* bottom sand: pile growing */}
      <path d={`M15 42 L33 42 L${24 + 4 * (1 - t)} ${42 - 11 * t} L${24 - 4 * (1 - t)} ${42 - 11 * t} Z`} fill={C.accent} opacity={0.9} />
      {t > 0.01 && t < 0.99 && (
        <line x1={24} y1={24} x2={24} y2={42 - 11 * t} stroke={C.accent} strokeWidth={1.4} strokeDasharray="1.5 2" strokeDashoffset={-f * 0.6} />
      )}
      <path
        d="M13 5h22 M13 43h22 M16 5c0 11 15 12 15 19s-15 8-15 19 M32 5c0 11-15 12-15 19s15 8 15 19"
        fill="none"
        stroke={C.text}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

// ── Flow diagram: nodes + edges with data dots running along them ────────────────────────────
type Pt = { x: number; y: number };
const qPoint = (a: Pt, c: Pt, b: Pt, t: number) => ({
  x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
  y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
});

/** Edge a→b (quadratic, `bend` px sideways), drawn by `p`, with `dots` running once p≈1. Renders inside an <svg>. */
export const FlowEdge: React.FC<{
  a: Pt;
  b: Pt;
  p: number;
  f: number;
  bend?: number;
  dots?: number;
  period?: number;
  color?: string;
  width?: number;
  arrow?: boolean;
  phase?: number;
}> = ({ a, b, p, f, bend = 0, dots = 2, period = 40, color = C.accent, width = 3.5, arrow = true, phase = 0 }) => {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const c = { x: mx + (-(b.y - a.y) / len) * bend, y: my + ((b.x - a.x) / len) * bend };
  const d = `M${a.x} ${a.y} Q${c.x} ${c.y} ${b.x} ${b.y}`;
  const end = qPoint(a, c, b, 1);
  const pre = qPoint(a, c, b, 0.93);
  const ang = Math.atan2(end.y - pre.y, end.x - pre.x);
  const dotsOn = lin(p, 0.85, 0.15);
  return (
    <g>
      <DrawPath d={d} p={p} color={color} width={width} opacity={0.55} />
      {arrow && p > 0.9 && (
        <path
          d={`M${end.x - 14 * Math.cos(ang - 0.5)} ${end.y - 14 * Math.sin(ang - 0.5)} L${end.x} ${end.y} L${end.x - 14 * Math.cos(ang + 0.5)} ${end.y - 14 * Math.sin(ang + 0.5)}`}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.75 * lin(p, 0.9, 0.1)}
        />
      )}
      {dotsOn > 0 &&
        Array.from({ length: dots }, (_, i) => {
          const t = (((f / period + i / dots + phase) % 1) + 1) % 1;
          const q = qPoint(a, c, b, t);
          const fade = Math.min(1, t * 6, (1 - t) * 6);
          return <circle key={i} cx={q.x} cy={q.y} r={width * 1.9} fill={color} opacity={dotsOn * fade} />;
        })}
    </g>
  );
};

/** Round node with an icon; `p` springs it in, `hl` lights it up. */
export const FlowNode: React.FC<{ x: number; y: number; icon: IconName; p: number; size?: number; hl?: number; label?: string; spin?: number }> = ({
  x,
  y,
  icon,
  p,
  size = 96,
  hl = 0,
  label,
  spin = 0,
}) => {
  if (p <= 0.002) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        transform: `scale(${p})`,
        opacity: Math.min(1, p * 1.6),
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.3,
          background: C.raised,
          border: `2px solid rgba(255,179,0,${0.25 + 0.65 * hl})`,
          boxShadow: `0 12px 28px rgba(0,0,0,0.35), 0 0 ${30 * hl}px rgba(255,179,0,${0.35 * hl})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={size * 0.55} color={C.accent} sw={3.4} style={spin ? { transform: `rotate(${spin}deg)` } : undefined} />
      </div>
      {label && (
        <div
          style={{
            position: "absolute",
            top: size + 10,
            left: -60,
            right: -60,
            textAlign: "center",
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 24,
            color: C.muted,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};

/** Pulsing location dot (chart markers): core + two expanding rings, looping every `period`. */
export const PulseDot: React.FC<{ f: number; start: number; size?: number; color?: string; period?: number }> = ({
  f,
  start,
  size = 22,
  color = C.accent,
  period = 40,
}) => {
  if (f < start) return null;
  const p = sp(f, start, "bouncy");
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {[0, 0.5].map((o, i) => {
        const t = (((f - start) / period + o) % 1 + 1) % 1;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: `2px solid ${color}`,
              opacity: (1 - t) * 0.7 * Math.min(1, (f - start) / 10),
              transform: `scale(${1 + t * 2.4})`,
            }}
          />
        );
      })}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: color,
          transform: `scale(${p})`,
          boxShadow: `0 0 0 5px ${C.bg}, 0 0 22px ${color}`,
        }}
      />
    </div>
  );
};

/** Short-lived spark burst (n rays) — accents a success or an impact. */
export const Burst: React.FC<{ f: number; start: number; r0?: number; r1?: number; n?: number; color?: string; width?: number; rot?: number }> = ({
  f,
  start,
  r0 = 60,
  r1 = 120,
  n = 8,
  color = C.accent,
  width = 5,
  rot = 0,
}) => {
  const t = eo(f, start, 22);
  if (f < start || t >= 1) return null;
  const size = (r1 + 20) * 2;
  return (
    <svg width={size} height={size} style={{ position: "absolute", left: "50%", top: "50%", marginLeft: -size / 2, marginTop: -size / 2, overflow: "visible", pointerEvents: "none" }}>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + (rot * Math.PI) / 180;
        const rb = mix(r0, r1, eo(f, start, 14)); // head
        const ra = mix(r0, r1, eo(f, start + 6, 16)); // tail chases the head
        return (
          <line
            key={i}
            x1={size / 2 + ra * Math.cos(a)}
            y1={size / 2 + ra * Math.sin(a)}
            x2={size / 2 + rb * Math.cos(a)}
            y2={size / 2 + rb * Math.sin(a)}
            stroke={color}
            strokeWidth={width * (1 - t * 0.6)}
            strokeLinecap="round"
            opacity={1 - t}
          />
        );
      })}
    </svg>
  );
};

// ── Tangle: deterministic spaghetti (Catmull-Rom through pseudo-random points) ───────────────
export const tangle = (seed: number, n: number, x0: number, y0: number, w: number, h: number) => {
  const P = Array.from({ length: n }, (_, i) => ({ x: x0 + w * (0.08 + 0.84 * hash(seed + i * 3.1)), y: y0 + h * (0.1 + 0.8 * hash(seed + i * 7.7 + 1)) }));
  let d = `M${P[0].x.toFixed(1)} ${P[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = P[Math.max(0, i - 1)];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[Math.min(n - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 4, y: p1.y + (p2.y - p0.y) / 4 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 4, y: p2.y - (p3.y - p1.y) / 4 };
    d += ` C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
};

// ── Git-style commit rail: dots on a line, HEAD marker can travel back (head = index, float) ──
export const CommitRail: React.FC<{
  f: number;
  labels: string[];
  at: number;
  w: number;
  head: number;
  dropFrom?: number; // commits with index ≥ dropFrom are greyed (rolled back)
}> = ({ f, labels, at, w, head, dropFrom = Infinity }) => {
  const n = labels.length;
  const X = (i: number) => 90 + ((w - 180) * i) / (n - 1);
  const line = eo(f, at, 16);
  return (
    <div style={{ position: "relative", width: w, height: 120 }}>
      <svg width={w} height={120} style={{ position: "absolute", left: 0, top: 0 }}>
        <line x1={X(0)} y1={40} x2={X(0) + (X(n - 1) - X(0)) * line} y2={40} stroke="rgba(243,239,230,0.25)" strokeWidth={4} strokeLinecap="round" />
      </svg>
      {labels.map((l, i) => {
        const p = sp(f, at + 4 + i * 4, "bouncy");
        const gone = i >= dropFrom;
        const isHead = Math.abs(head - i) < 0.5;
        return (
          <div key={i} style={{ position: "absolute", left: X(i) - 80, top: 22, width: 160, display: "flex", flexDirection: "column", alignItems: "center", opacity: Math.min(1, p * 2) * (gone ? 0.35 : 1) }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                background: isHead ? C.accent : C.surface,
                border: `4px solid ${gone ? C.muted : C.accent}`,
                transform: `scale(${p})`,
              }}
            />
            <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 24, color: gone ? C.muted : C.text, whiteSpace: "nowrap", textDecoration: gone ? "line-through" : undefined }}>{l}</div>
          </div>
        );
      })}
      {/* HEAD tag rides above the current commit */}
      {f >= at + 4 + (n - 1) * 4 && (
        <div style={{ position: "absolute", left: X(0) + (X(n - 1) - X(0)) * (head / (n - 1)) - 40, top: -30, width: 80, textAlign: "center" }}>
          <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 24, color: C.accent }}>HEAD</span>
        </div>
      )}
    </div>
  );
};

// ── Month grid: cells fill one by one (filled = how many, float for a soft edge) ─────────────
export const MonthGrid: React.FC<{ filled: number; cols?: number; days?: number; cell?: number; gap?: number; icon?: (i: number) => IconName | undefined }> = ({
  filled,
  cols = 7,
  days = 30,
  cell = 78,
  gap = 12,
  icon,
}) => (
  <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gap }}>
    {Array.from({ length: days }, (_, i) => {
      const on = Math.max(0, Math.min(1, filled - i));
      const ic = icon?.(i);
      return (
        <div
          key={i}
          style={{
            position: "relative",
            width: cell,
            height: cell,
            borderRadius: 14,
            background: on > 0 ? `rgba(255,179,0,${0.18 + 0.6 * on})` : C.surface2,
            border: `1px solid ${on > 0 ? "rgba(255,179,0,0.8)" : C.line}`,
            transform: `scale(${1 + 0.12 * Math.sin(Math.PI * on) * (on < 1 ? 1 : 0)})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ position: "absolute", left: 8, top: 4, fontFamily: MONO, fontSize: 24, color: on > 0.5 ? C.bg : C.muted, opacity: 0.8 }}>{i + 1}</span>
          {ic && on > 0.5 && <Icon name={ic} size={cell * 0.42} color={C.bg} sw={4} style={{ marginTop: 14, opacity: on }} />}
        </div>
      );
    })}
  </div>
);

/** Flickering flame (deterministic), anchored at its bottom centre. */
export const Flame: React.FC<{ f: number; size?: number; seed?: number }> = ({ f, size = 80, seed = 0 }) => {
  const k = 1 + 0.08 * Math.sin(f / 3 + seed) + 0.05 * Math.sin(f / 1.7 + seed * 2);
  const sk = 4 * Math.sin(f / 4 + seed);
  return (
    <div style={{ width: size, height: size, transformOrigin: "50% 100%", transform: `scaleY(${k}) skewX(${sk}deg)` }}>
      <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: "block", overflow: "visible" }}>
        <path d="M24 4c2 8 12 12 12 24a12 12 0 0 1-24 0c0-6 3-9 5-12 1 4 3 6 5 6-1-6 0-12 2-18z" fill={C.err} />
        <path d="M24 20c1 5 7 7 7 14a7 7 0 0 1-14 0c0-4 2-6 3-8 1 2 2 3 3 3-.5-3 0-6 1-9z" fill={C.accent} />
      </svg>
    </div>
  );
};

/** A die: rounded square with `n` pips, rotated `rot` degrees. */
export const Dice: React.FC<{ n: number; size?: number; rot?: number }> = ({ n, size = 160, rot = 0 }) => {
  const P: Record<number, [number, number][]> = {
    1: [[24, 24]],
    2: [[15, 15], [33, 33]],
    3: [[14, 14], [24, 24], [34, 34]],
    4: [[15, 15], [33, 15], [15, 33], [33, 33]],
    5: [[14, 14], [34, 14], [24, 24], [14, 34], [34, 34]],
    6: [[15, 13], [33, 13], [15, 24], [33, 24], [15, 35], [33, 35]],
  };
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: "block", transform: `rotate(${rot}deg)`, overflow: "visible" }}>
      <rect x={3} y={3} width={42} height={42} rx={10} fill={C.raised} stroke={C.accent} strokeWidth={2.5} />
      {(P[((n - 1) % 6) + 1] ?? []).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3.6} fill={C.text} />
      ))}
    </svg>
  );
};
