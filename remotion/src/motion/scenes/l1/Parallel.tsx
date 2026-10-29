import React from "react";
import { interpolateColors } from "remotion";
import { C, MONO, SANS } from "../../../theme";
import { bump, clamp01, ei, eio, eo, float, hash, lin, mix, shake, sp } from "../../anim";
import { Icon, IconName } from "../../icons";
import { SceneProps } from "../../types";
import { Bubble, CheckBadge, Chip, Frame, Pop, Ripple, StatusIcon, Strike, Tone, TX, glowWin } from "../../ui";
import { ArrowPath, CrossBadge, IconTile, Leave, Overlay, Verdict } from "../kit";

// Урок 1 · раздел 11 «Параллельность и мощности» (l1_parallel).
// A: ролик режется на 72 куска → 72 воркера → 3 ч превращаются в 3,5 мин.
// B: ноутбук ✗ · сервер ✗ → облако ✓; карточки Modal и Hugging Face (без цен и сумм).
// C: этот ролик (72 воркера · около 5 мин · центы) и нюанс с картами.

// ── Геометрия (зона сцены x 140–1780 / y 130–830) ─────────────────────────────────────────────
const L = 140;
const ZW = 1640;
const TOP_Y = 250; // верхний ряд: полоса ролика → железо → «этот ролик»
const TOP_H = 160;
const LOW_Y = 434; // нижний ряд до y 820
const LOW_H = 386;
const GRID_W = 1000;
const COL_X = 1165;
const COL_W = 615;
const X100_Y = 434;
const X100_H = 186;
const TIM_Y = 634;
const TIM_H = 186;
const CARD_W = 808;
const MODAL_X = 140;
const HF_X = 972;

// полоса ролика внутри верхней карточки
const N = 72;
const STRIP_X = 34;
const STRIP_Y = 86;
const STRIP_W = 1572;
const STRIP_H = 48;
const SEG = STRIP_W / N;

// сетка воркеров внутри нижней левой карточки: 12 × 6, кусок i → столбец i/6, строка i%6
const COLS = 12;
const ROWS = 6;
const GX = 34;
const GY = 86;
const GW = 932;
const GH = 274;
const GAPX = 10;
const GAPY = 9;
const CW = (GW - GAPX * (COLS - 1)) / COLS;
const CH = (GH - GAPY * (ROWS - 1)) / ROWS;
const cellOf = (i: number) => ({ col: Math.floor(i / ROWS), row: i % ROWS });
const cellLeft = (col: number) => GX + col * (CW + GAPX);
const cellTop = (row: number) => GY + row * (CH + GAPY);

const FLY = 16; // кадров полёта куска к воркеру

type T = {
  t0: number;
  bX: number;
  bCut: number;
  bWork: number;
  bTime: number;
  bIron: number;
  bModal: number;
  bHF: number;
  bThis: number;
  bCards: number;
  aWhy: number;
  aSend: number;
  aLap: number;
  aSrv: number;
  aTwo: number;
  aCloud: number;
  aCredits: number;
  aMonthly: number;
  aInvest: number;
  aPopular: number;
  aPro: number;
  aEight: number;
  aCpu: number;
  aSeventy: number;
  aAbout: number;
  aCents: number;
  aNothing: number;
  aAbuse: number;
  aAny: number;
  aTry: number;
  aPrepaid: number;
  aOne: number;
};

const cutAt = (t: T, i: number) => t.bCut + i * 0.35;
const depAt = (t: T, i: number) => {
  const step = Math.max(0.2, Math.min(0.5, (t.bWork - 20 - t.aSend) / N));
  return Math.max(t.aSend + i * step, cutAt(t, i) + 10);
};
const doneAt = (t: T, i: number) => t.bTime - 6 - Math.floor(hash(i * 3.7 + 1) * 30);
/** Доля «одного процесса» до разрезания: ползёт еле-еле (0,6 % → 3 %). */
const preProgress = (f: number, t: T) => 0.006 + 0.024 * lin(f, t.t0, Math.max(1, t.bCut - t.t0));

// ── Мелкие помощники ────────────────────────────────────────────────────────────────────────────
/** Абсолютный блок, который проявляется в `a` и уходит к `z` (за 10 кадров до него). */
const Swap: React.FC<{ f: number; a: number; z?: number; dy?: number; style?: React.CSSProperties; children?: React.ReactNode }> = ({
  f,
  a,
  z = Infinity,
  dy = 14,
  style,
  children,
}) => {
  const i = eo(f, a, 12);
  const o = Number.isFinite(z) ? ei(f, z - 10, 10) : 0;
  if (i <= 0 || o >= 1) return null;
  return <div style={{ position: "absolute", opacity: i * (1 - o), transform: `translateY(${dy * (1 - i) - dy * 0.8 * o}px)`, ...style }}>{children}</div>;
};

/** Внутренняя плашка 14px 20px. */
const plate = (w: number, h: number, extra?: React.CSSProperties): React.CSSProperties => ({
  position: "relative",
  width: w,
  height: h,
  boxSizing: "border-box",
  padding: "14px 20px",
  borderRadius: 16,
  background: C.surface2,
  border: `1px solid ${C.line}`,
  ...extra,
});

