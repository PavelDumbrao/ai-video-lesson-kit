import React, { CSSProperties } from "react";
import { interpolateColors } from "remotion";
import { C, MONO } from "../../../theme";
import { blink, bump, clamp01, ei, eio, eo, float, hash, lin, mix, smooth, sp } from "../../anim";
import { Icon, IconName } from "../../icons";
import { TypeText } from "../../text";
import { SceneProps } from "../../types";
import { Bubble, CheckBadge, Chip, Frame, glowWin, Pop, Ripple, shadow, StatusIcon, Strike, TX } from "../../ui";
import { Burst, DrawPath, PulseDot } from "../../viz";
import { At, CrossBadge, IconTile } from "../kit";

// «Слой первый: сценарий» (раздел 3, 126,56–185,28 с). Лица нет — вся сцена графика, пять страниц:
// 1) роли: «агент пишет текст» · «вы — архитектор смысла» → карточки складываются вверх, снизу контекст
//    (аудитория · боль · действие); 2) крупная цитата «стиль повествования» → сужается влево, справа список
//    «оставить обязательно» (топор · узкое горлышко · словечки) → «обездушенная выжимка ✗» → «душа ✓»;
// 3) таймлайн 2 часа: вода и сбои выпадают серыми кусками, фразы автора съезжаются в 13 минут;
// 4) один промпт → три модели → три разных текста, Gemini подсвечен с пометками «усмехнуться», «шёпот»;
// 5) глаз читает сценарий → «хорош? плох?» → «не понял — смотри видеоряд».

type W = SceneProps["w"];

const ZX = 140; // scene zone x 140–1780
const ZW = 1640;
const CY = 250; // content container y 250–820
const CH = 570;

/** 1 while an element lives; eases to 0 over the ~10 frames before the next beat; no next beat → never fades. */
const safeExitAlpha = (f: number, bNext?: number, dur = 10) =>
  bNext === undefined || !Number.isFinite(bNext) ? 1 : 1 - ei(f, bNext - dur, dur);

const kick: CSSProperties = { ...TX.kicker, lineHeight: 1, whiteSpace: "nowrap" };
const plaque: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "14px 20px",
  borderRadius: 14,
  background: C.surface2,
  border: `1px solid ${C.line}`,
};

/** A page of the scene: visible from `a`, leaves smoothly right before `z` (the next page's beat). */
const Act: React.FC<{ f: number; a: number; z?: number; children?: React.ReactNode }> = ({ f, a, z, children }) => {
  if (f < a - 1) return null;
  const al = safeExitAlpha(f, z);
  if (al <= 0.001) return null;
  const q = 1 - al;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: al, transform: q > 0 ? `translateY(${-26 * q}px)` : undefined }}>
      {children}
    </div>
  );
};

/** Card body with a size that may animate (the caller places it, e.g. inside <Pop>). */
const Panel: React.FC<{ w: number; h: number; glow?: number; style?: CSSProperties; children?: React.ReactNode }> = ({
  w,
  h,
  glow = 0,
  style,
  children,
}) => (
  <div
    style={{
      position: "relative",
      width: w,
      height: h,
      borderRadius: 22,
      background: C.surface,
      border: `1px solid ${C.line}`,
      boxShadow: shadow(glow),
      overflow: "hidden",
      ...style,
    }}
  >
    {children}
  </div>
);

/** Scene header: kicker with page dots + title (≤ 38 px) on the left, chips on the right (top-aligned). */
const Head: React.FC<{ f: number; at: number; step: number; kicker: string; title: string; chips?: React.ReactNode }> = ({
  f,
  at,
  step,
  kicker,
  title,
  chips,
}) => {
  const p = sp(f, at, "snap");
  if (p <= 0.002) return null;
  const rise = eo(f, at + 2, 16);
  return (
    <div style={{ position: "absolute", left: ZX, top: 130, width: ZW, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 30 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, opacity: Math.min(1, p * 1.6), transform: `translateX(${(1 - p) * -24}px)` }}>
          <span style={{ ...kick, color: C.accent }}>{kicker}</span>
          <div style={{ display: "flex", gap: 6 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  width: i === step ? 30 : 14,
                  height: 6,
                  borderRadius: 3,
                  background: i === step ? C.accent : i < step ? "rgba(255,179,0,0.45)" : "rgba(154,160,170,0.3)",
                }}
              />
            ))}
          </div>
        </div>
        <div style={{ overflow: "hidden", marginTop: 8, paddingBottom: 4 }}>
          <div style={{ ...TX.title, fontSize: 38, lineHeight: 1.2, whiteSpace: "nowrap", transform: `translateY(${(1 - rise) * 110}%)` }}>{title}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flex: "none" }}>{chips}</div>
    </div>
  );
};

/** Header chip that drops in at `at`. */
const ChipAt: React.FC<{ f: number; at: number; children?: React.ReactNode }> = ({ f, at, children }) => {
  const p = sp(f, at, "bouncy");
  if (p <= 0.002) return null;
  return <div style={{ opacity: Math.min(1, p * 1.6), transform: `translateY(${(1 - p) * -14}px)` }}>{children}</div>;
};

/** Two chips in one grid cell (always both laid out → no width jump); `second` replaces `first` at `b`. */
const ChipSwap: React.FC<{ f: number; a: number; b: number; first: React.ReactNode; second: React.ReactNode }> = ({ f, a, b, first, second }) => {
  const p = sp(f, a, "bouncy");
  if (p <= 0.002) return null;
  const so = eio(f, b, 8); // the old one is gone before the new one shows — never two texts on top of each other
  const si = eio(f, b + 7, 10);
  return (
    <div style={{ display: "grid", justifyItems: "end", opacity: Math.min(1, p * 1.6), transform: `translateY(${(1 - p) * -14}px)` }}>
      <div style={{ gridArea: "1 / 1", opacity: 1 - so, transform: `translateY(${-12 * so}px)` }}>{first}</div>
      <div style={{ gridArea: "1 / 1", opacity: si, transform: `translateY(${12 * (1 - si)}px)` }}>{second}</div>
    </div>
  );
};

