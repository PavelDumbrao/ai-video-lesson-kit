import React, { CSSProperties } from "react";
import { C, MONO, SANS } from "../theme";
import { eo, lin, sp } from "./anim";
import { Icon, IconName } from "./icons";

// ── Layout + entrance ────────────────────────────────────────────────────────────────────────
export type Box = { x: number; y: number; w?: number; h?: number };
export const box = ({ x, y, w, h }: Box): CSSProperties => ({ position: "absolute", left: x, top: y, width: w, height: h });

export const TX = {
  kicker: { fontFamily: MONO, fontWeight: 700, fontSize: 24, letterSpacing: "0.16em", color: C.muted, textTransform: "uppercase" },
  title: { fontFamily: SANS, fontWeight: 900, color: C.text, letterSpacing: "-0.01em", lineHeight: 1.08 },
  label: { fontFamily: SANS, fontWeight: 700, color: C.text, lineHeight: 1.25 },
  mono: { fontFamily: MONO, fontWeight: 400, color: C.text },
} satisfies Record<string, CSSProperties>;

type Dir = "below" | "above" | "left" | "right" | "none";
const DIRS: Record<Dir, [number, number]> = { below: [0, 1], above: [0, -1], left: [-1, 0], right: [1, 0], none: [0, 0] };

/**
 * Absolutely placed wrapper that springs in (p: 0→1, overshoot allowed) and leaves (q: 0→1).
 * `from` is where it comes from; `s0` the start scale; `r0` the start rotation.
 */
export const Pop: React.FC<
  Box & { p: number; q?: number; from?: Dir; d?: number; s0?: number; r0?: number; rot?: number; origin?: string; style?: CSSProperties; children?: React.ReactNode }
> = ({ x, y, w, h, p, q = 0, from = "below", d = 40, s0 = 0.92, r0 = 0, rot = 0, origin = "50% 50%", style, children }) => {
  if (p <= 0.002 || q >= 0.998) return null;
  const k = 1 - p;
  const [dx, dy] = DIRS[from];
  return (
    <div
      style={{
        ...box({ x, y, w, h }),
        opacity: Math.min(1, p * 1.7) * (1 - q),
        transform: `translate(${dx * d * k}px, ${dy * d * k - 26 * q}px) scale(${(s0 + (1 - s0) * p) * (1 - 0.04 * q)}) rotate(${rot + r0 * k}deg)`,
        transformOrigin: origin,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const shadow = (glow = 0, tone: string = C.accent) => {
  const base = "0 30px 70px rgba(0,0,0,0.42), inset 0 1px 0 rgba(243,239,230,0.05)";
  if (glow <= 0) return base;
  const rgb = tone === C.ok ? "74,222,128" : tone === C.err ? "248,113,113" : "255,179,0";
  return `0 0 0 2px rgba(${rgb},${0.9 * glow}), 0 0 56px rgba(${rgb},${0.3 * glow}), ${base}`;
};

// ── Window frame: editor / browser / chat / sheet / plain card ─────────────────────────────
export type FrameKind = "editor" | "browser" | "chat" | "sheet" | "plain";
export const BAR = 58;

export const Frame: React.FC<{
  w: number;
  h: number;
  kind?: FrameKind;
  title?: string;
  sub?: string;
  icon?: IconName;
  glow?: number;
  tone?: string;
  right?: React.ReactNode;
  style?: CSSProperties;
  children?: React.ReactNode;
}> = ({ w, h, kind = "editor", title, sub, icon = "bot", glow = 0, tone = C.accent, right, style, children }) => {
  const bar = kind === "plain" ? 0 : BAR;
  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        borderRadius: 22,
        background: C.surface,
        border: `1px solid ${C.line}`,
        boxShadow: shadow(glow, tone),
        overflow: "hidden",
        ...style,
      }}
    >
      {bar > 0 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            right: 0,
            height: bar,
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "0 22px",
            background: "rgba(17,19,24,0.4)",
            borderBottom: `1px solid ${C.line}`,
          }}
        >
          {kind === "chat" ? (
            <>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  background: "rgba(255,179,0,0.16)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={icon} size={26} color={C.accent} sw={3.6} />
              </div>
              <div style={{ ...TX.label, fontSize: 24, whiteSpace: "nowrap" }}>{title}</div>
              <div style={{ width: 10, height: 10, borderRadius: 5, background: C.ok, marginLeft: 2 }} />
              {sub && <div style={{ ...TX.label, fontSize: 24, color: C.muted, whiteSpace: "nowrap" }}>{sub}</div>}
            </>
          ) : (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: 13, height: 13, borderRadius: 7, background: "rgba(243,239,230,0.16)" }} />
              ))}
              {kind === "browser" ? (
                <div
                  style={{
                    marginLeft: 12,
                    flex: 1,
                    height: 36,
                    borderRadius: 18,
                    background: C.surface2,
                    display: "flex",
                    alignItems: "center",
                    padding: "0 16px",
                    fontFamily: MONO,
                    fontSize: 24,
                    color: C.muted,
                    whiteSpace: "nowrap",
                  }}
                >
                  {title}
                </div>
              ) : (
                <div style={{ marginLeft: 10, fontFamily: MONO, fontSize: 24, color: C.muted, whiteSpace: "nowrap" }}>{title}</div>
              )}
            </>
          )}
          {right && <div style={{ marginLeft: "auto" }}>{right}</div>}
        </div>
      )}
      <div style={{ position: "absolute", left: 0, top: bar, right: 0, bottom: 0 }}>{children}</div>
    </div>
  );
};