const Kicker: React.FC<{ icon: IconName; text: string; color?: string; style?: React.CSSProperties }> = ({ icon, text, color = C.muted, style }) => (
  <div style={{ position: "absolute", left: 34, top: 26, height: 46, display: "flex", alignItems: "center", gap: 12, ...style }}>
    <Icon name={icon} size={30} color={C.accent} sw={3.8} />
    <span style={{ ...TX.kicker, color, whiteSpace: "nowrap" }}>{text}</span>
  </div>
);

const BigNum: React.FC<{ size: number; color?: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ size, color = C.accent, children, style }) => (
  <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: size, lineHeight: 1, color, letterSpacing: "-0.02em", whiteSpace: "nowrap", ...style }}>{children}</span>
);

/** «≈» рисуем сами: в подмножествах шрифтов этого знака нет. */
const Approx: React.FC<{ size: number; color?: string }> = ({ size, color = C.accent }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: "block", flex: "none" }}>
    <path d="M7 18c5.5-6 11.5-6 17 0s11.5 6 17 0 M7 32c5.5-6 11.5-6 17 0s11.5 6 17 0" fill="none" stroke={color} strokeWidth={5.5} strokeLinecap="round" />
  </svg>
);

/** Монетка «центы» — без суммы; въезжает переворотом. */
const Coin: React.FC<{ f: number; at: number; size: number }> = ({ f, at, size }) => {
  const spin = eo(f, at, 22);
  const sx = Math.max(0.08, Math.abs(Math.cos((1 - spin) * Math.PI * 2.5)));
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none", transform: `scaleX(${sx})` }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: C.accent, boxShadow: "inset 0 -5px 0 rgba(17,19,24,0.22)" }} />
      <div style={{ position: "absolute", inset: size * 0.13, borderRadius: "50%", border: "3px solid rgba(17,19,24,0.3)" }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: SANS,
          fontWeight: 900,
          fontSize: size * 0.56,
          color: C.bg,
          lineHeight: 1,
        }}
      >
        ¢
      </div>
    </div>
  );
};

// ── Шапка: заголовок слева, чипы справа (alignItems: flex-start) ─────────────────────────────
const Titles: React.FC<{ f: number; items: { a: number; text: string }[] }> = ({ f, items }) => (
  <div style={{ position: "relative", width: 900, height: 46, flex: "none" }}>
    {items.map((it, k) => {
      const z = k + 1 < items.length ? items[k + 1].a : Infinity;
      const rise = eo(f, it.a, 16);
      const out = Number.isFinite(z) ? ei(f, z - 10, 10) : 0;
      if (rise <= 0 || out >= 1) return null;
      return (
        <div key={k} style={{ position: "absolute", left: 0, top: 0, overflow: "hidden", padding: "4px 6px 10px", margin: "-4px -6px -10px" }}>
          <div
            style={{
              ...TX.title,
              fontSize: 38,
              whiteSpace: "nowrap",
              opacity: 1 - out,
              transform: `translateY(${(1 - rise) * 110}%) translateY(${-out * 16}px)`,
            }}
          >
            {it.text}
          </div>
        </div>
      );
    })}
  </div>
);

type ChipItem = { a: number; z?: number; text: string; icon: IconName; tone: Tone };
const ChipSlot: React.FC<{ f: number; right: number; items: ChipItem[] }> = ({ f, right, items }) => (
  <div style={{ position: "absolute", right, top: 0, width: 344, height: 46 }}>
    {items.map((it, k) => {
      const p = sp(f, it.a, "bouncy");
      const o = it.z !== undefined && Number.isFinite(it.z) ? ei(f, it.z - 10, 10) : 0;
      if (p <= 0.002 || o >= 1) return null;
      return (
        <div key={k} style={{ position: "absolute", right: 0, top: 0, opacity: Math.min(1, p * 1.6) * (1 - o), transform: `translateY(${(1 - p) * -16 - o * 10}px)` }}>
          <Chip text={it.text} icon={it.icon} tone={it.tone} size={24} />
        </div>
      );
    })}
  </div>
);