/** Legend chip: shows dim at `at`, lights up when the voice names it at `on`. */
const Lit: React.FC<{ f: number; at: number; on: number; children?: React.ReactNode }> = ({ f, at, on, children }) => {
  const p = sp(f, at, "snap");
  if (p <= 0.002) return null;
  const l = eo(f, on, 10);
  return (
    <div style={{ opacity: Math.min(1, p * 1.6) * (0.36 + 0.64 * l), transform: `translateY(${(1 - p) * 14 - 6 * bump(f, on, 14)}px)` }}>{children}</div>
  );
};

// ═══ page 1: roles + context ════════════════════════════════════════════════════════════════════════════════
const BARS = [600, 700, 540, 672, 590, 430, 690, 360];
const BLUE = ["цель", "контекст", "стиль"];
const CTX: { icon: IconName; title: string; sub: string }[] = [
  { icon: "team", title: "Аудитория", sub: "кто будет смотреть" },
  { icon: "flame", title: "Боль", sub: "что у зрителя болит" },
  { icon: "cursor", title: "Действие", sub: "что сделать после просмотра" },
];

const Roles: React.FC<{ f: number; t0: number; b: number[]; w: W }> = ({ f, t0, b, w }) => {
  const [b0, b1, b2] = b;
  const aA = t0 + 2;
  const k = eio(f, b1 - 22, 20); // the role cards fold up to make room for the context row
  const rh = mix(CH, 216, k);
  const low = 1 - clamp01(k * 1.8);
  const plY = mix(CH - 26 - 64, 130, k);
  const wTask = w("задача");
  const wRes = w("результат");
  const ctxAt = [w("аудитория"), w("боль"), w("сделать")];
  const barStart = (i: number) => aA + 10 + i * 10;
  let cur = -1;
  BARS.forEach((_, i) => {
    if (f >= barStart(i)) cur = i;
  });
  const pT = sp(f, wTask, "snap");
  const resC = interpolateColors(eo(f, wRes, 8), [0, 1], [C.text, C.accent]);
  return (
    <>
      <Head
        f={f}
        at={t0}
        step={0}
        kicker="Сценарий · роли"
        title="Агент пишет — смысл задаёте вы"
        chips={
          <>
            <ChipAt f={f} at={b1}>
              <Chip text="весь контекст" icon="plus" tone="outline" />
            </ChipAt>
            <ChipAt f={f} at={t0 + 6}>
              <Chip text="сценарий.md" icon="doc" />
            </ChipAt>
          </>
        }
      />
      {/* agent */}
      <Pop x={ZX} y={CY + float(f, 1, 3, 120)} w={800} h={rh} p={sp(f, aA, "pop")} from="left" d={60} s0={0.96}>
        <Panel w={800} h={rh}>
          <At x={34} y={30}>
            <IconTile icon="bot" size={72} />
          </At>
          <At x={128} y={30} style={kick}>
            Агент
          </At>
          <At x={128} y={62} style={{ ...TX.title, fontSize: 40, whiteSpace: "nowrap" }}>
            пишет текст
          </At>
          {low > 0.01 && (
            <At x={34} y={150} w={732} h={300} style={{ opacity: low }}>
              {BARS.map((bw, i) => {
                const g = eo(f, barStart(i), 14);
                return g > 0 ? (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: 0,
                      top: i * 38,
                      width: bw * g,
                      height: 14,
                      borderRadius: 7,
                      background: i === 0 ? "rgba(255,179,0,0.6)" : "rgba(243,239,230,0.16)",
                    }}
                  />
                ) : null;
              })}
              {cur >= 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: BARS[cur] * eo(f, barStart(cur), 14) + 10,
                    top: cur * 38 - 6,
                    width: 12,
                    height: 26,
                    borderRadius: 3,
                    background: C.accent,
                    opacity: f < barStart(cur) + 14 ? 1 : blink(f),
                  }}
                />
              )}
            </At>
          )}
          <At x={34} y={plY}>
            <div style={plaque}>
              <StatusIcon s="run" f={f} size={30} />
              <span style={{ fontFamily: MONO, fontSize: 26, color: C.text, whiteSpace: "nowrap" }}>сценарий.md · пишется…</span>
            </div>
          </At>
        </Panel>
      </Pop>
      {/* architect */}
      <Pop x={980} y={CY + float(f, 2, 3, 130)} w={800} h={rh} p={sp(f, b0, "pop")} from="right" d={60} s0={0.96}>
        <Panel w={800} h={rh} glow={0.5 * glowWin(f, b0 + 4, b0 + 40, 0)}>
          <At x={34} y={30}>
            <IconTile icon="brain" size={72} />
          </At>
          <At x={128} y={30} style={kick}>
            Вы
          </At>
          <At x={128} y={62} style={{ ...TX.title, fontSize: 40, whiteSpace: "nowrap" }}>
            архитектор смысла
          </At>
          {low > 0.01 && (
            <At
              x={34}
              y={140}
              w={732}
              h={310}
              style={{
                opacity: low,
                borderRadius: 14,
                backgroundImage:
                  "linear-gradient(rgba(243,239,230,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(243,239,230,0.045) 1px, transparent 1px)",
                backgroundSize: "36px 36px",
              }}
            >
              {BLUE.map((t, i) => {
                const p = sp(f, b0 + 8 + i * 6, "snap");
                const hl = i === 0 ? eo(f, wTask, 10) : 0;
                return (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: i * 266,
                      top: 119,
                      width: 200,
                      height: 72,
                      boxSizing: "border-box",
                      borderRadius: 14,
                      border: `2px ${hl > 0.5 ? "solid" : "dashed"} rgba(255,179,0,${0.5 + 0.5 * hl})`,
                      background: `rgba(255,179,0,${0.04 + 0.14 * hl})`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: MONO,
                      fontWeight: 700,
                      fontSize: 26,
                      color: hl > 0.5 ? C.accent : C.text,
                      opacity: Math.min(1, p * 1.6),
                      transform: `translateY(${(1 - p) * 20}px)`,
                    }}
                  >
                    {t}
                  </div>
                );
              })}
              <svg width={732} height={310} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
                {[0, 1].map((i) => {
                  const x1 = i * 266 + 212;
                  const x2 = (i + 1) * 266 - 12;
                  return (
                    <DrawPath
                      key={i}
                      d={`M${x1} 155 L${x2} 155 M${x2 - 12} 144 L${x2} 155 L${x2 - 12} 166`}
                      p={eo(f, b0 + 14 + i * 6, 10)}
                      width={3}
                      color="rgba(255,179,0,0.75)"
                    />
                  );
                })}
              </svg>
            </At>
          )}
          {pT > 0.002 && (
            <At x={34} y={plY}>
              <div style={{ ...plaque, opacity: Math.min(1, pT * 1.6), transform: `translateY(${(1 - pT) * 18}px)` }}>
                <Icon name="target" size={32} color={C.accent} sw={3.6} />
                <span style={{ ...TX.label, fontSize: 26, whiteSpace: "nowrap" }}>
                  Задача — <span style={{ color: resC }}>результат на выходе</span>
                </span>
              </div>
            </At>
          )}
        </Panel>
      </Pop>
      {/* context row */}
      {CTX.map((c, i) => {
        const a = ctxAt[i];
        const z = i < 2 ? ctxAt[i + 1] : b2;
        const on = eo(f, a, 10);
        return (
          <Pop key={i} x={ZX + i * 558} y={496 + float(f, 3 + i, 3, 115)} w={524} h={324} p={sp(f, b1 + i * 5, "pop")} from="below" d={50} s0={0.96}>
            <Panel w={524} h={324} glow={glowWin(f, a, z, 0.22)}>
              <At x={34} y={30}>
                <IconTile icon={c.icon} size={72} />
              </At>
              <At x={126} y={47} style={{ ...TX.title, fontSize: 36, whiteSpace: "nowrap" }}>
                {c.title}
              </At>
              <At x={420} y={44} w={70} style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, color: C.muted, textAlign: "right" }}>
                {`0${i + 1}`}
              </At>
              <At x={34} y={130} w={456} style={{ ...TX.label, fontSize: 28, lineHeight: 1.3, color: interpolateColors(on, [0, 1], [C.muted, C.text]) }}>
                {c.sub}
              </At>
              <At x={442} y={242}>
                <CheckBadge f={f} start={a + 4} size={52} />
              </At>
            </Panel>
          </Pop>
        );
      })}
    </>
  );
};

