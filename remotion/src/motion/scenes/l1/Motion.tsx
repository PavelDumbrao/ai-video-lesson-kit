import React from "react";
import { interpolateColors } from "remotion";
import { at, C, MONO, pad2, SANS } from "../../../theme";
import { bump, clamp01, ei, eo, float, hash, lin, mix, shake, sp, SprName } from "../../anim";
import { Icon, IconName } from "../../icons";
import { Caret, code, CodeBlock, Tok } from "../../text";
import { SceneProps } from "../../types";
import { CheckBadge, Chip, Frame, FrameKind, glowWin, Pop, StatusIcon, TX } from "../../ui";
import { Burst, Ring } from "../../viz";
import { ArrowPath, IconTile, Overlay, Verdict } from "../kit";

// «Слой четвёртый: графика» (раздел 6, 311.99–360.20 с). Сцена-самоирония: графика рассказывает, как она сделана.
// p1 рамка вокруг всего кадра «это — слой графики» + этот же кадр внутри кадра (бесконечный зум) + «дизайнер → код»
//    + код Remotion, где x(f) считается вживую («кадр = формула») →
// p2 раскадровка этой самой сцены: волна голоса с бегущей головкой, к словам привязаны элементы (линии вниз),
//    «пирожок» на слове «пирожок», 72 квадратика выстреливают сеткой →
// p2.5 «Потом» левая часть уезжает (с 337,24 с слева угол с лицом), справа агент пишет код сцены по раскадровке →
// p3 справа 16 карточек-сцен с агентами + таймер; после угла слева большой таймер «30 мин — графика готова» →
// p4 правила вёрстки из скилла (слева список, справа каркас кадра: лимит заголовка, линия карточек, угол лица) →
//    «грабли → строка в скилле: записано один раз».

// ── local helpers ─────────────────────────────────────────────────────────────────────────────────────────────
/** Element lives until its next beat: full until `bNext`, then a soft ~10-frame exit (no `bNext` → never leaves). */
const safeExitAlpha = (f: number, bNext?: number) => (bNext === undefined || !Number.isFinite(bNext) ? 1 : 1 - ei(f, bNext, 10));

/** A group of elements (page) that leaves together at `z`. */
const Page: React.FC<{ f: number; a: number; z?: number; children?: React.ReactNode }> = ({ f, a, z = Infinity, children }) => {
  if (f < a - 1) return null;
  const al = safeExitAlpha(f, z);
  if (al <= 0.001) return null;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: al, transform: al < 1 ? `translateY(${-26 * (1 - al)}px)` : undefined }}>{children}</div>
  );
};

type From = "below" | "above" | "left" | "right" | "none";
/** Card that springs in, with an optional kicker (+ icon) in its top-left corner; a slow float gives light parallax. */
const Panel: React.FC<{
  f: number;
  a: number;
  x: number;
  y: number;
  w: number;
  h: number;
  from?: From;
  spr?: SprName;
  kicker?: string;
  icon?: IconName;
  glow?: number;
  kind?: FrameKind;
  title?: string;
  seed?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ f, a, x, y, w, h, from = "below", spr = "pop", kicker, icon, glow = 0, kind = "plain", title, seed = 0, style, children }) => (
  <Pop x={x} y={y + float(f, seed, 2, 150)} w={w} h={h} p={sp(f, a, spr)} from={from} d={44}>
    <Frame w={w} h={h} kind={kind} title={title} glow={glow} style={style}>
      {kicker && (
        <div style={{ position: "absolute", left: 34, top: 24, display: "flex", alignItems: "center", gap: 12, ...TX.kicker, whiteSpace: "nowrap" }}>
          {icon && <Icon name={icon} size={30} color={C.accent} sw={3.8} />}
          {kicker}
        </div>
      )}
      {children}
    </Frame>
  </Pop>
);

// ── header: title + chip, one per page (flex-start, never flex-end) ──────────────────────────────────────────
type Head = { a: number; z: number; title: string; chip: string; icon: IconName; mono?: boolean };
const Header: React.FC<{ f: number; items: Head[] }> = ({ f, items }) => (
  <div style={{ position: "absolute", left: 140, top: 130, width: 1640, height: 90 }}>
    {items.map((h, i) => {
      const p = sp(f, h.a, "snap");
      const q = ei(f, h.z, 10);
      if (p <= 0.002 || q >= 0.998) return null;
      const c = sp(f, h.a + 7, "pop");
      return (
        <div
          key={i}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 1640,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 30,
            opacity: Math.min(1, p * 1.6) * (1 - q),
            transform: `translateY(${(1 - p) * 22 - q * 18}px)`,
          }}
        >
          <div style={{ ...TX.title, fontSize: 38, whiteSpace: "nowrap" }}>{h.title}</div>
          <div style={{ opacity: Math.min(1, c * 1.6), transform: `translateX(${(1 - c) * 26}px)` }}>
            <Chip text={h.chip} icon={h.icon} tone="outline" size={24} mono={h.mono} />
          </div>
        </div>
      );
    })}
  </div>
);

// ── p1: selection frame around the whole video frame ─────────────────────────────────────────────────────────
const SelFrame: React.FC<{ f: number; a: number }> = ({ f, a }) => {
  const d = eo(f, a, 24);
  if (d <= 0) return null;
  const amp = mix(1, 0.45, eo(f, a + 110, 40));
  const pulse = (0.5 - 0.5 * Math.cos(((f - a) / 36) * Math.PI * 2)) * amp;
  const hp = sp(f, a + 14, "bouncy");
  const lp = sp(f, a + 8, "snap");
  const X0 = 24;
  const Y0 = 24;
  const X1 = 1896;
  const Y1 = 1056;
  return (
    <>
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
        <rect x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} rx={18} fill="none" stroke={C.accent} strokeWidth={12} opacity={0.16 * pulse * d} />
        <rect
          x={X0}
          y={Y0}
          width={X1 - X0}
          height={Y1 - Y0}
          rx={18}
          fill="none"
          stroke={C.accent}
          strokeWidth={3}
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={1 - d}
          opacity={0.55 + 0.45 * pulse}
        />
        {[
          [X0, Y0],
          [X1, Y0],
          [X0, Y1],
          [X1, Y1],
        ].map(([x, y], i) => (
          <rect
            key={i}
            x={x - 9}
            y={y - 9}
            width={18}
            height={18}
            rx={3}
            fill={C.bg}
            stroke={C.accent}
            strokeWidth={3}
            transform={`translate(${x} ${y}) scale(${hp}) translate(${-x} ${-y})`}
          />
        ))}
      </svg>
      {lp > 0.002 && (
        <div
          style={{
            position: "absolute",
            left: 960,
            top: Y0 + 2,
            transform: `translate(-50%, -50%) translateY(${(1 - lp) * -16}px)`,
            opacity: Math.min(1, lp * 1.6),
            padding: "5px 20px",
            borderRadius: 10,
            background: C.accent,
            color: C.bg,
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 24,
            letterSpacing: "0.1em",
            whiteSpace: "nowrap",
            boxShadow: `0 0 ${24 * pulse}px rgba(255,179,0,0.5)`,
          }}
        >
          ЭТО — СЛОЙ ГРАФИКИ
        </div>
      )}
    </>
  );
};