// ── Chip / badge ─────────────────────────────────────────────────────────────────────────────
export type Tone = "accent" | "outline" | "surface" | "ok" | "err" | "muted" | "dark";
const TONES: Record<Tone, { bg: string; fg: string; bd: string }> = {
  accent: { bg: C.accent, fg: C.bg, bd: C.accent },
  outline: { bg: "rgba(255,179,0,0.08)", fg: C.accent, bd: "rgba(255,179,0,0.65)" },
  surface: { bg: C.raised, fg: C.text, bd: C.line },
  ok: { bg: "rgba(74,222,128,0.14)", fg: C.ok, bd: "rgba(74,222,128,0.6)" },
  err: { bg: "rgba(248,113,113,0.14)", fg: C.err, bd: "rgba(248,113,113,0.65)" },
  muted: { bg: "rgba(154,160,170,0.12)", fg: C.muted, bd: "rgba(154,160,170,0.35)" },
  dark: { bg: C.surface2, fg: C.text, bd: C.line },
};

export const Chip: React.FC<{ text: string; icon?: IconName; tone?: Tone; size?: number; mono?: boolean; style?: CSSProperties }> = ({
  text,
  icon,
  tone = "surface",
  size = 26,
  mono = false,
  style,
}) => {
  const t = TONES[tone];
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.42,
        height: size * 1.9,
        padding: `0 ${size * 0.72}px 0 ${icon ? size * 0.55 : size * 0.72}px`,
        borderRadius: size,
        background: t.bg,
        border: `2px solid ${t.bd}`,
        color: t.fg,
        fontFamily: mono ? MONO : SANS,
        fontWeight: 700,
        fontSize: size,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={size * 1.15} color={t.fg} sw={4} />}
      {text}
    </div>
  );
};

// ── Stamp: slams in from above, settles with a hard bounce and a ring of dust ────────────────
export const Stamp: React.FC<{ text: string; f: number; start: number; color?: string; size?: number; rot?: number }> = ({
  text,
  f,
  start,
  color = C.accent,
  size = 44,
  rot = -7,
}) => {
  if (f < start) return null;
  const p = sp(f, start, "stamp");
  const ring = lin(f, start + 4, 14);
  return (
    <div style={{ position: "relative", transform: `rotate(${rot}deg) scale(${2.1 - 1.1 * p})`, opacity: Math.min(1, (f - start) / 3) }}>
      <div
        style={{
          position: "absolute",
          inset: -10,
          borderRadius: 18,
          border: `3px solid ${color}`,
          opacity: (1 - ring) * 0.6 * (ring > 0 ? 1 : 0),
          transform: `scale(${1 + ring * 0.25})`,
        }}
      />
      <div
        style={{
          padding: `${size * 0.32}px ${size * 0.6}px`,
          border: `5px solid ${color}`,
          borderRadius: 14,
          outline: `2px solid ${color}`,
          outlineOffset: 5,
          background: "rgba(17,19,24,0.82)",
          fontFamily: SANS,
          fontWeight: 900,
          fontSize: size,
          letterSpacing: "0.1em",
          color,
          whiteSpace: "nowrap",
          lineHeight: 1,
        }}
      >
        {text}
      </div>
    </div>
  );
};

