import React from "react";
import { interpolateColors } from "remotion";
import { C, MONO } from "../../../theme";
import { bump, ei, eio, eo, float, hash, mix, sp, SprName, typed, typeDone } from "../../anim";
import { Icon, IconName } from "../../icons";
import { Caret } from "../../text";
import { SceneProps } from "../../types";
import { Bubble, CheckBadge, Chip, Frame, glowWin, Pop, Ripple, Stamp, Tone, TX } from "../../ui";
import { Burst, DrawPath } from "../../viz";
import { At, CrossBadge, IconTile } from "../kit";

// «Заточка топора» (раздел 9, 445,29–494,41 с). Четыре листа, каждый занимает зону целиком:
// 1) мысль Линкольна: точильный камень, топор и дерево; шкала «6 часов» → 4 на заточку + 2 на рубку;
// 2) «7 дней» → «1 скилл» → «это видео» → «сделай 100 роликов, пока я сплю»: сетка 10×10 заполняется, три формата;
// 3) формула [слои] + [правила] + [грабли] = [скилл]; на «Первая версия» плитки ужимаются вверх,
//    снизу шкала 80/20 — шлифовка 20 %: под аудиторию · стиль · критерии;
// 4) плитка «Скилл» улетает в отдельного агента, на «трогайте» — замок и табличка «Работает — не трогай».
// Лицо F08 во весь экран 486,65–494,35: последний лист живёт под ним до t1 (уход делает SceneLayer).

// ── helpers (local to this scene) ───────────────────────────────────────────────────────────────────────────
/** 1 until the next beat, then a ~10-frame fade; no next beat → never fades. */
const safeExitAlpha = (f: number, bNext?: number, dur = 10) =>
  bNext === undefined || !Number.isFinite(bNext) ? 1 : 1 - ei(f, bNext, dur);

/** A page: mounts at `a`, everything inside leaves together at `z` (fade + small lift). */
const Page: React.FC<{ f: number; a: number; z?: number; children?: React.ReactNode }> = ({ f, a, z, children }) => {
  if (f < a - 1) return null;
  const al = safeExitAlpha(f, z, 10);
  if (al <= 0.001) return null;
  const q = 1 - al;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: al, transform: q > 0 ? `translateY(${-28 * q}px)` : undefined }}>{children}</div>
  );
};

const rise = (f: number, at: number, d = 18, spr: SprName = "snap"): React.CSSProperties => {
  const p = sp(f, at, spr);
  return { opacity: Math.min(1, p * 1.6), transform: `translateY(${(1 - p) * d}px)` };
};

type HChip = { text: string; icon?: IconName; tone?: Tone; at: number };
/** Scene header: title (≤ 38 px) left, chips right, aligned to the top. */
const Header: React.FC<{ f: number; at: number; title: React.ReactNode; chips?: HChip[] }> = ({ f, at, title, chips = [] }) => {
  if (f < at) return null;
  const r = eo(f, at, 16);
  return (
    <div
      style={{
        position: "absolute",
        left: 140,
        top: 146,
        width: 1640,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
      }}
    >
      <div style={{ overflow: "hidden", padding: "0.12em 0.06em 0.16em", margin: "-0.12em -0.06em -0.16em" }}>
        <div style={{ ...TX.title, fontSize: 38, whiteSpace: "nowrap", transform: `translateY(${(1 - r) * 110}%)` }}>{title}</div>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {chips.map((c, i) => (
          <div key={i} style={rise(f, c.at, -14)}>
            <Chip text={c.text} icon={c.icon} tone={c.tone ?? "outline"} size={24} />
          </div>
        ))}
      </div>
    </div>
  );
};

const Kicker: React.FC<{ icon: IconName; text: string; color?: string }> = ({ icon, text, color = C.muted }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, ...TX.kicker, color, whiteSpace: "nowrap" }}>
    <Icon name={icon} size={30} color={C.accent} sw={3.8} />
    {text}
  </div>
);

const Acc: React.FC<{ children?: React.ReactNode }> = ({ children }) => <span style={{ color: C.accent }}>{children}</span>;

/** A real axe silhouette (head + handle, edge parallel to the handle) — the library glyph reads as a hammer. */
const AxeGlyph: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: "block", overflow: "visible" }}>
    <g transform="translate(-1.5 3.5)">
      <path d="M13.8 41.7 L31.2 11.5" stroke={color} strokeWidth={4.4} strokeLinecap="round" fill="none" />
      <path d="M25.3 20.7 L7 16 Q6.2 2.5 18.8 -2.4 L30.7 12.3 L34.1 16.3 L30.3 22.1 Z" fill={color} />
    </g>
  </svg>
);