// ── p1: this very frame inside the frame (Droste), endless zoom into the left card ───────────────────────────
const DW = 692; // viewport width = the mini's width at level 0
const DS = DW / 1920; // one level → the next
const DFX = (174 * DS) / (1 - DS); // fixed point of the level map (zoom anchor)
const DFY = (312 * DS) / (1 - DS);
const MiniScreen: React.FC<{ w: number; lvl: number; f: number; a: number }> = ({ w, lvl, f, a }) => {
  const u = w / 1920;
  const h = (w * 9) / 16;
  const pulse = 0.5 - 0.5 * Math.cos(((f - a) / 36) * Math.PI * 2);
  const R = (x: number, y: number, ww: number, hh: number, st: React.CSSProperties, k?: number) => (
    <div key={k} style={{ position: "absolute", left: x * u, top: y * u, width: ww * u, height: hh * u, ...st }} />
  );
  const xv = 90 * Math.sin(f / 12);
  const inner = w * DS;
  return (
    <div style={{ position: "relative", width: w, height: h, background: C.bg, overflow: "hidden", opacity: lvl === 0 ? 1 : eo(f, a + lvl * 5, 12) }}>
      {R(24, 24, 1872, 1032, { border: `${Math.max(0.5, 3 * u)}px solid rgba(255,179,0,${0.45 + 0.55 * pulse})`, borderRadius: 18 * u, boxSizing: "border-box" })}
      {R(140, 130, 560, 40, { background: C.text, opacity: 0.85, borderRadius: 8 * u })}
      {R(1520, 128, 260, 46, { border: `${Math.max(0.5, 2.5 * u)}px solid ${C.accent}`, borderRadius: 23 * u, boxSizing: "border-box" })}
      {/* left card (holds the next level) */}
      {R(140, 250, 760, 570, { background: C.surface, borderRadius: 22 * u })}
      {R(174, 280, 260, 20, { background: C.muted, opacity: 0.5, borderRadius: 6 * u })}
      {R(174, 746, 330, 26, { background: C.muted, opacity: 0.4, borderRadius: 8 * u })}
      {R(716, 740, 150, 36, { background: C.accent, opacity: 0.8, borderRadius: 8 * u })}
      {/* right top: designer ✗ → code ✓ */}
      {R(940, 250, 840, 170, { background: C.surface, borderRadius: 22 * u })}
      {R(974, 316, 56, 56, { background: C.raised, borderRadius: 16 * u })}
      {R(1044, 324, 220, 40, { background: C.muted, opacity: 0.55, borderRadius: 8 * u })}
      {R(1036, 341, 236, 6, { background: C.err })}
      {R(1310, 316, 56, 56, { background: "rgba(255,179,0,0.25)", borderRadius: 16 * u })}
      {R(1380, 324, 100, 40, { background: C.accent, borderRadius: 8 * u })}
      {/* right bottom: editor with code and the live strip */}
      {R(940, 450, 840, 370, { background: C.surface, borderRadius: 22 * u })}
      {R(940, 450, 840, 58, { background: "rgba(17,19,24,0.45)", borderRadius: `${22 * u}px ${22 * u}px 0 0` })}
      {R(1000, 530, 430, 20, { background: C.accent, opacity: 0.8, borderRadius: 6 * u })}
      {R(1030, 572, 520, 20, { background: C.text, opacity: 0.55, borderRadius: 6 * u })}
      {R(1030, 614, 380, 20, { background: "#FFD27A", opacity: 0.7, borderRadius: 6 * u })}
      {R(1000, 656, 50, 20, { background: C.muted, opacity: 0.6, borderRadius: 6 * u })}
      {R(964, 724, 792, 76, { background: C.surface2, borderRadius: 14 * u })}
      {R(994, 748, 190, 28, { background: C.text, opacity: 0.6, borderRadius: 6 * u })}
      {R(1220, 760, 210, 4, { background: C.muted, opacity: 0.5 })}
      {R(1314 + xv, 751, 22, 22, { background: C.accent, borderRadius: 11 * u })}
      {R(1500, 739, 240, 46, { background: C.accent, borderRadius: 23 * u })}
      {lvl < 6 && inner > 2 && (
        <div style={{ position: "absolute", left: 174 * u, top: 312 * u }}>
          <MiniScreen w={inner} lvl={lvl + 1} f={f} a={a} />
        </div>
      )}
    </div>
  );
};

const Droste: React.FC<{ f: number; a: number }> = ({ f, a }) => {
  const x = Math.max(0, f - (a + 50));
  const g = x < 24 ? (x * x) / 48 : x - 12; // eases into a constant zoom speed
  const t = (g / 150) % 1;
  const Z = Math.pow(DS, -t);
  return (
    <div style={{ position: "relative", width: DW, height: (DW * 9) / 16, overflow: "hidden", borderRadius: 12, border: "2px solid rgba(243,239,230,0.14)", boxSizing: "content-box" }}>
      <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: `${DFX}px ${DFY}px`, transform: `scale(${Z})` }}>
        <MiniScreen w={DW} lvl={0} f={f} a={a} />
      </div>
    </div>
  );
};

// ── p1: code where every frame is a formula ──────────────────────────────────────────────────────────────────
const DOT_CODE: Tok[][] = [
  code("k:export |k:const |f:Dot |p:= ({ |t:f |p:}) => {"),
  code("t:  |k:const |t:x |p:= |n:90 |p:* |t:Math.|f:sin|p:(|t:f |p:/ |n:12|p:);"),
  code("t:  |k:return |p:<|f:Circle |t:x|p:={|t:x|p:} />;"),
  code("p:};"),
];

