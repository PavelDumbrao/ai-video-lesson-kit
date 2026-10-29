import React from "react";
import { C, MONO } from "../../../theme";
import { bump, ei, eio, eo, float, hash, lin, mix, shake, sp, SprName, typed } from "../../anim";
import { Icon, IconName } from "../../icons";
import { SceneProps } from "../../types";
import { Avatar, Bubble, CheckBadge, Checklist, Chip, Frame, Pop, Ripple, Stamp, Strike, Tone, TX } from "../../ui";
import { Burst, PulseDot } from "../../viz";
import { ArrowPath, At, Count, IconTile } from "../kit";

// «Сколько это стоит и что дальше» (раздел 12, 605,05–660,58 с). Лица в отрезке нет — вся сцена графика,
// пять композиций подряд:
//  P1 себестоимость: кольцо долей («лицо» — большой сектор, голос · графика · рендер — тонкие) в центре →
//     на «урок» уезжает влево, справа часы «урок 14 мин ≈ 1 час агента», «без меня»;
//  P2 было/сейчас: слева 34 ролика руками (ночи, красные глаза, «надо записать»), справа пустая сетка 60
//     уроков, которая заполняется на «шестьдесят»;
//  P3 «расширьте мышление»: конвейер контента, человек в горлышке → уходит с линии, поток ускоряется,
//     счётчик «1000 роликов в месяц»;
//  P4 рынки: новая страна → 1000 роликов → спрос → продукт (центр → влево), справа маркетплейсы:
//     ценник ×2, внутренняя конкуренция → внешний трафик, «свой бренд»;
//  P5 узкое горлышко — вы: воронка с человеком в горлышке, 4 подписки · 4 проекта (центр → влево),
//     справа ИИ-приёмщик с чек-листом «критерии приёмки».
// Сумм и дат нет: доли — только площадью секторов.

type Dir = "below" | "above" | "left" | "right" | "none";
const ZX = 140; // scene zone x 140–1780
const ZW = 1640;
const CY = 250; // content cards start here
const CH = 570;

/** Элемент живёт до следующего бита: уходит плавно за 10 кадров до `bNext`; без `bNext` не гаснет. */
const safeExitAlpha = (f: number, bNext?: number) => (bNext === undefined ? 1 : 1 - ei(f, bNext - 10, 10));

/** One composition of the scene: visible from `a`, leaves (up + fade) right before `z`. */
const Page: React.FC<{ f: number; a: number; z?: number; children?: React.ReactNode }> = ({ f, a, z, children }) => {
  if (f < a - 1) return null;
  const al = safeExitAlpha(f, z === undefined ? undefined : z - 1);
  if (al <= 0.002) return null;
  const q = 1 - al;
  return <div style={{ position: "absolute", inset: 0, opacity: al, transform: q > 0 ? `translateY(${-28 * q}px)` : undefined }}>{children}</div>;
};

