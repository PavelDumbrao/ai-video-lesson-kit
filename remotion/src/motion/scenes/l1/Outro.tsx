import React from "react";
import { interpolateColors } from "remotion";
import { at, C, MONO } from "../../../theme";
import { bump, clamp01, ei, eio, eo, float, hash, lin, mix, sp } from "../../anim";
import { Icon, IconName } from "../../icons";
import { SceneProps } from "../../types";
import { CheckBadge, Chip, Frame, glowWin, Pop, Ripple, Stamp, TX } from "../../ui";
import { Burst, DrawPath, fnPath } from "../../viz";

// Урок 1 · раздел 15 «Финал» (голос 754.90–776.74 с).
// Фаза A (до «бережно»): «скилла» — широкая карточка SKILL.md → слои → «это видео», «ваш» — штамп «ТЕПЕРЬ ВАШ»;
// «нейросети/дешевеют» — карточка сжимается в левую колонку, в центре график «цена ↓ · ум ↑» без цифр;
// «у каждого в руках» — справа ладони, «ядерная» — над ними вспыхивает атом, «вопрос» — плашка-вопрос.
// Фаза B (с «бережно»): лицо F13 в углу справа 769.86–773.59 (x 1220–1920 / y 280–850 свободны) — правые карточки
// уходят до «бережно», слева (x 140–1180) чек-лист «один скилл → под себя → до результата → потом второй»,
// пункты отмечаются на своих словах. С 773.59 лицо во весь экран — графика под ним доживает до конца сцены.

/** 1 до следующего бита, затем плавный уход за `dur` кадров; без bNext элемент не гаснет. */
const safeExitAlpha = (f: number, bNext?: number, dur = 10) => (bNext === undefined ? 1 : 1 - ei(f, bNext, dur));

// ── small pieces ─────────────────────────────────────────────────────────────────────────────────────────
const Kicker: React.FC<{ text: string; icon: IconName; color?: string }> = ({ text, icon, color = C.muted }) => (
  <div style={{ position: "absolute", left: 34, top: 26, display: "flex", alignItems: "center", gap: 12, ...TX.kicker, color, whiteSpace: "nowrap" }}>
    <Icon name={icon} size={30} color={C.accent} sw={3.8} />
    {text}
  </div>
);

const Tile: React.FC<{ icon: IconName; size: number; on?: number }> = ({ icon, size, on = 1 }) => (
  <div
    style={{
      width: size,
      height: size,
      flex: "none",
      borderRadius: size * 0.28,
      background: `rgba(255,179,0,${0.05 + 0.11 * on})`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <Icon name={icon} size={size * 0.6} color={interpolateColors(on, [0, 1], [C.muted, C.accent])} sw={3.6} />
  </div>
);

const Arrow: React.FC<{ dir: "up" | "down" | "right"; size: number; color: string }> = ({ dir, size, color }) => (
  <Icon name="arrow" size={size} color={color} sw={4.6} style={{ transform: `rotate(${dir === "up" ? -90 : dir === "down" ? 90 : 0}deg)` }} />
);

/** Header line that slides up into place at `a` and leaves upward at `z`. */
const Swap: React.FC<{ f: number; a: number; z?: number; right?: boolean; children: React.ReactNode }> = ({ f, a, z = Infinity, right = false, children }) => {
  const i = eo(f, a, 16);
  const o = ei(f, z, 10);
  if (i <= 0.002 || o >= 0.998) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        ...(right ? { right: 0 } : { left: 0 }),
        whiteSpace: "nowrap",
        opacity: Math.min(1, i * 1.4) * (1 - o),
        transform: `translateY(${(1 - i) * 30 - o * 26}px)`,
      }}
    >
      {children}
    </div>
  );
};

// ── card 1: one skill → this video (wide), then the left column ─────────────────────────────────────────
const LAYERS: { t: string; icon: IconName }[] = [
  { t: "сценарий", icon: "pencil" },
  { t: "голос", icon: "mic" },
  { t: "лицо", icon: "camera" },
  { t: "графика", icon: "layers" },
  { t: "проверка кадров", icon: "eye" },
];
const WIDE_W = 1640;
const NARROW_W = 520;
const PLATE_Y = (i: number) => 104 + i * 76; // wide layout
const PLATE_YN = (i: number) => 180 + i * 58; // narrow layout