// ── p2: storyboard of this very scene ────────────────────────────────────────────────────────────────────────
const T0S = 312;
const T1S = 333;
const TRX = 174; // track inner left (frame px)
const TRW = 1572;
const PXS = TRW / (T1S - T0S);
const kxOf = (v: number) => TRX + (v - T0S) * PXS;
const CARD_CX = [258, 512, 766, 1104, 1554];

const Wave: React.FC<{ f: number; a: number; words: { s: number; e: number }[] }> = ({ f, a, words }) => {
  const vNow = (f - 15) / 30;
  const n = Math.floor(TRW / 8);
  const ph = eo(f, a + 8, 10);
  const px = 34 + clamp01((vNow - T0S) / (T1S - T0S)) * TRW;
  return (
    <svg width={1640} height={230} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      {Array.from({ length: n }, (_, i) => {
        const v = T0S + (i * 8 + 4) / PXS;
        const on = words.some((wd) => v >= wd.s && v <= wd.e);
        const amp = on ? 0.3 + 0.7 * hash(i * 1.7 + 3) : 0.05 + 0.04 * hash(i + 0.5);
        const g = eo(f, a + 2 + i * 0.12, 12);
        const hh = Math.max(0, (6 + 70 * amp) * g);
        return <rect key={i} x={34 + i * 8} y={106 - hh / 2} width={4} height={hh} rx={2} fill={v <= vNow ? C.accent : "rgba(243,239,230,0.26)"} />;
      })}
      {ph > 0 && (
        <g opacity={ph}>
          <line x1={px} y1={68} x2={px} y2={150} stroke={C.text} strokeWidth={3} />
          <circle cx={px} cy={66} r={7} fill={C.text} />
        </g>
      )}
    </svg>
  );
};

/** Dashed slot for an element that waits for its word. */
const Slot: React.FC<{ f: number; a: number; z: number; x: number; w: number; word: string }> = ({ f, a, z, x, w, word }) => {
  const p = eo(f, a, 12) * (1 - eo(f, z, 8));
  if (p <= 0.002) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: 530,
        width: w,
        height: 290,
        boxSizing: "border-box",
        borderRadius: 22,
        border: "2px dashed rgba(154,160,170,0.5)",
        opacity: p,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
      }}
    >
      <Icon name="clock" size={48} color={C.muted} sw={3.4} />
      <div style={{ ...TX.label, fontSize: 26, color: C.muted }}>ждёт слова</div>
      <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, color: C.muted }}>{word}</div>
    </div>
  );
};

const PIE_SEAM = (() => {
  const yOf = (x: number) => 84 + ((x - 150) / 95) ** 2 * 18;
  let d = `M60 ${yOf(60).toFixed(1)}`;
  for (let i = 1; i <= 10; i++) {
    const x = 60 + i * 18;
    d += ` Q${x - 9} ${(yOf(x - 9) - 11).toFixed(1)} ${x} ${yOf(x).toFixed(1)}`;
  }
  return d;
})();

/** «Пирожок» on the word «пирожок»: drops in, squashes on landing, steams. */
const Pie: React.FC<{ f: number; a: number }> = ({ f, a }) => {
  const p = sp(f, a, "heavy");
  if (p <= 0.002) return null;
  const land = bump(f, a + 8, 14);
  const y = (1 - Math.min(1, p)) * -170;
  return (
    <div style={{ position: "relative", width: 300, height: 190 }}>
      <div style={{ position: "absolute", left: 150, top: 120 }}>
        <Burst f={f} start={a + 8} r0={80} r1={150} n={10} width={5} />
      </div>
      <svg
        width={300}
        height={190}
        viewBox="0 0 300 190"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          overflow: "visible",
          transform: `translateY(${y}px) scale(${1 + 0.12 * land}, ${1 - 0.14 * land})`,
          transformOrigin: "50% 90%",
          opacity: Math.min(1, p * 2),
        }}
      >
        <defs>
          <linearGradient id="l1a07pie" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFD27A" />
            <stop offset="0.45" stopColor="#FFB300" />
            <stop offset="1" stopColor="#B86A00" />
          </linearGradient>
        </defs>
        <ellipse cx={150} cy={172} rx={118} ry={11} fill="rgba(0,0,0,0.42)" />
        <path d="M22 120 C 34 50, 266 50, 278 120 C 266 166, 34 166, 22 120 Z" fill="url(#l1a07pie)" stroke="#8F5200" strokeWidth={3} />
        <path d={PIE_SEAM} fill="none" stroke="#8F5200" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        <ellipse cx={112} cy={108} rx={46} ry={8} fill="rgba(255,244,214,0.38)" transform="rotate(-6 112 108)" />
        {[0, 1, 2].map((k) => {
          const ph = (((f - a - 14 + k * 14) % 42) + 42) % 42 / 42;
          const on = f > a + 14 ? Math.sin(Math.PI * ph) : 0;
          return (
            <path
              key={k}
              d={`M${108 + k * 42} 60 c -10 -10, 10 -16, 0 -27 c -8 -8, 8 -13, 0 -22`}
              fill="none"
              stroke={C.text}
              strokeWidth={4}
              strokeLinecap="round"
              opacity={0.55 * on}
              transform={`translate(0 ${-14 * ph})`}
            />
          );
        })}
      </svg>
    </div>
  );
};

// 72 squares: 12 × 6, launched from the card top in a ring order (centre first)
const SQ = Array.from({ length: 72 }, (_, i) => {
  const r = Math.floor(i / 12);
  const c = i % 12;
  const d = Math.hypot((c - 5.5) / 1.2, r - 2.5) + hash(i * 3.7) * 0.8;
  return { r, c, d, k: hash(i * 7.1) };
});
const SQ_RANK = (() => {
  const idx = SQ.map((_, i) => i).sort((p, q) => SQ[p].d - SQ[q].d);
  const rank: number[] = [];
  idx.forEach((i, n) => (rank[i] = n));
  return rank;
})();