/** Icon in a rounded tile (IconTile look); "axe" uses the custom glyph. */
const GTile: React.FC<{ icon: IconName; size: number; color: string; bg: string }> = ({ icon, size, color, bg }) =>
  icon === "axe" ? (
    <div style={{ width: size, height: size, flex: "none", borderRadius: size * 0.28, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <AxeGlyph size={size * 0.62} color={color} />
    </div>
  ) : (
    <IconTile icon={icon} size={size} color={color} bg={bg} />
  );

// ── timings (absolute frames) ───────────────────────────────────────────────────────────────────────────────
const timing = (b: number[], w: SceneProps["w"]) => {
  const [b0, b1, b2, b3, b4, b5, b6] = b;
  return {
    b0,
    b1,
    b2,
    b3,
    b4,
    b5,
    b6,
    // page 1 — Lincoln
    wSix: w("шесть"),
    wHours: w("часов"),
    wTree: w("дерево"),
    wFour: w("четыре"),
    wSharp: w("заточку"),
    wAxe: w("топора"),
    // page 2 — 7 days → 1 skill → 100 videos
    wOne: w("один", 453),
    wSkill: w("скилл", 453),
    wThis: w("вот", 454),
    wBuilt: w("собрано"),
    wVideo: w("видео", 456),
    bCmd: Math.min(w("сделай"), b2),
    wSleep: w("сплю"),
    wLong: w("длинн"),
    wHourF: w("часов", 462),
    // page 3 — formula + polishing
    wWhat: w("что", 463),
    wPie: w("пирож"),
    wRules: w("правила"),
    wRakes: w("грабли"),
    wOnce: w("один", 468.5),
    wFirst: w("первая"),
    wResult: w("результат"),
    wAud: w("под", 476.5),
    wStyle: w("ваш", 478),
    wCrit: w("ваши", 479),
    // page 4 — separate agent under lock
    wTake: w("выносите"),
    wWorks: w("работает"),
    wDont: w("не", 485.7),
  };
};
type Tm = ReturnType<typeof timing>;

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// PAGE 1 — «6 часов на дерево → 4 на заточку топора»
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
const CONTACT = { x: 237.6, y: 196.6 }; // where the axe edge meets the grindstone (wheel angle −70°, panel coords)
const TREE: [number, number, number][] = [
  [600, 205, 62],
  [550, 262, 50],
  [650, 262, 50],
  [600, 282, 56],
];

/** Grindstone + axe + tree, drawn in the 720×518 panel. Sparks fly while the axe is sharpened. */
const GrindArt: React.FC<{ f: number; a: number; wTree: number; wSharp: number }> = ({ f, a, wTree, wSharp }) => {
  const cx = 200;
  const cy = 300;
  const r = 110;
  const rot = -((f - a) * 1.2 + Math.max(0, f - wSharp) * 7); // counter-clockwise: sparks fly up-left
  const sharp = eo(f, wSharp, 40);
  const tree = sp(f, a + 8, "pop");
  const treeHl = glowWin(f, wTree, wTree + 30, 0.45);
  const axeP = sp(f, a + 4, "heavy");
  const outline = interpolateColors(treeHl, [0, 1], ["rgba(154,160,170,0.55)", C.text]);
  const sparks: React.ReactNode[] = [];
  if (f >= wSharp) {
    const k1 = Math.floor((f - wSharp) / 2);
    for (let k = Math.max(0, k1 - 9); k <= k1; k++) {
      const age = f - (wSharp + k * 2);
      if (age < 0 || age > 16) continue;
      const ang = ((-176 + 38 * hash(k * 3.1 + 0.4)) * Math.PI) / 180;
      const v = 6 + 5 * hash(k * 7.7 + 1.2);
      const x = CONTACT.x + Math.cos(ang) * v * age;
      const y = CONTACT.y + Math.sin(ang) * v * age + 0.3 * age * age;
      const len = 12 + 10 * hash(k * 1.3 + 2);
      sparks.push(
        <line
          key={k}
          x1={x}
          y1={y}
          x2={x - Math.cos(ang) * len}
          y2={y - Math.sin(ang) * len}
          stroke={C.accent}
          strokeWidth={4}
          strokeLinecap="round"
          opacity={1 - age / 16}
        />,
      );
    }
  }
  // a glint runs along the blade edge once sharpening starts
  const gt = ((((f - wSharp) % 28) + 28) % 28) / 28;
  const gx = 2 * (1 - gt) * gt * -12;
  const gy = (1 - gt) ** 2 * -50 + gt ** 2 * 50;
  return (
    <svg width={720} height={518} style={{ position: "absolute", left: 0, top: 0 }}>
      <line x1={30} y1={448} x2={690} y2={448} stroke="rgba(243,239,230,0.14)" strokeWidth={3} strokeLinecap="round" />
      {/* tree: outline pass, then fill pass → one clean silhouette */}
      <g opacity={Math.min(1, tree * 1.6)} transform={`translate(0 ${(1 - tree) * 30})`}>
        <rect x={586} y={296} width={28} height={152} rx={7} fill={C.raised} stroke={outline} strokeWidth={3} />
        {TREE.map(([x, y, rr], i) => (
          <circle key={`o${i}`} cx={x} cy={y} r={rr} fill={outline} />
        ))}
        {TREE.map(([x, y, rr], i) => (
          <circle key={`f${i}`} cx={x} cy={y} r={rr - 3} fill={C.raised} />
        ))}
      </g>
      {/* grindstone */}
      <path d="M150 448 L188 354 M250 448 L212 354 M164 416 H236" stroke="rgba(243,239,230,0.3)" strokeWidth={8} strokeLinecap="round" fill="none" />
      <g transform={`rotate(${rot} ${cx} ${cy})`}>
        <circle cx={cx} cy={cy} r={r} fill={C.raised} stroke="rgba(243,239,230,0.34)" strokeWidth={4} />
        <circle cx={cx} cy={cy} r={r - 16} fill="none" stroke="rgba(243,239,230,0.12)" strokeWidth={3} strokeDasharray="10 14" />
        {[0, 60, 120].map((d) => {
          const ra = (d * Math.PI) / 180;
          return (
            <line
              key={d}
              x1={cx + Math.cos(ra) * (r - 28)}
              y1={cy + Math.sin(ra) * (r - 28)}
              x2={cx - Math.cos(ra) * (r - 28)}
              y2={cy - Math.sin(ra) * (r - 28)}
              stroke="rgba(243,239,230,0.16)"
              strokeWidth={6}
              strokeLinecap="round"
            />
          );
        })}
        <circle cx={cx} cy={cy} r={18} fill={C.surface2} stroke="rgba(243,239,230,0.4)" strokeWidth={3} />
      </g>
      {/* axe lying on the stone: edge on the wheel (parallel to the handle), handle to the right */}
      <g transform={`translate(${CONTACT.x} ${CONTACT.y - (1 - axeP) * 60}) rotate(-70)`} opacity={Math.min(1, axeP * 1.6)}>
        <rect x={66} y={-40} width={22} height={270} rx={11} fill="rgba(243,239,230,0.3)" stroke="rgba(243,239,230,0.5)" strokeWidth={2} />
        <rect x={92} y={-18} width={20} height={36} rx={6} fill={C.muted} />
        <rect x={56} y={-26} width={42} height={52} rx={8} fill={C.muted} />
        <path d="M0 -50 Q -12 0 0 50 C 22 40 40 26 60 22 L 60 -22 C 40 -26 22 -40 0 -50 Z" fill="rgba(243,239,230,0.82)" />
        <path d="M0 -50 Q -12 0 0 50" fill="none" stroke={C.accent} strokeWidth={7} strokeLinecap="round" opacity={0.25 + 0.75 * sharp} />
        {sharp > 0 && <circle cx={gx} cy={gy} r={8} fill="#FFF4D6" opacity={0.9 * sharp} />}
      </g>
      {sparks}
    </svg>
  );
};

const HOUR_W = 124;
const HOUR_GAP = 14;
const HX = 790; // right column of the Lincoln card (card coords)

const PageLincoln: React.FC<{ f: number; t: Tm }> = ({ f, t }) => {
  const card = sp(f, t.b0, "pop");
  const tree = eo(f, t.wTree, 12);
  const la = eo(f, t.wSharp + 4, 12);
  const lb = eo(f, t.wAxe + 4, 12);
  const xA0 = HX + 2;
  const xA1 = HX + 4 * HOUR_W + 3 * HOUR_GAP - 2;
  const xB0 = HX + 4 * (HOUR_W + HOUR_GAP) + 2;
  const xB1 = HX + 6 * HOUR_W + 5 * HOUR_GAP - 2;
  return (
    <>
      <Header
        f={f}
        at={t.b0}
        title={
          <>
            Сначала <Acc>точим топор</Acc>
          </>
        }
        chips={[{ text: "4 из 6 часов", icon: "clock", at: t.wFour }]}
      />
      <Pop x={140} y={250} w={1640} h={570} p={card} d={50}>
        <Frame w={1640} h={570} kind="plain">
          <div
            style={{
              position: "absolute",
              left: 26,
              top: 26,
              width: 720,
              height: 518,
              borderRadius: 18,
              background: C.surface2,
              border: `1px solid ${C.line}`,
              overflow: "hidden",
            }}
          >
            <GrindArt f={f} a={t.b0} wTree={t.wTree} wSharp={t.wSharp} />
            <div style={{ position: "absolute", left: 200, top: 462, transform: "translateX(-50%)" }}>
              <div style={rise(f, t.b0 + 10, 14)}>
                <Chip text="топор" tone="surface" size={24} />
              </div>
            </div>
            <div style={{ position: "absolute", left: 600, top: 462, transform: "translateX(-50%)" }}>
              <div style={rise(f, t.b0 + 14, 14)}>
                <Chip text="дерево" tone="surface" size={24} />
              </div>
            </div>
          </div>
          <At x={HX} y={64} style={rise(f, t.b0 + 4, 14)}>
            <Kicker icon="quote" text="мысль Линкольна" color={C.accent} />
          </At>
          <At x={HX} y={112} style={{ display: "flex", alignItems: "baseline", gap: 22, whiteSpace: "nowrap" }}>
            <div style={{ ...TX.title, fontSize: 72, color: C.accent, ...rise(f, t.wSix, 26, "pop") }}>6 часов</div>
            <div style={{ ...TX.label, fontSize: 36, fontWeight: 800, opacity: tree, transform: `translateX(${(1 - tree) * -16}px)` }}>
              — срубить дерево
            </div>
          </At>
          {Array.from({ length: 6 }, (_, k) => {
            const p = sp(f, t.wHours + k * 3, "pop");
            const fill = k < 4 ? eo(f, t.wFour + k * 5, 8) : 0;
            const ic = eo(f, t.wFour + (k < 4 ? k * 5 : 22 + (k - 4) * 4), 10);
            return (
              <div
                key={k}
                style={{
                  position: "absolute",
                  left: HX + k * (HOUR_W + HOUR_GAP),
                  top: 250,
                  width: HOUR_W,
                  height: 130,
                  boxSizing: "border-box",
                  borderRadius: 18,
                  background: interpolateColors(fill, [0, 1], [C.surface2, C.accent]),
                  border: `2px solid ${fill > 0.5 ? C.accent : "rgba(243,239,230,0.14)"}`,
                  opacity: Math.min(1, p * 1.6),
                  transform: `translateY(${(1 - p) * 34}px)`,
                }}
              >
                <div style={{ position: "absolute", left: 14, top: 10, fontFamily: MONO, fontWeight: 700, fontSize: 24, color: fill > 0.5 ? C.bg : C.muted }}>
                  {k + 1} ч
                </div>
                <div style={{ position: "absolute", left: 32, top: 50, opacity: ic, transform: `translateY(${(1 - ic) * 10}px)` }}>
                  {k < 4 ? <AxeGlyph size={56} color={C.bg} /> : <Icon name="tree" size={56} color={C.muted} sw={3.8} />}
                </div>
              </div>
            );
          })}
          <svg width={1640} height={570} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
            <DrawPath d={`M${xA0} 398 v14 H${xA1} v-14 M${(xA0 + xA1) / 2} 412 v12`} p={eo(f, t.wSharp, 14)} width={4} />
            <DrawPath d={`M${xB0} 398 v14 H${xB1} v-14 M${(xB0 + xB1) / 2} 412 v12`} p={eo(f, t.wAxe, 14)} width={4} color={C.muted} />
          </svg>
          <div
            style={{
              position: "absolute",
              left: (xA0 + xA1) / 2,
              top: 436,
              transform: `translateX(-50%) translateY(${(1 - la) * 14}px)`,
              opacity: la,
              ...TX.label,
              fontSize: 32,
              fontWeight: 800,
              color: C.accent,
              whiteSpace: "nowrap",
            }}
          >
            4 ч — заточка топора
          </div>
          <div
            style={{
              position: "absolute",
              left: (xB0 + xB1) / 2,
              top: 438,
              transform: `translateX(-50%) translateY(${(1 - lb) * 14}px)`,
              opacity: lb,
              ...TX.label,
              fontSize: 28,
              color: C.muted,
              whiteSpace: "nowrap",
            }}
          >
            2 ч — рубка
          </div>
        </Frame>
      </Pop>
    </>
  );
};

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// PAGE 2 — «7 дней → 1 скилл → это видео → 100 роликов, три формата»
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
const ArrowBadge: React.FC<{ f: number; at: number; x: number; y: number }> = ({ f, at, x, y }) => {
  const p = sp(f, at, "bouncy");
  if (p <= 0.002) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x - 26,
        top: y - 26,
        width: 52,
        height: 52,
        borderRadius: 26,
        background: C.accent,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: `scale(${p})`,
        boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
      }}
    >
      <Icon name="arrow" size={30} color={C.bg} sw={4.4} />
    </div>
  );
};