// ── A1. Полоса ролика: один процесс → 72 куска → собран ─────────────────────────────────────
const StripCard: React.FC<{ f: number; t: T }> = ({ f, t }) => {
  const pre = preProgress(f, t);
  const preFade = 1 - eo(f, t.bCut, 8);
  const blade = lin(f, t.bCut, 25);
  const bladeA = f > t.bCut ? Math.min(1, blade * 8, (1 - blade) * 8) : 0;
  return (
    <Pop x={L} y={TOP_Y} w={ZW} h={TOP_H} p={sp(f, t.t0, "soft")} from="below" d={40}>
      <Frame w={ZW} h={TOP_H} kind="plain" glow={glowWin(f, t.bTime + 6, t.bTime + 40, 0.15)}>
        <Kicker icon="video" text="Ролик · 14 минут" />
        <Swap f={f} a={t.t0} z={t.bCut} style={{ right: 34, top: 26, height: 46, display: "flex", alignItems: "center", gap: 12 }}>
          <StatusIcon s="run" f={f} size={30} />
          <span style={{ fontFamily: MONO, fontSize: 24, color: C.muted, whiteSpace: "nowrap" }}>1 процесс · {Math.max(1, Math.round(pre * 100))} %</span>
        </Swap>
        <Swap f={f} a={t.bCut} z={t.bTime + 6} style={{ right: 34, top: 26 }}>
          <Chip text="72 куска" icon="scissors" tone="outline" size={24} />
        </Swap>
        <Swap f={f} a={t.bTime + 6} style={{ right: 34, top: 26 }}>
          <Chip text="собран" icon="check" tone="ok" size={24} />
        </Swap>

        <div style={{ position: "absolute", left: STRIP_X, top: STRIP_Y, width: STRIP_W, height: STRIP_H }}>
          {Array.from({ length: N }, (_, i) => {
            const cut = sp(f, cutAt(t, i), "snap") * (1 - eo(f, t.bTime + 4 + i * 0.15, 14));
            const gap = 6 * cut;
            const dn = doneAt(t, i);
            const away = eo(f, depAt(t, i), 6) * (1 - eo(f, dn, 8));
            const done = eo(f, dn, 8);
            const flash = bump(f, dn, 12);
            const sweep = bump(f, t.bTime + 8 + i * 0.3, 14);
            const preFill = clamp01(pre * N - i) * preFade;
            const dy = cut * (hash(i * 1.3) - 0.5) * 6;
            const rl = i === 0 ? 8 : 4 * cut;
            const rr = i === N - 1 ? 8 : 4 * cut;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: i * SEG + gap / 2,
                  top: dy,
                  width: SEG - gap,
                  height: STRIP_H,
                  borderRadius: `${rl}px ${rr}px ${rr}px ${rl}px`,
                  overflow: "hidden",
                  background: i % 2 ? "#333A4A" : C.raised,
                  opacity: 1 - 0.62 * away,
                }}
              >
                {preFill > 0 && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${preFill * 100}%`, background: C.accent, opacity: 0.9 }} />}
                {done > 0 && <div style={{ position: "absolute", inset: 0, background: C.accent, opacity: Math.min(1, 0.8 * done + 0.2 * flash) }} />}
                {sweep > 0 && <div style={{ position: "absolute", inset: 0, background: "#FFE3A0", opacity: 0.55 * sweep }} />}
                <div style={{ position: "absolute", left: "50%", top: 5, width: 7, height: 5, marginLeft: -3.5, borderRadius: 1.5, background: "rgba(17,19,24,0.72)" }} />
                <div style={{ position: "absolute", left: "50%", top: STRIP_H - 10, width: 7, height: 5, marginLeft: -3.5, borderRadius: 1.5, background: "rgba(17,19,24,0.72)" }} />
              </div>
            );
          })}
          {bladeA > 0 && (
            <>
              <div
                style={{
                  position: "absolute",
                  left: blade * STRIP_W - 1.5,
                  top: -8,
                  width: 3,
                  height: STRIP_H + 16,
                  borderRadius: 2,
                  background: C.accent,
                  boxShadow: "0 0 14px rgba(255,179,0,0.85)",
                  opacity: bladeA,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: blade * STRIP_W - 24,
                  top: STRIP_H / 2 - 24,
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  background: C.bg,
                  border: `2px solid ${C.accent}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: bladeA,
                  transform: `rotate(${Math.sin(f * 0.9) * 14}deg)`,
                }}
              >
                <Icon name="scissors" size={30} color={C.accent} sw={3.6} />
              </div>
            </>
          )}
        </div>
      </Frame>
    </Pop>
  );
};