// ═══ page 2: «стиль повествования» + keep-list + soul ═══════════════════════════════════════════════════════
const KEEP: { icon: IconName; text: string }[] = [
  { icon: "axe", text: "про топор" },
  { icon: "hourglass", text: "про узкое горлышко" },
  { icon: "chat", text: "про словечки" },
];

const Style: React.FC<{ f: number; b: number[]; w: W }> = ({ f, b, w }) => {
  const b2 = b[2];
  const b3 = b[3];
  const b4 = b[4];
  const wStyle = w("стиль");
  const wNarr = w("повествования");
  const wSay = w("говорю");
  const kN = eio(f, Math.min(w("агенту"), b3 - 26), 26); // the quote card narrows to the left column
  const qW = mix(ZW, 760, kN);
  const wObez = w("обездушенная");
  const wWant = w("хочу");
  const kL = eio(f, w("иначе"), 16); // the keep-list folds up to free the bottom row
  const lH = mix(CH, 316, kL);
  const rowsAt = [w("топор"), w("узкое"), w("словечки")];
  const ph = (((f - b4) % 32) + 32) % 32;
  const hb = f < b4 ? 0 : bump(ph, 0, 9) + 0.55 * bump(ph, 9, 9); // heartbeat
  const pSay = sp(f, wSay, "snap");
  return (
    <>
      <Head
        f={f}
        at={b2}
        step={1}
        kicker="Сценарий · промпт"
        title="Стиль повествования и ваши реплики"
        chips={
          <ChipSwap
            f={f}
            a={b2 + 6}
            b={w("слышите")}
            first={<Chip text="два волшебных слова" icon="wand" />}
            second={<Chip text="этот текст вы слышите" icon="wave" tone="outline" />}
          />
        }
      />
      {/* the big quote */}
      <Pop x={ZX} y={CY + float(f, 6, 3, 125)} w={qW} h={CH} p={sp(f, b2, "heavy")} from="below" d={70} s0={0.96}>
        <Panel w={qW} h={CH}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 40, display: "flex", justifyContent: "center", alignItems: "center", gap: 14 }}>
            <Icon name="wand" size={34} color={C.accent} sw={3.6} />
            <span style={{ ...kick, color: C.accent }}>Два волшебных слова</span>
          </div>
          <div style={{ position: "absolute", left: qW / 2 - 330, top: 70, opacity: 0.16 }}>
            <Icon name="quote" size={110} color={C.accent} />
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 124, textAlign: "center" }}>
            {["«Стиль", "повествования»"].map((t, i) => {
              const r = eo(f, i ? wNarr : wStyle, 16);
              return (
                <div key={i} style={{ overflow: "hidden", height: 76 }}>
                  <div
                    style={{
                      ...TX.title,
                      fontSize: 64,
                      lineHeight: "76px",
                      whiteSpace: "nowrap",
                      color: i ? C.accent : C.text,
                      opacity: r > 0 ? 1 : 0,
                      transform: `translateY(${(1 - r) * 105}%)`,
                    }}
                  >
                    {t}
                  </div>
                </div>
              );
            })}
          </div>
          <svg width={600} height={44} style={{ position: "absolute", left: qW / 2 - 300, top: 284, overflow: "visible" }}>
            <DrawPath d="M20 28 C 160 6, 320 8, 440 20 S 560 34, 580 14" p={eo(f, wNarr + 12, 18)} width={6} />
          </svg>
          {pSay > 0.002 && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 352,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
                opacity: Math.min(1, pSay * 1.6),
                transform: `translateY(${(1 - pSay) * 24}px)`,
              }}
            >
              <div style={{ ...TX.label, fontSize: 26, color: C.muted }}>Я говорю агенту:</div>
              <Bubble me size={28} maxW={600} style={{ textAlign: "center" }}>
                Мои реплики — оставлять обязательно
              </Bubble>
            </div>
          )}
        </Panel>
      </Pop>
      {/* keep-list */}
      <Pop x={940} y={CY + float(f, 7, 3, 118)} w={840} h={lH} p={sp(f, b3, "pop")} from="right" d={70} s0={0.96}>
        <Panel w={840} h={lH}>
          <At x={34} y={30} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Icon name="lock" size={30} color={C.accent} sw={3.6} />
            <span style={{ ...kick, color: C.accent }}>Оставить обязательно</span>
          </At>
          {KEEP.map((r, i) => {
            const y = mix(110 + i * 150, 82 + i * 72, kL);
            const slot = eo(f, b3 + 6 + i * 4, 10);
            const pr = sp(f, rowsAt[i], "snap");
            const lk = sp(f, rowsAt[i] + 6, "bouncy");
            return (
              <At key={i} x={34} y={y} w={772} h={66}>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 14,
                    border: "2px dashed rgba(154,160,170,0.35)",
                    opacity: slot * (1 - Math.min(1, pr * 1.6)),
                  }}
                />
                {pr > 0.002 && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      padding: "0 20px",
                      borderRadius: 14,
                      background: C.surface2,
                      border: `1px solid ${C.line}`,
                      opacity: Math.min(1, pr * 1.6),
                      transform: `translateX(${(1 - pr) * 40}px)`,
                    }}
                  >
                    <Icon name={r.icon} size={36} color={C.accent} sw={3.6} />
                    <span style={{ ...TX.label, fontSize: 30, whiteSpace: "nowrap" }}>{r.text}</span>
                    <div style={{ marginLeft: "auto", transform: `scale(${lk})`, opacity: Math.min(1, lk * 2) }}>
                      <Icon name="lock" size={32} color={C.accent} sw={3.6} />
                    </div>
                  </div>
                )}
              </At>
            );
          })}
        </Panel>
      </Pop>
      {/* «обездушенная выжимка» ✗ */}
      <Pop x={940} y={596 + float(f, 8, 3, 112)} w={370} h={224} p={sp(f, wObez, "snap")} from="below" d={40} s0={0.96}>
        <Panel w={370} h={224} style={{ background: C.surface2, border: "2px dashed rgba(154,160,170,0.45)" }}>
          <At x={26} y={26}>
            <CrossBadge f={f} start={wObez + 4} size={48} />
          </At>
          <svg width={240} height={44} style={{ position: "absolute", left: 96, top: 28, overflow: "visible" }}>
            <DrawPath d="M0 22 L56 22 L68 6 L80 38 L92 22 L236 22" p={eo(f, wObez + 6, 36)} width={4} color={C.muted} />
          </svg>
          <At x={26} y={96} w={318} h={80} style={{ opacity: mix(1, 0.6, eo(f, b4, 12)) }}>
            <div style={{ ...TX.label, fontSize: 32, lineHeight: 1.2, color: C.muted }}>
              обездушенная
              <br />
              выжимка
            </div>
            <Strike w={250} h={80} p={eo(f, b4, 12)} width={6} />
          </At>
        </Panel>
      </Pop>
      {f >= wWant && (
        <At x={1325} y={680} style={{ opacity: eo(f, wWant, 10), transform: `translateX(${(1 - eo(f, wWant, 14)) * -24}px)` }}>
          <Icon name="arrow" size={56} color={C.accent} sw={4} />
        </At>
      )}
      <At
        x={1400}
        y={596}
        w={380}
        h={224}
        style={{ boxSizing: "border-box", borderRadius: 22, border: "2px dashed rgba(255,179,0,0.45)", opacity: eo(f, wWant, 10) * (1 - eo(f, b4, 6)) }}
      />
      {/* «душа» ✓ */}
      <Pop x={1400} y={596 + float(f, 9, 3, 108)} w={380} h={224} p={sp(f, b4, "pop")} from="right" d={50} s0={0.96}>
        <Panel w={380} h={224} glow={0.5 + 0.4 * hb}>
          <At x={30} y={26} style={{ transform: `scale(${1 + 0.12 * hb})` }}>
            <Icon name="heart" size={56} color={C.accent} />
          </At>
          <At x={306} y={26}>
            <CheckBadge f={f} start={b4 + 6} size={48} />
          </At>
          <At x={30} y={96} style={{ ...TX.title, fontSize: 56, color: C.accent, whiteSpace: "nowrap" }}>
            душа
          </At>
          <At x={30} y={166} style={{ ...TX.label, fontSize: 26, whiteSpace: "nowrap" }}>
            осталась в ролике
          </At>
        </Panel>
      </Pop>
      <At x={1430} y={622} w={56} h={56}>
        <Burst f={f} start={b4 + 2} r0={40} r1={96} n={10} />
      </At>
    </>
  );
};