const CMD = "Сделай 100 роликов, пока я сплю";
const GRID = { x: 34, y: 168, cw: 38, ch: 22, gx: 8, gy: 6 };
const cellXY = (i: number) => ({ x: GRID.x + (i % 10) * (GRID.cw + GRID.gx), y: GRID.y + Math.floor(i / 10) * (GRID.ch + GRID.gy) });
const cellStart = (t: Tm, i: number) => t.b2 + 10 + ((i % 10) + Math.floor(i / 10)) * 1.1;
const FORMATS: { text: string; icon: IconName }[] = [
  { text: "короткий", icon: "phone" },
  { text: "длинный", icon: "monitor" },
  { text: "часовой", icon: "clock" },
];

const ResultCard: React.FC<{ f: number; t: Tm }> = ({ f, t }) => {
  const fmtAt = [t.b3, t.wLong, t.wHourF];
  const ph = eo(f, t.b1 + 18, 10);
  const lit = eo(f, t.wBuilt, 10);
  const m = eio(f, t.b2 + 4, 16);
  const R = { x: mix(130, GRID.x, m), y: mix(150, GRID.y, m), w: mix(400, GRID.cw, m), h: mix(225, GRID.ch, m) };
  const tileBg = m > 0 ? interpolateColors(m, [0, 1], [C.raised, "rgba(255,179,0,0.9)"]) : interpolateColors(lit, [0, 1], [C.surface2, C.raised]);
  const border = m > 0 ? `${mix(3, 0, m)}px solid ${C.accent}` : lit > 0.5 ? `3px solid ${C.accent}` : "3px dashed rgba(154,160,170,0.5)";
  const pb = sp(f, t.bCmd, "snap");
  const typedTxt = typed(CMD, f, t.bCmd + 3, 40);
  const typingOn = f < typeDone(CMD, t.bCmd + 3, 40);
  const moon = sp(f, t.wSleep, "bouncy");
  let cnt = 0;
  for (let i = 0; i < 100; i++) if (f >= cellStart(t, i) + 2) cnt++;
  const eyeChip = Math.min(1, sp(f, t.wVideo, "snap") * 1.6) * (1 - eo(f, t.b2, 8));
  return (
    <Frame w={660} h={570} kind="plain">
      <At x={34} y={26}>
        <Kicker icon="video" text="результат" />
      </At>
      {/* the single video (this one) → shrinks into the first cell of the grid */}
      {ph > 0 && (
        <div
          style={{
            position: "absolute",
            left: R.x,
            top: R.y,
            width: R.w,
            height: R.h,
            boxSizing: "border-box",
            borderRadius: mix(18, 5, m),
            background: tileBg,
            border,
            opacity: ph,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: lit > 0 && m < 1 ? `0 0 ${40 * lit * (1 - m)}px rgba(255,179,0,${0.3 * lit * (1 - m)})` : undefined,
          }}
        >
          {lit < 1 && <div style={{ position: "absolute", ...TX.title, fontSize: 64, color: "rgba(154,160,170,0.6)", opacity: 1 - lit }}>?</div>}
          {lit > 0 && (
            <div style={{ opacity: lit }}>
              <Icon name="play" size={mix(84, 11, m)} color={interpolateColors(m, [0, 1], [C.accent, C.bg])} />
            </div>
          )}
        </div>
      )}
      {eyeChip > 0.001 && (
        <At x={0} y={398} w={660} style={{ display: "flex", justifyContent: "center", opacity: eyeChip }}>
          <Chip text="вы смотрите его сейчас" icon="eye" tone="surface" size={24} />
        </At>
      )}
      {/* command bubble */}
      {pb > 0.002 && (
        <div style={{ position: "absolute", left: 34, top: 76, opacity: Math.min(1, pb * 1.6), transform: `translateX(${(1 - pb) * 30}px)` }}>
          <Bubble me size={26} maxW={592} style={{ width: 592, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
            <span>{typedTxt}</span>
            {typingOn && <Caret f={f} color={C.bg} solid />}
            {moon > 0.002 && (
              <span style={{ display: "inline-flex", marginLeft: "auto", transform: `scale(${moon})` }}>
                <Icon name="moon" size={28} color={C.bg} />
              </span>
            )}
          </Bubble>
        </div>
      )}
      {/* 100 videos */}
      {Array.from({ length: 100 }, (_, i) => {
        if (i === 0) return null;
        const p = sp(f, cellStart(t, i), "snap");
        if (p <= 0.002) return null;
        const { x, y } = cellXY(i);
        const row = Math.floor(i / 10);
        const g = row < 4 ? 0 : row < 7 ? 1 : 2;
        const hl = bump(f, fmtAt[g], 26);
        const base = 0.5 + 0.4 * hash(i * 1.7);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: GRID.cw,
              height: GRID.ch,
              borderRadius: 5,
              background: interpolateColors(hl, [0, 1], [`rgba(255,179,0,${base})`, C.text]),
              opacity: Math.min(1, p * 1.6),
              transform: `translateY(${(1 - p) * 10}px)`,
            }}
          >
            <svg width={GRID.cw} height={GRID.ch} style={{ display: "block" }}>
              <path d="M16 6 L24 11 L16 16 Z" fill={C.bg} opacity={0.7} />
            </svg>
          </div>
        );
      })}
      {/* counter */}
      <At x={500} y={236} w={130} style={{ textAlign: "center", ...rise(f, t.b2 + 12, 16) }}>
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 56, color: C.accent, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{cnt}</div>
        <div style={{ ...TX.label, fontSize: 24, color: C.muted, marginTop: 6 }}>роликов</div>
      </At>
      {/* three formats */}
      <At x={34} y={482} style={{ display: "flex", gap: 12 }}>
        {FORMATS.map((fm, k) => (
          <div key={fm.text} style={rise(f, fmtAt[k], 18, "pop")}>
            <Chip text={fm.text} icon={fm.icon} tone="outline" size={24} />
          </div>
        ))}
      </At>
    </Frame>
  );
};