// ── A2. Сетка 72 воркеров ──────────────────────────────────────────────────────────────────────
const GridCard: React.FC<{ f: number; t: T }> = ({ f, t }) => {
  const lit = eo(f, t.bWork, 8);
  const flash = bump(f, t.bWork, 20);
  const pre = preProgress(f, t);
  const busy0 = 1 - eo(f, t.bCut, 8);
  const firstDone = t.bTime - 36;
  let doneN = 0;
  let gotN = 0;
  for (let i = 0; i < N; i++) {
    if (f >= doneAt(t, i)) doneN++;
    if (f >= depAt(t, i) + FLY - 2) gotN++;
  }
  const workN = Math.round(mix(1, N, eo(f, t.bWork, 10)));
  const counter = (label: string, v: number, color: string = C.text) => (
    <>
      <span style={{ fontFamily: MONO, fontSize: 24, color: C.muted, whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, color, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        {v} / {N}
      </span>
    </>
  );
  const row: React.CSSProperties = { right: 34, top: 26, height: 46, display: "flex", alignItems: "center", gap: 12 };
  return (
    <Pop x={L} y={LOW_Y + float(f, 1, 2, 130)} w={GRID_W} h={LOW_H} p={sp(f, t.t0 + 6, "soft")} from="below" d={50}>
      <Frame w={GRID_W} h={LOW_H} kind="plain" glow={glowWin(f, t.bWork, t.bTime + 24, 0.18)}>
        <Kicker icon="server" text="Воркеры" />
        <Swap f={f} a={t.t0} z={t.bCut} style={row}>
          {counter("в работе", 1)}
        </Swap>
        <Swap f={f} a={t.bCut} z={t.bWork} style={row}>
          {counter("получили кусок", gotN)}
        </Swap>
        <Swap f={f} a={t.bWork} z={firstDone} style={row}>
          {counter("в работе", workN, C.accent)}
        </Swap>
        <Swap f={f} a={firstDone} style={row}>
          {counter("готово", doneN, doneN >= N ? C.ok : C.text)}
          <div style={{ width: 32, height: 32 }}>
            <CheckBadge f={f} start={t.bTime - 6} size={32} ring={false} />
          </div>
        </Swap>

        {Array.from({ length: N }, (_, i) => {
          const { col, row: r } = cellOf(i);
          const arr = depAt(t, i) + FLY;
          const got = eo(f, arr - 2, 6);
          const dn = doneAt(t, i);
          const done = eo(f, dn, 8);
          const dflash = bump(f, dn, 14);
          const start = t.bWork + 4;
          const prog = f < start ? 0 : Math.min(1, (f - start) / Math.max(1, dn - start));
          const b0 = i === 0 ? busy0 : 0;
          const on = Math.max(got * 0.55, lit, b0);
          const led = b0 > 0 ? b0 * (0.55 + 0.45 * Math.sin(f / 5)) : lit;
          const barFill = b0 > 0 ? (pre / 0.03) * b0 : prog * lit;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: cellLeft(col),
                top: cellTop(r),
                width: CW,
                height: CH,
                borderRadius: 8,
                boxSizing: "border-box",
                border: `2px solid ${interpolateColors(on, [0, 1], ["rgba(243,239,230,0.10)", C.accent])}`,
                background: `rgba(255,179,0,${Math.min(0.95, 0.1 * lit + 0.2 * flash + 0.55 * done + 0.35 * dflash + 0.12 * b0)})`,
                boxShadow: lit > 0 ? `0 0 ${18 * (flash + dflash)}px rgba(255,179,0,${0.5 * lit})` : undefined,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 8,
                  top: CH / 2 - 5,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  background: led > 0 ? C.accent : "rgba(154,160,170,0.4)",
                  opacity: led > 0 ? Math.max(0.35, led) * (1 - done) : 1 - done,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 22,
                  right: 8,
                  top: CH / 2 - 5,
                  height: 8,
                  borderRadius: 4,
                  background: "rgba(243,239,230,0.1)",
                  boxShadow: got > 0 ? `inset 0 0 0 1.5px rgba(255,179,0,${0.7 * got * (1 - lit)})` : undefined,
                  overflow: "hidden",
                  opacity: 1 - done,
                }}
              >
                <div style={{ width: `${clamp01(barFill) * 100}%`, height: "100%", background: C.accent }} />
              </div>
              {done > 0 && (
                <svg width={26} height={26} viewBox="0 0 48 48" style={{ position: "absolute", left: CW / 2 - 13, top: CH / 2 - 14, overflow: "visible" }}>
                  <path
                    d="M11 25l8.5 8.5L37 15"
                    fill="none"
                    stroke={C.bg}
                    strokeWidth={7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pathLength={1}
                    strokeDasharray="1 1"
                    strokeDashoffset={1 - done}
                  />
                </svg>
              )}
            </div>
          );
        })}
        <div style={{ position: "absolute", left: GX + GW / 2, top: GY + GH / 2, width: 0, height: 0 }}>
          <Ripple f={f} start={t.bWork} size={240} dur={26} grow={2.4} />
        </div>
      </Frame>
    </Pop>
  );
};

/** Куски летят из полосы к своим воркерам (поверх карточек, только на время полёта). */
const Pieces: React.FC<{ f: number; t: T }> = ({ f, t }) => (
  <>
    {Array.from({ length: N }, (_, i) => {
      const d = depAt(t, i);
      const k = (f - d) / FLY;
      if (k <= 0 || k >= 1) return null;
      const e = eio(f, d, FLY);
      const { col, row } = cellOf(i);
      const sx = L + STRIP_X + (i + 0.5) * SEG;
      const sy = TOP_Y + STRIP_Y + STRIP_H / 2;
      const tx = L + cellLeft(col) + CW / 2;
      const ty = LOW_Y + cellTop(row) + CH / 2;
      const arc = 60 + hash(i * 2.1) * 70;
      const x = mix(sx, tx, e);
      const y = mix(sy, ty, e) - arc * Math.sin(Math.PI * e);
      const w = mix(SEG - 6, 30, e);
      const h = mix(STRIP_H, 12, e);
      const rot = (hash(i * 4.4) - 0.5) * 70 * Math.sin(Math.PI * e);
      return (
        <div
          key={i}
          style={{
            position: "absolute",
            left: x - w / 2,
            top: y - h / 2,
            width: w,
            height: h,
            borderRadius: 4,
            background: C.accent,
            boxShadow: "0 0 14px rgba(255,179,0,0.55)",
            transform: `rotate(${rot}deg)`,
            opacity: Math.min(1, k * 6, (1 - k) * 8),
          }}
        />
      );
    })}
  </>
);

