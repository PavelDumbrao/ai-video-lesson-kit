import React from "react";
import { C, MONO, SANS } from "../../../theme";
import { bump, ei, eio, eo, float, lin, mix, shake, sp } from "../../anim";
import { Icon, IconName } from "../../icons";
import { TypeText } from "../../text";
import { SceneProps } from "../../types";
import { Avatar, Bubble, CheckBadge, Chip, Dots, Frame, glowWin, Pop, TX } from "../../ui";
import { Burst, Calendar, Ring } from "../../viz";
import { ArrowPath, Count, CrossBadge, Flyer, IconTile, Overlay, Slide } from "../kit";

// «Форумы и три решения» (урок 1, раздел 8, голос 397,22–445,29).
// Страница A (до «Правило»): слева — «ваш стол» (одна карточка, три состояния: промпт ×100 → чёткая
// формулировка → «10 с ↔ неделя»), справа — мир агента (стена «проблема» → стопка форумов → вторая стопка
// «китайские форумы», первая сжимается вверх). Под лицом во весь экран (423,22–432,02) страница A стоит.
// Страница B (с «Правило»): карточка-правило сверху, под ней «ловушка» → три варианта (один выбран ✓),
// внизу бейдж «проактивный агент · разница — в правилах».

/** Элемент живёт до своего следующего бита и уходит за ~10 кадров (нет следующего — не гаснет). */
const safeExitAlpha = (f: number, bNext?: number) => (bNext === undefined ? 1 : 1 - ei(f, bNext, 10));

// ── геометрия (зона сцены x 140–1780, контент y 250–820) ─────────────────────────────────────
const L = { x: 140, y: 250, w: 620, h: 570 }; // «ваш стол»
const R = { x: 860, y: 250, w: 920, h: 570 }; // мир агента
const PILE = 20; // смещение листов стопки
const HALF = 270; // высота стопки после сжатия
const S2Y = 550; // вторая стопка
const BY = 250; // страница B: карточка-правило
const BH = 180;
const MY = 466; // ряд «ловушка» / три варианта
const MH = 254;
const BADGE_Y = 752;

// ── мелкие детали ───────────────────────────────────────────────────────────────────────────
const Kicker: React.FC<{ icon: IconName; text: string; color?: string; iconColor?: string }> = ({ icon, text, color = C.accent, iconColor }) => (
  <div style={{ position: "absolute", left: 30, top: 26, display: "flex", alignItems: "center", gap: 12, ...TX.kicker, color, whiteSpace: "nowrap" }}>
    <Icon name={icon} size={30} color={iconColor ?? color} sw={3.8} />
    {text}
  </div>
);

const Label: React.FC<{ x: number; y: number; text: string; color?: string }> = ({ x, y, text, color = C.accent }) => (
  <div style={{ position: "absolute", left: x, top: y, fontFamily: MONO, fontWeight: 700, fontSize: 24, letterSpacing: "0.12em", color, whiteSpace: "nowrap" }}>
    {text}
  </div>
);

/** Заголовок шапки: кикер + строка 38 px, выезжает из-под маски; уходит к `z`. */
const HeadText: React.FC<{ f: number; a: number; z?: number; kicker: string; title: string }> = ({ f, a, z = Infinity, kicker, title }) => {
  const p = sp(f, a, "snap");
  const rise = eo(f, a + 2, 16);
  const out = ei(f, z, 10);
  if (p <= 0.002 || out >= 1) return null;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, opacity: 1 - out, transform: `translateY(${-18 * out}px)` }}>
      <div style={{ ...TX.kicker, color: C.accent, opacity: Math.min(1, p * 1.6), transform: `translateX(${(1 - p) * -24}px)`, whiteSpace: "nowrap" }}>
        {kicker}
      </div>
      <div style={{ overflow: "hidden", marginTop: 6, paddingBottom: 6 }}>
        <div style={{ ...TX.title, fontSize: 38, whiteSpace: "nowrap", transform: `translateY(${(1 - rise) * 115}%)` }}>{title}</div>
      </div>
    </div>
  );
};

/** Чип статуса в правом слоте шапки (прижат вправо), меняется с крестфейдом. */
const ChipSlot: React.FC<{ f: number; a: number; z?: number; children: React.ReactNode }> = ({ f, a, z = Infinity, children }) => {
  const p = sp(f, a, "bouncy");
  const out = ei(f, z, 8);
  if (p <= 0.002 || out >= 1) return null;
  return (
    <div style={{ position: "absolute", right: 0, top: 0, opacity: Math.min(1, p * 1.6) * (1 - out), transform: `translateY(${(1 - p) * -16 - 10 * out}px)` }}>
      {children}
    </div>
  );
};