const Squares: React.FC<{ f: number; a: number }> = ({ f, a }) => (
  <>
    {SQ.map((s, i) => {
      const st = a + 3 + SQ_RANK[i] * 0.36;
      const p = sp(f, st, "pop");
      if (p <= 0.002) return null;
      const cx = 50 + s.c * 30;
      const cy = 86 + s.r * 30;
      const ox = 226 - 11;
      const oy = -6;
      const t = Math.min(1, p);
      const x = mix(ox, cx, p);
      const y = mix(oy, cy, p) - 70 * Math.sin(Math.PI * t) * (0.6 + 0.4 * s.k);
      return (
        <div
          key={i}
          style={{
            position: "absolute",
            left: x,
            top: y,
            width: 22,
            height: 22,
            borderRadius: 5,
            background: s.k > 0.84 ? C.text : C.accent,
            opacity: Math.min(1, p * 3),
            transform: `rotate(${(1 - p) * (s.k - 0.5) * 360}deg)`,
          }}
        />
      );
    })}
  </>
);

// ── p2.5: the agent writes the scene code from the storyboard ────────────────────────────────────────────────
const MAP_CODE: Tok[][] = [
  code("c:// раскадровка: слово → элемент"),
  code("p:<|f:Track |t:words|p:={|t:tl|p:} />"),
  code("p:<|f:Pie |t:at|p:={|t:b|p:[|n:3|p:]} />"),
  code("p:<|f:Grid |t:n|p:={|n:72|p:} |t:at|p:={|t:b|p:[|n:4|p:]} />"),
];
const MAP_CPS = 54;
/** Frame at which CodeBlock starts typing line `i` (same budget rule as CodeBlock: +4 chars between lines). */
const lineAt = (lines: Tok[][], i: number, start: number, cps: number) => {
  let n = 0;
  for (let j = 0; j < i; j++) n += lines[j].reduce((s, t) => s + t[0].length, 0) + 4;
  return start + Math.ceil((n * 30) / cps);
};

// ── p3: 16 scenes, 16 agents ─────────────────────────────────────────────────────────────────────────────────
const SCN = ["старт", "зачем", "ошибка", "сценарий", "голос", "лицо", "графика", "проверка", "форумы", "топор", "харнес", "мощности", "что дальше", "контроль", "повтор", "финал"];

/** `mins` is shared with the big timer on the left, so both always show the same number. */
const Grid16: React.FC<{ f: number; a: number; done: number; mins: number }> = ({ f, a, done, mins }) => {
  return (
    <Panel f={f} a={a} x={740} y={250} w={1040} h={570} kicker="КАЖДЫЙ АГЕНТ — СВОЯ СЦЕНА" icon="bot" spr="snap" seed={4}>
      <div style={{ position: "absolute", right: 34, top: 16, opacity: eo(f, a + 8, 10) }}>
        <Chip text={`${pad2(Math.floor(mins))} мин`} icon="clock" tone={mins >= 29.99 ? "accent" : "outline"} size={24} mono />
      </div>
      {SCN.map((nm, i) => {
        const r = Math.floor(i / 4);
        const c = i % 4;
        const st = a + 6 + (r + c) * 3;
        const p = sp(f, st, "pop");
        const en = Math.round(a + 40 + hash(i * 3.3 + 1) * (done - a - 54));
        const pr = lin(f, st + 8, Math.max(8, en - st - 8));
        const ok = f >= en;
        const me = i === 6;
        return (
          <Pop key={i} x={34 + c * 246} y={80 + r * 118} w={232} h={104} p={p} from="below" d={26}>
            <div
              style={{
                position: "relative",
                width: 232,
                height: 104,
                boxSizing: "border-box",
                borderRadius: 16,
                background: me ? "rgba(255,179,0,0.1)" : C.surface2,
                border: `2px solid ${me ? C.accent : ok ? "rgba(74,222,128,0.45)" : C.line}`,
                padding: "12px 16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, height: 32 }}>
                <Icon name="bot" size={30} color={me ? C.accent : C.muted} sw={3.6} />
                <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, color: me ? C.accent : C.text }}>{pad2(i + 1)}</span>
                <div style={{ marginLeft: "auto", width: 30, height: 30 }}>
                  {ok ? <CheckBadge f={f} start={en} size={30} ring={false} /> : <StatusIcon s="run" f={f} size={30} />}
                </div>
              </div>
              <div style={{ ...TX.label, fontSize: 26, marginTop: 6, color: me ? C.accent : C.text, whiteSpace: "nowrap" }}>{nm}</div>
              <div style={{ position: "absolute", left: 16, right: 16, bottom: 8, height: 5, borderRadius: 3, background: "rgba(243,239,230,0.08)" }}>
                <div style={{ width: `${pr * 100}%`, height: 5, borderRadius: 3, background: C.accent }} />
              </div>
            </div>
          </Pop>
        );
      })}
    </Panel>
  );
};

// ── p4: layout rules from the skill ──────────────────────────────────────────────────────────────────────────
const RULES: { t: string; s: string; icon: IconName }[] = [
  { t: "Заголовок не выше лимита", s: "не больше 38 px", icon: "gauge" },
  { t: "Карточки — от линии", s: "все стартуют с y = 250", icon: "blocks" },
  { t: "Угол лица свободен", s: "туда ничего не ставим", icon: "user" },
];