type HChip = { text: string; icon?: IconName; tone?: Tone; at: number };
/** Scene heading row: kicker + title on the left, chips on the right (flex-start, never flex-end). */
const Head: React.FC<{ f: number; at: number; kicker: string; title: string; chips?: HChip[] }> = ({ f, at, kicker, title, chips = [] }) => {
  const p = sp(f, at, "snap");
  if (p <= 0.002) return null;
  const r = eo(f, at + 2, 16);
  return (
    <div style={{ position: "absolute", left: ZX, top: 130, width: ZW, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <div style={{ ...TX.kicker, color: C.accent, opacity: Math.min(1, p * 1.6), transform: `translateX(${(1 - p) * -24}px)`, whiteSpace: "nowrap" }}>{kicker}</div>
        <div style={{ overflow: "hidden", padding: "0.12em 0.06em 0.16em", margin: "-0.12em -0.06em -0.16em", marginTop: 8 }}>
          <div style={{ ...TX.title, fontSize: 38, whiteSpace: "nowrap", transform: `translateY(${(1 - r) * 110}%)` }}>{title}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        {chips.map((c, i) => {
          const cp = sp(f, c.at, "pop");
          if (cp <= 0.002) return null;
          return (
            <div key={i} style={{ opacity: Math.min(1, cp * 1.6), transform: `translateY(${(1 - cp) * 16}px)` }}>
              <Chip text={c.text} icon={c.icon} tone={c.tone ?? "outline"} size={24} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** A content card (26/34 padding grid) that springs in at `at`, with a kicker in the top-left corner. */
const Panel: React.FC<{
  f: number;
  at: number;
  x: number;
  w: number;
  y?: number;
  h?: number;
  from?: Dir;
  spr?: SprName;
  kicker?: string;
  icon?: IconName;
  glow?: number;
  tone?: string;
  dim?: number;
  children?: React.ReactNode;
}> = ({ f, at, x, w, y = CY, h = CH, from = "below", spr = "pop", kicker, icon, glow = 0, tone = C.accent, dim = 0, children }) => (
  <Pop x={x} y={y} w={w} h={h} p={sp(f, at, spr)} from={from} d={60}>
    <Frame w={w} h={h} kind="plain" glow={glow} tone={tone}>
      <div style={{ position: "absolute", inset: 0, opacity: 1 - dim }}>
        {kicker && (
          <div style={{ position: "absolute", left: 34, top: 26, display: "flex", alignItems: "center", gap: 12, ...TX.kicker, whiteSpace: "nowrap" }}>
            {icon && <Icon name={icon} size={30} color={C.accent} sw={3.8} />}
            {kicker}
          </div>
        )}
        {children}
      </div>
    </Frame>
  </Pop>
);

/** A block without a size that springs in at `at`. */
const In: React.FC<{ f: number; at: number; x: number; y: number; from?: Dir; spr?: SprName; d?: number; children?: React.ReactNode }> = ({
  f,
  at,
  x,
  y,
  from = "below",
  spr = "pop",
  d = 24,
  children,
}) => (
  <Pop x={x} y={y} p={sp(f, at, spr)} from={from} d={d}>
    {children}
  </Pop>
);

// ── P1: cost donut + clock ─────────────────────────────────────────────────────────────────────────────────
const SECT = [
  { name: "Лицо", a: 0, b: 0.74, color: C.accent },
  { name: "Голос", a: 0.74, b: 0.83, color: "rgba(243,239,230,0.8)" },
  { name: "Графика", a: 0.83, b: 0.915, color: C.muted },
  { name: "Рендер", a: 0.915, b: 1, color: "rgba(154,160,170,0.55)" },
];

const Donut: React.FC<{ f: number; starts: number[]; ex: number }> = ({ f, starts, ex }) => {
  const S = 420;
  const R = 168;
  const SW = 74;
  const c = S / 2;
  const GAP = 0.008;
  return (
    <svg width={S} height={S} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <circle cx={c} cy={c} r={R} fill="none" stroke="rgba(243,239,230,0.06)" strokeWidth={SW} />
      {SECT.map((s, i) => {
        const p = eio(f, starts[i], i === 0 ? 28 : 12);
        if (p <= 0.001) return null;
        const len = (s.b - s.a - GAP) * p;
        const th = ((-90 + ((s.a + s.b) / 2) * 360) * Math.PI) / 180;
        const e = i === 0 ? ex : 0;
        return (
          <g key={i} transform={`translate(${(Math.cos(th) * e).toFixed(2)} ${(Math.sin(th) * e).toFixed(2)})`}>
            <circle
              cx={c}
              cy={c}
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={SW}
              pathLength={1}
              strokeDasharray={`${len} 1`}
              strokeDashoffset={-(s.a + GAP / 2)}
              transform={`rotate(-90 ${c} ${c})`}
            />
          </g>
        );
      })}
    </svg>
  );
};

const Clock: React.FC<{ p: number; size?: number }> = ({ p, size = 270 }) => {
  const c = size / 2;
  const ang = 2 * Math.PI * Math.min(p, 0.9995);
  const r = c - 30;
  const wedge = `M${c} ${c} L${c} ${c - r} A${r} ${r} 0 ${ang > Math.PI ? 1 : 0} 1 ${(c + Math.sin(ang) * r).toFixed(2)} ${(c - Math.cos(ang) * r).toFixed(2)} Z`;
  return (
    <svg width={size} height={size} style={{ display: "block", overflow: "visible" }}>
      <circle cx={c} cy={c} r={c - 6} fill={C.surface2} stroke="rgba(243,239,230,0.12)" strokeWidth={3} />
      {p > 0.004 && <path d={wedge} fill="rgba(255,179,0,0.16)" />}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const r0 = i % 3 === 0 ? c - 36 : c - 28;
        return (
          <line
            key={i}
            x1={c + Math.sin(a) * r0}
            y1={c - Math.cos(a) * r0}
            x2={c + Math.sin(a) * (c - 16)}
            y2={c - Math.cos(a) * (c - 16)}
            stroke={i % 3 === 0 ? C.text : C.muted}
            strokeWidth={i % 3 === 0 ? 5 : 3}
            strokeLinecap="round"
          />
        );
      })}
      {p > 0.002 && (
        <circle
          cx={c}
          cy={c}
          r={c - 6}
          fill="none"
          stroke={C.accent}
          strokeWidth={10}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${Math.min(1, p)} 1`}
          transform={`rotate(-90 ${c} ${c})`}
        />
      )}
      <line x1={c} y1={c} x2={c} y2={44} stroke={C.text} strokeWidth={7} strokeLinecap="round" transform={`rotate(${360 * p} ${c} ${c})`} />
      <line x1={c} y1={c} x2={c} y2={78} stroke={C.accent} strokeWidth={9} strokeLinecap="round" transform={`rotate(${30 * p} ${c} ${c})`} />
      <circle cx={c} cy={c} r={10} fill={C.accent} />
    </svg>
  );
};

// ── P3: the content conveyor ─────────────────────────────────────────────────────────────────────────────────
const BAND_Y = 240;
const BAND_X0 = 60;
const BAND_X1 = 1160;
const GATE_X = 150;
const bandPath = (pinch: number) => {
  const hh = (x: number) => 42 - pinch * 30 * Math.exp(-(((x - GATE_X) / 60) ** 2));
  const top: string[] = [];
  const bot: string[] = [];
  for (let x = BAND_X0; x <= BAND_X1; x += 10) {
    top.push(`${x} ${(BAND_Y - hh(x)).toFixed(1)}`);
    bot.push(`${x} ${(BAND_Y + hh(x)).toFixed(1)}`);
  }
  return `M${top.join(" L")} L${bot.reverse().join(" L")} Z`;
};
const STATIONS: { x: number; icon: IconName; t: string }[] = [
  { x: 330, icon: "doc", t: "сценарий" },
  { x: 510, icon: "mic", t: "голос" },
  { x: 690, icon: "camera", t: "лицо" },
  { x: 870, icon: "layers", t: "графика" },
  { x: 1050, icon: "video", t: "рендер" },
];
/** Distance travelled: v0 px/frame, then a linear ramp (R frames) to v1 from frame `t`. */
const travel = (f: number, s: number, t: number, v0: number, v1: number, R = 30) => {
  const base = v0 * Math.max(0, f - s);
  const u = f - t;
  const extra = u <= 0 ? 0 : u < R ? (u * u) / (2 * R) : R / 2 + (u - R);
  return base + (v1 - v0) * extra;
};

// ── P4: dotted map of the new country ────────────────────────────────────────────────────────────────────────
const MAP_W = 234;
const MAP_H = 338;
const PIN = { x: 0.62 * MAP_W, y: 0.72 * MAP_H };
const MAP = (() => {
  const pts: { x: number; y: number; d: number; hi: boolean }[] = [];
  const blob = (u: number, v: number) =>
    Math.exp(-(((u - 0.45) / 0.36) ** 2 + ((v - 0.36) / 0.3) ** 2)) + 0.85 * Math.exp(-(((u - 0.6) / 0.26) ** 2 + ((v - 0.74) / 0.22) ** 2));
  for (let r = 0; r < 13; r++)
    for (let c = 0; c < 9; c++) {
      const u = (c + 0.5) / 9;
      const v = (r + 0.5) / 13;
      if (blob(u, v) + 0.18 * (hash(r * 13 + c) - 0.5) < 0.4) continue;
      const x = c * 26 + 13;
      const y = r * 26 + 13;
      const d = Math.hypot(x - PIN.x, y - PIN.y);
      pts.push({ x, y, d, hi: d < 56 });
    }
  return pts;
})();

const Tag: React.FC<{ rot: number }> = ({ rot }) => (
  <div style={{ position: "relative", width: 240, height: 128, transformOrigin: "26px 64px", transform: `rotate(${rot}deg)` }}>
    <svg width={240} height={128} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <path d="M6 64 L54 8 H226 a10 10 0 0 1 10 10 V110 a10 10 0 0 1 -10 10 H54 Z" fill={C.raised} stroke={C.accent} strokeWidth={3} strokeLinejoin="round" />
      <circle cx={44} cy={64} r={10} fill={C.surface} stroke={C.accent} strokeWidth={3} />
    </svg>
    <div style={{ position: "absolute", left: 80, top: 0, height: 128, display: "flex", alignItems: "center", ...TX.title, fontSize: 40 }}>цена</div>
  </div>
);

// ── P5: the funnel ───────────────────────────────────────────────────────────────────────────────────────────
const FN = { y0: 206, y1: 378, y2: 440, xl0: 110, xr0: 750, xl1: 380, xr1: 480 };
const fxL = (y: number) => mix(FN.xl0, FN.xl1, (y - FN.y0) / (FN.y1 - FN.y0));
const fxR = (y: number) => mix(FN.xr0, FN.xr1, (y - FN.y0) / (FN.y1 - FN.y0));
const CRITERIA = ["текст читается", "ничего не налезает", "графика в такт голосу", "звук ровный"];

export const Cost: React.FC<SceneProps> = ({ f, b, t0, w }) => {
  const [bCost, bHour, bOld, bSixty, bThousand, bCountry, bMarket, bNeck, bAccept] = b;
  const T = {
    face: w("лицо"),
    voice: w("голос"),
    graph: w("графика"),
    render: w("рендер"),
    cheap: w("копейки"),
    lesson: w("урок"),
    fourteen: w("четырнадцать"),
    noMe: w("без"),
    nights: w("ночи"),
    eyes: w("красные"),
    must: w("надо"),
    several: w("несколько"),
    widen: w("расширьте"),
    human: w("человек"),
    narrow: w("узкое"),
    thousandL: w("тысяча"),
    demand: w("спрос"),
    product: w("продукт"),
    price: w("цену"),
    twice: w("вдвое"),
    leave: w("уходите"),
    outer: w("внешний"),
    brand: w("бренд"),
    subs: w("четыре", 646),
    projs: w("четыре", 649),
    paral: w("параллельно"),
    cogn: w("когнитивно"),
    digest: w("переварите"),
    so: w("поэтому"),
    knows: w("знает"),
    crit: w("критерии"),
    accepts: w("принимает"),
    start: w("начинать"),
  };
  // composition starts (a hair before the beat so the old page and the new one cross-fade, no empty frame)
  const a2 = bOld - 1;
  const a3 = T.widen - 1;
  const a4 = bCountry - 1;
  const a5 = bNeck - 1;
  // light parallax: the two cards of a page float out of phase
  const flA = float(f, 1, 3, 130);
  const flB = float(f, 2.4, 4, 104);

  // ── P1 ──
  const k1 = sp(f, T.lesson - 10, "soft");
  const donutX = mix(510, 140, k1);
  const starts = [bCost, T.voice, T.graph, T.render];
  const ex = 12 * sp(f, T.face, "bouncy");
  const hourP = eio(f, bHour, 46);

  // ── P2 ──
  const oldN = Math.min(34, Math.floor(lin(f, bOld + 2, 34 * 1.6) * 34 + 0.0001));
  const dimOld = 0.3 * eo(f, bSixty, 18);
  const fills = Array.from({ length: 60 }, (_, i) => {
    const order = ((i % 12) + Math.floor(i / 12) * 1.5) / 17;
    return eo(f, bSixty + 3 + order * 58, 8);
  });
  const newN = fills.filter((v) => v > 0.5).length;
  const gridDone = bSixty + 3 + 58 + 8;

  // ── P3 ──
  const openAt = T.narrow + 4;
  const pinch = 1 - eio(f, openAt, 22);
  const lift = eio(f, T.narrow, 20);
  const ph = travel(f, a3, openAt, 1.2, 7.5);
  const N = 15;
  const SPC = (BAND_X1 - BAND_X0) / N;
  const extraIn = eo(f, openAt + 2, 20);
  const tiles = Array.from({ length: N }, (_, i) => {
    const x = BAND_X0 + ((((ph + i * SPC) % (BAND_X1 - BAND_X0)) + (BAND_X1 - BAND_X0)) % (BAND_X1 - BAND_X0));
    const edge = Math.min(1, (x - BAND_X0) / 40) * Math.min(1, (BAND_X1 - x) / 40);
    return { x, a: Math.max(0, edge) * (i % 3 === 0 ? 1 : extraIn) };
  });
  const near = (sx: number) => tiles.reduce((m, t) => Math.max(m, t.a * Math.exp(-(((t.x - sx) / 28) ** 2))), 0);
  const binHit = near(BAND_X1 - 10);
  const speed = 0.12 + 0.88 * eio(f, openAt + 6, 40);
  const warnQ = ei(f, T.narrow, 8);

  // ── P4 ──
  const k6 = sp(f, bMarket - 12, "soft");
  const countryX = mix(560, 140, k6);
  const ROWS: { icon: IconName; t: string; s: string; at: number; ok?: boolean }[] = [
    { icon: "pin", t: "Новая страна", s: "сначала — контент", at: bCountry + 4 },
    { icon: "video", t: "1000 роликов", s: "на их языке", at: T.thousandL },
    { icon: "chart", t: "Спрос проверен", s: "реакция рынка", at: T.demand, ok: true },
    { icon: "box", t: "Потом — продукт", s: "везёте товар", at: T.product },
  ];

  // ── P5 ──
  const kP = sp(f, T.so - 12, "soft");
  const funnelX = mix(530, 140, kP);
  const relief = eio(f, T.accepts, 36);
  const level = lin(f, T.subs + 20, 150) * (1 - 0.75 * relief);
  const yTop = FN.y1 - 150 * level;
  const overload = eo(f, T.cogn, 12) * (1 - relief);
  const funnelDraw = eo(f, bNeck + 4, 20);
  const personShake = shake(f, T.cogn, 9, 26) + shake(f, T.digest, 9, 26);
  const parts: { x: number; y: number; o: number }[] = [];
  for (let k = 0; k < 90; k++) {
    const s0 = T.subs + 8 + k * 5;
    if (s0 >= T.accepts) break;
    const proj = k % 2 === 1;
    if (proj && s0 < T.projs + 8) continue;
    const t = (f - s0) / 26;
    if (t <= 0 || t >= 1) continue;
    const sx = proj ? 478 + 292 * hash(k * 3.3) : 90 + 292 * hash(k * 5.7);
    const tx = mix(fxL(yTop) + 24, fxR(yTop) - 24, hash(k * 7.1 + 2));
    parts.push({ x: mix(sx, tx, t * t), y: mix(186, yTop - 10, t * t), o: Math.min(1, t * 4) * Math.min(1, (1 - t) * 5) });
  }

  return (
    <>
      {/* ═════ P1 · себестоимость ═════ */}
      <Page f={f} a={t0} z={a2}>
        <Head f={f} at={t0} kicker="Себестоимость урока" title="Самая дорогая часть — лицо" chips={[{ text: "доли расходов", icon: "chart", at: bCost + 10 }]} />
        <Panel f={f} at={bCost} x={donutX} y={CY + flA} w={900} kicker="Из чего складывается урок" icon="chart">
          <At x={34} y={112} w={420} h={420}>
            <Donut f={f} starts={starts} ex={ex} />
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 420,
                height: 420,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                opacity: eo(f, bCost + 10, 12),
              }}
            >
              <Icon name="video" size={64} color={C.text} sw={3.4} />
              <div style={{ ...TX.label, fontSize: 28 }}>1 урок</div>
            </div>
          </At>
          <In f={f} at={bCost + 6} x={500} y={104} from="right" d={30}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: C.accent }} />
              <div style={{ ...TX.title, fontSize: 44, whiteSpace: "nowrap" }}>Лицо</div>
            </div>
            <div style={{ ...TX.label, fontSize: 26, color: C.accent, marginTop: 8, whiteSpace: "nowrap" }}>самая дорогая часть</div>
            <div style={{ marginTop: 14, width: 330, height: 18, borderRadius: 9, background: "rgba(243,239,230,0.08)" }}>
              <div style={{ width: 330 * eo(f, bCost + 8, 26), height: 18, borderRadius: 9, background: C.accent }} />
            </div>
          </In>
          {[1, 2, 3].map((i) => (
            <In key={i} f={f} at={starts[i]} x={500} y={262 + (i - 1) * 60} from="right" spr="snap" d={24}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 20, height: 20, borderRadius: 5, background: SECT[i].color }} />
                <div style={{ ...TX.label, fontSize: 30, width: 160, whiteSpace: "nowrap" }}>{SECT[i].name}</div>
                <div style={{ width: 40 * eo(f, starts[i] + 2, 12), height: 12, borderRadius: 6, background: SECT[i].color }} />
              </div>
            </In>
          ))}
          <div
            style={{
              position: "absolute",
              left: 484,
              top: 246,
              width: 382,
              height: 190,
              borderRadius: 18,
              border: "2px dashed rgba(255,179,0,0.55)",
              opacity: eo(f, T.cheap, 10),
            }}
          />
          <In f={f} at={T.cheap + 2} x={500} y={456} spr="bouncy" d={16}>
            <Chip text="копейки" icon="spark" tone="outline" size={28} />
          </In>
        </Panel>
        <Panel f={f} at={T.lesson + 2} x={Math.max(1080, donutX + 940)} y={CY + flB} w={700} from="right" kicker="Время на урок" icon="clock">
          <At x={34} y={84} style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ ...TX.label, fontSize: 28 }}>Урок</div>
            <div style={{ display: "flex", gap: 4 }}>
              {Array.from({ length: 14 }, (_, j) => {
                const on = eo(f, T.lesson + 8 + j * 1.4, 6);
                return <div key={j} style={{ width: 18, height: 26, borderRadius: 4, background: on > 0 ? `rgba(255,179,0,${0.25 + 0.75 * on})` : "rgba(243,239,230,0.08)" }} />;
              })}
            </div>
            <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 32, color: C.accent, whiteSpace: "nowrap", opacity: eo(f, T.fourteen, 10) }}>14 мин</div>
          </At>
          <At x={34} y={164}>
            <Clock p={hourP} />
          </At>
          <In f={f} at={bHour} x={344} y={180} from="right" d={30}>
            <div style={{ ...TX.label, fontSize: 28, color: C.muted }}>около</div>
            <div style={{ ...TX.title, fontSize: 64, color: C.accent, whiteSpace: "nowrap", marginTop: 4 }}>1 час</div>
            <div style={{ ...TX.label, fontSize: 28, marginTop: 8, whiteSpace: "nowrap" }}>работы агента</div>
          </In>
          <In f={f} at={T.noMe} x={34} y={462} spr="pop" d={20}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div style={{ position: "relative", width: 64, height: 64 }}>
                <IconTile icon="user" size={64} color={C.muted} bg="rgba(154,160,170,0.14)" />
                <Strike w={64} h={64} p={eo(f, T.noMe + 6, 10)} color={C.muted} width={6} />
              </div>
              <div style={{ ...TX.title, fontSize: 38, color: C.accent, whiteSpace: "nowrap" }}>без меня</div>
              <CheckBadge f={f} start={T.noMe + 10} size={46} />
            </div>
          </In>
        </Panel>
      </Page>

      {/* ═════ P2 · было / сейчас ═════ */}
      <Page f={f} a={a2} z={a3}>
        <Head f={f} at={a2} kicker="Как было и как сейчас" title="Было руками — сейчас агентом" />
        <Panel f={f} at={a2} x={140} y={CY + flA} w={760} kicker="Было · руками" icon="hand" dim={dimOld}>
          <In f={f} at={bOld + 2} x={34} y={70} spr="snap" d={20}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
              <Count v={Math.max(1, oldN)} style={{ fontSize: 72, color: C.text, lineHeight: 1.1 }} />
              <span style={{ ...TX.label, fontSize: 32, whiteSpace: "nowrap" }}>ролика руками</span>
            </div>
          </In>
          <At x={34} y={172} style={{ display: "grid", gridTemplateColumns: "repeat(12, 50px)", gap: 8 }}>
            {Array.from({ length: 34 }, (_, i) => {
              const p = sp(f, bOld + 2 + i * 1.6, "snap");
              return (
                <div
                  key={i}
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 10,
                    background: C.surface2,
                    border: "1px solid rgba(243,239,230,0.14)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: Math.min(1, p * 1.5),
                    transform: `translateY(${(1 - p) * 10}px)`,
                  }}
                >
                  <Icon name="video" size={26} color={C.muted} sw={3.4} />
                </div>
              );
            })}
          </At>
          <At x={34} y={366} style={{ display: "flex", gap: 14 }}>
            <div style={{ opacity: Math.min(1, sp(f, T.nights, "pop") * 1.6), transform: `translateY(${(1 - sp(f, T.nights, "pop")) * 14}px)` }}>
              <Chip text="ночи" icon="moon" tone="dark" size={26} />
            </div>
            <div style={{ opacity: Math.min(1, sp(f, T.eyes, "pop") * 1.6), transform: `translateY(${(1 - sp(f, T.eyes, "pop")) * 14}px)` }}>
              <Chip text="красные глаза" icon="eye" tone="err" size={26} />
            </div>
          </At>
          <In f={f} at={T.must} x={34} y={442} d={16}>
            <Bubble size={28} maxW={560}>
              {typed("«надо записать…»", f, T.must + 2, 22) || " "}
            </Bubble>
          </In>
        </Panel>
        <Panel f={f} at={a2 + 12} x={940} y={CY + flB} w={840} from="right" kicker="Сейчас · агент" icon="bot" glow={0.5 * eo(f, bSixty, 14)}>
          <In f={f} at={bSixty} x={34} y={70} spr="snap" d={20}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
              <Count v={newN} style={{ fontSize: 72, color: C.accent, lineHeight: 1.1 }} />
              <span style={{ ...TX.label, fontSize: 32, whiteSpace: "nowrap" }}>уроков</span>
            </div>
          </In>
          <At x={64} y={172} style={{ display: "grid", gridTemplateColumns: "repeat(12, 52px)", gap: 8 }}>
            {fills.map((v, i) => (
              <div
                key={i}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 11,
                  background: v > 0 ? `rgba(255,179,0,${0.2 + 0.8 * v})` : "transparent",
                  border: v > 0 ? "2px solid rgba(255,179,0,0.9)" : "2px dashed rgba(154,160,170,0.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transform: `translateY(${-6 * bump(f, bSixty + 3 + (((i % 12) + Math.floor(i / 12) * 1.5) / 17) * 58, 12)}px)`,
                }}
              >
                {v > 0.4 && <Icon name="play" size={22} color={C.bg} style={{ opacity: v }} />}
              </div>
            ))}
          </At>
          <At x={34} y={488} style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ opacity: Math.min(1, sp(f, T.several, "pop") * 1.6), transform: `translateY(${(1 - sp(f, T.several, "pop")) * 14}px)` }}>
              <Chip text="за несколько ночей" icon="moon" tone="outline" size={26} />
            </div>
            <CheckBadge f={f} start={Math.max(gridDone, T.several + 8)} size={48} />
          </At>
        </Panel>
      </Page>

      {/* ═════ P3 · расширьте мышление: конвейер ═════ */}
      <Page f={f} a={a3} z={a4}>
        <Head f={f} at={a3} kicker="А теперь" title="Расширьте мышление" />
        <Panel f={f} at={a3} x={ZX} y={CY + flA * 0.6} w={ZW} kicker="Производство контента" icon="gear" glow={0.45 * eo(f, bThousand, 14)}>
          <svg width={ZW} height={CH} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
            <path d={bandPath(pinch)} fill={C.surface2} stroke="rgba(243,239,230,0.14)" strokeWidth={2} opacity={eo(f, a3 + 6, 14)} />
          </svg>
          {tiles.map((t, i) =>
            t.a > 0.01 && f > a3 + 8 ? (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: t.x - 22,
                  top: BAND_Y - 15,
                  width: 44,
                  height: 30,
                  borderRadius: 7,
                  background: C.accent,
                  opacity: t.a * eo(f, a3 + 8, 12),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="play" size={16} color={C.bg} />
              </div>
            ) : null,
          )}
          {STATIONS.map((s, i) => {
            const p = sp(f, a3 + 8 + i * 4, "pop");
            if (p <= 0.002) return null;
            const g = near(s.x);
            return (
              <div key={i} style={{ position: "absolute", left: s.x - 80, top: BAND_Y - 40, width: 160, opacity: Math.min(1, p * 1.6) }}>
                <div
                  style={{
                    width: 80,
                    height: 80,
                    margin: "0 auto",
                    borderRadius: 40,
                    background: C.raised,
                    border: `3px solid rgba(255,179,0,${0.35 + 0.65 * g})`,
                    boxShadow: `0 0 ${24 * g}px rgba(255,179,0,${0.45 * g})`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transform: `scale(${0.6 + 0.4 * p})`,
                  }}
                >
                  <Icon name={s.icon} size={42} color={C.accent} sw={3.6} />
                </div>
                <div style={{ ...TX.label, fontSize: 24, color: C.muted, textAlign: "center", marginTop: 14, whiteSpace: "nowrap" }}>{s.t}</div>
              </div>
            );
          })}
          {/* the person: sits in the neck, then leaves the line */}
          {f > a3 + 6 && (
            <div
              style={{
                position: "absolute",
                left: GATE_X - 50,
                top: BAND_Y - 50 - 112 * lift,
                width: 100,
                height: 100,
                opacity: Math.min(1, sp(f, a3 + 6, "pop") * 1.6),
                transform: `scale(${0.7 + 0.3 * sp(f, a3 + 6, "pop")})`,
              }}
            >
              <Ripple f={f} start={T.human} size={100} color={C.err} dur={24} />
              <Avatar
                size={100}
                icon="user"
                ring={f >= T.human && f < T.narrow + 8 ? C.err : lift > 0.5 ? C.muted : C.accent}
                tone={lift > 0.5 ? C.muted : C.text}
              />
            </div>
          )}
          {/* output bin + counter */}
          <div style={{ position: "absolute", left: 1180, top: BAND_Y - 56, opacity: eo(f, a3 + 14, 12), transform: `translateY(${-6 * binHit}px)` }}>
            <IconTile icon="box" size={112} ring={`rgba(255,179,0,${0.3 + 0.7 * binHit})`} />
          </div>
          <In f={f} at={bThousand} x={1326} y={150} spr="snap" d={20}>
            <div style={{ position: "relative" }}>
              <Burst f={f} start={bThousand + 30} r0={70} r1={140} n={10} />
              <Count v={1000 * eo(f, bThousand, 40)} style={{ fontSize: 72, color: C.accent, lineHeight: 1.1 }} />
            </div>
            <div style={{ ...TX.label, fontSize: 28, marginTop: 6, whiteSpace: "nowrap" }}>роликов в месяц</div>
          </In>
          {/* bottom: state chip + speed meter */}
          {f >= T.human && warnQ < 1 && (
            <div style={{ position: "absolute", left: 34, top: 444, opacity: Math.min(1, sp(f, T.human, "pop") * 1.6) * (1 - warnQ), transform: `translateY(${(1 - sp(f, T.human, "pop")) * 14}px)` }}>
              <Chip text="человек — узкое горлышко" icon="warn" tone="err" size={26} />
            </div>
          )}
          <In f={f} at={T.narrow + 8} x={34} y={444} spr="bouncy" d={16}>
            <Chip text="человек вне конвейера" icon="check" tone="outline" size={26} />
          </In>
          <div style={{ position: "absolute", left: 600, top: 416, opacity: eo(f, a3 + 16, 12) }}>
            <div style={{ ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap" }}>скорость выпуска</div>
            <div style={{ position: "relative", marginTop: 14, width: 1006, height: 26, borderRadius: 13, background: "rgba(243,239,230,0.08)", overflow: "hidden" }}>
              <div style={{ width: 1006 * speed, height: 26, borderRadius: 13, background: C.accent }} />
            </div>
          </div>
        </Panel>
      </Page>

      {/* ═════ P4 · рынки ═════ */}
      <Page f={f} a={a4} z={a5}>
        <Head
          f={f}
          at={a4}
          kicker="Куда девать тысячу роликов"
          title="Новые рынки и свой бренд"
          chips={[{ text: "1000 роликов в месяц", icon: "video", at: a4 + 10 }]}
        />
        <Panel f={f} at={a4} x={countryX} y={CY + flA} w={800} kicker="Новая страна" icon="globe">
          {ROWS.map((r, i) => {
            const y = 84 + i * 112;
            const lineP = i < ROWS.length - 1 ? eo(f, ROWS[i + 1].at - 6, 10) : 0;
            return (
              <React.Fragment key={i}>
                {lineP > 0 && <div style={{ position: "absolute", left: 34 + 36, top: y + 80, width: 4, height: 28 * lineP, borderRadius: 2, background: C.accent }} />}
                <In f={f} at={r.at} x={34} y={y} from="left" d={30}>
                  <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                    <IconTile icon={r.icon} size={76} />
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ ...TX.title, fontSize: 32, whiteSpace: "nowrap" }}>{r.t}</div>
                        {r.ok && <CheckBadge f={f} start={r.at + 6} size={40} />}
                      </div>
                      <div style={{ ...TX.label, fontSize: 24, color: C.muted, marginTop: 4, whiteSpace: "nowrap" }}>{r.s}</div>
                    </div>
                  </div>
                </In>
              </React.Fragment>
            );
          })}
          <At x={530} y={96} w={MAP_W} h={MAP_H}>
            {MAP.map((d, i) => {
              const o = eo(f, a4 + 4 + d.d / 14, 8);
              if (o <= 0) return null;
              const hi = d.hi ? eo(f, T.thousandL + d.d / 6, 10) : 0;
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: d.x - 7,
                    top: d.y - 7,
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    opacity: o,
                    background: hi > 0 ? `rgba(255,179,0,${0.35 + 0.65 * hi})` : "rgba(154,160,170,0.42)",
                  }}
                />
              );
            })}
            <div style={{ position: "absolute", left: PIN.x - 11, top: PIN.y - 11 }}>
              <PulseDot f={f} start={a4 + 16} size={22} />
            </div>
          </At>
        </Panel>
        <Panel f={f} at={bMarket} x={Math.max(980, countryX + 840)} y={CY + flB} w={800} from="right" kicker="Маркетплейсы" icon="cart">
          <At x={34} y={84} style={{ opacity: eo(f, bMarket + 4, 12) }}>
            <Tag rot={shake(f, T.price, 9, 34)} />
          </At>
          <In f={f} at={T.twice} x={310} y={98} spr="stamp" d={10}>
            <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 72, color: C.accent, lineHeight: 1.1 }}>×2</div>
              <div style={{ ...TX.label, fontSize: 30, whiteSpace: "nowrap" }}>цена вдвое</div>
            </div>
          </In>
          <In f={f} at={T.leave} x={34} y={256} from="left" d={24}>
            <div
              style={{
                width: 300,
                height: 116,
                boxSizing: "border-box",
                padding: "14px 20px",
                borderRadius: 16,
                background: C.surface2,
                border: `1px solid ${C.line}`,
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <Icon name="team" size={44} color={C.muted} sw={3.4} />
              <div style={{ ...TX.label, fontSize: 26, color: C.muted, lineHeight: 1.2 }}>
                внутренняя
                <br />
                конкуренция
              </div>
            </div>
          </In>
          <svg width={800} height={CH} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
            <ArrowPath x1={346} y1={314} x2={422} y2={314} p={eo(f, T.outer - 8, 12)} width={5} />
          </svg>
          <In f={f} at={T.outer} x={432} y={256} from="right" spr="bouncy" d={24}>
            <div
              style={{
                width: 300,
                height: 116,
                boxSizing: "border-box",
                padding: "14px 20px",
                borderRadius: 16,
                background: "rgba(255,179,0,0.1)",
                border: "2px solid rgba(255,179,0,0.75)",
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <Icon name="trend" size={44} color={C.accent} sw={3.8} />
              <div style={{ ...TX.label, fontSize: 26, lineHeight: 1.2 }}>
                внешний
                <br />
                трафик
              </div>
            </div>
          </In>
          {f >= T.brand && (
            <At x={34} y={408} w={732} h={130} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 26 }}>
              <div style={{ opacity: Math.min(1, sp(f, T.brand, "pop") * 1.6), transform: `translateY(${(1 - sp(f, T.brand, "pop")) * 14}px)` }}>
                <IconTile icon="crown" size={84} />
              </div>
              <div style={{ position: "relative" }}>
                <Burst f={f} start={T.brand + 8} r0={90} r1={130} n={12} />
                <Stamp text="СВОЙ БРЕНД" f={f} start={T.brand + 3} size={40} rot={-5} />
              </div>
            </At>
          )}
        </Panel>
      </Page>

      {/* ═════ P5 · узкое горлышко — вы; ИИ-приёмщик ═════ */}
      <Page f={f} a={a5}>
        <Head f={f} at={a5} kicker="Следующий шаг" title="Узким горлышком становитесь вы" chips={[{ text: "ИИ-приёмщик", icon: "bot", at: bAccept + 4 }]} />
        <Panel f={f} at={a5} x={funnelX} y={CY + flA} w={860} kicker="Когнитивный предел" icon="brain">
          {/* inputs: 4 subscriptions · 4 projects */}
          <In f={f} at={T.subs} x={90} y={70} from="left" spr="snap" d={20}>
            <div style={{ ...TX.label, fontSize: 28, whiteSpace: "nowrap" }}>4 подписки</div>
          </In>
          {[0, 1, 2, 3].map((j) => (
            <In key={`s${j}`} f={f} at={T.subs + 3 + j * 4} x={90 + j * 76} y={114} spr="bouncy" d={18}>
              <IconTile icon="zap" size={64} />
            </In>
          ))}
          <In f={f} at={T.projs} x={478} y={70} from="right" spr="snap" d={20}>
            <div style={{ ...TX.label, fontSize: 28, whiteSpace: "nowrap" }}>4 проекта</div>
          </In>
          {[0, 1, 2, 3].map((j) => (
            <In key={`p${j}`} f={f} at={T.projs + 3 + j * 4} x={478 + j * 76} y={114} spr="bouncy" d={18}>
              <IconTile icon="folder" size={64} />
            </In>
          ))}
          <svg width={860} height={CH} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
            {funnelDraw > 0 && (
              <>
                <path
                  d={`M${FN.xl0} ${FN.y0} L${FN.xr0} ${FN.y0} L${FN.xr1} ${FN.y1} L${FN.xr1} ${FN.y2} L${FN.xl1} ${FN.y2} L${FN.xl1} ${FN.y1} Z`}
                  fill="rgba(255,179,0,0.05)"
                  opacity={funnelDraw}
                />
                {level > 0.002 && (
                  <>
                    <path
                      d={`M${fxL(yTop)} ${yTop} L${fxR(yTop)} ${yTop} L${FN.xr1} ${FN.y1} L${FN.xl1} ${FN.y1} Z`}
                      fill="rgba(255,179,0,0.26)"
                      opacity={1 - overload}
                    />
                    <path
                      d={`M${fxL(yTop)} ${yTop} L${fxR(yTop)} ${yTop} L${FN.xr1} ${FN.y1} L${FN.xl1} ${FN.y1} Z`}
                      fill="rgba(248,113,113,0.26)"
                      opacity={overload}
                    />
                    <path d={`M${fxL(yTop) + 4} ${yTop} L${fxR(yTop) - 4} ${yTop}`} stroke={overload > 0.5 ? C.err : C.accent} strokeWidth={3} strokeLinecap="round" opacity={0.8} />
                  </>
                )}
                <path
                  d={`M${FN.xl0} ${FN.y0} L${FN.xl1} ${FN.y1} L${FN.xl1} ${FN.y2}`}
                  fill="none"
                  stroke={C.accent}
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  strokeDasharray="1 1"
                  strokeDashoffset={1 - funnelDraw}
                />
                <path
                  d={`M${FN.xr0} ${FN.y0} L${FN.xr1} ${FN.y1} L${FN.xr1} ${FN.y2}`}
                  fill="none"
                  stroke={C.accent}
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  strokeDasharray="1 1"
                  strokeDashoffset={1 - funnelDraw}
                />
              </>
            )}
          </svg>
          {parts.map((p, i) => (
            <div key={i} style={{ position: "absolute", left: p.x - 8, top: p.y - 8, width: 16, height: 16, borderRadius: 4, background: C.accent, opacity: p.o }} />
          ))}
          {/* trickle out of the neck */}
          {Array.from({ length: 12 }, (_, k) => {
            const s0 = a5 + 24 + k * 40;
            const t = (f - s0) / 30;
            if (t <= 0 || t >= 1) return null;
            return (
              <div
                key={`d${k}`}
                style={{ position: "absolute", left: 430 - 12, top: mix(448, 528, t), width: 24, height: 16, borderRadius: 4, background: C.accent, opacity: Math.min(1, (1 - t) * 3) }}
              />
            );
          })}
          {/* the person stuck in the neck */}
          {f > a5 + 4 && (
            <div
              style={{
                position: "absolute",
                left: 430 - 48 + personShake,
                top: 344,
                width: 96,
                height: 96,
                opacity: Math.min(1, sp(f, a5 + 4, "stamp") * 1.6),
                transform: `scale(${0.6 + 0.4 * sp(f, a5 + 4, "stamp")})`,
              }}
            >
              <Ripple f={f} start={T.cogn} size={96} color={C.err} dur={24} />
              <Avatar size={96} icon="user" ring={overload > 0.5 ? C.err : C.accent} tone={C.text} />
            </div>
          )}
          <In f={f} at={T.digest} x={520} y={398} spr="stamp" d={12}>
            <Chip text="не переварить" icon="warn" tone="err" size={26} />
          </In>
          <In f={f} at={T.paral} x={90} y={398} from="left" spr="snap" d={20}>
            <div style={{ ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap" }}>всё параллельно</div>
          </In>
        </Panel>
        <Panel f={f} at={T.so} x={Math.max(1040, funnelX + 900)} y={CY + flB} w={740} from="right" kicker="ИИ-приёмщик" icon="bot" glow={0.6 * eo(f, T.accepts, 12)}>
          <At x={34} y={74} style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <Avatar size={100} icon="bot" />
            <div>
              <div style={{ ...TX.title, fontSize: 36, whiteSpace: "nowrap" }}>Ваш ИИ-приёмщик</div>
              <div style={{ ...TX.label, fontSize: 26, color: C.muted, marginTop: 6, whiteSpace: "nowrap", opacity: eo(f, T.knows, 10) }}>знает ваши критерии</div>
            </div>
          </At>
          {f >= T.crit - 2 && (
            <At
              x={34}
              y={200}
              w={672}
              h={236}
              style={{
                boxSizing: "border-box",
                padding: "14px 20px",
                borderRadius: 16,
                background: C.surface2,
                border: `1px solid ${eo(f, bAccept, 10) > 0 ? "rgba(255,179,0,0.5)" : C.line}`,
                opacity: eo(f, T.crit - 2, 10),
                transform: `translateY(${(1 - eo(f, T.crit - 2, 12)) * 16}px)`,
              }}
            >
              <div style={{ ...TX.kicker, color: C.accent, whiteSpace: "nowrap" }}>Критерии приёмки</div>
              <div style={{ marginTop: 14 }}>
                <Checklist items={CRITERIA.map((t, i) => ({ text: t, at: bAccept + 2 + i * 8 }))} f={f} size={28} gap={12} />
              </div>
            </At>
          )}
          <In f={f} at={T.start} x={34} y={470} spr="pop" d={16}>
            <Chip text="обучать — сегодня" icon="spark" tone="accent" size={26} />
          </In>
          {f >= T.accepts && (
            <div style={{ position: "absolute", left: 412, top: 474 }}>
              <Stamp text="ПРИНЯТО" f={f} start={T.accepts} size={30} rot={-4} />
            </div>
          )}
        </Panel>
      </Page>
    </>
  );
};