// ── страница A: стена «проблема» ─────────────────────────────────────────────────────────────
const BRICK_W = 70;
const BRICK_H = 30;
const Wall: React.FC<{ w: number; h: number }> = ({ w, h }) => (
  <div style={{ position: "relative", width: w, height: h, overflow: "hidden", borderRadius: 8, background: C.surface2 }}>
    {Array.from({ length: Math.ceil(h / BRICK_H) }, (_, r) =>
      Array.from({ length: Math.ceil(w / BRICK_W) + 2 }, (_, k) => (
        <div
          key={`${r}-${k}`}
          style={{
            position: "absolute",
            left: (r % 2 ? -BRICK_W / 2 : 0) + k * BRICK_W + 2,
            top: r * BRICK_H + 2,
            width: BRICK_W - 4,
            height: BRICK_H - 4,
            borderRadius: 4,
            background: r % 3 === 1 ? "#343B4A" : C.raised,
          }}
        />
      )),
    )}
  </div>
);

/** Агент раз за разом врезается в стену «проблема» (цикл каждые P кадров с кадра c0). */
const WallCard: React.FC<{ f: number; c0: number }> = ({ f, c0 }) => {
  const P = 30;
  const HIT = 14;
  let bx = 170;
  let imp = -Infinity;
  if (f >= c0) {
    const ph = (f - c0) % P;
    bx = ph < HIT ? mix(170, 330, ei(ph, 0, HIT)) : mix(330, 170, eo(ph, HIT, P - HIT));
    const n = Math.floor((f - c0 - HIT) / P);
    if (f >= c0 + HIT) imp = c0 + HIT + n * P;
  }
  const tilt = -9 * bump(f, imp, 12);
  const wx = shake(f, imp, 5, 14);
  const bub = sp(f, c0 + HIT + 2, "pop");
  const cap = eo(f, c0 + 30, 12);
  return (
    <Frame w={R.w} h={R.h} kind="plain">
      <Kicker icon="warn" text="АГЕНТ УПЁРСЯ В СТЕНУ" />
      {/* пол */}
      <div style={{ position: "absolute", left: 40, top: 440, width: R.w - 80, height: 3, borderRadius: 2, background: "rgba(243,239,230,0.12)" }} />
      {/* за стеной — недоступное решение */}
      <div style={{ position: "absolute", left: 700, top: 300 + float(f, 2, 4), opacity: 0.42 }}>
        <IconTile icon="target" size={120} color={C.muted} bg="rgba(154,160,170,0.12)" />
      </div>
      <div style={{ position: "absolute", left: 700, top: 452, width: 120, textAlign: "center", ...TX.label, fontSize: 26, color: C.muted, opacity: 0.7 }}>
        решение
      </div>
      {/* стена */}
      <div style={{ position: "absolute", left: 470, top: 110, transform: `translateX(${wx}px)` }}>
        <Wall w={142} h={330} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 541,
          top: 238,
          transform: `translateX(-50%) translateX(${wx}px)`,
          padding: "14px 20px",
          borderRadius: 12,
          border: `3px solid ${C.err}`,
          background: C.surface2,
          fontFamily: SANS,
          fontWeight: 900,
          fontSize: 34,
          letterSpacing: "0.06em",
          color: C.err,
          whiteSpace: "nowrap",
          boxShadow: "0 14px 30px rgba(0,0,0,0.4)",
        }}
      >
        ПРОБЛЕМА
      </div>
      {/* удар */}
      <div style={{ position: "absolute", left: 470, top: 370, width: 0, height: 0 }}>
        <Burst f={f} start={imp} r0={22} r1={72} n={7} color={C.accent} width={5} />
      </div>
      {/* агент */}
      <div style={{ position: "absolute", left: bx, top: 300, transform: `rotate(${tilt}deg)`, transformOrigin: "50% 100%" }}>
        <Avatar size={140} icon="bot" />
      </div>
      {bub > 0.002 && (
        <div style={{ position: "absolute", left: 40, top: 168, opacity: Math.min(1, bub * 1.6), transform: `translateY(${(1 - bub) * 16}px)` }}>
          <Bubble size={28} maxW={400}>
            не получается…
          </Bubble>
        </div>
      )}
      <div style={{ position: "absolute", left: 40, top: 488, ...TX.label, fontSize: 28, color: C.muted, opacity: cap, whiteSpace: "nowrap" }}>
        каждая попытка — в ту же стену
      </div>
    </Frame>
  );
};