const RuleRow: React.FC<{ f: number; a: number; on: number; rake: number; i: number }> = ({ f, a, on, rake, i }) => {
  const r = RULES[i];
  const p = sp(f, a + i * 4, "snap");
  if (p <= 0.002) return null;
  const t = eo(f, on, 12);
  const ic = sp(f, on, "bouncy");
  const rk = eo(f, rake + i * 5, 10);
  return (
    <div
      style={{
        position: "absolute",
        left: 34,
        top: 68 + i * 116,
        width: 632,
        height: 104,
        boxSizing: "border-box",
        borderRadius: 16,
        background: C.surface2,
        border: `2px solid ${t > 0.5 ? "rgba(255,179,0,0.4)" : C.line}`,
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        gap: 18,
        opacity: Math.min(1, p * 1.6),
        transform: `translateX(${(1 - p) * -24}px)`,
      }}
    >
      <div style={{ position: "relative", width: 60, height: 60, flex: "none" }}>
        <div style={{ position: "absolute", inset: 0, opacity: (0.35 + 0.65 * Math.min(1, ic)) * (1 - rk) }}>
          <IconTile icon={r.icon} size={60} />
        </div>
        {rk > 0 && (
          <div style={{ position: "absolute", inset: 0, opacity: rk, transform: `rotate(${shake(f, rake + i * 5, 16, 22)}deg)` }}>
            <IconTile icon="rake" size={60} />
          </div>
        )}
      </div>
      <div style={{ position: "relative", flex: 1, height: 72 }}>
        {t < 1 && (
          <div style={{ position: "absolute", left: 0, top: 6, opacity: 1 - t }}>
            <div style={{ width: 300, height: 22, borderRadius: 8, background: "rgba(243,239,230,0.1)" }} />
            <div style={{ width: 190, height: 18, borderRadius: 8, background: "rgba(243,239,230,0.06)", marginTop: 14 }} />
          </div>
        )}
        {t > 0 && (
          <div style={{ position: "absolute", left: 0, top: 0, opacity: t, transform: `translateX(${(1 - t) * 18}px)` }}>
            <div style={{ ...TX.label, fontSize: 28, whiteSpace: "nowrap" }}>{r.t}</div>
            <div style={{ fontFamily: MONO, fontSize: 24, color: C.muted, marginTop: 4, whiteSpace: "nowrap" }}>{r.s}</div>
          </div>
        )}
      </div>
      <div style={{ width: 44, height: 44, flex: "none" }}>
        {f >= on + 10 ? (
          <CheckBadge f={f} start={on + 10} size={44} ring={false} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 22, border: "3px solid rgba(154,160,170,0.35)", boxSizing: "border-box" }} />
        )}
      </div>
    </div>
  );
};

/** Dashed slot for the next line of the skill (filled by the rake on «грабли»). */
const NextLine: React.FC<{ f: number; a: number; z: number }> = ({ f, a, z }) => {
  const p = eo(f, a, 12) * (1 - eo(f, z, 8));
  if (p <= 0.002) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 34,
        top: 420,
        width: 632,
        height: 124,
        boxSizing: "border-box",
        borderRadius: 18,
        border: "2px dashed rgba(154,160,170,0.45)",
        padding: "0 26px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        opacity: p,
      }}
    >
      <Icon name="plus" size={40} color={C.muted} sw={3.6} />
      <span style={{ fontFamily: MONO, fontSize: 26, color: C.muted, whiteSpace: "nowrap" }}>
        новая строка
        <Caret f={f} color={C.muted} />
      </span>
    </div>
  );
};

const RakeBanner: React.FC<{ f: number; a: number; one: number }> = ({ f, a, one }) => {
  const p = sp(f, a, "pop");
  if (p <= 0.002) return null;
  const sw = sp(f, a + 4, "stamp");
  const rot = -38 * (1 - sw) + shake(f, a + 10, 9, 22);
  return (
    <div
      style={{
        position: "absolute",
        left: 34,
        top: 420,
        width: 632,
        height: 124,
        boxSizing: "border-box",
        borderRadius: 18,
        background: "rgba(255,179,0,0.08)",
        border: "2px solid rgba(255,179,0,0.6)",
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        gap: 20,
        opacity: Math.min(1, p * 1.6),
        transform: `translateY(${(1 - p) * 30}px)`,
      }}
    >
      <div style={{ position: "relative", width: 76, height: 76, flex: "none" }}>
        <div style={{ position: "absolute", left: 38, top: 38 }}>
          <Burst f={f} start={a + 10} r0={46} r1={86} n={8} width={4} />
        </div>
        <div style={{ transform: `rotate(${rot}deg)`, transformOrigin: "20% 85%" }}>
          <IconTile icon="rake" size={76} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ ...TX.label, fontSize: 28, whiteSpace: "nowrap" }}>Грабли → строка в скилле</div>
        <div style={{ height: 46 }}>
          <Verdict f={f} start={one} text="записано один раз" ok size={24} />
        </div>
      </div>
    </div>
  );
};