const SkillCard: React.FC<{ f: number; b0: number; fNow: number; k: number }> = ({ f, b0, fNow, k }) => {
  const W1 = mix(WIDE_W, NARROW_W, k);
  const wideA = 1 - clamp01(k * 3); // connectors and the video tile clear out early in the reflow
  const pos = (wx: number, wy: number, nx: number, ny: number): React.CSSProperties => ({ position: "absolute", left: mix(wx, nx, k), top: mix(wy, ny, k) });
  const pf = sp(f, b0 + 2, "snap");
  const pr = sp(f, b0 + 10, "pop");
  const play = lin(f, b0 + 12, 80);
  return (
    <Frame w={W1} h={570} kind="plain" glow={0.55 * bump(f, fNow, 26)}>
      <Kicker text="ОДИН СКИЛЛ" icon="doc" />

      {wideA > 0.01 && (
        <svg width={WIDE_W} height={570} style={{ position: "absolute", left: 0, top: 0, opacity: wideA, overflow: "visible" }}>
          {LAYERS.map((_, i) => {
            const yc = PLATE_Y(i) + 28;
            return (
              <g key={i}>
                <DrawPath d={`M496 242 C 556 242, 552 ${yc}, 610 ${yc}`} p={eo(f, b0 + 6 + i * 2, 12)} width={3} opacity={0.55} />
                <DrawPath d={`M1010 ${yc} C 1062 ${yc}, 1058 290, 1110 290`} p={eo(f, b0 + 12 + i * 2, 12)} width={3} opacity={0.55} />
              </g>
            );
          })}
        </svg>
      )}

      {/* SKILL.md */}
      <div
        style={{
          ...pos(60, 196, 34, 72),
          display: "flex",
          alignItems: "center",
          gap: 20,
          opacity: Math.min(1, pf * 1.6),
          transform: `translateY(${(1 - pf) * 24}px)`,
        }}
      >
        <Tile icon="doc" size={92} />
        <div>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 48, color: C.accent, lineHeight: 1.1, whiteSpace: "nowrap" }}>SKILL.md</div>
          <div style={{ ...TX.label, fontSize: 24, color: C.muted, whiteSpace: "nowrap", marginTop: 6 }}>инструкция для агента</div>
        </div>
      </div>

      {/* the layers the skill drives */}
      {LAYERS.map((L, i) => {
        const pp = sp(f, b0 + 4 + i * 2, "pop");
        if (pp <= 0.002) return null;
        const lit = eo(f, b0 + 8 + i * 2, 10);
        return (
          <div
            key={i}
            style={{
              ...pos(610, PLATE_Y(i), 34, PLATE_YN(i)),
              width: mix(400, 452, k),
              height: mix(56, 50, k),
              boxSizing: "border-box",
              borderRadius: 14,
              background: C.surface2,
              border: `1px solid ${C.line}`,
              boxShadow: `inset 4px 0 0 rgba(255,179,0,${0.25 + 0.65 * lit})`,
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "0 20px",
              opacity: Math.min(1, pp * 1.7),
              transform: `translateX(${(1 - pp) * -30}px)`,
            }}
          >
            <Icon name={L.icon} size={30} color={C.accent} sw={3.6} />
            <span style={{ ...TX.label, fontSize: 26, whiteSpace: "nowrap" }}>{L.t}</span>
          </div>
        );
      })}

      {/* «это видео»: a mini player whose tracks are the layers above */}
      {wideA > 0.01 && pr > 0.002 && (
        <div
          style={{
            position: "absolute",
            left: 1110,
            top: 100,
            width: 470,
            height: 380,
            boxSizing: "border-box",
            borderRadius: 18,
            background: C.surface2,
            border: `1px solid ${C.line}`,
            opacity: wideA * Math.min(1, pr * 1.7),
            transform: `translateX(${(1 - pr) * 40}px)`,
          }}
        >
          <div style={{ position: "absolute", left: 24, top: 18, display: "flex", alignItems: "center", gap: 12, ...TX.kicker, color: C.accent, whiteSpace: "nowrap" }}>
            <Icon name="video" size={30} color={C.accent} sw={3.8} />
            ЭТО ВИДЕО
          </div>
          <div
            style={{
              position: "absolute",
              left: 24,
              top: 64,
              width: 420,
              height: 196,
              boxSizing: "border-box",
              borderRadius: 12,
              background: C.bg,
              border: `1px solid ${C.line}`,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 172,
                top: 54,
                width: 76,
                height: 76,
                borderRadius: 38,
                background: C.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 0 ${26 + 14 * Math.sin(f / 8)}px rgba(255,179,0,0.45)`,
              }}
            >
              <Icon name="play" size={40} color={C.bg} style={{ marginLeft: 5 }} />
            </div>
            <div style={{ position: "absolute", left: 16, right: 16, bottom: 14, height: 6, borderRadius: 3, background: "rgba(243,239,230,0.12)" }}>
              <div style={{ width: `${(0.06 + 0.94 * play) * 100}%`, height: 6, borderRadius: 3, background: C.accent }} />
            </div>
          </div>
          {LAYERS.map((_, i) => {
            const lit = eo(f, b0 + 8 + i * 2, 10);
            return (
              <div key={i} style={{ position: "absolute", left: 24, top: 280 + i * 18, width: 420, height: 10, borderRadius: 5, background: "rgba(243,239,230,0.06)" }}>
                {[0, 1, 2].map((j) => {
                  const s = j * 0.34 + 0.02 + hash(i * 5 + j * 3 + 1) * 0.1;
                  const l = 0.14 + hash(i * 3 + j * 11 + 2) * 0.12;
                  return (
                    <div
                      key={j}
                      style={{
                        position: "absolute",
                        left: s * 420,
                        top: 0,
                        width: l * 420,
                        height: 10,
                        borderRadius: 5,
                        background: lit > 0 ? `rgba(255,179,0,${0.2 + 0.6 * lit})` : "rgba(243,239,230,0.14)",
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
          <div style={{ position: "absolute", left: 24 + 420 * (0.06 + 0.94 * play) - 1, top: 274, width: 3, height: 94, borderRadius: 2, background: C.text, opacity: 0.85 }} />
        </div>
      )}

      {/* «Теперь он ваш» */}
      {f >= fNow && (
        <div style={pos(66, 340, 34, 486)}>
          <Stamp text="ТЕПЕРЬ ВАШ" f={f} start={fNow} size={32} rot={-3} />
        </div>
      )}
    </Frame>
  );
};

// ── card 2: cheaper and smarter every year (no numbers) ────────────────────────────────────────────────
const CX0 = 44; // chart x of the first year
const CW = 392;
const priceY = (u: number) => 36 + (320 * (1 - Math.exp(-2.6 * u))) / (1 - Math.exp(-2.6));
const smartY = (u: number) => 356 - (320 * (Math.exp(2.2 * u) - 1)) / (Math.exp(2.2) - 1);
const toU = (x: number) => (x - CX0) / CW;
const U_CROSS = (() => {
  let best = 0;
  let d = Infinity;
  for (let i = 0; i <= 400; i++) {
    const u = i / 400;
    const v = Math.abs(priceY(u) - smartY(u));
    if (v < d) {
      d = v;
      best = u;
    }
  }
  return best;
})();

const ChartCard: React.FC<{ f: number; b1: number; fSmart: number }> = ({ f, b1, fSmart }) => {
  const pA = eo(f, b1 + 8, 16);
  const sP = b1 + 12;
  const pP = lin(f, sP, 34);
  const sU = fSmart - 4;
  const pU = lin(f, sU, 32);
  const xP = CX0 + CW * pP;
  const xU = CX0 + CW * pU;
  const fCross = sU + Math.round(U_CROSS * 32);
  const lp = sp(f, sP + 30, "snap");
  const lu = sp(f, sU + 28, "snap");
  const pt = sp(f, b1 + 8, "snap");
  return (
    <Frame w={520} h={570} kind="plain">
      <div style={{ position: "absolute", left: 34, top: 26, ...TX.title, fontSize: 34, whiteSpace: "nowrap", opacity: Math.min(1, pt * 1.6), transform: `translateY(${(1 - pt) * 16}px)` }}>
        Дешевле и умнее
      </div>
      <svg width={452} height={420} style={{ position: "absolute", left: 34, top: 84, overflow: "visible" }}>
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1={24} x2={24 + 416 * pA} y1={64 + i * 80} y2={64 + i * 80} stroke="rgba(243,239,230,0.06)" strokeWidth={2} />
        ))}
        <line x1={24} y1={384} x2={24} y2={384 - 374 * pA} stroke="rgba(243,239,230,0.32)" strokeWidth={3} strokeLinecap="round" />
        <line x1={24} y1={384} x2={24 + 420 * pA} y2={384} stroke="rgba(243,239,230,0.32)" strokeWidth={3} strokeLinecap="round" />
        {[1, 2, 3, 4, 5].map((i) => {
          const x = 24 + i * 80;
          return <line key={i} x1={x} x2={x} y1={384} y2={398} stroke="rgba(243,239,230,0.32)" strokeWidth={3} strokeLinecap="round" opacity={24 + 420 * pA >= x ? 1 : 0} />;
        })}
        {pU > 0 && <path d={`${fnPath((x) => smartY(toU(x)), CX0, xU, 4)} L${xU.toFixed(1)} 384 L${CX0} 384 Z`} fill="rgba(255,179,0,0.07)" />}
        {pP > 0 && (
          <path d={fnPath((x) => priceY(toU(x)), CX0, xP, 4)} fill="none" stroke="rgba(243,239,230,0.78)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {pU > 0 && <path d={fnPath((x) => smartY(toU(x)), CX0, xU, 4)} fill="none" stroke={C.accent} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />}
        {pP > 0 && <circle cx={xP} cy={priceY(pP)} r={8} fill={C.text} />}
        {pU > 0 && <circle cx={xU} cy={smartY(pU)} r={9} fill={C.accent} />}
      </svg>
      {/* the moment smarter overtakes cheaper */}
      <div style={{ position: "absolute", left: 34 + CX0 + CW * U_CROSS, top: 84 + priceY(U_CROSS), width: 0, height: 0 }}>
        <Burst f={f} start={fCross} r0={18} r1={64} n={10} width={4} />
      </div>
      {lu > 0.002 && (
        <div
          style={{
            position: "absolute",
            right: 82,
            top: 84,
            display: "flex",
            alignItems: "center",
            gap: 8,
            ...TX.title,
            fontSize: 34,
            color: C.accent,
            whiteSpace: "nowrap",
            opacity: Math.min(1, lu * 1.6),
            transform: `translateY(${(1 - lu) * 14}px)`,
          }}
        >
          ум
          <Arrow dir="up" size={32} color={C.accent} />
        </div>
      )}
      {lp > 0.002 && (
        <div
          style={{
            position: "absolute",
            left: 338,
            top: 338,
            display: "flex",
            alignItems: "center",
            gap: 8,
            ...TX.label,
            fontSize: 30,
            color: C.text,
            whiteSpace: "nowrap",
            opacity: Math.min(1, lp * 1.6),
            transform: `translateY(${(1 - lp) * -14}px)`,
          }}
        >
          цена
          <Arrow dir="down" size={28} color={C.text} />
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: 372,
          top: 486,
          display: "flex",
          alignItems: "center",
          gap: 8,
          ...TX.label,
          fontSize: 24,
          color: C.muted,
          whiteSpace: "nowrap",
          opacity: eo(f, b1 + 18, 12),
        }}
      >
        годы
        <Arrow dir="right" size={24} color={C.muted} />
      </div>
    </Frame>
  );
};

// ── card 3: a nuclear power in everyone's hands ─────────────────────────────────────────────────────────
const Atom: React.FC<{ f: number; start: number; size: number }> = ({ f, start, size }) => {
  if (f < start) return null;
  const RX = 138;
  const RY = 46;
  const O = 160;
  const rot = (f - start) * 0.35;
  const pn = sp(f, start, "stamp");
  const glow = eo(f, start, 20);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 320 320" style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <defs>
          <radialGradient id="l1outro-core">
            <stop offset="0%" stopColor="rgba(255,179,0,0.5)" />
            <stop offset="100%" stopColor="rgba(255,179,0,0)" />
          </radialGradient>
        </defs>
        <circle cx={O} cy={O} r={150} fill="url(#l1outro-core)" opacity={glow * (0.78 + 0.22 * Math.sin(f / 9))} />
        {[0, 60, 120].map((a, i) => {
          const pd = eo(f, start + 2 + i * 4, 18);
          const th = (f - start) * (0.11 + i * 0.025) + i * 2.1;
          const e = eo(f, start + 18 + i * 4, 8);
          return (
            <g key={i} transform={`rotate(${a + rot} ${O} ${O})`}>
              <path
                d={`M${O - RX} ${O} A${RX} ${RY} 0 1 0 ${O + RX} ${O} A${RX} ${RY} 0 1 0 ${O - RX} ${O}`}
                fill="none"
                stroke={C.accent}
                strokeWidth={5}
                pathLength={1}
                strokeDasharray="1 1"
                strokeDashoffset={1 - pd}
                opacity={0.9}
              />
              {e > 0 && <circle cx={O + RX * Math.cos(th)} cy={O + RY * Math.sin(th)} r={11} fill={C.text} opacity={e} />}
            </g>
          );
        })}
        <circle cx={O} cy={O} r={30 * pn} fill={C.accent} />
        <circle cx={O - 9} cy={O - 9} r={9 * pn} fill="rgba(255,255,255,0.4)" />
      </svg>
      <Ripple f={f} start={start} size={110} dur={26} grow={1.7} />
      <Burst f={f} start={start + 2} r0={50} r1={150} n={12} />
    </div>
  );
};

/** One open hand, palm up, coming in from the left (sleeve cuff, thumb on top, fingertips to the right). */
const HAND = "M30 58 C50 56 62 50 74 40 C84 30 98 22 108 26 C118 30 114 42 102 48 C94 52 92 58 100 60 L160 60 C178 60 180 76 164 77 C180 78 180 93 164 94 C178 96 176 108 160 109 L72 110 C54 112 40 112 30 108 Z";
const OneHand: React.FC = () => (
  <>
    <rect x={0} y={50} width={30} height={64} rx={6} fill={C.raised} stroke={C.text} strokeWidth={4.5} />
    <path d={HAND} fill={C.raised} stroke={C.text} strokeWidth={4.5} strokeLinejoin="round" />
    <path d="M112 77 L160 77 M112 94 L160 94" stroke="rgba(243,239,230,0.45)" strokeWidth={3} strokeLinecap="round" />
  </>
);
/** Two palms offered from both sides, tilted up; the fingertips meet under the held object. `spread` 0..1 opens them. */
const Hands: React.FC<{ w: number; spread?: number }> = ({ w, spread = 0 }) => (
  <svg width={w} height={(w * 170) / 360} viewBox="0 0 360 170" style={{ display: "block", overflow: "visible" }}>
    <g transform={`translate(${4 - 40 * spread} 40) rotate(-9 30 80)`}>
      <OneHand />
    </g>
    <g transform={`translate(${356 + 40 * spread} 40) scale(-1 1) rotate(-9 30 80)`}>
      <OneHand />
    </g>
  </svg>
);

const PowerCard: React.FC<{ f: number; fHands: number; b2: number; fAsk: number }> = ({ f, fHands, b2, fAsk }) => {
  const pt = sp(f, fHands, "snap");
  const ph = sp(f, fHands + 4, "soft");
  const pl = sp(f, b2 + 8, "snap");
  const pq = sp(f, fAsk, "pop");
  return (
    <Frame w={520} h={570} kind="plain" glow={0.7 * bump(f, b2, 34)}>
      <div style={{ position: "absolute", left: 34, top: 26, ...TX.title, fontSize: 34, whiteSpace: "nowrap", opacity: Math.min(1, pt * 1.6), transform: `translateY(${(1 - pt) * 16}px)` }}>
        У каждого в руках
      </div>
      <div style={{ position: "absolute", left: 145, top: 75 }}>
        <Atom f={f} start={b2} size={230} />
      </div>
      <div style={{ position: "absolute", left: 110, top: 250, opacity: Math.min(1, ph * 1.6), transform: `translateY(${(1 - ph) * 50}px)` }}>
        <Hands w={300} spread={1 - ph} />
      </div>
      {pl > 0.002 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            width: 520,
            top: 408,
            textAlign: "center",
            ...TX.title,
            fontSize: 32,
            color: C.accent,
            whiteSpace: "nowrap",
            opacity: Math.min(1, pl * 1.6),
            transform: `translateY(${(1 - pl) * 18}px)`,
          }}
        >
          ядерная энергия
        </div>
      )}
      {pq > 0.002 && (
        <div
          style={{
            position: "absolute",
            left: 34,
            width: 452,
            top: 482,
            height: 56,
            boxSizing: "border-box",
            borderRadius: 14,
            background: C.surface2,
            border: `1px solid ${C.line}`,
            boxShadow: "inset 4px 0 0 rgba(255,179,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            opacity: Math.min(1, pq * 1.7),
            transform: `translateY(${(1 - pq) * 22}px)`,
          }}
        >
          <Icon name="question" size={30} color={C.accent} sw={4} />
          <span style={{ ...TX.label, fontSize: 26, whiteSpace: "nowrap" }}>Как вы ей распорядитесь?</span>
        </div>
      )}
    </Frame>
  );
};

// ── phase B: the four steps (left column only — the face takes the right corner) ──────────────────────
const PLAN: { t: string; s: string; icon: IconName }[] = [
  { t: "Один скилл", s: "а не десять сразу", icon: "doc" },
  { t: "Под себя", s: "под вашу задачу", icon: "wrench" },
  { t: "До результата", s: "довести до готового", icon: "target" },
  { t: "Потом второй", s: "когда первый работает", icon: "plus" },
];
const ROW_STEP = 126;
const ROW_H = 112;
const ROW_Y = (i: number) => 40 + i * ROW_STEP;

const PlanCard: React.FC<{ f: number; b3: number; ticks: number[] }> = ({ f, b3, ticks }) => {
  const rail = ticks.slice(1).reduce((acc, t) => acc + ROW_STEP * eo(f, t - 4, 12), 0);
  return (
    <Frame w={1040} h={570} kind="plain">
      <div style={{ position: "absolute", left: 52, top: ROW_Y(0) + ROW_H / 2, width: 4, height: 3 * ROW_STEP * eo(f, b3 + 6, 18), borderRadius: 2, background: "rgba(243,239,230,0.12)" }} />
      <div style={{ position: "absolute", left: 52, top: ROW_Y(0) + ROW_H / 2, width: 4, height: rail, borderRadius: 2, background: C.accent }} />
      {PLAN.map((r, i) => {
        const pr = sp(f, b3 + 4 + i * 4, "pop");
        if (pr <= 0.002) return null;
        const tk = ticks[i];
        const on = eo(f, tk, 8);
        const last = i === PLAN.length - 1;
        const g = glowWin(f, tk, last ? Infinity : ticks[i + 1], 0);
        const pn = sp(f, tk, "bouncy");
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 0,
              top: ROW_Y(i),
              width: 1040,
              height: ROW_H,
              opacity: Math.min(1, pr * 1.7),
              transform: `translateX(${(1 - pr) * -40}px)`,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 24,
                top: (ROW_H - 60) / 2,
                width: 60,
                height: 60,
                boxSizing: "border-box",
                borderRadius: 30,
                border: `3px solid ${on > 0.5 ? C.accent : "rgba(154,160,170,0.5)"}`,
                background: interpolateColors(on, [0, 1], [C.surface, C.accent]),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: MONO,
                fontWeight: 700,
                fontSize: 28,
                color: on > 0.5 ? C.bg : C.muted,
              }}
            >
              {i + 1}
            </div>
            <div
              style={{
                position: "absolute",
                left: 110,
                top: 0,
                width: 896,
                height: ROW_H,
                boxSizing: "border-box",
                borderRadius: 16,
                background: C.surface2,
                border: `2px solid rgba(255,179,0,${0.08 + 0.75 * g})`,
                boxShadow: g > 0 ? `0 0 34px rgba(255,179,0,${0.22 * g})` : undefined,
              }}
            >
              <div style={{ position: "absolute", left: 22, top: (ROW_H - 64) / 2 }}>
                <Tile icon={r.icon} size={64} on={on} />
              </div>
              <div
                style={{
                  position: "absolute",
                  left: 108,
                  top: 14,
                  ...TX.title,
                  fontSize: 36,
                  lineHeight: 1.15,
                  color: interpolateColors(on, [0, 1], [C.muted, last ? C.accent : C.text]),
                  whiteSpace: "nowrap",
                }}
              >
                {r.t}
              </div>
              <div style={{ position: "absolute", left: 108, top: 62, ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap" }}>{r.s}</div>
              <div style={{ position: "absolute", right: 24, top: last ? (ROW_H - 49) / 2 : (ROW_H - 62) / 2 }}>
                {last ? (
                  pn > 0.002 && (
                    <div style={{ opacity: Math.min(1, pn * 1.7), transform: `translateX(${(1 - pn) * 24}px)` }}>
                      <Chip text="дальше" icon="arrow" tone="accent" size={26} />
                    </div>
                  )
                ) : (
                  <CheckBadge f={f} start={tk} size={62} />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </Frame>
  );
};

// ── the scene ───────────────────────────────────────────────────────────────────────────────────────────
export const Outro: React.FC<SceneProps> = ({ f, b, t0, w }) => {
  const [b0, b1, b2, b3, b4] = b;
  const fNow = w("теперь", 757);
  const fSmart = w("умнее", 760);
  const fHands = w("каждого", 761);
  const fAsk = w("вопрос", 764);
  const fMine = w("моё", 767);
  const fLove = w("любов", 768.9);
  const ticks = [w("один", 769.5), w("под", 770.5), w("до", 771.2), w("потом", 772)];

  // Right corner (x 1220+, y 280–850) belongs to the face from 769.86 s: phase A is gone by «бережно».
  const fCorner = at(769.86);
  const leaveAt = Math.min(b3, fCorner - 14) - 10;
  const q1 = 1 - safeExitAlpha(f, leaveAt);
  const q2 = 1 - safeExitAlpha(f, leaveAt - 2);
  const q3 = 1 - safeExitAlpha(f, leaveAt - 4);
  const k = eio(f, b1 - 10, 20); // the skill card folds into the left column as the chart arrives
  const fl = (seed: number) => float(f, seed, 3, 120);

  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080 }}>
      {/* header: title left, chip right */}
      <div style={{ position: "absolute", left: 140, top: 150, width: 1640, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ position: "relative", width: 1240, height: 50 }}>
          <Swap f={f} a={t0} z={fMine - 4}>
            <span style={{ ...TX.title, fontSize: 38 }}>
              Это видео — результат одного <span style={{ color: C.accent }}>скилла</span>
            </span>
          </Swap>
          <Swap f={f} a={fMine + 7}>
            <span style={{ ...TX.title, fontSize: 38 }}>
              Моё предложение — <span style={{ color: C.accent }}>бережно и с любовью</span>
            </span>
          </Swap>
        </div>
        <div style={{ position: "relative", width: 360, height: 50 }}>
          <Swap f={f} a={t0 + 6} z={fMine - 4} right>
            <Chip text="итог урока" icon="star" tone="outline" size={24} />
          </Swap>
          <Swap f={f} a={fLove} z={b4 - 4} right>
            <Chip text="с любовью" icon="heart" tone="outline" size={24} />
          </Swap>
          <Swap f={f} a={b4 + 7} right>
            <Chip text="Промпт — под видео" icon="arrow" tone="accent" size={24} />
          </Swap>
        </div>
      </div>

      {/* phase A */}
      <Pop x={140} y={250} w={mix(WIDE_W, NARROW_W, k)} h={570} p={sp(f, b0, "pop")} q={q1} from="below" d={50}>
        <div style={{ transform: `translateY(${fl(1)}px)` }}>
          <SkillCard f={f} b0={b0} fNow={fNow} k={k} />
        </div>
      </Pop>
      <Pop x={700} y={250} w={520} h={570} p={sp(f, b1 + 6, "pop")} q={q2} from="right" d={60}>
        <div style={{ transform: `translateY(${fl(2)}px)` }}>
          <ChartCard f={f} b1={b1} fSmart={fSmart} />
        </div>
      </Pop>
      <Pop x={1260} y={250} w={520} h={570} p={sp(f, fHands, "snap")} q={q3} from="below" d={50}>
        <div style={{ transform: `translateY(${fl(3)}px)` }}>
          <PowerCard f={f} fHands={fHands} b2={b2} fAsk={fAsk} />
        </div>
      </Pop>

      {/* phase B */}
      <Pop x={140} y={250} w={1040} h={570} p={sp(f, b3, "snap")} from="left" d={60}>
        <div style={{ transform: `translateY(${fl(4)}px)` }}>
          <PlanCard f={f} b3={b3} ticks={ticks} />
        </div>
      </Pop>
    </div>
  );
};