// ── страница A: «ваш стол», три состояния ────────────────────────────────────────────────────
const PROMPTS = ["сделай нормально", "ещё раз, но лучше", "ну пожалуйста, ещё раз"];

const PromptLoop: React.FC<{ f: number; wK: number; wRaz: number }> = ({ f, wK, wRaz }) => {
  const v = mix(1, 100, eio(f, wK, Math.max(10, wRaz - wK)));
  const dim = 1 - 0.5 * eo(f, wRaz + 2, 10);
  const cap = eo(f, wRaz + 8, 12);
  return (
    <>
      <Kicker icon="undo" text="КРУТИТЬ ПРОМПТ" />
      <div style={{ position: "absolute", right: 30, top: 92, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 16 }}>
        {PROMPTS.map((t, i) => {
          const p = sp(f, wK - 10 + i * 9, "snap");
          return (
            <div key={i} style={{ opacity: Math.min(1, p * 1.6) * dim, transform: `translateX(${(1 - p) * 40}px)` }}>
              <Bubble me size={28} maxW={500}>
                {t}
              </Bubble>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 30, top: 340, display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <Count v={v} prefix="×" style={{ fontSize: 72, color: C.accent, lineHeight: 1 }} />
          <span style={{ ...TX.label, fontSize: 28, color: C.muted }}>попыток</span>
        </div>
        <CrossBadge f={f} start={wRaz + 2} size={72} />
      </div>
      <div style={{ position: "absolute", left: 30, top: 452, ...TX.label, fontSize: 28, color: C.muted, opacity: cap, transform: `translateY(${(1 - cap) * 12}px)`, whiteSpace: "nowrap" }}>
        так стену не пробить
      </div>
    </>
  );
};

const PROBLEM = "липсинк на русском не получается в такой-то модели";
const TASK = "найди, как решают другие";

const Formulation: React.FC<{ f: number; a: number; wNai: number; wOtp: number; z: number }> = ({ f, a, wNai, wOtp, z }) => {
  const send = sp(f, wOtp - 8, "snap");
  const press = eo(f, wOtp + 2, 6);
  const txt = { ...TX.label, fontSize: 32, lineHeight: 1.25 } as const;
  return (
    <>
      <Kicker icon="doc" text="ЧЁТКАЯ ФОРМУЛИРОВКА" />
      <Label x={30} y={92} text="ПРОБЛЕМА" color={C.muted} />
      <div style={{ position: "absolute", left: 30, top: 128, width: L.w - 60 }}>
        <TypeText text={PROBLEM} f={f} start={a + 4} cps={44} caretUntil={wNai} style={txt} />
      </div>
      <Label x={30} y={286} text="ЗАДАЧА АГЕНТУ" color={C.muted} />
      <div style={{ position: "absolute", left: 30, top: 322, width: L.w - 60 }}>
        <TypeText text={TASK} f={f} start={wNai} cps={30} caretUntil={z} style={{ ...txt, color: C.accent }} />
      </div>
      {send > 0.002 && (
        <div style={{ position: "absolute", left: 30, top: 470, opacity: Math.min(1, send * 1.6), transform: `translateY(${(1 - send) * 14 + 2 * bump(f, wOtp + 2, 8)}px)` }}>
          <Chip text="отправить на форумы" icon="send" tone="outline" />
          <div style={{ position: "absolute", left: 0, top: 0, opacity: press }}>
            <Chip text="отправить на форумы" icon="send" tone="accent" />
          </div>
        </div>
      )}
    </>
  );
};

/** Двусторонняя стрелка ↔, рисуется по p. */
const BothWays: React.FC<{ p: number; w?: number }> = ({ p, w = 70 }) => (
  <svg width={w} height={44} viewBox={`0 0 ${w} 44`} style={{ display: "block", overflow: "visible" }}>
    <path d={`M8 22 H${w - 8}`} stroke={C.accent} strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} fill="none" />
    <path d={`M20 10 L8 22 L20 34 M${w - 20} 10 L${w - 8} 22 L${w - 20} 34`} stroke={C.accent} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={lin(p, 0.6, 0.4)} />
  </svg>
);

const TimeVsWeek: React.FC<{ f: number; a: number; wNed: number; wDoo: number }> = ({ f, a, wNed, wDoo }) => {
  const ring = eo(f, a + 4, 22);
  const cal = sp(f, a + 8, "heavy");
  const v = 1 + 6 * lin(f, a + 14, Math.max(20, wNed - a - 14));
  const arr = eo(f, a + 10, 14);
  const ok = sp(f, wDoo - 4, "snap");
  return (
    <>
      <Kicker icon="clock" text="10 СЕКУНД ПРОТИВ НЕДЕЛИ" />
      {/* таймер */}
      <div style={{ position: "absolute", left: 30, top: 104, width: 210, height: 210 }}>
        <Ring size={210} p={ring} width={14} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 68, color: C.text, lineHeight: 1 }}>10</span>
          <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 40, color: C.accent, lineHeight: 1, marginTop: 14 }}>с</span>
        </div>
      </div>
      <div style={{ position: "absolute", left: 30, top: 352, width: 210, textAlign: "center", ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap" }}>
        вашего времени
      </div>
      {/* ↔ */}
      <div style={{ position: "absolute", left: 262, top: 188 }}>
        <BothWays p={arr} />
      </div>
      {/* календарь */}
      {cal > 0.002 && (
        <div style={{ position: "absolute", left: 356, top: 86 + (1 - cal) * -30, opacity: Math.min(1, cal * 1.6) }}>
          <Calendar v={v} w={226} h={250} label="ДЕНЬ" />
        </div>
      )}
      <div style={{ position: "absolute", left: 356, top: 352, width: 226, textAlign: "center", ...TX.label, fontSize: 26, color: C.muted, opacity: Math.min(1, cal * 1.6), whiteSpace: "nowrap" }}>
        чужая неделя
      </div>
      {/* итог */}
      {ok > 0.002 && (
        <div
          style={{
            position: "absolute",
            left: 30,
            top: 424,
            width: L.w - 60,
            height: 84,
            boxSizing: "border-box",
            padding: "14px 20px",
            borderRadius: 14,
            background: "rgba(74,222,128,0.08)",
            border: "2px solid rgba(74,222,128,0.45)",
            display: "flex",
            alignItems: "center",
            gap: 18,
            opacity: Math.min(1, ok * 1.6),
            transform: `translateY(${(1 - ok) * 16}px)`,
          }}
        >
          <CheckBadge f={f} start={wDoo} size={48} />
          <span style={{ ...TX.label, fontSize: 28, whiteSpace: "nowrap" }}>модель дообучена нюансу</span>
        </div>
      )}
    </>
  );
};

// ── страница A: стопка форумов ───────────────────────────────────────────────────────────────
type Row = { v: string; t: string; ok?: boolean; n?: string };
const FORUM: Row[] = [
  { v: "▲ 214", t: "фикс фонем для русского", ok: true },
  { v: "▲ 96", t: "липсинк RU: рабочие настройки", ok: true },
  { v: "▲ 48", t: "модель путает «ы» и «и»", n: "12 ответов" },
  { v: "▲ 31", t: "сравнение моделей на русском", n: "31 ответ" },
  { v: "▲ 17", t: "губы отстают от голоса", n: "9 ответов" },
];
const CHINA: Row[] = [
  { v: "▲ 530", t: "русский липсинк: готовый рецепт", ok: true },
  { v: "▲ 270", t: "фонемы RU — два шага", ok: true },
];
const ROW0 = 100;
const ROW_STEP = 64;

const Stack: React.FC<{
  f: number;
  at: number;
  hl0: number;
  w: number;
  h: number;
  icon: IconName;
  title: string;
  sub: string;
  rows: Row[];
  extraA?: number;
  badge?: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ f, at, hl0, w, h, icon, title, sub, rows, extraA = 1, badge, footer }) => {
  const fw = w - PILE;
  const fh = h - PILE;
  return (
    <div style={{ position: "relative", width: w, height: h }}>
      {[2, 1].map((k) => (
        <div
          key={k}
          style={{
            position: "absolute",
            left: (k * PILE) / 2,
            top: (k * PILE) / 2,
            width: fw,
            height: fh,
            borderRadius: 22,
            background: k === 2 ? "#1B1F27" : "#1F242D",
            border: `1px solid ${C.line}`,
          }}
        />
      ))}
      <div style={{ position: "absolute", left: 0, top: 0 }}>
        <Frame w={fw} h={fh} kind="plain">
          <div style={{ position: "absolute", left: 26, top: 22, transform: `translateY(${float(f, title.length, 2)}px)` }}>
            <IconTile icon={icon} size={60} />
          </div>
          <div style={{ position: "absolute", left: 104, top: 18, ...TX.title, fontSize: 32, whiteSpace: "nowrap" }}>{title}</div>
          <div style={{ position: "absolute", left: 104, top: 58, ...TX.label, fontSize: 24, color: C.muted, whiteSpace: "nowrap" }}>{sub}</div>
          {badge && <div style={{ position: "absolute", right: 26, top: 22 }}>{badge}</div>}
          {rows.map((r, i) => {
            const enter = eo(f, at + 4 + i * 3, 8);
            const s = hl0 + i * 7;
            const scan = bump(f, s, 18);
            const keep = r.ok ? eo(f, s + 9, 10) : 0;
            const hl = Math.max(scan * 0.8, keep);
            const a = enter * (i >= 2 ? extraA : 1);
            if (a <= 0.002) return null;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: 26,
                  top: ROW0 + i * ROW_STEP,
                  width: fw - 52,
                  height: 54,
                  boxSizing: "border-box",
                  padding: "0 20px",
                  borderRadius: 12,
                  background: `rgba(255,179,0,${0.04 + 0.12 * hl})`,
                  boxShadow: `inset 4px 0 0 rgba(255,179,0,${0.18 + 0.82 * hl})`,
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  opacity: a,
                  transform: `translateX(${(1 - enter) * 20}px)`,
                }}
              >
                <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 24, color: hl > 0.4 ? C.accent : C.muted, width: 104, flex: "none", whiteSpace: "nowrap" }}>{r.v}</span>
                <span style={{ ...TX.label, fontSize: 24, flex: 1, whiteSpace: "nowrap" }}>{r.t}</span>
                {r.ok ? (
                  keep > 0.01 && (
                    <span style={{ display: "flex", alignItems: "center", gap: 10, opacity: Math.min(1, keep * 1.5) }}>
                      <CheckBadge f={f} start={s + 9} size={34} ring={false} />
                      <span style={{ ...TX.label, fontSize: 24, color: C.ok }}>решено</span>
                    </span>
                  )
                ) : (
                  <span style={{ fontFamily: MONO, fontSize: 24, color: C.muted, whiteSpace: "nowrap" }}>{r.n}</span>
                )}
              </div>
            );
          })}
          {footer && <div style={{ position: "absolute", left: 26, right: 26, top: fh - 74, opacity: extraA }}>{footer}</div>}
        </Frame>
      </div>
    </div>
  );
};