/** Wireframe of a 1920×1080 frame at 800×450 (k = 0.4167): title limit, card line, face corner. */
const Wire: React.FC<{ f: number; a: number; r1: number; r2: number; vot: number; r3: number; face: number; not: number }> = ({
  f,
  a,
  r1,
  r2,
  vot,
  r3,
  face,
  not,
}) => {
  const base = eo(f, a, 14);
  // rule 1: an oversize red title shrinks into the limit
  const gIn = eo(f, r1, 8);
  const shr = sp(f, r1 + 16, "snap");
  const gOut = ei(f, r1 + 36, 10);
  const tFlash = bump(f, r1 + 26, 20);
  const brk = sp(f, r1 + 24, "pop");
  // rule 2: the card line draws, messy cards snap onto it
  const ld = eo(f, r2, 18);
  const ll = sp(f, r2 + 8, "pop");
  const snap = Math.min(1, sp(f, vot, "snap"));
  // rule 3: the face corner appears, cards move out of it
  const zIn = eo(f, r3, 12);
  const fIc = sp(f, face, "bouncy");
  const nar = sp(f, not, "soft");
  const errP = eo(f, r3 + 6, 8) * (1 - eo(f, not + 6, 10));
  const messy = 1 - snap;
  const blocks = [
    { x: mix(58, 74, messy), y: mix(104, 150, messy), w: mix(mix(317, 212, nar), 292, messy), h: mix(237, 192, messy), r: -3.2 * messy },
    { x: mix(mix(392, 282, nar), 384, messy), y: mix(104, 126, messy), w: mix(mix(350, 212, nar), 330, messy), h: mix(237, 206, messy), r: 2.6 * messy },
  ];
  const gp = Math.min(1, Math.max(0, shr));
  return (
    <div
      style={{
        position: "relative",
        width: 800,
        height: 450,
        borderRadius: 12,
        overflow: "hidden",
        background: C.bg,
        backgroundImage: "linear-gradient(rgba(243,239,230,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(243,239,230,0.035) 1px, transparent 1px)",
        backgroundSize: "25px 25px",
        border: "2px solid rgba(243,239,230,0.16)",
        boxSizing: "border-box",
        opacity: base,
      }}
    >
      {/* karaoke band */}
      <div style={{ position: "absolute", left: 0, top: 358, width: 800, height: 92, background: "rgba(243,239,230,0.035)", borderTop: "2px dashed rgba(154,160,170,0.3)" }} />
      <div style={{ position: "absolute", left: 250, top: 396, width: 300, height: 14, borderRadius: 7, background: "rgba(154,160,170,0.35)" }} />
      {/* face corner (under the cards) */}
      {zIn > 0 && (
        <div
          style={{
            position: "absolute",
            left: 508,
            top: 117,
            width: 292,
            height: 237,
            boxSizing: "border-box",
            borderRadius: 10,
            border: `2px dashed ${C.accent}`,
            background: "repeating-linear-gradient(135deg, rgba(255,179,0,0.15) 0 10px, rgba(255,179,0,0) 10px 22px)",
            opacity: zIn,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <div style={{ opacity: Math.min(1, fIc * 1.6), transform: `translateY(${(1 - Math.min(1, fIc)) * 20}px)` }}>
            <Icon name="user" size={84} color={C.accent} sw={3.4} />
          </div>
          <div style={{ ...TX.label, fontSize: 26, color: C.accent, opacity: Math.min(1, fIc * 1.6) }}>лицо</div>
        </div>
      )}
      {/* cards */}
      {blocks.map((bl, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: bl.x,
            top: bl.y,
            width: bl.w,
            height: bl.h,
            boxSizing: "border-box",
            borderRadius: 10,
            background: C.surface,
            border: `${i === 1 && errP > 0.01 ? 3 : 2}px solid ${
              i === 1 && errP > 0.01 ? interpolateColors(errP, [0, 1], ["rgba(255,179,0,0.4)", C.err]) : snap > 0.5 ? "rgba(255,179,0,0.4)" : "rgba(243,239,230,0.12)"
            }`,
            boxShadow: i === 1 && errP > 0.01 ? `inset 0 0 0 999px rgba(248,113,113,${0.12 * errP})` : undefined,
            transform: `rotate(${bl.r}deg)`,
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", left: 14, top: 16, width: "45%", height: 10, borderRadius: 5, background: C.muted, opacity: 0.5 }} />
          {[44, 88, 132].map((yy, j) => (
            <div key={j} style={{ position: "absolute", left: 14, top: yy, width: j === 2 ? "60%" : "auto", right: j === 2 ? undefined : 14, height: 34, borderRadius: 8, background: C.surface2 }} />
          ))}
        </div>
      ))}
      {/* title block */}
      <div
        style={{
          position: "absolute",
          left: 58,
          top: 54,
          width: 250,
          height: 16,
          borderRadius: 4,
          background: interpolateColors(tFlash, [0, 1], ["rgba(243,239,230,0.85)", C.accent]),
        }}
      />
      {gIn > 0 && gOut < 1 && (
        <div
          style={{
            position: "absolute",
            left: 58,
            top: mix(30, 54, gp),
            width: mix(440, 250, gp),
            height: mix(48, 16, gp),
            boxSizing: "border-box",
            borderRadius: 6,
            border: `3px solid ${interpolateColors(gp, [0, 1], [C.err, C.accent])}`,
            background: interpolateColors(gp, [0, 1], ["rgba(248,113,113,0.2)", "rgba(255,179,0,0)"]),
            opacity: gIn * (1 - gOut),
          }}
        />
      )}
      {brk > 0.002 && (
        <div style={{ position: "absolute", left: 318, top: 44, display: "flex", alignItems: "center", gap: 10, opacity: Math.min(1, brk * 1.6) }}>
          <div style={{ width: 10, height: 20, borderTop: `3px solid ${C.accent}`, borderBottom: `3px solid ${C.accent}`, borderRight: `3px solid ${C.accent}` }} />
          <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 24, color: C.accent, whiteSpace: "nowrap" }}>≤ 38 px</span>
        </div>
      )}
      {/* card line y = 250 */}
      {ld > 0 && (
        <div style={{ position: "absolute", left: 14, top: 103, width: 772 * ld, height: 3, overflow: "hidden" }}>
          <div style={{ width: 772, height: 3, backgroundImage: `repeating-linear-gradient(90deg, ${C.accent} 0 12px, transparent 12px 20px)` }} />
        </div>
      )}
      {ll > 0.002 && (
        <div style={{ position: "absolute", right: 18, top: 70, fontFamily: MONO, fontWeight: 700, fontSize: 24, color: C.accent, opacity: Math.min(1, ll * 1.6), whiteSpace: "nowrap" }}>
          y = 250
        </div>
      )}
    </div>
  );
};