// ── A3. «Ускорь ×100» и таймер ─────────────────────────────────────────────────────────────────
const SpeedCard: React.FC<{ f: number; t: T }> = ({ f, t }) => {
  const px = sp(f, t.bX, "stamp");
  return (
    <Pop x={COL_X} y={X100_Y + float(f, 2, 2, 140)} w={COL_W} h={X100_H} p={sp(f, t.t0 + 10, "soft")} from="right" d={60}>
      <Frame w={COL_W} h={X100_H} kind="plain" glow={glowWin(f, t.bX, t.bX + 40, 0.2)} style={{ transform: `translateX(${shake(f, t.bX + 2, 8, 16)}px)` }}>
        <Kicker icon="chat" text="Мой запрос" />
        <Swap f={f} a={t.aWhy} z={t.bX} style={{ left: 34, top: 76 }}>
          <Bubble me size={28} maxW={460}>
            <span style={{ whiteSpace: "nowrap" }}>Почему 3 часа?</span>
          </Bubble>
        </Swap>
        <Swap f={f} a={t.bX} style={{ left: 34, top: 76 }}>
          <Bubble me size={28}>
            <span style={{ whiteSpace: "nowrap" }}>Ускорь</span>
          </Bubble>
        </Swap>
        {f > t.bX && (
          <div
            style={{
              position: "absolute",
              right: 34,
              top: 40,
              opacity: Math.min(1, (f - t.bX) / 3),
              transform: `scale(${2 - px})`,
              transformOrigin: "60% 50%",
            }}
          >
            <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }}>
              <Ripple f={f} start={t.bX + 4} size={200} dur={24} grow={1.1} />
            </div>
            <BigNum size={104} style={{ display: "block", textShadow: `0 0 ${34 * bump(f, t.bX + 2, 26)}px rgba(255,179,0,0.85)` }}>
              ×100
            </BigNum>
          </div>
        )}
      </Frame>
    </Pop>
  );
};

const TimerCard: React.FC<{ f: number; t: T }> = ({ f, t }) => {
  const k = eo(f, t.bTime, 10);
  const pNew = sp(f, t.bTime + 5, "pop");
  const arr = eo(f, t.bTime + 2, 10);
  return (
    <Pop x={COL_X} y={TIM_Y + float(f, 3, 2, 150)} w={COL_W} h={TIM_H} p={sp(f, t.t0 + 14, "soft")} from="right" d={60}>
      <Frame w={COL_W} h={TIM_H} kind="plain" glow={glowWin(f, t.bTime, t.bTime + 40, 0.2)}>
        <Kicker icon="clock" text="Время рендера" />
        <div style={{ position: "absolute", left: 34, top: 76, width: 104, height: 64 }}>
          <BigNum size={56} color={interpolateColors(k, [0, 1], [C.text, C.muted])} style={{ display: "block", lineHeight: 1.1 }}>
            3 ч
          </BigNum>
          {k > 0 && <Strike w={96} h={62} p={k} width={7} />}
        </div>
        {arr > 0 && (
          <div style={{ position: "absolute", left: 150, top: 86, opacity: arr, transform: `translateX(${(1 - arr) * -14}px)` }}>
            <Icon name="arrow" size={44} color={C.accent} sw={4.2} />
          </div>
        )}
        <Swap f={f} a={t.t0} z={t.bTime + 4} style={{ left: 214, top: 92 }}>
          <span style={{ ...TX.label, fontSize: 28, color: C.muted, whiteSpace: "nowrap" }}>один процесс</span>
        </Swap>
        {pNew > 0.002 && (
          <div style={{ position: "absolute", left: 214, top: 70, opacity: Math.min(1, pNew * 1.6), transform: `translateX(${(1 - pNew) * 40}px)` }}>
            <BigNum size={72} style={{ display: "block", textShadow: `0 0 ${28 * bump(f, t.bTime + 6, 24)}px rgba(255,179,0,0.8)` }}>
              3,5 мин
            </BigNum>
          </div>
        )}
      </Frame>
    </Pop>
  );
};