// ── страница B ───────────────────────────────────────────────────────────────────────────────
const RULE_A = ["Не", "неси", "проблему", "—", "принеси"];

const RuleCard: React.FC<{ f: number; a: number; wPri: number }> = ({ f, a, wPri }) => {
  const word = (i: number) => sp(f, a + 4 + i * 3, "snap");
  const under = eo(f, wPri, 14);
  const pk = word(RULE_A.length);
  return (
    <Frame w={1640} h={BH} kind="plain" glow={glowWin(f, a, a + 26, 0.35)}>
      <div style={{ position: "absolute", left: 34, top: 38, transform: `translateY(${float(f, 5, 3)}px)` }}>
        <IconTile icon="doc" size={104} />
      </div>
      <div style={{ position: "absolute", left: 168, top: 30, ...TX.kicker, color: C.accent, whiteSpace: "nowrap" }}>ПРАВИЛО · В НАСТРОЙКАХ АГЕНТА</div>
      <div style={{ position: "absolute", left: 168, top: 72, display: "flex", gap: 16, alignItems: "baseline", whiteSpace: "nowrap" }}>
        {RULE_A.map((t, i) => {
          const p = word(i);
          return (
            <span key={i} style={{ ...TX.title, fontSize: 52, opacity: Math.min(1, p * 1.6), transform: `translateY(${(1 - p) * 26}px)`, display: "inline-block" }}>
              {t}
            </span>
          );
        })}
        <span style={{ position: "relative", display: "inline-block", ...TX.title, fontSize: 52, color: C.accent, opacity: Math.min(1, pk * 1.6), transform: `translateY(${(1 - pk) * 26}px)` }}>
          три решения
          <span style={{ position: "absolute", left: 0, right: 0, bottom: -8, height: 6, borderRadius: 3, background: C.accent, transformOrigin: "0 50%", transform: `scaleX(${under})` }} />
        </span>
      </div>
    </Frame>
  );
};