// ═══ page 3: 2 hours → 13 minutes ═══════════════════════════════════════════════════════════════════════════
type SegT = "w" | "x" | "k"; // water · technical failures · kept phrases (minutes; totals 75 + 32 + 13 = 120)
const SEG: [SegT, number][] = [
  ["w", 8], ["k", 2], ["w", 11], ["x", 5], ["k", 2.5], ["w", 9], ["x", 7], ["w", 8], ["k", 2],
  ["w", 12], ["x", 6], ["k", 1.5], ["w", 11], ["x", 8], ["k", 3], ["w", 16], ["x", 6], ["k", 2],
];
const BW = 1572;
const PX = BW / 120;
const RULER: [number, string][] = [
  [0, "0"],
  [30, "30 мин"],
  [60, "1 час"],
  [90, "1,5 часа"],
  [120, "2 часа"],
];
const SEG_BG: Record<SegT, string> = {
  w: "rgba(154,160,170,0.30)",
  x: "repeating-linear-gradient(135deg, rgba(154,160,170,0.58) 0px, rgba(154,160,170,0.58) 8px, rgba(154,160,170,0.26) 8px, rgba(154,160,170,0.26) 16px)",
  k: C.accent,
};

const Cut: React.FC<{ f: number; b: number[]; w: W }> = ({ f, b, w }) => {
  const b5 = b[5];
  const w13 = w("тринадцати");
  const wWater = w("воду");
  const wFail = w("сбои");
  const wPhr = w("фразы");
  const wKept = w("оставил");
  const packAt = wFail + 14;
  const pack = eio(f, packAt, 22);
  const done = eo(f, packAt + 22, 10);
  const kept = eo(f, wPhr, 10);
  let m0 = 0;
  let nw = 0;
  let nx = 0;
  let kOff = 0;
  let removed = 0;
  const segs = SEG.map(([t, m], i) => {
    const x = m0 * PX;
    m0 += m;
    const width = m * PX;
    const fall = t === "w" ? wWater + nw++ * 2 : t === "x" ? wFail + nx++ * 2 : Infinity;
    const kx = kOff;
    if (t === "k") kOff += width;
    else removed += m * eo(f, fall, 16);
    return { t, x, width, fall, kx, i };
  });
  const v = 120 - removed;
  const ST: [number, string][] = [
    [b5 + 8, "читаю расшифровку: 2 часа"],
    [w("ужал"), "ужимаю до 13 минут"],
    [w("выкинул"), "выкидываю воду и сбои"],
    [wKept, "фразы автора — на месте"],
  ];
  let si = 0;
  ST.forEach(([s], i) => {
    if (f >= s) si = i;
  });
  const pC = sp(f, b5 + 4, "pop");
  return (
    <>
      <Head
        f={f}
        at={b5}
        step={2}
        kicker="Сценарий · монтаж текста"
        title="2 часа живого занятия → 13 минут"
        chips={
          <ChipAt f={f} at={b5 + 6}>
            <Chip text="агент режет лишнее" icon="scissors" />
          </ChipAt>
        }
      />
      <Pop x={ZX} y={CY + float(f, 11, 3, 130)} w={ZW} h={CH} p={sp(f, b5, "pop")} from="below" d={50} s0={0.97}>
        <Panel w={ZW} h={CH}>
          <At x={34} y={30} style={{ display: "flex", alignItems: "center", gap: 34 }}>
            <div style={{ marginLeft: 6 }}>
              <PulseDot f={f} start={b5 + 4} size={16} />
            </div>
            <span style={{ ...kick, color: C.accent }}>Живое занятие → сценарий</span>
          </At>
          {/* the counter */}
          <At x={34} y={70} style={{ display: "flex", alignItems: "baseline", gap: 12, opacity: Math.min(1, pC * 1.6), transform: `translateY(${(1 - pC) * 16}px)` }}>
            <span
              style={{
                display: "inline-block",
                width: 132,
                textAlign: "right",
                fontFamily: MONO,
                fontWeight: 700,
                fontSize: 72,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
                color: interpolateColors(done, [0, 1], [C.text, C.accent]),
              }}
            >
              {Math.round(v)}
            </span>
            <span style={{ ...TX.label, fontSize: 36, color: C.muted }}>мин</span>
          </At>
          <At x={34} y={158} style={{ display: "grid", opacity: Math.min(1, pC * 1.6) }}>
            <span style={{ gridArea: "1 / 1", ...TX.label, fontSize: 26, color: C.muted, opacity: 1 - done, whiteSpace: "nowrap" }}>длина живого занятия</span>
            <span style={{ gridArea: "1 / 1", ...TX.label, fontSize: 26, color: C.text, opacity: done, whiteSpace: "nowrap" }}>длина сценария урока</span>
          </At>
          {/* the agent's status line */}
          <At x={BW + 34 - 640} y={30} w={640} h={88} style={{ opacity: eo(f, b5 + 6, 10) }}>
            <div style={{ ...plaque, height: "100%", boxSizing: "border-box", padding: "0 20px", gap: 16 }}>
              <IconTile icon="bot" size={56} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <span style={kick}>Агент</span>
                <div style={{ height: 32 }}>
                  <TypeText
                    key={si}
                    text={ST[si][1]}
                    f={f}
                    start={ST[si][0]}
                    cps={40}
                    style={{ fontFamily: MONO, fontSize: 26, lineHeight: "32px", color: C.text, whiteSpace: "nowrap" }}
                  />
                </div>
              </div>
              <div style={{ marginLeft: "auto" }}>
                <StatusIcon s={si === 3 ? "ok" : "run"} f={f} size={34} />
              </div>
            </div>
          </At>
          {/* target bracket */}
          <At x={34} y={210} style={{ ...TX.label, fontSize: 26, color: C.accent, opacity: eo(f, w13, 10), whiteSpace: "nowrap" }}>
            13 минут
          </At>
          <At
            x={26}
            y={252}
            w={13 * PX + 16}
            h={90}
            style={{ boxSizing: "border-box", borderRadius: 14, border: `3px dashed ${C.accent}`, opacity: eo(f, w13, 10) }}
          />
          {/* the 2-hour track (its dashed ghost stays) */}
          <At x={32} y={260} w={BW} h={70} style={{ borderRadius: 12, border: "2px dashed rgba(154,160,170,0.32)", opacity: eo(f, b5 + 4, 10) }} />
          {segs.map((s) => {
            const ap = eo(f, b5 + 6 + s.i * 1.5, 10);
            let dx = 0;
            let dy = 0;
            let rot = 0;
            let op = ap;
            if (s.t === "k") dx = (s.kx - s.x) * pack;
            else {
              const u = ei(f, s.fall, 20);
              dy = 150 * u;
              rot = (hash(s.i * 3.3) - 0.5) * 30 * u;
              op *= 1 - eo(f, s.fall + 6, 14);
            }
            if (op <= 0.003) return null;
            return (
              <div
                key={s.i}
                style={{
                  position: "absolute",
                  left: 34 + s.x,
                  top: 262,
                  width: s.width,
                  height: 70,
                  borderRadius: 4,
                  background: SEG_BG[s.t],
                  boxShadow:
                    s.t === "k"
                      ? `inset 0 0 0 1px rgba(17,19,24,0.35), 0 0 ${26 * kept}px rgba(255,179,0,${0.55 * kept})`
                      : "inset 0 0 0 1px rgba(17,19,24,0.5)",
                  opacity: op,
                  transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scaleY(${0.35 + 0.65 * ap})`,
                }}
              />
            );
          })}
          <At x={34 + 13 * PX + 30} y={273}>
            <CheckBadge f={f} start={wKept} size={48} />
          </At>
          {/* ruler */}
          <At x={34} y={346} w={BW} h={50} style={{ opacity: eo(f, b5 + 12, 12) }}>
            {RULER.map(([m, t], j) => (
              <React.Fragment key={j}>
                <div style={{ position: "absolute", left: m * PX - 1, top: 0, width: 2, height: 12, background: "rgba(154,160,170,0.5)" }} />
                <div
                  style={{
                    position: "absolute",
                    left: m * PX,
                    top: 18,
                    transform: `translateX(${j === 0 ? 0 : j === RULER.length - 1 ? -100 : -50}%)`,
                    fontFamily: MONO,
                    fontSize: 24,
                    color: j === RULER.length - 1 ? C.text : C.muted,
                    whiteSpace: "nowrap",
                  }}
                >
                  {t}
                </div>
              </React.Fragment>
            ))}
          </At>
          {/* legend */}
          <At x={34} y={470} style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <Lit f={f} at={b5 + 16} on={wWater}>
              <Chip text="вода" icon="drop" tone="muted" size={28} />
            </Lit>
            <Lit f={f} at={b5 + 20} on={wFail}>
              <Chip text="технические сбои" icon="warn" tone="muted" size={28} />
            </Lit>
            <Lit f={f} at={b5 + 24} on={wPhr}>
              <Chip text="мои фразы — оставил" icon="quote" tone="outline" size={28} />
            </Lit>
          </At>
        </Panel>
      </Pop>
    </>
  );
};

// ═══ page 4: one prompt → three models ══════════════════════════════════════════════════════════════════════
const MOD = [
  { name: "Claude", text: "Сценарий пишет агент. Вы задаёте смысл и проверяете результат." },
  { name: "GPT", text: "В этом уроке разберём, как агент пишет сценарий по заданию." },
  { name: "Gemini", text: "" },
];
const GEM: { tag: boolean; t: string }[] = [
  { tag: true, t: "[усмехнуться]" },
  { tag: false, t: "Сценарий? Его пишет агент." },
  { tag: true, t: "[шёпот]" },
  { tag: false, t: "А смысл — за вами." },
];
const COL = (i: number) => ZX + 262 + i * 558; // column centres

/** Gemini's script: stage directions are typed with the text, they light up when the voice names them. */
const GemText: React.FC<{ f: number; start: number; hiAt: number[] }> = ({ f, start, hiAt }) => {
  let budget = f < start ? -1 : Math.floor(((f - start) * 34) / 30);
  let ti = 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      {GEM.map((r, i) => {
        const n = Math.max(0, Math.min(r.t.length, budget));
        budget -= r.t.length + 3;
        if (r.tag) {
          const hAt = hiAt[ti++];
          const h = eo(f, hAt, 8);
          return (
            <div key={i} style={{ position: "relative", height: 36 }}>
              {n > 0 && (
                <span
                  style={{
                    position: "relative",
                    display: "inline-block",
                    fontFamily: MONO,
                    fontWeight: 700,
                    fontSize: 24,
                    lineHeight: "26px",
                    padding: "3px 12px",
                    borderRadius: 10,
                    border: `2px solid ${interpolateColors(h, [0, 1], ["rgba(154,160,170,0.35)", C.accent])}`,
                    background: `rgba(255,179,0,${0.16 * h})`,
                    color: interpolateColors(h, [0, 1], [C.muted, C.accent]),
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.t.slice(0, n)}
                  <span style={{ visibility: "hidden" }}>{r.t.slice(n)}</span>
                  <Ripple f={f} start={hAt} size={70} grow={1.4} />
                </span>
              )}
            </div>
          );
        }
        return (
          <div key={i} style={{ ...TX.label, fontWeight: 600, fontSize: 26, lineHeight: 1.35, color: C.text, minHeight: 35, whiteSpace: "nowrap" }}>
            {r.t.slice(0, n)}
          </div>
        );
      })}
    </div>
  );
};

const Models: React.FC<{ f: number; b: number[]; w: W }> = ({ f, b, w }) => {
  const b6 = b[6];
  const b7 = b[7];
  const wWrite = w("пишут");
  const wGive = w("дайте");
  const hi = eo(f, b7, 12);
  const back = eo(f, wGive, 14);
  const swOut = eio(f, wGive, 8);
  const swIn = eio(f, wGive + 7, 10);
  const flyers: React.ReactNode[] = [];
  [0, 1, 2].forEach((i) => {
    [b6 + 10 + i * 3, wGive + 4 + i * 3].forEach((s, r) => {
      const t = lin(f, s, 12);
      if (t <= 0 || t >= 1) return;
      flyers.push(
        <div
          key={`${i}-${r}`}
          style={{
            position: "absolute",
            left: COL(i) - 9,
            top: mix(340, 394, t) - 9,
            width: 18,
            height: 18,
            borderRadius: 9,
            background: C.accent,
            boxShadow: "0 0 18px rgba(255,179,0,0.8)",
            opacity: Math.sin(Math.PI * t),
          }}
        />,
      );
    });
  });
  return (
    <>
      <Head
        f={f}
        at={b6}
        step={3}
        kicker="Сценарий · модели"
        title="Разные модели пишут разные сценарии"
        chips={
          <ChipAt f={f} at={w("опыту")}>
            <Chip text="по опыту автора" icon="star" />
          </ChipAt>
        }
      />
      <Pop x={ZX} y={CY} w={ZW} h={86} p={sp(f, b6, "snap")} from="above" d={30} s0={0.98}>
        <Panel w={ZW} h={86} glow={0.6 * Math.max(glowWin(f, b6 + 2, b6 + 26, 0), glowWin(f, wGive, wGive + 30, 0))}>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", gap: 20, padding: "0 34px" }}>
            <IconTile icon="doc" size={56} />
            <span style={{ ...kick, color: C.accent }}>Один промпт</span>
            <TypeText
              text="сценарий урока · аудитория · боль · стиль повествования"
              f={f}
              start={b6 + 6}
              cps={60}
              caretUntil={b6 + 90}
              style={{ fontFamily: MONO, fontSize: 26, color: C.text, whiteSpace: "nowrap" }}
            />
          </div>
        </Panel>
      </Pop>
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
        {[0, 1, 2].map((i) => (
          <DrawPath
            key={i}
            d={`M${COL(i)} 344 L${COL(i)} 390 M${COL(i) - 10} 380 L${COL(i)} 390 L${COL(i) + 10} 380`}
            p={eo(f, b6 + 6 + i * 3, 10)}
            width={4}
            color="rgba(255,179,0,0.75)"
          />
        ))}
      </svg>
      {flyers}
      {MOD.map((m, i) => {
        const gem = i === 2;
        const dim = gem ? 1 : 1 - 0.55 * hi * (1 - back);
        const glow = gem ? hi * (1 - 0.45 * back) : 0;
        const lift = gem ? -5 * hi : 0;
        const start = wWrite + i * 4;
        const pb = gem ? sp(f, b7, "bouncy") : 0;
        return (
          <Pop key={i} x={ZX + i * 558} y={400 + lift + float(f, 13 + i, 2, 120)} w={524} h={326} p={sp(f, b6 + 4 + i * 4, "pop")} from="below" d={50} s0={0.96}>
            <Panel w={524} h={326} glow={glow}>
              <div style={{ position: "absolute", inset: 0, opacity: dim }}>
                <At x={30} y={28}>
                  <IconTile icon="bot" size={64} />
                </At>
                <At x={110} y={40} style={{ ...TX.title, fontSize: 36, whiteSpace: "nowrap" }}>
                  {m.name}
                </At>
                <At x={30} y={112} w={464} h={2} style={{ background: C.line }} />
                <At x={30} y={132} w={464}>
                  {gem ? (
                    <GemText f={f} start={start} hiAt={[w("усмехнуться"), w("шёпот")]} />
                  ) : (
                    <TypeText
                      text={m.text}
                      f={f}
                      start={start}
                      cps={38}
                      caretUntil={start + 80}
                      style={{ ...TX.label, fontWeight: 600, fontSize: 26, lineHeight: 1.35, color: C.text }}
                    />
                  )}
                </At>
              </div>
              {pb > 0.002 && (
                <At
                  x={524 - 30 - 220}
                  y={37}
                  w={220}
                  style={{ display: "flex", justifyContent: "flex-end", opacity: Math.min(1, pb * 1.6), transform: `translateY(${(1 - pb) * -12}px)` }}
                >
                  <Chip text="живее всех" tone="accent" size={24} />
                </At>
              )}
            </Panel>
          </Pop>
        );
      })}
      {/* takeaway strip: one prompt → three texts, then «дайте … и сравните» */}
      <Pop x={ZX} y={754 + float(f, 16, 2, 110)} w={ZW} h={66} p={sp(f, wWrite + 12, "snap")} from="below" d={30} s0={0.98}>
        <Panel w={ZW} h={66} glow={0.5 * glowWin(f, wGive, wGive + 30, 0)}>
          <div style={{ position: "absolute", inset: 0, display: "grid", alignItems: "center", padding: "0 34px" }}>
            <div style={{ gridArea: "1 / 1", display: "flex", alignItems: "center", gap: 16, opacity: 1 - swOut, transform: `translateY(${-14 * swOut}px)` }}>
              <Icon name="copy" size={34} color={C.accent} sw={3.6} />
              <span style={{ ...TX.label, fontSize: 28, whiteSpace: "nowrap" }}>
                Один промпт → <span style={{ color: C.accent }}>три разных текста</span>
              </span>
            </div>
            <div style={{ gridArea: "1 / 1", display: "flex", alignItems: "center", gap: 16, opacity: swIn, transform: `translateY(${14 * (1 - swIn)}px)` }}>
              <Icon name="scales" size={34} color={C.accent} sw={3.6} />
              <span style={{ ...TX.label, fontSize: 28, whiteSpace: "nowrap" }}>
                Дайте один промпт нескольким моделям — и{" "}
                <span style={{ color: interpolateColors(eo(f, w("сравните"), 8), [0, 1], [C.text, C.accent]) }}>сравните</span>
              </span>
            </div>
          </div>
        </Panel>
      </Pop>
    </>
  );
};

// ═══ page 5: read it with your eyes ═════════════════════════════════════════════════════════════════════════
const DOC: { tag?: string; t: string }[] = [
  { t: "Сценарий пишет агент," },
  { t: "а вы — архитектор смысла." },
  { t: "Задача одна: сказать, какой" },
  { t: "результат нужен на выходе…" },
  { tag: "[усмехнуться]", t: " И два волшебных" },
  { t: "слова: «стиль повествования»." },
  { t: "Мои реплики — оставлять." },
];
const FILM: IconName[] = ["play", "image", "chart", "video", "team", "image", "play"];

/** An eye whose iris reads left → right and snaps back, line after line. */
const Eye: React.FC<{ f: number; start: number }> = ({ f, start }) => {
  const p = sp(f, start, "bouncy");
  if (p <= 0.002) return null;
  const u = ((((f - start) % 40) + 40) % 40) / 40;
  const ix = u < 0.8 ? mix(-34, 34, smooth(u / 0.8)) : mix(34, -34, smooth((u - 0.8) / 0.2));
  const almond = "M8 50 Q90 -14 172 50 Q90 114 8 50 Z";
  return (
    <svg width={180} height={100} viewBox="0 0 180 100" style={{ display: "block", overflow: "visible", transform: `scale(${p})` }}>
      <defs>
        <clipPath id="l1a04-eye">
          <path d={almond} />
        </clipPath>
      </defs>
      <path d={almond} fill="rgba(255,179,0,0.10)" stroke={C.accent} strokeWidth={5} strokeLinejoin="round" />
      <g clipPath="url(#l1a04-eye)">
        <circle cx={90 + ix} cy={50} r={25} fill={C.surface} stroke={C.accent} strokeWidth={5} />
        <circle cx={90 + ix} cy={50} r={11} fill={C.accent} />
        <circle cx={84 + ix} cy={44} r={4} fill={C.text} opacity={0.8} />
      </g>
    </svg>
  );
};

/** A film strip that keeps scrolling — «видеоряд». */
const Film: React.FC<{ f: number; start: number }> = ({ f, start }) => {
  const a = eo(f, start, 12);
  if (a <= 0) return null;
  const off = ((f - start) * 3) % 140;
  return (
    <div style={{ position: "absolute", inset: 0, borderRadius: 12, background: C.surface2, overflow: "hidden", opacity: a, transform: `translateX(${(1 - a) * 30}px)` }}>
      {[6, 78].map((y) => (
        <div
          key={y}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: y,
            height: 6,
            backgroundImage: "repeating-linear-gradient(90deg, rgba(243,239,230,0.22) 0px, rgba(243,239,230,0.22) 10px, transparent 10px, transparent 20px)",
            backgroundPosition: `${-off}px 0px`,
          }}
        />
      ))}
      {FILM.map((ic, j) => (
        <div
          key={j}
          style={{
            position: "absolute",
            left: j * 140 - off + 8,
            top: 18,
            width: 124,
            height: 54,
            borderRadius: 6,
            background: C.raised,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={ic} size={32} color={j === 2 ? C.accent : C.muted} sw={3.4} />
        </div>
      ))}
    </div>
  );
};

const Check: React.FC<{ f: number; b: number[]; w: W }> = ({ f, b, w }) => {
  const b8 = b[8];
  const wSkip = w("пропускайте");
  const wIf = w("если");
  const readF = (f - (b8 + 8)) / 9;
  const rFl = Math.floor(readF);
  const pos = Math.min(DOC.length - 1, rFl + smooth(clamp01((readF - rFl - 0.66) * 3)));
  const band = readF < 0 ? 0 : eo(f, b8 + 8, 6) * (1 - eo(f, b8 + 8 + 9 * DOC.length + 6, 10));
  return (
    <>
      <Head
        f={f}
        at={b8}
        step={4}
        kicker="Сценарий · проверка"
        title="Сценарий читаете глазами"
        chips={
          <ChipAt f={f} at={b8 + 6}>
            <Chip text="сценарий.md" icon="doc" />
          </ChipAt>
        }
      />
      <Pop x={ZX} y={CY + float(f, 17, 3, 120)} w={840} h={CH} p={sp(f, b8, "pop")} from="left" d={60} s0={0.96}>
        <Frame w={840} h={CH} kind="editor" title="сценарий.md">
          <At x={330} y={18}>
            <Eye f={f} start={b8} />
          </At>
          {band > 0.002 && (
            <At
              x={26}
              y={150 + pos * 42}
              w={788}
              h={40}
              style={{ borderRadius: 8, background: `rgba(255,179,0,${0.14 * band})`, boxShadow: `inset 3px 0 0 rgba(255,179,0,${0.9 * band})` }}
            />
          )}
          {DOC.map((l, i) => {
            const ap = eo(f, b8 + 2 + i * 2, 8);
            const rd = clamp01((readF - i) * 2);
            return (
              <At key={i} x={40} y={150 + i * 42} w={760} h={40} style={{ opacity: ap, transform: `translateY(${(1 - ap) * 10}px)` }}>
                <div
                  style={{
                    ...TX.label,
                    fontWeight: 600,
                    fontSize: 26,
                    lineHeight: "40px",
                    whiteSpace: "nowrap",
                    color: interpolateColors(rd, [0, 1], [C.muted, C.text]),
                  }}
                >
                  {l.tag && <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 24, color: C.accent }}>{l.tag}</span>}
                  {l.t}
                </div>
              </At>
            );
          })}
        </Frame>
      </Pop>
      {/* good or bad? */}
      <Pop x={1020} y={CY + float(f, 18, 3, 112)} w={760} h={270} p={sp(f, wIf, "pop")} from="right" d={50} s0={0.96}>
        <Panel w={760} h={270}>
          <At x={34} y={30}>
            <IconTile icon="question" size={72} />
          </At>
          <At x={126} y={47} style={{ ...TX.title, fontSize: 36, whiteSpace: "nowrap" }}>
            Не уверены в тексте?
          </At>
          <At x={34} y={150} style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <ChipAt f={f} at={w("хорош")}>
              <Chip text="хорош?" />
            </ChipAt>
            <ChipAt f={f} at={w("плох")}>
              <Chip text="плох?" />
            </ChipAt>
            <ChipAt f={f} at={wSkip}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Icon name="arrow" size={40} color={C.accent} sw={4} />
                <Chip text="пропускайте" tone="accent" />
              </div>
            </ChipAt>
          </At>
        </Panel>
      </Pop>
      {/* the caption */}
      <Pop x={1020} y={550 + float(f, 19, 3, 108)} w={760} h={270} p={sp(f, wIf + 10, "pop")} from="below" d={50} s0={0.96}>
        <Panel w={760} h={270} glow={0.45 * glowWin(f, wSkip + 6, wSkip + 40, 0.3)}>
          <At x={34} y={30}>
            <IconTile icon="video" size={72} />
          </At>
          <At x={126} y={26} w={600} h={92}>
            {[260, 420].map((bw, i) => (
              <div
                key={`sk${i}`}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 12 + i * 46,
                  width: bw,
                  height: 22,
                  borderRadius: 11,
                  background: "rgba(243,239,230,0.08)",
                  opacity: 1 - eo(f, wSkip, 8),
                }}
              />
            ))}
            {["Не понял —", "смотри видеоряд"].map((t, i) => {
              const r = eo(f, wSkip + i * 5, 14);
              return (
                <div key={i} style={{ overflow: "hidden", height: 46 }}>
                  <div
                    style={{
                      ...TX.title,
                      fontSize: 40,
                      lineHeight: "46px",
                      whiteSpace: "nowrap",
                      color: i ? C.accent : C.text,
                      opacity: r > 0 ? 1 : 0,
                      transform: `translateY(${(1 - r) * 105}%)`,
                    }}
                  >
                    {t}
                  </div>
                </div>
              );
            })}
          </At>
          <At x={34} y={150} w={692} h={90}>
            <Film f={f} start={wIf + 14} />
          </At>
        </Panel>
      </Pop>
    </>
  );
};

export const Script: React.FC<SceneProps> = ({ f, b, t0, w }) => {
  const b2 = b[2];
  const b5 = b[5];
  const b6 = b[6];
  const b8 = b[8];
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <Act f={f} a={t0} z={b2}>
        <Roles f={f} t0={t0} b={b} w={w} />
      </Act>
      <Act f={f} a={b2} z={b5}>
        <Style f={f} b={b} w={w} />
      </Act>
      <Act f={f} a={b5} z={b6}>
        <Cut f={f} b={b} w={w} />
      </Act>
      <Act f={f} a={b6} z={b8}>
        <Models f={f} b={b} w={w} />
      </Act>
      <Act f={f} a={b8}>
        <Check f={f} b={b} w={w} />
      </Act>
    </div>
  );
};