// ── B1. Железо: ноутбук ✗ · сервер ✗ → облако ✓ ──────────────────────────────────────────────
const HwTile: React.FC<{ f: number; at: number; x: number; w: number; icon: IconName; small: string; name: string; mark: number; ok: boolean; seed: number }> = ({
  f,
  at,
  x,
  w,
  icon,
  small,
  name,
  mark,
  ok,
  seed,
}) => {
  const m = eo(f, mark, 10);
  const dim = ok ? 0 : m;
  return (
    <Pop x={x} y={TOP_Y + float(f, seed, 2, 120)} w={w} h={TOP_H} p={sp(f, at, ok ? "pop" : "heavy")} from="below" d={36}>
      <Frame w={w} h={TOP_H} kind="plain" glow={ok ? glowWin(f, mark, mark + 40, 0.35) : 0}>
        <div style={{ position: "absolute", left: 34, top: 38 }}>
          <IconTile
            icon={icon}
            size={84}
            color={interpolateColors(dim, [0, 1], [C.accent, C.muted])}
            bg={interpolateColors(dim, [0, 1], ["rgba(255,179,0,0.14)", "rgba(154,160,170,0.12)"])}
          />
        </div>
        <div style={{ position: "absolute", left: 138, top: 40 }}>
          <div style={{ ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap" }}>{small}</div>
          <div style={{ ...TX.title, fontSize: 36, whiteSpace: "nowrap", color: interpolateColors(dim, [0, 1], [C.text, C.muted]) }}>{name}</div>
        </div>
        <div style={{ position: "absolute", right: 34, top: ok ? 48 : 50 }}>
          {ok ? <CheckBadge f={f} start={mark} size={64} /> : <CrossBadge f={f} start={mark} size={60} />}
        </div>
      </Frame>
    </Pop>
  );
};

// ── B2/B3. Карточки сервисов ──────────────────────────────────────────────────────────────────
const SvcCard: React.FC<{
  f: number;
  at: number;
  x: number;
  icon: IconName;
  name: string;
  sub: string;
  subAt: number;
  glow?: number;
  badge?: React.ReactNode;
  badgeAt?: number;
  seed: number;
  children?: React.ReactNode;
}> = ({ f, at, x, icon, name, sub, subAt, glow = 0, badge, badgeAt = Infinity, seed, children }) => {
  const s = eo(f, subAt, 12);
  const bp = sp(f, badgeAt, "bouncy");
  return (
    <Pop x={x} y={LOW_Y + float(f, seed, 2, 140)} w={CARD_W} h={LOW_H} p={sp(f, at, "pop")} from="below" d={56}>
      <Frame w={CARD_W} h={LOW_H} kind="plain" glow={glow}>
        <div style={{ position: "absolute", left: 34, top: 26 }}>
          <IconTile icon={icon} size={80} />
        </div>
        <div style={{ position: "absolute", left: 134, top: 26, ...TX.title, fontSize: 44, whiteSpace: "nowrap" }}>{name}</div>
        {s > 0 && (
          <div
            style={{
              position: "absolute",
              left: 134,
              top: 84,
              ...TX.label,
              fontSize: 26,
              color: C.muted,
              whiteSpace: "nowrap",
              opacity: s,
              transform: `translateX(${(1 - s) * -16}px)`,
            }}
          >
            {sub}
          </div>
        )}
        {badge && bp > 0.002 && (
          <div style={{ position: "absolute", right: 34, top: 28, opacity: Math.min(1, bp * 1.6), transform: `translateY(${(1 - bp) * -14}px)` }}>{badge}</div>
        )}
        {children}
      </Frame>
    </Pop>
  );
};

const ROW2_Y = 132;
const ROW2_H = 86;
const ROW3_Y = 234;
const ROW3_H = 126;
const IN_W = CARD_W - 68; // 740
const HALF_W = (IN_W - 16) / 2; // 362

const Plate: React.FC<{ f: number; at: number; x: number; lead: React.ReactNode; lines: string[] }> = ({ f, at, x, lead, lines }) => (
  <Pop x={x} y={ROW2_Y} w={HALF_W} h={ROW2_H} p={sp(f, at, "pop")} from="below" d={22}>
    <div style={plate(HALF_W, ROW2_H, { display: "flex", alignItems: "center", gap: 16 })}>
      {lead}
      <div style={{ ...TX.label, fontSize: 26, lineHeight: 1.12 }}>
        {lines.map((l, k) => (
          <div key={k} style={{ whiteSpace: "nowrap" }}>
            {l}
          </div>
        ))}
      </div>
    </div>
  </Pop>
);

/** Квота на видеокарты: 1 деление → 8 делений (×8). */
const QuotaPlate: React.FC<{ f: number; at: number; eight: number }> = ({ f, at, eight }) => {
  const px = sp(f, eight, "stamp");
  const segW = (560 - 7 * 8) / 8;
  return (
    <Pop x={34} y={ROW3_Y} w={IN_W} h={ROW3_H} p={sp(f, at, "pop")} from="below" d={24}>
      <div style={plate(IN_W, ROW3_H)}>
        <div style={{ position: "absolute", left: 20, top: 14, display: "flex", alignItems: "center", gap: 14 }}>
          <IconTile icon="chip" size={44} />
          <span style={{ ...TX.label, fontSize: 28, whiteSpace: "nowrap" }}>квота на видеокарты</span>
        </div>
        <div style={{ position: "absolute", left: 20, top: 76, width: 560, height: 28 }}>
          {Array.from({ length: 8 }, (_, k) => {
            const on = eo(f, eight + 2 + k * 2.5, 8);
            const base = k === 0 ? 1 : 0;
            return (
              <div
                key={k}
                style={{
                  position: "absolute",
                  left: k * (segW + 8),
                  top: 0,
                  width: segW,
                  height: 28,
                  borderRadius: 8,
                  boxSizing: "border-box",
                  background: on > 0 ? `rgba(255,179,0,${on})` : base ? "rgba(243,239,230,0.45)" : "rgba(243,239,230,0.06)",
                  border: on > 0 || base ? "none" : "2px dashed rgba(243,239,230,0.2)",
                  boxShadow: on > 0 ? `0 0 ${16 * bump(f, eight + 2 + k * 2.5, 14)}px rgba(255,179,0,0.8)` : undefined,
                }}
              />
            );
          })}
        </div>
        {f > eight && (
          <div style={{ position: "absolute", right: 30, top: 30, opacity: Math.min(1, (f - eight) / 3), transform: `scale(${2 - px})`, transformOrigin: "50% 50%" }}>
            <BigNum size={60}>×8</BigNum>
          </div>
        )}
      </div>
    </Pop>
  );
};

const CompanyPlate: React.FC<{ f: number; at: number }> = ({ f, at }) => (
  <Pop x={34} y={ROW3_Y} w={IN_W} h={ROW3_H} p={sp(f, at, "pop")} from="below" d={24}>
    <div style={plate(IN_W, ROW3_H, { display: "flex", alignItems: "center", gap: 20 })}>
      <IconTile icon="trend" size={64} />
      <div>
        <div style={{ ...TX.title, fontSize: 34, whiteSpace: "nowrap" }}>крупная компания</div>
        <div style={{ ...TX.label, fontSize: 26, color: C.muted, marginTop: 6, whiteSpace: "nowrap" }}>высоко оценена инвесторами</div>
      </div>
    </div>
  </Pop>
);

/** Нижняя плашка «Карта» в карточке сервиса (с бита «картами»). */
const RulePlate: React.FC<{ f: number; at: number; needZ?: number; children?: React.ReactNode }> = ({ f, at, needZ = Infinity, children }) => (
  <Pop x={34} y={ROW3_Y} w={IN_W} h={ROW3_H} p={sp(f, at, "pop")} from="below" d={24}>
    <div style={plate(IN_W, ROW3_H, { border: "1px solid rgba(255,179,0,0.4)" })}>
      <div style={{ position: "absolute", left: 20, top: 14, height: 46, display: "flex", alignItems: "center", gap: 12 }}>
        <Icon name="card" size={34} color={C.accent} sw={3.8} />
        <span style={{ ...TX.kicker, color: C.accent }}>Карта</span>
        <span style={{ ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap", marginLeft: 4, opacity: 1 - eo(f, needZ - 8, 8) }}>нужна привязка</span>
      </div>
      {children}
    </div>
  </Pop>
);

const Enter: React.FC<{ f: number; at: number; style?: React.CSSProperties; children?: React.ReactNode }> = ({ f, at, style, children }) => {
  const p = sp(f, at, "snap");
  if (p <= 0.002) return null;
  return <div style={{ position: "absolute", opacity: Math.min(1, p * 1.6), transform: `translateY(${(1 - p) * 14}px)`, ...style }}>{children}</div>;
};

// ── C1. «Этот ролик» ──────────────────────────────────────────────────────────────────────────
const STAT_W = 250;
const Stat: React.FC<{ f: number; at: number; x: number; lead: React.ReactNode; label: string }> = ({ f, at, x, lead, label }) => (
  <Pop x={x} y={26} w={STAT_W} h={108} p={sp(f, at, "bouncy")} from="below" d={20}>
    <div style={plate(STAT_W, 108, { display: "flex", alignItems: "center", gap: 14 })}>
      {lead}
      <span style={{ ...TX.label, fontSize: 26, whiteSpace: "nowrap" }}>{label}</span>
    </div>
  </Pop>
);

const ThisVideo: React.FC<{ f: number; t: T }> = ({ f, t }) => {
  const sx = ZW - 34 - STAT_W * 3 - 16 * 2;
  return (
    <Pop x={L} y={TOP_Y + float(f, 7, 2, 130)} w={ZW} h={TOP_H} p={sp(f, t.bThis, "pop")} from="below" d={40}>
      <Frame w={ZW} h={TOP_H} kind="plain" glow={glowWin(f, t.bThis, t.bThis + 40, 0.3)}>
        <div style={{ position: "absolute", left: 34, top: 38 }}>
          <IconTile icon="video" size={84} />
        </div>
        <div style={{ position: "absolute", left: 138, top: 38 }}>
          <div style={{ ...TX.title, fontSize: 36, whiteSpace: "nowrap" }}>Этот ролик</div>
          <div style={{ ...TX.label, fontSize: 26, color: C.muted, marginTop: 6, whiteSpace: "nowrap" }}>рендер на Hugging Face</div>
        </div>
        <Stat f={f} at={t.aSeventy} x={sx} lead={<BigNum size={56}>{Math.round(mix(0, 72, eo(f, t.aSeventy, 18)))}</BigNum>} label="воркера" />
        <Stat
          f={f}
          at={t.aAbout}
          x={sx + STAT_W + 16}
          lead={
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Approx size={40} />
              <BigNum size={56}>5</BigNum>
            </span>
          }
          label="минут"
        />
        <Stat f={f} at={t.aCents} x={sx + (STAT_W + 16) * 2} lead={<Coin f={f} at={t.aCents} size={58} />} label="центы" />
      </Frame>
    </Pop>
  );
};

// ── Сцена ─────────────────────────────────────────────────────────────────────────────────────
export const Parallel: React.FC<SceneProps> = ({ f, b, t0, w }) => {
  const [bX, bCut, bWork, bTime, bIron, bModal, bHF, bThis, bCards] = b;
  const t: T = {
    t0,
    bX,
    bCut,
    bWork,
    bTime,
    bIron,
    bModal,
    bHF,
    bThis,
    bCards,
    aWhy: w("почему"),
    aSend: w("отправил"),
    aLap: w("ноутбук"),
    aSrv: w("сервер"),
    aTwo: w("два", 560),
    aCloud: w("облачные"),
    aCredits: w("даёт"),
    aMonthly: w("каждый"),
    aInvest: w("компанию"),
    aPopular: w("самая"),
    aPro: w("подписка"),
    aEight: w("восемь"),
    aCpu: w("процессоры"),
    aSeventy: w("семьдесят", 585),
    aAbout: w("около", 586),
    aCents: w("центов", 588),
    aNothing: w("ничего"),
    aAbuse: w("защита"),
    aAny: w("принимает"),
    aTry: w("пробуйте"),
    aPrepaid: w("предоплаченные"),
    aOne: w("один", 602),
  };

  const titles = [
    { a: t0, text: "Параллельный рендер" },
    { a: t.aLap, text: "Где взять мощность" },
    { a: bThis, text: "Рендер этого ролика" },
    { a: bCards, text: "Нюанс с картами" },
  ];
  const slotA: ChipItem[] = [
    { a: t.aTwo, z: bThis, text: "два сервиса", icon: "blocks", tone: "outline" },
    { a: t.aNothing, text: "ничего не списывают", icon: "shield", tone: "outline" },
  ];
  const slotB: ChipItem[] = [
    { a: t.aAbuse, z: t.aOne, text: "защита от абьюза", icon: "lock", tone: "muted" },
    { a: t.aOne, text: "не с первой попытки", icon: "undo", tone: "muted" },
  ];

  const colDim = 1 - 0.35 * eo(f, bModal, 16);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* шапка */}
      <div style={{ position: "absolute", left: L, top: 148, width: ZW, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Titles f={f} items={titles} />
        <div style={{ position: "relative", width: 720, height: 46, flex: "none" }}>
          <ChipSlot f={f} right={0} items={slotA} />
          <ChipSlot f={f} right={376} items={slotB} />
        </div>
      </div>

      {/* верхний ряд */}
      <Leave f={f} at={t.aLap - 12}>
        <StripCard f={f} t={t} />
      </Leave>
      <Leave f={f} at={bThis - 12}>
        <HwTile f={f} at={t.aLap} x={140} w={420} icon="laptop" small="мой" name="ноутбук" mark={t.aLap + 10} ok={false} seed={4} />
        <HwTile f={f} at={t.aSrv} x={580} w={420} icon="server" small="мой" name="сервер" mark={t.aSrv + 10} ok={false} seed={5} />
        <Overlay>
          <ArrowPath x1={1008} y1={330} x2={1072} y2={330} p={eo(f, bIron, 12)} width={5} />
        </Overlay>
        <HwTile f={f} at={bIron} x={1080} w={700} icon="cloud" small="облако" name="чужое железо" mark={bIron + 10} ok seed={6} />
      </Leave>
      <ThisVideo f={f} t={t} />

      {/* нижний ряд: слева */}
      <Leave f={f} at={bModal - 12}>
        <GridCard f={f} t={t} />
      </Leave>
      <SvcCard f={f} at={bModal} x={MODAL_X} icon="zap" name="Modal" sub="облачные вычисления" subAt={t.aCloud} seed={8}>
        <Plate f={f} at={t.aCredits} x={34} lead={<IconTile icon="spark" size={52} />} lines={["бесплатные", "кредиты"]} />
        <Plate f={f} at={t.aMonthly} x={34 + HALF_W + 16} lead={<IconTile icon="calendar" size={52} />} lines={["каждый", "месяц"]} />
        <Leave f={f} at={bCards - 12}>
          <CompanyPlate f={f} at={t.aInvest} />
        </Leave>
        <RulePlate f={f} at={bCards} needZ={t.aPrepaid}>
          <Enter f={f} at={t.aPrepaid} style={{ left: 166, top: 14 }}>
            <Verdict f={f} start={t.aPrepaid} text="предоплаченные" ok={false} size={24} />
          </Enter>
          <Enter f={f} at={t.aTry} style={{ left: 20, top: 66 }}>
            <Chip text="виртуальные — пробуйте разные" icon="card" tone="outline" size={24} />
          </Enter>
        </RulePlate>
      </SvcCard>

      {/* нижний ряд: справа */}
      <Leave f={f} at={bHF - 12}>
        <div style={{ position: "absolute", inset: 0, opacity: colDim }}>
          <SpeedCard f={f} t={t} />
          <TimerCard f={f} t={t} />
        </div>
      </Leave>
      <SvcCard
        f={f}
        at={bHF}
        x={HF_X}
        icon="brain"
        name="Hugging Face"
        sub="самая популярная площадка нейросетей"
        subAt={t.aPopular}
        glow={glowWin(f, bThis, bThis + 45, 0.4)}
        badge={<Chip text="этот ролик" icon="video" tone="outline" size={24} />}
        badgeAt={bThis + 6}
        seed={9}
      >
        <Plate f={f} at={t.aPro} x={34} lead={<BigNum size={48}>PRO</BigNum>} lines={["подписка"]} />
        <Plate f={f} at={t.aCpu} x={34 + HALF_W + 16} lead={<BigNum size={48}>CPU</BigNum>} lines={["фоновые", "задачи"]} />
        <Leave f={f} at={bCards - 12}>
          <QuotaPlate f={f} at={bHF + 8} eight={t.aEight} />
        </Leave>
        <RulePlate f={f} at={bCards + 4}>
          <Enter f={f} at={t.aAny} style={{ left: 20, top: 66 }}>
            <Verdict f={f} start={t.aAny} text="любая карта" ok size={26} />
          </Enter>
        </RulePlate>
      </SvcCard>

      {/* куски в полёте — поверх всего */}
      <Pieces f={f} t={t} />
    </div>
  );
};