const TrapCard: React.FC<{ f: number; a: number }> = ({ f, a }) => {
  const pb = sp(f, a + 6, "pop");
  const pu = sp(f, a + 16, "pop");
  return (
    <Frame w={1640} h={MH} kind="plain">
      <Kicker icon="warn" text="БЕЗ ПРАВИЛА — ЛОВУШКА" color={C.muted} iconColor={C.err} />
      <div style={{ position: "absolute", left: 34, top: 96, transform: `translateY(${float(f, 1, 3)}px)` }}>
        <Avatar size={110} icon="bot" ring={C.muted} tone={C.muted} />
      </div>
      {pb > 0.002 && (
        <div style={{ position: "absolute", left: 170, top: 106, display: "flex", alignItems: "center", gap: 22, opacity: Math.min(1, pb * 1.6), transform: `translateX(${(1 - pb) * -24}px)` }}>
          <Bubble size={32} maxW={760}>
            «липсинк кривой, не получилось»
          </Bubble>
          <CrossBadge f={f} start={a + 26} size={64} />
        </div>
      )}
      {pu > 0.002 && (
        <div style={{ position: "absolute", right: 34, top: 96, display: "flex", alignItems: "center", gap: 24, opacity: Math.min(1, pu * 1.6), transform: `translateX(${(1 - pu) * 24}px)` }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ ...TX.label, fontSize: 28, color: C.muted, whiteSpace: "nowrap" }}>и смотрит на вас:</div>
            <div style={{ ...TX.title, fontSize: 44, whiteSpace: "nowrap", marginTop: 4 }}>«Решай»</div>
          </div>
          <Avatar size={110} icon="user" />
        </div>
      )}
    </Frame>
  );
};