// ── Check badge: circle pops, tick draws ─────────────────────────────────────────────────────
export const CheckBadge: React.FC<{ f: number; start: number; size?: number; color?: string; ring?: boolean }> = ({
  f,
  start,
  size = 88,
  color = C.ok,
  ring = true,
}) => {
  if (f < start) return null;
  const p = sp(f, start, "bouncy");
  const d = eo(f, start + 5, 11);
  const wave = lin(f, start + 2, 20);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {ring && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `3px solid ${color}`,
            opacity: wave > 0 && wave < 1 ? 0.7 * (1 - wave) : 0,
            transform: `scale(${1 + wave * 0.9})`,
          }}
        />
      )}
      <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: "block", transform: `scale(${p})`, overflow: "visible" }}>
        <circle cx={24} cy={24} r={22} fill={color} />
        <path
          d="M13 24.5l7.5 7.5L35 17"
          fill="none"
          stroke={C.bg}
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={1 - d}
        />
      </svg>
    </div>
  );
};

/** A strike line drawn across a w×h box (left-low → right-high by default). */
export const Strike: React.FC<{ w: number; h: number; p: number; color?: string; width?: number; flat?: boolean }> = ({
  w,
  h,
  p,
  color = C.err,
  width = 10,
  flat = false,
}) => (
  <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
    <path
      d={flat ? `M-12 ${h / 2 + 4} L${w + 12} ${h / 2 - 4}` : `M-10 ${h * 0.85} L${w + 10} ${h * 0.15}`}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      fill="none"
      pathLength={1}
      strokeDasharray="1 1"
      strokeDashoffset={1 - p}
    />
  </svg>
);

// ── Chat bubble ──────────────────────────────────────────────────────────────────────────────
export const Bubble: React.FC<{ me?: boolean; name?: string; size?: number; maxW?: number; children: React.ReactNode; style?: CSSProperties }> = ({
  me = false,
  name,
  size = 26,
  maxW = 420,
  children,
  style,
}) => (
  <div
    style={{
      maxWidth: maxW,
      padding: `${size * 0.5}px ${size * 0.75}px`,
      borderRadius: 22,
      borderBottomRightRadius: me ? 6 : 22,
      borderBottomLeftRadius: me ? 22 : 6,
      background: me ? C.accent : C.raised,
      color: me ? C.bg : C.text,
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: size,
      lineHeight: 1.3,
      boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
      ...style,
    }}
  >
    {name && <div style={{ fontSize: 24, color: me ? C.bg : C.accent, marginBottom: 4 }}>{name}</div>}
    {children}
  </div>
);

/** Three typing dots. */
export const Dots: React.FC<{ f: number; color?: string; size?: number }> = ({ f, color = C.muted, size = 10 }) => (
  <span style={{ display: "inline-flex", gap: size * 0.7, alignItems: "center", verticalAlign: "middle" }}>
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        style={{
          width: size,
          height: size,
          borderRadius: size,
          background: color,
          opacity: 0.35 + 0.65 * Math.max(0, Math.sin((f / 18) * Math.PI * 2 - i * 0.9)),
          transform: `translateY(${-3 * Math.max(0, Math.sin((f / 18) * Math.PI * 2 - i * 0.9))}px)`,
        }}
      />
    ))}
  </span>
);