// ── the scene ────────────────────────────────────────────────────────────────────────────────────────────────
export const Motion: React.FC<SceneProps> = ({ f, b, w, tl, scene }) => {
  const [b0, b1, b2, b3, b4, b5, b6, b7] = b;
  const wDes = w("дизайнер");
  const wKod = w("код");
  const wEvery = w("каждый");
  const wForm = w("формула");
  const w72 = w("семьдесят");
  const wP = w("потом");
  const wPol = w("полчаса");
  const wDone = w("готова");
  const wR1 = w("заголовок");
  const wR2 = w("карточки");
  const wVot = w("вот", 351);
  const wR3 = w("угол");
  const wFace = w("лицо", 353);
  const wNot = w("ничего");
  const wEach = w("каждое");
  const wOne = w("один", 358);
  const cornerEnd = at(342.72); // the face leaves the left corner
  const leftOut = at(334.4); // last left-side element leaves here (fully gone ~334.73 s, F05 starts 335.28 s)
  const tTimer = Math.max(wPol, cornerEnd + 8);
  const words = tl.words.filter((wd) => wd.sec === scene.section);
  const vNow = (f - 15) / 30;

  // p1 values
  const strikeP = eo(f, wDes + 6, 10);
  const kodP = sp(f, wKod, "pop");
  const xv = Math.round(90 * Math.sin(f / 12));
  const stripP = sp(f, wEvery, "snap");
  const formP = sp(f, wForm, "bouncy");
  const skel = 1 - eo(f, b1, 8);

  // p2 values
  const KW = [
    { v: 312.96, t: "экране", show: b2 + 12 },
    { v: 317.92, t: "Remotion", show: b2 + 16 },
    { v: 321.28, t: "раскадровка", show: b2 + 20 },
    { v: 327.52, t: "«пирожок»", show: b3 },
    { v: 329.92, t: "«72»", show: w72 },
  ];
  const SMALL: { x: number; t: string; icon: IconName }[] = [
    { x: 140, t: "рамка", icon: "monitor" },
    { x: 394, t: "код", icon: "code" },
    { x: 648, t: "таймлайн", icon: "wave" },
  ];
  const nSq = SQ_RANK.filter((rk) => f >= b4 + 3 + rk * 0.36).length;

  // p2.5 values
  const mapStart = wP + 18;
  const gPie = lineAt(MAP_CODE, 2, mapStart, MAP_CPS) + 6;
  const gGrid = lineAt(MAP_CODE, 3, mapStart, MAP_CPS) + 10;

  // p3 timer
  const mins = 30 * clamp01((f - (b5 + 17)) / Math.max(1, wDone - b5 - 17));

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Header
        f={f}
        items={[
          { a: b0, z: b2, title: "Это — слой графики", chip: "слой № 4", icon: "layers" },
          { a: b2 + 10, z: wP, title: "Раскадровка: слово → элемент", chip: "голос + тайминги", icon: "wave" },
          { a: wP + 10, z: b5, title: "По раскадровке — код сцены", chip: "агент пишет", icon: "bot" },
          { a: b5 + 10, z: b6, title: "16 сцен — 16 агентов", chip: "одновременно", icon: "team" },
          { a: b6 + 10, z: Infinity, title: "Правила вёрстки — в скилле", chip: "SKILL.md", icon: "doc", mono: true },
        ]}
      />

      {/* ═══ p1: the graphics layer itself ═══ */}
      <Page f={f} a={b0} z={b2}>
        <SelFrame f={f} a={b0} />
        <Panel f={f} a={b0 + 6} x={140} y={250} w={760} h={570} kicker="ЭТОТ КАДР · 1920 × 1080" icon="monitor" seed={1}>
          <div style={{ position: "absolute", left: 34, top: 62 }}>
            <Droste f={f} a={b0 + 14} />
          </div>
          <div
            style={{
              position: "absolute",
              left: 34,
              right: 34,
              top: 482,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              opacity: eo(f, b0 + 24, 12),
            }}
          >
            <span style={{ ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap" }}>тот же кадр — внутри кадра</span>
            <span style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span style={{ ...TX.label, fontSize: 26, color: C.muted }}>кадр</span>
              <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 32, color: C.accent }}>{f}</span>
            </span>
          </div>
        </Panel>

        <Panel f={f} a={b0 + 12} x={940} y={250} w={840} h={170} kicker="КТО ЭТО НАРИСОВАЛ?" icon="pencil" from="right" seed={2}>
          <div style={{ position: "absolute", left: 34, top: 74, display: "flex", alignItems: "center", gap: 14 }}>
            <IconTile icon="user" size={56} color={C.muted} bg="rgba(154,160,170,0.14)" />
            <span style={{ position: "relative", fontFamily: SANS, fontWeight: 800, fontSize: 40, color: interpolateColors(strikeP, [0, 1], [C.text, C.muted]), whiteSpace: "nowrap" }}>
              дизайнер
              <span
                style={{
                  position: "absolute",
                  left: -6,
                  right: -6,
                  top: "52%",
                  height: 5,
                  borderRadius: 3,
                  background: C.err,
                  transformOrigin: "0 50%",
                  transform: `scaleX(${strikeP})`,
                }}
              />
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginLeft: 22, opacity: Math.min(1, kodP * 1.6), transform: `translateX(${(1 - kodP) * 30}px)` }}>
              <Icon name="arrow" size={44} color={C.accent} sw={4} />
              <IconTile icon="code" size={56} />
              <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 40, color: C.accent, whiteSpace: "nowrap" }}>код</span>
            </div>
          </div>
        </Panel>

        <Panel f={f} a={b0 + 18} x={940} y={450} w={840} h={370} kind="editor" title="Dot.tsx — Remotion" from="right" seed={3} glow={glowWin(f, b1, b1 + 40, 0)}>
          {skel > 0 && (
            <div style={{ position: "absolute", left: 80, top: 30, opacity: skel }}>
              {[420, 520, 380, 60].map((ww, i) => (
                <div key={i} style={{ width: ww, height: 18, borderRadius: 8, background: "rgba(243,239,230,0.08)", marginBottom: 22, marginLeft: i === 1 || i === 2 ? 30 : 0 }} />
              ))}
            </div>
          )}
          <div style={{ position: "absolute", left: 22, top: 18 }}>
            <CodeBlock lines={DOT_CODE} f={f} start={b1} cps={60} size={26} lh={1.55} caretUntil={wForm} />
          </div>
          {stripP > 0.002 && (
            <div
              style={{
                position: "absolute",
                left: 24,
                right: 24,
                top: 214,
                height: 76,
                boxSizing: "border-box",
                borderRadius: 14,
                background: C.surface2,
                padding: "0 20px",
                display: "flex",
                alignItems: "center",
                gap: 24,
                opacity: Math.min(1, stripP * 1.6),
                transform: `translateY(${(1 - stripP) * 20}px)`,
              }}
            >
              <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, color: C.text, whiteSpace: "pre", width: 210, flex: "none" }}>
                {`x(${f}) = ${xv < 0 ? "−" : "+"}${Math.abs(xv) < 10 ? " " : ""}${Math.abs(xv)}`}
              </span>
              <div style={{ position: "relative", width: 210, height: 30, flex: "none" }}>
                <div style={{ position: "absolute", left: 0, right: 0, top: 13, height: 4, borderRadius: 2, background: "rgba(154,160,170,0.4)" }} />
                <div style={{ position: "absolute", left: 104, top: 7, width: 2, height: 16, background: "rgba(154,160,170,0.6)" }} />
                <div style={{ position: "absolute", left: 105 + xv - 11, top: 4, width: 22, height: 22, borderRadius: 11, background: C.accent, boxShadow: "0 0 14px rgba(255,179,0,0.55)" }} />
              </div>
              <div style={{ marginLeft: "auto", opacity: Math.min(1, formP * 1.6), transform: `translateY(${(1 - formP) * 14}px)` }}>
                <Chip text="кадр = формула" tone="accent" size={24} />
              </div>
            </div>
          )}
        </Panel>
      </Page>

      {/* ═══ p2 (left part): voice track + first bindings — leaves on «Потом», the left corner must be free ═══ */}
      <Page f={f} a={b2} z={wP}>
        <Panel f={f} a={b2 + 2} x={140} y={250} w={1640} h={230} kicker="ГОЛОС С ТАЙМИНГАМИ" icon="wave" spr="snap" seed={5}>
          <div style={{ position: "absolute", right: 34, top: 22, fontFamily: MONO, fontWeight: 700, fontSize: 24, color: C.accent, opacity: eo(f, b2 + 10, 10) }}>
            {`${vNow.toFixed(1).replace(".", ",")} с`}
          </div>
          <Wave f={f} a={b2 + 4} words={words} />
          {KW.map((k, i) => {
            const x = kxOf(k.v) - 140;
            const fut = i >= 3;
            const mk = fut ? eo(f, b2 + 34, 10) * (1 - eo(f, k.show, 6)) : 0;
            const p = sp(f, k.show, "bouncy");
            return (
              <React.Fragment key={i}>
                {mk > 0 && (
                  <div style={{ position: "absolute", left: x - 9, top: 178, width: 18, height: 18, transform: "rotate(45deg)", border: `3px solid ${C.muted}`, boxSizing: "border-box", opacity: mk }} />
                )}
                {p > 0.002 && (
                  <div style={{ position: "absolute", left: x, top: 164, transform: `translate(-50%, ${(1 - Math.min(1, p)) * 18}px)`, opacity: Math.min(1, p * 1.8) }}>
                    <Chip text={k.t} tone="accent" size={24} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </Panel>

        <Overlay>
          {KW.map((k, i) => {
            const x1 = kxOf(k.v);
            const x2 = CARD_CX[i];
            const solid = eo(f, k.show + 4, 14);
            const dash = i >= 3 && f < k.show ? eo(f, b2 + 36, 12) : 0;
            return (
              <g key={i}>
                {dash > 0 && <ArrowPath x1={x1} y1={466} x2={x2} y2={526} p={dash} dash head={false} color={C.muted} width={3} />}
                {solid > 0 && <ArrowPath x1={x1} y1={466} x2={x2} y2={526} p={solid} color={C.accent} width={4} />}
              </g>
            );
          })}
        </Overlay>

      </Page>

      {/* bound elements stay while the agent starts the code; gone by ~334.7 s (left corner free before F05 at 335.28) */}
      <Page f={f} a={b2} z={leftOut}>
        {SMALL.map((s, i) => (
          <Panel key={i} f={f} a={b2 + 18 + i * 5} x={s.x} y={530} w={236} h={290} seed={6 + i}>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
              <IconTile icon={s.icon} size={84} />
              <div style={{ ...TX.label, fontSize: 30, whiteSpace: "nowrap" }}>{s.t}</div>
              <div style={{ fontFamily: MONO, fontSize: 24, color: C.muted }}>{`бит ${i + 1}`}</div>
            </div>
          </Panel>
        ))}
      </Page>

      {/* ═══ p2 (right part) + p2.5: pie and 72 squares stay, the agent writes the scene code above them ═══ */}
      <Page f={f} a={b2} z={b5}>
        <Slot f={f} a={b2 + 34} z={b3} x={904} w={400} word="«пирожок»" />
        <Slot f={f} a={b2 + 38} z={b4} x={1328} w={452} word="«72»" />

        <Panel f={f} a={b3} x={904} y={530} w={400} h={290} kicker="«ПИРОЖОК»" icon="spark" spr="snap" seed={9} glow={glowWin(f, gPie, gPie + 24, 0.3)}>
          <div style={{ position: "absolute", left: 50, top: 74 }}>
            <Pie f={f} a={b3 + 3} />
          </div>
        </Panel>

        <Panel f={f} a={b4 - 2} x={1328} y={530} w={452} h={290} kicker="КВАДРАТИКИ" icon="blocks" spr="snap" seed={10} glow={glowWin(f, gGrid, gGrid + 24, 0.3)}>
          <div style={{ position: "absolute", right: 34, top: 10, fontFamily: MONO, fontWeight: 700, fontSize: 48, lineHeight: 1, color: C.accent }}>{nSq}</div>
          <Squares f={f} a={b4} />
        </Panel>

        <Panel f={f} a={wP + 10} x={904} y={250} w={876} h={250} kind="editor" title="Motion.tsx" from="right" seed={11} glow={glowWin(f, wP + 10, wP + 50, 0)}>
          <div style={{ position: "absolute", left: 22, top: 16 }}>
            <CodeBlock lines={MAP_CODE} f={f} start={mapStart} cps={MAP_CPS} size={26} lh={1.55} />
          </div>
        </Panel>
      </Page>

      {/* ═══ p3: 16 scenes on the right (the face takes the left corner until 342.72 s), then the timer on the left ═══ */}
      <Page f={f} a={b5} z={b6}>
        <Grid16 f={f} a={b5 + 9} done={wDone} mins={mins} />
        <Panel f={f} a={tTimer} x={140} y={250} w={560} h={570} kicker="ВСЯ ГРАФИКА" icon="clock" seed={12}>
          <div style={{ position: "absolute", left: 130, top: 74, width: 300, height: 300 }}>
            <Ring size={300} p={mins / 30} width={18} />
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 72, lineHeight: 1, color: C.accent }}>{Math.floor(mins)}</span>
              <span style={{ ...TX.label, fontSize: 30, color: C.muted, marginTop: 6 }}>мин</span>
            </div>
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 404, display: "flex", justifyContent: "center", height: 46 }}>
            <Verdict f={f} start={wDone} text="графика готова" ok size={28} />
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 480, textAlign: "center", ...TX.label, fontSize: 26, color: C.muted, opacity: eo(f, tTimer + 10, 12) }}>
            16 сцен параллельно
          </div>
        </Panel>
      </Page>

      {/* ═══ p4: layout rules from the skill + the rake ═══ */}
      <Page f={f} a={b6}>
        <Panel f={f} a={b6 + 10} x={140} y={250} w={700} h={570} kicker="SKILL.MD · ВЁРСТКА" icon="doc" from="left" seed={13}>
          {[wR1, wR2, wR3].map((on, i) => (
            <RuleRow key={i} f={f} a={b6 + 16} on={on} rake={wEach} i={i} />
          ))}
          <NextLine f={f} a={b6 + 40} z={b7} />
          <RakeBanner f={f} a={b7} one={wOne} />
        </Panel>
        <Panel f={f} a={b6 + 14} x={880} y={250} w={900} h={570} kicker="КАДР 1920 × 1080" icon="monitor" from="right" seed={14}>
          <div style={{ position: "absolute", left: 50, top: 74 }}>
            <Wire f={f} a={b6 + 20} r1={wR1} r2={wR2} vot={wVot} r3={wR3} face={wFace} not={wNot} />
          </div>
        </Panel>
      </Page>
    </div>
  );
};