const OPTS = [
  { t: "Сменить модель", s: "быстро, но другой стиль" },
  { t: "Дообучить нюанс", s: "точнее всего, без смены" },
  { t: "Обходной путь", s: "надёжно, но дольше" },
];
const OPT_W = 520;
const OPT_X = [140, 700, 1260];

const OptionCard: React.FC<{ f: number; i: number; wVyb: number; wOdin: number; wSled: number }> = ({ f, i, wVyb, wOdin, wSled }) => {
  const sel = i === 1;
  const g = sel ? glowWin(f, wVyb, wVyb + 24, 0.7) : 0;
  const dim = sel ? 0 : 0.5 * eo(f, wVyb, 12);
  const c1 = sp(f, wOdin, "bouncy");
  const c2 = sp(f, wSled, "bouncy");
  return (
    <Frame w={OPT_W} h={MH} kind="plain" glow={g}>
      <div style={{ position: "absolute", inset: 0, opacity: 1 - dim }}>
        <Label x={30} y={26} text={`ВАРИАНТ ${i + 1}`} color={sel && g > 0.3 ? C.accent : C.muted} />
        <div style={{ position: "absolute", left: 30, top: 70, ...TX.title, fontSize: 36, whiteSpace: "nowrap" }}>{OPTS[i].t}</div>
        <div style={{ position: "absolute", left: 30, top: 122, ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap" }}>{OPTS[i].s}</div>
      </div>
      {sel && (
        <>
          <div style={{ position: "absolute", right: 26, top: 22 }}>
            <CheckBadge f={f} start={wVyb + 2} size={60} />
          </div>
          <div style={{ position: "absolute", left: 30, top: 178, display: "flex", gap: 12 }}>
            {c1 > 0.002 && (
              <div style={{ opacity: Math.min(1, c1 * 1.6), transform: `translateY(${(1 - c1) * 14}px)` }}>
                <Chip text="один раз" icon="check" tone="accent" size={24} />
              </div>
            )}
            {c2 > 0.002 && (
              <div style={{ opacity: Math.min(1, c2 * 1.6), transform: `translateY(${(1 - c2) * 14}px)` }}>
                <Chip text="дальше — сам" icon="bot" tone="surface" size={24} />
              </div>
            )}
          </div>
        </>
      )}
    </Frame>
  );
};

// ═══ сцена ═══════════════════════════════════════════════════════════════════════════════════
export const Forums: React.FC<SceneProps> = ({ f, b, w }) => {
  const [b0, b1, b2, b3, b4, b5, b6, b7] = b;

  // слова раздела (кадры)
  const wK = w("крутите");
  const wRaz = w("раз");
  const wOtp = w("отправьте");
  const wNai = w("найди");
  const wNed = w("неделю");
  const wDoo = w("дообучена");
  const wPri = w("принеси");
  const wVyb = w("выберу");
  const wOdin = w("один");
  const wSled = w("следующий");

  // ── страница A ──
  const qA = 1 - safeExitAlpha(f, b5);
  const pW = sp(f, b0, "heavy");
  const qW = 1 - safeExitAlpha(f, b2);
  const pP = sp(f, b0 + 6, "pop");
  const glowP = f < b4 ? glowWin(f, b1, b1 + 24, 0.25) * (1 - eo(f, b4 - 4, 8)) : glowWin(f, wDoo, wDoo + 22, 0.3);
  const p1 = sp(f, b2 + 7, "pop");
  const shrink = eio(f, b3 - 6, 14); // освобождаем низ чуть заранее, чтобы вторая стопка встала на слово
  const s1h = mix(R.h, HALF, shrink);
  const extra = 1 - eo(f, b3 - 10, 6);
  const p2 = sp(f, b3 + 2, "heavy");
  const pBadge = sp(f, b3 + 10, "bouncy");
  const a1 = eo(f, b2 + 2, 12);
  const a2 = eo(f, b3 + 4, 12);
  const fly = lin(f, b2 + 3, 22);

  // ── страница B ──
  const pRule = sp(f, b5 + 3, "snap");
  const pTrap = sp(f, b5 + 9, "pop");
  const qTrap = 1 - safeExitAlpha(f, b6);
  const pBdg = sp(f, b7, "stamp");
  const pTxt = eo(f, b7 + 12, 12);
  const ring7 = lin(f, b7 + 4, 18);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* ── шапка: заголовок слева, чипы справа (alignItems: flex-start) ── */}
      <div style={{ position: "absolute", left: 140, top: 130, width: 1640, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ position: "relative", width: 1160, height: 86 }}>
          <HeadText f={f} a={b0} z={b5} kicker="ЗАСТРЯЛИ НА ПРОБЛЕМЕ?" title="Не крутите промпт — отправьте агента на форумы" />
          <HeadText f={f} a={b5 + 2} kicker="КЛАССИЧЕСКАЯ ЛОВУШКА" title="Агент приносит проблему, а не решение" />
        </div>
        <div style={{ position: "relative", width: 440, height: 52 }}>
          <ChipSlot f={f} a={b0 + 8} z={b2}>
            <Chip text="агент застрял" icon="warn" tone="err" />
          </ChipSlot>
          <ChipSlot f={f} a={b2 + 4} z={b4}>
            <Chip text="агент ищет решения" icon="search" tone="outline" />
          </ChipSlot>
          <ChipSlot f={f} a={b4 + 4} z={b5}>
            <Chip text="решение найдено" icon="check" tone="ok" />
          </ChipSlot>
          <ChipSlot f={f} a={b5 + 8}>
            <Chip text="настройки агента" icon="gear" tone="surface" />
          </ChipSlot>
        </div>
      </div>

      {/* ══ страница A ══ */}
      {qA < 0.998 && (
        <div style={{ position: "absolute", inset: 0, opacity: 1 - qA, transform: `translateY(${-30 * qA}px)` }}>
          {/* мир агента: стена */}
          <Pop x={R.x} y={R.y} w={R.w} h={R.h} p={pW} q={qW} from="above" d={50}>
            <WallCard f={f} c0={b0 + 10} />
          </Pop>

          {/* стопка 1: форумы (во всю высоту, на «китайские» сжимается вверх) */}
          <Pop x={R.x} y={R.y} w={R.w} h={s1h} p={p1} from="right" d={70}>
            <Stack
              f={f}
              at={b2 + 7}
              hl0={b2 + 16}
              w={R.w}
              h={s1h}
              icon="chat"
              title="Форумы"
              sub="ветки и обсуждения"
              rows={FORUM}
              extraA={extra}
              footer={
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 14, ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap" }}>
                    агент читает ветки <Dots f={f} size={10} />
                  </span>
                  <span style={{ ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap" }}>
                    <Count v={mix(0, 240, eio(f, b2 + 12, 120))} style={{ color: C.accent, fontSize: 30 }} /> веток
                  </span>
                </div>
              }
            />
          </Pop>

          {/* стопка 2: китайские форумы */}
          <Pop x={R.x} y={S2Y} w={R.w} h={HALF} p={p2} from="below" d={50}>
            <Stack
              f={f}
              at={b3 + 2}
              hl0={b3 + 14}
              w={R.w}
              h={HALF}
              icon="globe"
              title="Китайские форумы"
              sub="агент читает в переводе"
              rows={CHINA}
              badge={
                pBadge > 0.002 ? (
                  <div style={{ opacity: Math.min(1, pBadge * 1.6), transform: `translateY(${(1 - pBadge) * -14}px)` }}>
                    <Chip text="раньше всех" icon="zap" tone="accent" />
                  </div>
                ) : null
              }
            />
          </Pop>

          {/* стрелки «ваш стол» → форумы */}
          <Overlay>
            <ArrowPath x1={772} y1={380} x2={846} y2={380} p={a1} width={6} />
            <ArrowPath x1={772} y1={560} x2={846} y2={676} p={a2} width={6} bend={-18} />
          </Overlay>

          {/* «ваш стол» */}
          <Pop x={L.x} y={L.y} w={L.w} h={L.h} p={pP} from="left" d={50}>
            <Frame w={L.w} h={L.h} kind="plain" glow={glowP}>
              <Slide f={f} a={b0 + 6} z={b1 - 6} dy={16}>
                <PromptLoop f={f} wK={wK} wRaz={wRaz} />
              </Slide>
              <Slide f={f} a={b1 + 2} z={b4 - 6} dy={16}>
                <Formulation f={f} a={b1} wNai={wNai} wOtp={wOtp} z={b4} />
              </Slide>
              <Slide f={f} a={b4 + 2} dy={16}>
                <TimeVsWeek f={f} a={b4} wNed={wNed} wDoo={wDoo} />
              </Slide>
            </Frame>
          </Pop>

          {/* задача улетает к форумам */}
          <Flyer t={fly} ax={318} ay={744} bx={916} by={302} arc={140}>
            <IconTile icon="doc" size={56} bg={C.surface} ring={C.accent} />
          </Flyer>
        </div>
      )}

      {/* ══ страница B ══ */}
      <Pop x={140} y={BY} w={1640} h={BH} p={pRule} from="above" d={40}>
        <RuleCard f={f} a={b5 + 3} wPri={wPri} />
      </Pop>

      <Pop x={140} y={MY} w={1640} h={MH} p={pTrap} q={qTrap} from="below" d={40}>
        <TrapCard f={f} a={b5 + 9} />
      </Pop>

      {OPT_X.map((x, i) => {
        const p = sp(f, b6 + 5 + i * 5, i === 1 ? "heavy" : "pop");
        const lift = i === 1 ? -10 * eo(f, wVyb, 14) : 0;
        return (
          <Pop key={i} x={x} y={MY + lift} w={OPT_W} h={MH} p={p} from="below" d={50}>
            <OptionCard f={f} i={i} wVyb={wVyb} wOdin={wOdin} wSled={wSled} />
          </Pop>
        );
      })}

      {pBdg > 0.002 && (
        <div style={{ position: "absolute", left: 140, top: BADGE_Y, width: 1640, height: 68, display: "flex", alignItems: "center", justifyContent: "center", gap: 30 }}>
          <div style={{ position: "relative", opacity: Math.min(1, pBdg * 2), transform: `translateY(${(1 - pBdg) * -20}px)` }}>
            <div
              style={{
                position: "absolute",
                inset: -4 - 14 * ring7,
                borderRadius: 48,
                border: `3px solid ${C.accent}`,
                opacity: ring7 > 0 && ring7 < 1 ? 0.7 * (1 - ring7) : 0,
              }}
            />
            <Chip text="проактивный агент" icon="zap" tone="accent" size={32} />
          </div>
          <div style={{ opacity: pTxt, transform: `translateX(${(1 - pTxt) * 24}px)`, ...TX.label, fontSize: 34, whiteSpace: "nowrap" }}>
            разница — всего лишь <span style={{ color: C.accent }}>в правилах</span>
          </div>
        </div>
      )}
    </div>
  );
};