// ── Avatar ───────────────────────────────────────────────────────────────────────────────────
export const Avatar: React.FC<{ size?: number; icon?: IconName; text?: string; ring?: string; tone?: string; style?: CSSProperties }> = ({
  size = 120,
  icon = "user",
  text,
  ring = C.accent,
  tone = C.accent,
  style,
}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: `radial-gradient(circle at 35% 30%, ${C.raised}, ${C.surface2})`,
      border: `3px solid ${ring}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 14px 30px rgba(0,0,0,0.35)",
      ...style,
    }}
  >
    {text ? (
      <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: size * 0.36, color: tone, letterSpacing: "0.02em" }}>{text}</span>
    ) : (
      <Icon name={icon} size={size * 0.62} color={tone} sw={3.2} />
    )}
  </div>
);

// ── Checklist: rows slide in, boxes tick ─────────────────────────────────────────────────────
export const Checklist: React.FC<{ items: { text: string; at: number }[]; f: number; size?: number; gap?: number; color?: string }> = ({
  items,
  f,
  size = 28,
  gap = 16,
  color = C.ok,
}) => (
  <div style={{ display: "flex", flexDirection: "column", gap }}>
    {items.map((it, i) => {
      const p = sp(f, it.at - 8, "snap");
      const d = eo(f, it.at, 9);
      return (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: size * 0.55,
            opacity: Math.min(1, p * 1.6),
            transform: `translateX(${(1 - p) * 24}px)`,
          }}
        >
          <svg width={size * 1.1} height={size * 1.1} viewBox="0 0 48 48" style={{ flex: "none" }}>
            <rect x={4} y={4} width={40} height={40} rx={10} fill={d > 0 ? color : "none"} fillOpacity={d} stroke={d > 0 ? color : C.muted} strokeWidth={4} />
            <path d="M13 25l7.5 7.5L35 17" fill="none" stroke={C.bg} strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - d} />
          </svg>
          <span style={{ ...TX.label, fontSize: size, color: d > 0.5 ? C.text : C.muted, whiteSpace: "nowrap" }}>{it.text}</span>
        </div>
      );
    })}
  </div>
);

/** Expanding ring (shockwave) centred on its box. */
export const Ripple: React.FC<{ f: number; start: number; size: number; color?: string; dur?: number; grow?: number }> = ({
  f,
  start,
  size,
  color = C.accent,
  dur = 22,
  grow = 1.2,
}) => {
  const t = lin(f, start, dur);
  if (t <= 0 || t >= 1) return null;
  const g = eo(f, start, dur);
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        borderRadius: "50%",
        border: `3px solid ${color}`,
        opacity: 0.75 * (1 - t),
        transform: `scale(${1 + grow * g})`,
      }}
    />
  );
};

/** 0..1 glow that rises on `start`, holds until `end`, then settles to `rest`. */
export const glowWin = (f: number, start: number, end: number, rest = 0) =>
  f < start ? 0 : f < end ? eo(f, start, 10) : rest + (1 - rest) * (1 - eo(f, end, 14));

// ── Test / job status icon: wait (ring) → run (spinner) → ok / fail ─────────────────────────
export type Status = "wait" | "run" | "ok" | "fail";
export const StatusIcon: React.FC<{ s: Status; f: number; size?: number }> = ({ s, f, size = 34 }) => {
  if (s === "ok" || s === "fail") {
    const c = s === "ok" ? C.ok : C.err;
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" style={{ flex: "none" }}>
        <circle cx={24} cy={24} r={21} fill={c} />
        <path d={s === "ok" ? "M14 24.5l7 7L34 18" : "M17 17l14 14 M31 17L17 31"} fill="none" stroke={C.bg} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ flex: "none", transform: s === "run" ? `rotate(${f * 14}deg)` : undefined }}>
      <circle cx={24} cy={24} r={19} fill="none" stroke="rgba(243,239,230,0.18)" strokeWidth={5} />
      {s === "run" && <circle cx={24} cy={24} r={19} fill="none" stroke={C.accent} strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray="0.3 1" />}
    </svg>
  );
};