const PageSkill: React.FC<{ f: number; t: Tm }> = ({ f, t }) => {
  const c1 = sp(f, t.b1 + 2, "pop");
  const c2 = sp(f, t.wOne - 2, "pop");
  const c3 = sp(f, t.b1 + 14, "pop");
  const g = eio(f, t.wSkill, 16);
  return (
    <>
      <Header
        f={f}
        at={t.b1 + 6}
        title={
          <>
            Неделя на скилл — <Acc>сто роликов</Acc> за ночь
          </>
        }
      />
      {/* 7 days */}
      <Pop x={140} y={250} w={430} h={570} p={c1} d={50}>
        <Frame w={430} h={570} kind="plain">
          <At x={34} y={26}>
            <Kicker icon="calendar" text="заточка" />
          </At>
          <At x={34} y={88} style={{ ...TX.title, fontSize: 72, whiteSpace: "nowrap", ...rise(f, t.b1 + 2, 22, "pop") }}>
            <Acc>7</Acc> дней
          </At>
          {Array.from({ length: 7 }, (_, k) => {
            const pos = k < 4 ? { x: 34 + k * 94, y: 214 } : { x: 81 + (k - 4) * 94, y: 308 };
            const p = sp(f, t.b1 + 4 + k * 2, "pop");
            const fill = eo(f, t.b1 + 10 + k * 4, 7);
            return (
              <div
                key={k}
                style={{
                  position: "absolute",
                  left: pos.x,
                  top: pos.y,
                  width: 80,
                  height: 80,
                  boxSizing: "border-box",
                  borderRadius: 18,
                  background: interpolateColors(fill, [0, 1], [C.surface2, C.accent]),
                  border: `2px solid ${fill > 0.5 ? C.accent : "rgba(243,239,230,0.14)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: MONO,
                  fontWeight: 700,
                  fontSize: 32,
                  color: fill > 0.5 ? C.bg : C.muted,
                  opacity: Math.min(1, p * 1.6),
                  transform: `translateY(${(1 - p) * 24}px)`,
                }}
              >
                {k + 1}
              </div>
            );
          })}
          <At x={34} y={432} style={{ ...TX.label, fontSize: 32, fontWeight: 800, whiteSpace: "nowrap", ...rise(f, t.wOne, 16) }}>
            на <Acc>один</Acc> скилл
          </At>
        </Frame>
      </Pop>
      <ArrowBadge f={f} at={t.wOne} x={600} y={535} />
      {/* 1 skill */}
      <Pop x={630} y={250} w={430} h={570} p={c2} d={50}>
        <Frame w={430} h={570} kind="plain" glow={glowWin(f, t.wThis, t.wThis + 30, 0)}>
          <At x={34} y={26}>
            <Kicker icon="doc" text="скилл" />
          </At>
          <At x={140} y={84} w={150} h={150} style={{ transform: `translateY(${float(f, 2, 3)}px)` }}>
            <Ripple f={f} start={t.wThis} size={150} />
            <div
              style={{
                position: "relative",
                width: 150,
                height: 150,
                boxSizing: "border-box",
                borderRadius: 42,
                overflow: "hidden",
                background: "rgba(255,179,0,0.14)",
                border: "2px solid rgba(255,179,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AxeGlyph size={92} color={C.accent} />
              {g > 0 && g < 1 && (
                <div
                  style={{
                    position: "absolute",
                    top: -40,
                    bottom: -40,
                    width: 46,
                    left: mix(-90, 210, g),
                    transform: "rotate(20deg)",
                    background: "linear-gradient(90deg, rgba(255,244,214,0), rgba(255,244,214,0.45), rgba(255,244,214,0))",
                  }}
                />
              )}
            </div>
          </At>
          <At x={0} y={262} w={430} style={{ ...TX.title, fontSize: 64, textAlign: "center", whiteSpace: "nowrap", ...rise(f, t.wOne, 22, "pop") }}>
            <Acc>1</Acc> скилл
          </At>
          <At x={0} y={362} w={430} style={{ display: "flex", justifyContent: "center", ...rise(f, t.wThis, 14, "pop") }}>
            <Chip text="вот этот" icon="spark" tone="outline" size={26} />
          </At>
          <At x={0} y={440} w={430} style={{ textAlign: "center" }}>
            <div style={{ ...TX.label, fontSize: 28, color: C.muted, ...rise(f, t.wBuilt, 14) }}>по нему собрано</div>
            <div style={{ ...TX.title, fontSize: 34, marginTop: 6, ...rise(f, t.wVideo - 8, 14) }}>это видео</div>
          </At>
        </Frame>
      </Pop>
      <ArrowBadge f={f} at={t.wBuilt} x={1090} y={535} />
      {/* result: this video → 100 videos */}
      <Pop x={1120} y={250} w={660} h={570} p={c3} d={50}>
        <ResultCard f={f} t={t} />
      </Pop>
    </>
  );
};

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// PAGE 3 — «[слои] + [правила] + [грабли] = [скилл]» → шлифовка 20 %
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
type TileDef = { icon: IconName; name: string; sub: string };
const TILES: TileDef[] = [
  { icon: "layers", name: "Слои", sub: "пирожок по шагам" },
  { icon: "list", name: "Правила", sub: "как делать каждый слой" },
  { icon: "rake", name: "Грабли", sub: "все ошибки — заранее" },
  { icon: "axe", name: "Скилл", sub: "записан один раз" },
];
const TILE_W = 368;
const tileX = (k: number) => 140 + k * (TILE_W + 56);
const LAYERS = ["графика", "лицо", "голос", "сценарий"];
const RULES = ["кадр 1920×1080", "текст от 24 px", "бит = слово"];
const RAKES = ["мелкий текст", "пустой экран", "наложения"];

const FTile: React.FC<{
  f: number;
  at: number;
  x: number;
  y: number;
  h: number;
  d: TileDef;
  deco: number;
  hot?: boolean;
  glow?: number;
  children?: React.ReactNode;
}> = ({ f, at, x, y, h, d, deco, hot = false, glow = 0, children }) => (
  <Pop x={x} y={y} w={TILE_W} h={h} p={sp(f, at, "pop")} d={44}>
    <Frame w={TILE_W} h={h} kind="plain" glow={glow}>
      <At x={34} y={26}>
        <GTile icon={d.icon} size={84} color={hot ? C.bg : C.accent} bg={hot ? C.accent : "rgba(255,179,0,0.14)"} />
      </At>
      <At x={138} y={48} style={{ ...TX.title, fontSize: 36, whiteSpace: "nowrap" }}>
        {d.name}
      </At>
      <At x={34} y={132} w={300} style={{ ...TX.label, fontSize: 26, color: C.muted, lineHeight: 1.3 }}>
        {d.sub}
      </At>
      {deco > 0.001 && (
        <At x={34} y={236} w={300} h={310} style={{ opacity: deco }}>
          {children}
        </At>
      )}
    </Frame>
  </Pop>
);

/** Decoration rows (icon + text) inside a tall tile. */
const Rows: React.FC<{ f: number; at: number; items: string[]; ok: boolean }> = ({ f, at, items, ok }) => (
  <>
    {items.map((s, i) => {
      const a = at + i * 5;
      return (
        <div
          key={s}
          style={{ position: "absolute", left: 0, top: i * 64, display: "flex", alignItems: "center", gap: 14, ...rise(f, a, 16) }}
        >
          <div style={{ width: 38, height: 38, flex: "none" }}>
            {ok ? <CheckBadge f={f} start={a} size={38} ring={false} /> : <CrossBadge f={f} start={a} size={38} />}
          </div>
          <span style={{ ...TX.label, fontSize: 26, whiteSpace: "nowrap" }}>{s}</span>
        </div>
      );
    })}
  </>
);

/** A criterion row: dim placeholder (empty box) from the card entry, ticks and lights up on its word. */
const CritRow: React.FC<{ f: number; show: number; at: number; text: string }> = ({ f, show, at, text }) => {
  const lit = eo(f, at, 10);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, whiteSpace: "nowrap", ...rise(f, show, 14) }}>
      <div style={{ position: "relative", width: 40, height: 40, flex: "none" }}>
        <div
          style={{
            position: "absolute",
            inset: 2,
            borderRadius: "50%",
            border: "3px solid rgba(154,160,170,0.45)",
            opacity: 1 - lit,
          }}
        />
        <div style={{ position: "absolute", inset: 0 }}>
          <CheckBadge f={f} start={at + 2} size={40} ring={false} />
        </div>
      </div>
      <span style={{ ...TX.label, fontSize: 28, color: interpolateColors(lit, [0, 1], [C.muted, C.text]), opacity: 0.55 + 0.45 * lit }}>{text}</span>
    </div>
  );
};

const PolishCard: React.FC<{ f: number; t: Tm }> = ({ f, t }) => {
  const p = sp(f, t.wFirst + 14, "pop");
  const aW = eo(f, t.wFirst + 22, 22);
  const aTxt = eo(f, t.wFirst + 34, 10);
  const bF = eo(f, t.b5, 14);
  const bTxt = eo(f, t.b5 + 6, 8);
  const res = eo(f, t.wResult, 10);
  const crit = [
    { text: "под вашу аудиторию", at: t.wAud },
    { text: "ваш стиль", at: t.wStyle },
    { text: "ваши критерии", at: t.wCrit },
  ];
  const Y = 16; // vertical centring of the content in the 290-px card
  return (
    <Pop x={140} y={530} w={1640} h={290} p={p} d={50}>
      <Frame w={1640} h={290} kind="plain" glow={glowWin(f, t.b5, t.b5 + 30, 0)}>
        <At x={34} y={26 + Y} style={{ display: "flex", alignItems: "center", gap: 16, whiteSpace: "nowrap", ...rise(f, t.wFirst + 18, 12) }}>
          <Chip text="v1" tone="muted" size={24} mono />
          <span style={{ ...TX.label, fontSize: 28 }}>первая версия — всегда хуже, чем хочется</span>
        </At>
        {/* 80 / 20 bar */}
        <At x={34} y={96 + Y} w={1040} h={80}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 832 * aW,
              height: 80,
              boxSizing: "border-box",
              borderRadius: 16,
              background: C.surface2,
              border: `2px solid rgba(243,239,230,0.14)`,
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", left: 24, top: 0, height: 76, display: "flex", alignItems: "center", ...TX.label, fontSize: 28, color: C.muted, whiteSpace: "nowrap", opacity: aTxt }}>
              80 % — первая версия
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              left: 840,
              top: 0,
              width: 200,
              height: 80,
              boxSizing: "border-box",
              borderRadius: 16,
              border: bF > 0.5 ? `2px solid ${C.accent}` : "2px dashed rgba(154,160,170,0.5)",
              overflow: "hidden",
              opacity: aTxt,
            }}
          >
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 200 * bF, background: C.accent }} />
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {bTxt < 1 && <span style={{ position: "absolute", ...TX.title, fontSize: 40, color: "rgba(154,160,170,0.6)", opacity: 1 - bTxt }}>?</span>}
              {bTxt > 0 && <span style={{ ...TX.title, fontSize: 48, color: C.bg, opacity: bTxt }}>20 %</span>}
            </div>
          </div>
        </At>
        <At x={874} y={190 + Y} w={200} style={{ textAlign: "center", ...TX.label, fontSize: 30, fontWeight: 800, color: C.accent, whiteSpace: "nowrap", ...rise(f, t.b5 + 6, 14) }}>
          шлифовка
        </At>
        <div style={{ position: "absolute", left: 1092, top: 26, width: 2, height: 238, background: C.line, opacity: aTxt }} />
        <At x={1124} y={26 + Y} style={{ ...TX.label, fontSize: 28, fontWeight: 800, whiteSpace: "nowrap", color: interpolateColors(res, [0, 1], [C.muted, C.text]), ...rise(f, t.wFirst + 26, 14) }}>
          делает результат <span style={{ color: interpolateColors(res, [0, 1], [C.muted, C.accent]) }}>вашим</span>
        </At>
        {crit.map((c, i) => (
          <At key={c.text} x={1124} y={84 + Y + i * 56}>
            <CritRow f={f} show={t.wFirst + 30 + i * 4} at={c.at} text={c.text} />
          </At>
        ))}
      </Frame>
    </Pop>
  );
};

const PageFormula: React.FC<{ f: number; t: Tm }> = ({ f, t }) => {
  const kc = eio(f, t.wFirst, 18);
  const h = mix(570, 250, kc);
  const deco = 1 - eo(f, t.wFirst, 8);
  const ats = [t.wPie, t.wRules, t.wRakes, t.b4];
  return (
    <>
      <Header
        f={f}
        at={t.wWhat + 6}
        title={
          <>
            Что такое <Acc>скилл</Acc>
          </>
        }
      />
      {/* skeleton: [ ? ] + [ ? ] + [ ? ] = [ ? ] */}
      {[0, 1, 2, 3].map((k) => {
        const ph = eo(f, t.wWhat + 8 + k * 3, 10) * (1 - eo(f, ats[k] + 2, 6));
        if (ph <= 0.001) return null;
        return (
          <div
            key={k}
            style={{
              position: "absolute",
              left: tileX(k),
              top: 250,
              width: TILE_W,
              height: h,
              boxSizing: "border-box",
              borderRadius: 22,
              border: "3px dashed rgba(154,160,170,0.35)",
              opacity: ph,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ ...TX.title, fontSize: 64, color: "rgba(154,160,170,0.5)" }}>?</span>
          </div>
        );
      })}
      {[0, 1, 2].map((k) => {
        const p = sp(f, t.wWhat + 10 + k * 3, "bouncy");
        if (p <= 0.002) return null;
        return (
          <div
            key={k}
            style={{
              position: "absolute",
              left: tileX(k) + TILE_W,
              top: 250 + h / 2 - 38,
              width: 56,
              textAlign: "center",
              ...TX.title,
              fontSize: 64,
              color: C.accent,
              opacity: Math.min(1, p * 1.6),
              transform: `translateY(${(1 - p) * -16}px)`,
            }}
          >
            {k < 2 ? "+" : "="}
          </div>
        );
      })}
      <FTile f={f} at={t.wPie} x={tileX(0)} y={250} h={h} d={TILES[0]} deco={deco}>
        {LAYERS.map((s, i) => {
          const p = sp(f, t.wPie + 4 + (3 - i) * 5, "heavy");
          return (
            <div
              key={s}
              style={{
                position: "absolute",
                left: 0,
                top: i * 64,
                width: 300,
                height: 56,
                boxSizing: "border-box",
                borderRadius: 14,
                background: i % 2 ? C.surface2 : C.raised,
                borderLeft: `6px solid ${C.accent}`,
                display: "flex",
                alignItems: "center",
                paddingLeft: 20,
                ...TX.label,
                fontSize: 26,
                opacity: Math.min(1, p * 1.6),
                transform: `translateY(${(1 - p) * -40}px)`,
              }}
            >
              {s}
            </div>
          );
        })}
      </FTile>
      <FTile f={f} at={t.wRules} x={tileX(1)} y={250} h={h} d={TILES[1]} deco={deco}>
        <Rows f={f} at={t.wRules + 4} items={RULES} ok />
      </FTile>
      <FTile f={f} at={t.wRakes} x={tileX(2)} y={250} h={h} d={TILES[2]} deco={deco}>
        <Rows f={f} at={t.wRakes + 3} items={RAKES} ok={false} />
      </FTile>
      <PolishCard f={f} t={t} />
    </>
  );
};

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// PAGE 4 — «выносите в отдельного агента и не трогайте»
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
const DOCK = { x: 406, y: 394 };

/** The «Скилл» tile: result of the formula, then it flies into the separate agent. Lives outside the pages. */
const SkillTile: React.FC<{ f: number; t: Tm }> = ({ f, t }) => {
  if (f < t.b4 - 1) return null;
  const kc = eio(f, t.wFirst, 18);
  const mv = eio(f, t.wTake + 4, 26);
  const h = mix(570, 250, kc);
  const x = mix(tileX(3), DOCK.x, mv);
  const y = mix(250, DOCK.y, mv) - 80 * Math.sin(Math.PI * mv);
  const deco = 1 - eo(f, t.wFirst, 8);
  const glow = Math.max(glowWin(f, t.b4, t.b4 + 36, 0.3), glowWin(f, t.wTake + 28, t.wTake + 48, 0.3) * (mv > 0 ? 1 : 0));
  return (
    <FTile f={f} at={t.b4} x={x} y={y} h={h} d={TILES[3]} deco={deco} hot glow={glow}>
      <At x={75} y={20} w={150} h={150} style={{ transform: `translateY(${float(f, 5, 3)}px)` }}>
        <Burst f={f} start={t.b4 + 4} r0={70} r1={130} n={10} />
        <AxeGlyph size={150} color={C.accent} />
      </At>
      <At x={0} y={206} w={300} style={{ display: "flex", justifyContent: "center" }}>
        <Stamp text="1 РАЗ" f={f} start={t.wOnce} size={34} />
      </At>
    </FTile>
  );
};

const PageAgent: React.FC<{ f: number; t: Tm }> = ({ f, t }) => {
  const card = sp(f, t.wTake + 8, "pop");
  return (
    <>
      <Header
        f={f}
        at={t.wTake + 6}
        title={
          <>
            Задача решена — <Acc>в отдельного агента</Acc>
          </>
        }
        chips={[{ text: "под замком", icon: "lock", at: t.b6 }]}
      />
      <Pop x={140} y={250} w={900} h={570} p={card} from="left" d={60}>
        <Frame w={900} h={570} kind="chat" title="отдельный агент" icon="bot" />
      </Pop>
      <At x={140} y={684} w={900} style={{ display: "flex", justifyContent: "center", gap: 16 }}>
        <div style={rise(f, t.wTake + 22, 16, "pop")}>
          <Chip text="задача решена" icon="check" tone="ok" size={26} />
        </div>
        <div style={rise(f, t.wWorks, 16, "pop")}>
          <Chip text="работает" icon="check" tone="ok" size={26} />
        </div>
      </At>
    </>
  );
};

/** Glass cover + padlock over the docked skill tile. */
const LockCover: React.FC<{ f: number; t: Tm }> = ({ f, t }) => {
  if (f < t.b6) return null;
  const cv = eo(f, t.b6, 10);
  const lp = sp(f, t.b6 + 2, "stamp");
  const close = eo(f, t.b6 + 10, 6);
  const click = bump(f, t.b6 + 15, 10);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: DOCK.x - 16,
          top: DOCK.y - 16,
          width: TILE_W + 32,
          height: 282,
          boxSizing: "border-box",
          borderRadius: 30,
          border: `3px dashed rgba(255,179,0,${0.85 * cv})`,
          background: `rgba(255,179,0,${0.06 * cv})`,
        }}
      />
      {f >= t.b6 + 2 && (
        <div
          style={{
            position: "absolute",
            left: 740,
            top: 336,
            width: 100,
            height: 120,
            opacity: Math.min(1, (f - t.b6 - 2) / 3),
            transform: `scale(${2 - lp})`,
            transformOrigin: "50% 70%",
          }}
        >
          <svg width={100} height={120} viewBox="0 0 100 120" style={{ overflow: "visible", display: "block" }}>
            <path
              d="M26 56 V36 a24 24 0 0 1 48 0 V56"
              transform={`translate(0 ${-14 * (1 - close) - 3 * click})`}
              fill="none"
              stroke={C.text}
              strokeWidth={10}
              strokeLinecap="round"
            />
            <rect x={8} y={52} width={84} height={64} rx={14} fill={C.accent} stroke={C.bg} strokeWidth={4} />
            <circle cx={50} cy={78} r={8} fill={C.bg} />
            <rect x={46} y={80} width={8} height={18} rx={3} fill={C.bg} />
          </svg>
        </div>
      )}
    </>
  );
};

/** «Работает — не трогай»: the sign drops onto its nail and swings to rest. */
const SignBoard: React.FC<{ f: number; t: Tm }> = ({ f, t }) => {
  const s0 = t.b6 + 4;
  if (f < s0) return null;
  const drop = sp(f, s0, "heavy");
  const tt = f - s0;
  const ang = 6 * Math.exp(-tt / 26) * Math.sin(tt * 0.24);
  const NX = 1430;
  const NY = 316;
  const PL = { x: 1130, y: 430, w: 600, h: 250 };
  const glow = bump(f, t.wDont, 26);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        opacity: Math.min(1, drop * 1.8),
        transform: `translateY(${(1 - drop) * -110}px) rotate(${ang}deg)`,
        transformOrigin: `${NX}px ${NY}px`,
      }}
    >
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <path d={`M${NX} ${NY} L${PL.x + 60} ${PL.y + 28} M${NX} ${NY} L${PL.x + PL.w - 60} ${PL.y + 28}`} stroke="rgba(243,239,230,0.5)" strokeWidth={3} fill="none" />
      </svg>
      <div
        style={{
          position: "absolute",
          left: PL.x,
          top: PL.y,
          width: PL.w,
          height: PL.h,
          borderRadius: 24,
          background: C.accent,
          boxShadow: `inset 0 0 0 6px ${C.bg}, inset 0 0 0 11px ${C.accent}, inset 0 0 0 14px rgba(17,19,24,0.85), 0 30px 60px rgba(0,0,0,0.45), 0 0 ${70 * glow}px rgba(255,179,0,${0.55 * glow})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {[60, PL.w - 60].map((sx) => (
          <div key={sx} style={{ position: "absolute", left: sx - 8, top: 20, width: 16, height: 16, borderRadius: 8, background: C.bg }} />
        ))}
        <div style={{ ...TX.title, fontSize: 64, color: C.bg, letterSpacing: "0.03em", lineHeight: 1.1, textAlign: "center", whiteSpace: "nowrap" }}>
          РАБОТАЕТ —
          <br />
          НЕ ТРОГАЙ
        </div>
      </div>
      <div style={{ position: "absolute", left: NX - 11, top: NY - 11, width: 22, height: 22, borderRadius: 11, background: C.muted, border: `3px solid ${C.bg}` }} />
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const Axe: React.FC<SceneProps> = ({ f, b, w }) => {
  const t = timing(b, w);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Page f={f} a={t.b0} z={t.b1}>
        <PageLincoln f={f} t={t} />
      </Page>
      <Page f={f} a={t.b1} z={t.wWhat}>
        <PageSkill f={f} t={t} />
      </Page>
      <Page f={f} a={t.wWhat} z={t.wTake}>
        <PageFormula f={f} t={t} />
      </Page>
      <Page f={f} a={t.wTake}>
        <PageAgent f={f} t={t} />
      </Page>
      <SkillTile f={f} t={t} />
      <LockCover f={f} t={t} />
      <SignBoard f={f} t={t} />
    </div>
  );
};
