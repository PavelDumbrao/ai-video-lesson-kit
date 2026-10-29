import React from "react";
import { interpolateColors } from "remotion";
import { at, C, MONO, SANS } from "../../../theme";
import { bump, ei, eio, eo, float, mix, sp, SprName, typed } from "../../anim";
import { Icon, IconName } from "../../icons";
import { SceneProps } from "../../types";
import { Avatar, CheckBadge, Chip, Frame, glowWin, Pop, Ripple, StatusIcon, TX } from "../../ui";
import { ArrowPath, IconTile, Overlay, Slide, Verdict } from "../kit";

// Сцена 10 урока 1 «Харнес: модель и домик» (494.41–538.98 с голоса).
// Три кристалла-модели → модель заселяется в домик-харнес (инструменты + стикеры-инструкции) →
// та же модель в домике лучше, чем в чате; Blender-куб на столе → основной агент раздаёт задания
// другим домикам → сверху «вы ставите результат».
// Лицо: F09 во весь экран до 495.86, угол СПРАВА 495.86–501.98 (x ≥ 1220, y 280–850 свободно) —
// до конца угла всё стоит в x 140–1180; домик въезжает справа только после 501.98.

// ── помощники этой сцены ─────────────────────────────────────────────────────────────────────

/** Элемент живёт до следующего бита: плавно уходит за 10 кадров от `bNext`; без `bNext` не гаснет. */
const safeExitAlpha = (f: number, bNext?: number) => (bNext === undefined || !Number.isFinite(bNext) ? 1 : 1 - ei(f, bNext, 10));

type P2 = [number, number];
type GemKind = "diamond" | "prism" | "octa";
type Facet = { p: P2[]; s: number };
const fac = (s: number, ...p: P2[]): Facet => ({ p, s });

/** Грани кристаллов в поле 100×120; `s` > 0 — подсветка белым, < 0 — тень. */
const GEM_FACETS: Record<GemKind, Facet[]> = {
  diamond: (() => {
    const T1: P2 = [30, 16];
    const T2: P2 = [70, 16];
    const G1: P2 = [4, 42];
    const G2: P2 = [27, 42];
    const G3: P2 = [50, 42];
    const G4: P2 = [73, 42];
    const G5: P2 = [96, 42];
    const Cu: P2 = [50, 114];
    return [
      fac(0.14, G1, T1, G2),
      fac(0.32, T1, G3, G2),
      fac(0.5, T1, T2, G3),
      fac(0.24, T2, G4, G3),
      fac(0.02, T2, G5, G4),
      fac(-0.16, G1, G2, Cu),
      fac(0.08, G2, G3, Cu),
      fac(-0.06, G3, G4, Cu),
      fac(-0.38, G4, G5, Cu),
    ];
  })(),
  prism: (() => {
    const P: P2 = [50, 2];
    const L1: P2 = [14, 28];
    const R1: P2 = [86, 28];
    const F1: P2 = [55, 38];
    const L2: P2 = [14, 92];
    const R2: P2 = [86, 92];
    const F2: P2 = [55, 102];
    const B: P2 = [50, 118];
    return [fac(0.1, P, L1, F1), fac(0.3, P, F1, R1), fac(-0.12, L1, F1, F2, L2), fac(0.02, F1, R1, R2, F2), fac(-0.4, L2, F2, B), fac(-0.26, F2, R2, B)];
  })(),
  octa: (() => {
    const Tp: P2 = [50, 2];
    const Lf: P2 = [6, 62];
    const Rt: P2 = [94, 62];
    const Fr: P2 = [60, 70];
    const Bt: P2 = [50, 118];
    return [fac(0.14, Tp, Lf, Fr), fac(0.42, Tp, Fr, Rt), fac(-0.32, Lf, Fr, Bt), fac(-0.1, Fr, Rt, Bt)];
  })(),
};

/** Гранёный кристалл (модель) шириной `w`, высота 1.2·w; мягкий ореол снизу и редкая искра. */
const Gem: React.FC<{ kind: GemKind; w: number; tint: string; rgb: string; f: number; seed?: number; halo?: number }> = ({
  kind,
  w,
  tint,
  rgb,
  f,
  seed = 0,
  halo = 1,
}) => {
  const h = w * 1.2;
  const facets = GEM_FACETS[kind];
  const pts = (fc: Facet) => fc.p.map(([x, y]) => `${x},${y}`).join(" ");
  const tw = Math.pow(Math.max(0, Math.sin((f + seed * 41) / 17)), 10);
  return (
    <div style={{ position: "relative", width: w, height: h }}>
      {halo > 0 && (
        <div
          style={{
            position: "absolute",
            left: -w * 0.3,
            width: w * 1.6,
            top: h * 0.8,
            height: h * 0.34,
            borderRadius: "50%",
            background: `radial-gradient(ellipse at center, rgba(${rgb},${0.32 * halo}) 0%, rgba(${rgb},0) 70%)`,
          }}
        />
      )}
      <svg width={w} height={h} viewBox="0 0 100 120" style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {facets.map((fc, i) => (
          <polygon key={`a${i}`} points={pts(fc)} fill={tint} />
        ))}
        {facets.map((fc, i) => (
          <polygon key={`b${i}`} points={pts(fc)} fill={fc.s > 0 ? "#FFFFFF" : "#000000"} opacity={Math.abs(fc.s)} />
        ))}
        {facets.map((fc, i) => (
          <polygon key={`c${i}`} points={pts(fc)} fill="none" stroke="rgba(17,19,24,0.55)" strokeWidth={1.4} strokeLinejoin="round" />
        ))}
      </svg>
      <div style={{ position: "absolute", left: w * 0.14, top: h * 0.04, opacity: 0.95 * tw }}>
        <Icon name="spark" size={Math.max(10, w * 0.2)} color="#FFFFFF" />
      </div>
    </div>
  );
};

const MODELS: { kind: GemKind; name: string; tint: string; rgb: string; spr: SprName }[] = [
  { kind: "diamond", name: "Opus", tint: C.accent, rgb: "255,179,0", spr: "pop" },
  { kind: "prism", name: "GPT", tint: C.text, rgb: "243,239,230", spr: "snap" },
  { kind: "octa", name: "Gemini", tint: "#FFD27A", rgb: "255,210,122", spr: "heavy" },
];

/** Серый «кубик по умолчанию» с янтарной обводкой выделения, честно вращается в 3D. */
const CUBE_FACES: { v: number[]; n: [number, number, number] }[] = [
  { v: [1, 3, 7, 5], n: [1, 0, 0] },
  { v: [0, 4, 6, 2], n: [-1, 0, 0] },
  { v: [2, 6, 7, 3], n: [0, 1, 0] },
  { v: [0, 1, 5, 4], n: [0, -1, 0] },
  { v: [4, 5, 7, 6], n: [0, 0, 1] },
  { v: [0, 2, 3, 1], n: [0, 0, -1] },
];
const LIGHT = (() => {
  const v = [-0.42, 0.78, 0.46];
  const n = Math.hypot(v[0], v[1], v[2]);
  return v.map((x) => x / n);
})();
const Cube3D: React.FC<{ s: number; ang: number; tilt?: number }> = ({ s, ang, tilt = 0.48 }) => {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const rot = (x: number, y: number, z: number): [number, number, number] => {
    const x1 = x * ca + z * sa;
    const z1 = -x * sa + z * ca;
    return [x1, y * ct - z1 * st, y * st + z1 * ct];
  };
  const P = Array.from({ length: 8 }, (_, i) => rot(i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1));
  const half = s * 1.65;
  const xy = (i: number) => `${half + s * P[i][0]},${half - s * P[i][1]}`;
  const faces = CUBE_FACES.map((fc) => {
    const n = rot(...fc.n);
    return { v: fc.v, z: n[2], lum: n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2] };
  });
  return (
    <svg width={half * 2} height={half * 2} style={{ display: "block", overflow: "visible" }}>
      {faces
        .filter((fc) => fc.z <= 0)
        .map((fc, i) => (
          <polygon key={`h${i}`} points={fc.v.map(xy).join(" ")} fill="none" stroke="rgba(255,179,0,0.4)" strokeWidth={2} strokeDasharray="6 7" />
        ))}
      {faces
        .filter((fc) => fc.z > 0)
        .map((fc, i) => {
          const k = Math.max(0, Math.min(1, 0.28 + 0.72 * fc.lum));
          const rgb = `rgb(${Math.round(mix(64, 206, k))},${Math.round(mix(70, 211, k))},${Math.round(mix(82, 219, k))})`;
          return <polygon key={`v${i}`} points={fc.v.map(xy).join(" ")} fill={rgb} stroke={C.accent} strokeWidth={3} strokeLinejoin="round" />;
        })}
    </svg>
  );
};

/** Жёлтый стикер-инструкция: заголовок моно + строка, которая дописывается на своём слове. */
const Sticker: React.FC<{ w: number; head: string; line: string; f: number; lineAt: number; glow?: number }> = ({ w, head, line, f, lineAt, glow = 0 }) => (
  <div
    style={{
      position: "relative",
      width: w,
      padding: "14px 18px 14px",
      borderRadius: 6,
      background: "#FFD27A",
      boxShadow: `0 14px 26px rgba(0,0,0,0.4)${glow > 0.01 ? `, 0 0 0 ${4 * glow}px rgba(255,179,0,${0.9 * glow}), 0 0 36px rgba(255,179,0,${0.5 * glow})` : ""}`,
    }}
  >
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: -13,
        width: 80,
        height: 26,
        marginLeft: -40,
        borderRadius: 3,
        background: "rgba(243,239,230,0.5)",
        transform: "rotate(-4deg)",
      }}
    />
    <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 24, letterSpacing: "0.03em", color: "rgba(17,19,24,0.7)", whiteSpace: "nowrap", lineHeight: 1.2 }}>{head}</div>
    <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 28, color: C.bg, whiteSpace: "nowrap", height: 38, lineHeight: "38px" }}>{typed(line, f, lineAt, 26)}</div>
    <div
      style={{
        position: "absolute",
        right: 0,
        bottom: 0,
        width: 24,
        height: 24,
        borderBottomRightRadius: 6,
        background: "linear-gradient(to top left, rgba(17,19,24,0.38) 50%, #E3A21A 50%)",
      }}
    />
  </div>
);

/** Шаг в шапке: серый → янтарный, когда шаг наступил. */
const StepChip: React.FC<{ text: string; icon: IconName; lit: number }> = ({ text, icon, lit }) => {
  const bg = interpolateColors(lit, [0, 1], ["rgba(154,160,170,0.12)", "rgba(255,179,0,1)"]);
  const bd = interpolateColors(lit, [0, 1], ["rgba(154,160,170,0.35)", "rgba(255,179,0,1)"]);
  const fg = interpolateColors(lit, [0, 1], [C.muted, C.bg]);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        height: 46,
        padding: "0 20px 0 14px",
        borderRadius: 23,
        background: bg,
        border: `2px solid ${bd}`,
        color: fg,
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: 24,
        whiteSpace: "nowrap",
      }}
    >
      <Icon name={icon} size={26} color={fg} sw={4} />
      {text}
    </div>
  );
};

/** Домик-узел (фаза «домиков много»): крыша-треугольник + корпус-карточка. */
const HouseNode: React.FC<{ w: number; h: number; roofH: number; roof: string; stroke?: string; glow?: number; children?: React.ReactNode }> = ({
  w,
  h,
  roofH,
  roof,
  stroke,
  glow = 0,
  children,
}) => (
  <div style={{ position: "relative", width: w, height: h }}>
    <div
      style={{
        position: "absolute",
        left: 14,
        top: roofH - 4,
        width: w - 28,
        height: h - roofH + 4,
        borderRadius: "0 0 18px 18px",
        background: C.surface,
        border: `1px solid ${C.line}`,
        boxShadow:
          glow > 0.01
            ? `0 0 0 ${3 * glow}px rgba(255,179,0,${0.9 * glow}), 0 0 44px rgba(255,179,0,${0.3 * glow}), 0 24px 50px rgba(0,0,0,0.4)`
            : "0 24px 50px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 4, right: 0, bottom: 0 }}>{children}</div>
    </div>
    <svg width={w} height={roofH + 2} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <polygon points={`0,${roofH} ${w / 2},2 ${w},${roofH}`} fill={roof} stroke={stroke ?? "none"} strokeWidth={3} strokeLinejoin="round" />
    </svg>
  </div>
);

/** Пунктирный «пустой» домик: места под будущих агентов. */
const GhostHouse: React.FC<{ w: number; h: number; roofH: number }> = ({ w, h, roofH }) => (
  <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
    <polygon points={`2,${roofH} ${w / 2},3 ${w - 2},${roofH}`} fill="rgba(154,160,170,0.05)" stroke="rgba(154,160,170,0.6)" strokeWidth={3} strokeDasharray="12 10" strokeLinejoin="round" />
    <rect x={16} y={roofH} width={w - 32} height={h - roofH - 2} rx={18} fill="rgba(154,160,170,0.04)" stroke="rgba(154,160,170,0.6)" strokeWidth={3} strokeDasharray="12 10" />
  </svg>
);

/** Точка на ломаной `pts` при доле пути t ∈ [0, 1]. */
const along = (pts: P2[], t: number): P2 => {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = seg.reduce((a, v) => a + v, 0) || 1;
  let d = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const k = seg[i] > 0 ? Math.min(1, d / seg[i]) : 1;
      return [mix(pts[i][0], pts[i + 1][0], k), mix(pts[i][1], pts[i + 1][1], k)];
    }
    d -= seg[i];
  }
  return pts[pts.length - 1];
};

/** Строка формулы в карточке «харнес = …». */
const FormulaRow: React.FC<{ p: number; icon: IconName; title: string; sub: string; y: number }> = ({ p, icon, title, sub, y }) =>
  p <= 0.002 ? null : (
    <div
      style={{
        position: "absolute",
        left: 34,
        top: y,
        display: "flex",
        alignItems: "center",
        gap: 18,
        opacity: Math.min(1, p * 1.6),
        transform: `translateX(${(1 - p) * 26}px)`,
      }}
    >
      <IconTile icon={icon} size={64} />
      <div>
        <div style={{ ...TX.title, fontSize: 32, whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ ...TX.label, fontSize: 24, color: C.muted, whiteSpace: "nowrap", marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  );

// Геометрия фазы «домиков много» (экранные px).
const MAIN = { x: 700, y: 380, w: 520, h: 210, roofH: 60 };
const SUB_Y = 660;
const SUB_H = 160;
const SUB_ROOF = 46;
const BUS_Y = 624;
const SUBS: { x: number; title: string; sub: string; spr: SprName }[] = [
  { x: 140, title: "Сценарий", sub: "пишет Gemini", spr: "pop" },
  { x: 710, title: "Сцены", sub: "параллельные агенты", spr: "bouncy" },
  { x: 1280, title: "Проверка", sub: "третий агент", spr: "heavy" },
];
const subCx = (i: number) => SUBS[i].x + 250;
const busPath = (i: number): P2[] => [
  [960, MAIN.y + MAIN.h + 2],
  [960, BUS_Y],
  [subCx(i), BUS_Y],
  [subCx(i), SUB_Y - 6],
];

// Большой домик (фаза харнеса): рамка 1160×570 в точке (620, 250).
const HX = 620;
const HY = 250;
const GEM_HOME: P2 = [420, 328]; // центр кристалла за столом, в координатах домика
const TOOLS: IconName[] = ["terminal", "globe", "folder", "code", "search", "wrench"];

export const Harness: React.FC<SceneProps> = ({ f, b, t0, w }) => {
  const [bModels, bHarness, bStickers, bBetter, bBlender, bDeal, bResult] = b;

  // ── слова раздела (кадры) ──
  const wGemIn = [w("opus"), w("gpt"), w("gemini")];
  const wProg = w("программ");
  const wSettle = w("поселить");
  // Фаза 1 уходит первой (слева, угол не трогает), домик въезжает справа, когда карточки уже ушли и угол свободен.
  const L = Math.max(w("домик") - 8, at(501.98) - 3);
  const H = Math.max(w("домик") + 6, at(501.98) + 8); // правая зона: только после конца угла (+0,27 с запаса)
  const wTools = w("инструмент");
  const wInstr = w("инструкц");
  const wCC = w("claude");
  const wFood = w("еда");
  const wDesk = w("стол");
  const wWork = w("работаешь");
  const wGood = w("хорошем");
  const wChat = w("чате");
  const wGreat = w("отлично");
  const wClear = w("понятен");
  const P5 = w("домик", 524.5);
  const wMore = w("один", 525.5);
  const wSub = [w("сценарий"), w("сцены"), w("проверяет")];
  const wSubLine = [w("gemini", 529), w("параллельн"), w("третий")];
  const wAg = w("агент", 533.5);
  const wYou = w("вы", 535.5);
  const wYou2 = w("вы", 537);

  // ── шапка ──
  const pHead = sp(f, t0, "snap");
  const steps: { text: string; icon: IconName; at: number }[] = [
    { text: "модели", icon: "spark", at: wGemIn[0] },
    { text: "харнес", icon: "house", at: bHarness },
    { text: "агенты", icon: "team", at: bDeal },
  ];

  // ── фаза 1: три кристалла (x 140–1180, правый угол свободен) ──
  const q1 = ei(f, L, 10);
  const show1 = f < L + 10;

  // ── фаза 2: домик ──
  const pH = sp(f, H, "soft");
  const q5 = eio(f, P5, 18);
  const houseOn = pH > 0.002 && q5 < 0.999;
  const hdx = 170 * (1 - pH);
  const FL = H + 20 - L; // кристалл вылетает из карточки на L и садится за стол на H + 20 («живёт»)
  const tFly = eio(f, L, FL);
  const flying = f >= L && f < L + FL;
  const landed = f >= L + FL;
  const qL = ei(f, P5, 12); // левые карточки уходят, когда домиков становится много
  const houseGlow = glowWin(f, wGood, bBlender, 0.25);
  const stickGlow = bump(f, wClear, 40);

  // ── фаза 3: домиков много ──
  const busP = eo(f, bDeal, 12);
  const busH = eo(f, bDeal + 6, 16);
  const dropP = eo(f, bDeal + 16, 10);
  const subAct = (i: number) => eo(f, wSub[i], 10);
  const flyers: { i: number; s: number }[] = [
    ...wSub.map((s, i) => ({ i, s })),
    ...[0, 1, 2].map((i) => ({ i, s: wAg + i * 3 })),
  ];

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* ═════ ШАПКА ═════ */}
      {pHead > 0.002 && (
        <div
          style={{
            position: "absolute",
            left: 140,
            top: 130,
            width: 1640,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            opacity: Math.min(1, pHead * 1.6),
            transform: `translateY(${(1 - pHead) * -18}px)`,
          }}
        >
          <div>
            <div style={{ ...TX.kicker, color: C.accent }}>Харнес</div>
            <div style={{ ...TX.title, fontSize: 38, marginTop: 8, whiteSpace: "nowrap" }}>Модель та же — решает домик</div>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            {steps.map((s, i) => {
              const p = sp(f, t0 + 4 + i * 4, "snap");
              return (
                <div key={i} style={{ opacity: Math.min(1, p * 1.6), transform: `translateY(${(1 - p) * -14}px)` }}>
                  <StepChip text={s.text} icon={s.icon} lit={eo(f, s.at, 10)} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═════ ФАЗА 1: «Opus, GPT, Gemini — это модели, а не программы» ═════ */}
      {show1 &&
        MODELS.map((m, i) => {
          const p = sp(f, wGemIn[i], m.spr);
          const hideGem = i === 0 && f >= L; // Opus улетает в домик отдельным кристаллом
          return (
            <Pop key={i} x={140 + i * 360} y={250} w={320} h={420} p={p} q={q1} d={60}>
              <Frame w={320} h={420} kind="plain" glow={0.35 * bump(f, bModels + i * 4, 22)}>
                {!hideGem && (
                  <div style={{ position: "absolute", left: 75, top: 34, transform: `translateY(${float(f, i, 5, 84)}px)` }}>
                    <Gem kind={m.kind} w={170} tint={m.tint} rgb={m.rgb} f={f} seed={i} />
                  </div>
                )}
                <div style={{ position: "absolute", left: 0, right: 0, top: 268, textAlign: "center", ...TX.title, fontSize: 44 }}>{m.name}</div>
                <div style={{ position: "absolute", left: 0, right: 0, top: 328, textAlign: "center", ...TX.label, fontSize: 24, color: C.muted }}>модель</div>
              </Frame>
            </Pop>
          );
        })}
      {show1 && (
        <div style={{ position: "absolute", left: 140, top: 712, display: "flex", gap: 22, alignItems: "center", opacity: 1 - q1, transform: `translateY(${-26 * q1}px)` }}>
          <Verdict f={f} start={bModels} text="модели" ok size={28} />
          <Verdict f={f} start={wProg} text="программы" ok={false} size={28} />
          {(() => {
            const p = sp(f, wSettle, "pop");
            return p > 0.002 ? (
              <div style={{ opacity: Math.min(1, p * 1.6), transform: `translateX(${(1 - p) * 30}px)` }}>
                <Chip text="селится куда угодно" icon="arrow" tone="outline" size={28} />
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* ═════ ФАЗА 2: левая колонка — модели и формула ═════ */}
      {qL < 0.999 && (
        <Pop x={140} y={250} w={420} h={170} p={sp(f, H + 4, "snap")} q={qL} from="left" d={40}>
          <Frame w={420} h={170} kind="plain">
            {MODELS.map((m, i) => {
              const cx = 34 + 58.5 + i * 117;
              const away = i === 0;
              return (
                <div key={i}>
                  <div style={{ position: "absolute", left: cx - 29, top: 18, opacity: away ? 0.22 : 1, transform: `translateY(${float(f, i + 3, 3, 90)}px)` }}>
                    <Gem kind={m.kind} w={58} tint={m.tint} rgb={m.rgb} f={f} seed={i + 5} halo={away ? 0 : 0.8} />
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      left: cx - 58,
                      width: 116,
                      top: 102,
                      textAlign: "center",
                      ...TX.label,
                      fontSize: 26,
                      color: away ? C.accent : C.text,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {away ? "Opus →" : m.name}
                  </div>
                </div>
              );
            })}
          </Frame>
        </Pop>
      )}
      {qL < 0.999 && (
        <Pop x={140} y={450} w={420} h={370} p={sp(f, bHarness, "pop")} q={qL} from="left" d={40}>
          <Frame w={420} h={370} kind="plain">
            {/* формула харнеса */}
            <Slide f={f} a={bHarness} z={bBetter} dy={16}>
              <div style={{ position: "absolute", left: 34, top: 26, ...TX.kicker, color: C.accent }}>Харнес =</div>
              <FormulaRow p={sp(f, wTools, "snap")} icon="wrench" title="инструменты" sub="терминал, файлы" y={76} />
              {(() => {
                const p = sp(f, wTools + 8, "bouncy");
                return p > 0.002 ? (
                  <div style={{ position: "absolute", left: 34 + 18, top: 150, fontFamily: SANS, fontWeight: 900, fontSize: 40, color: C.accent, opacity: Math.min(1, p * 1.6), lineHeight: 1 }}>+</div>
                ) : null;
              })()}
              <FormulaRow p={sp(f, wInstr, "snap")} icon="doc" title="инструкции" sub="стикеры: что где" y={196} />
              {(() => {
                const p = sp(f, wCC, "pop");
                return p > 0.002 ? (
                  <div style={{ position: "absolute", left: 34, top: 296, opacity: Math.min(1, p * 1.6), transform: `translateY(${(1 - p) * 16}px)` }}>
                    <Chip text="пример: Claude Code" icon="terminal" tone="outline" size={24} />
                  </div>
                ) : null;
              })()}
            </Slide>
            {/* сравнение: та же модель в чате и в домике */}
            <Slide f={f} a={bBetter} dy={16}>
              <div style={{ position: "absolute", left: 34, top: 26, ...TX.kicker, color: C.accent }}>Та же модель</div>
              <div style={{ position: "absolute", left: 34, top: 64, ...TX.label, fontSize: 24, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="trend" size={26} color={C.muted} sw={4} />
                результат
              </div>
              <div style={{ position: "absolute", left: 40, right: 40, top: 296, height: 3, borderRadius: 2, background: "rgba(243,239,230,0.18)" }} />
              {[0, 1].map((k) => {
                const cx = k === 0 ? 120 : 300;
                const grow = k === 0 ? 0.3 * eo(f, wChat, 18) : 0.96 * eo(f, bBetter + 2, 26);
                const hh = 176 * grow;
                const show = k === 0 ? f >= wChat : f >= bBetter;
                return (
                  <div key={k}>
                    {show && (
                      <div
                        style={{
                          position: "absolute",
                          left: cx - 55,
                          top: 296 - hh,
                          width: 110,
                          height: hh,
                          borderRadius: "12px 12px 4px 4px",
                          background: k === 0 ? "rgba(154,160,170,0.5)" : C.accent,
                          overflow: "hidden",
                        }}
                      >
                        {hh > 46 && (
                          <div style={{ position: "absolute", left: 55 - 17, bottom: 8 }}>
                            <Icon name={k === 0 ? "chat" : "house"} size={34} color={C.bg} sw={4} />
                          </div>
                        )}
                      </div>
                    )}
                    {show && (
                      <div style={{ position: "absolute", left: cx - 22, top: 296 - hh - 58 }}>
                        <Gem kind="diamond" w={44} tint={C.accent} rgb="255,179,0" f={f} seed={k + 9} halo={0} />
                      </div>
                    )}
                    <div style={{ position: "absolute", left: cx - 90, width: 180, top: 308, textAlign: "center", ...TX.label, fontSize: 26, color: k === 0 ? C.muted : C.accent, whiteSpace: "nowrap" }}>
                      {k === 0 ? "в чате" : "в домике"}
                    </div>
                  </div>
                );
              })}
            </Slide>
          </Frame>
        </Pop>
      )}

      {/* ═════ ФАЗА 2: большой домик-харнес ═════ */}
      {houseOn && (
        <div
          style={{
            position: "absolute",
            left: HX,
            top: HY,
            width: 1160,
            height: 570,
            opacity: Math.min(1, pH * 1.6) * (1 - q5),
            transform: `translate(${hdx + (960 - 1200) * q5}px, ${(485 - 535) * q5}px) scale(${1 - 0.56 * q5})`,
            transformOrigin: "50% 50%",
          }}
        >
          <svg width={1160} height={570} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
            {/* дымок из трубы — домик обжит */}
            {[0, 1, 2].map((i) => {
              const ph = ((((f - H + i * 26) % 78) + 78) % 78) / 78;
              return (
                <circle
                  key={i}
                  cx={873 + 10 * Math.sin(ph * 3 + i)}
                  cy={28 - ph * 66}
                  r={12 + ph * 16}
                  fill={C.muted}
                  opacity={0.16 * (1 - ph) * Math.min(1, ph * 5)}
                />
              );
            })}
            <rect x={846} y={34} width={54} height={90} rx={6} fill={C.raised} stroke={C.line} strokeWidth={2} />
            {/* корпус */}
            <rect x={30} y={146} width={1100} height={424} rx={20} fill={C.surface} stroke="rgba(243,239,230,0.12)" strokeWidth={2} />
            {houseGlow > 0.01 && <rect x={30} y={146} width={1100} height={424} rx={20} fill="none" stroke={C.accent} strokeWidth={4} opacity={0.9 * houseGlow} />}
            <line x1={52} y1={540} x2={1108} y2={540} stroke="rgba(243,239,230,0.14)" strokeWidth={3} />
            {/* холодильник */}
            <rect x={60} y={190} width={220} height={350} rx={18} fill={C.raised} stroke="rgba(243,239,230,0.12)" strokeWidth={2} />
            <line x1={62} y1={300} x2={278} y2={300} stroke="rgba(17,19,24,0.55)" strokeWidth={4} />
            <rect x={250} y={214} width={9} height={62} rx={4.5} fill="rgba(154,160,170,0.7)" />
            <rect x={250} y={318} width={9} height={96} rx={4.5} fill="rgba(154,160,170,0.7)" />
            {/* стол */}
            <rect x={320} y={400} width={480} height={20} rx={6} fill="#3A4150" stroke="rgba(243,239,230,0.14)" strokeWidth={2} />
            <rect x={340} y={420} width={16} height={120} rx={4} fill="#3A4150" />
            <rect x={764} y={420} width={16} height={120} rx={4} fill="#3A4150" />
            {/* перфопанель для инструментов */}
            <rect x={850} y={190} width={250} height={350} rx={16} fill={C.surface2} stroke={C.line} strokeWidth={2} />
            {Array.from({ length: 9 * 12 }, (_, k) => (
              <circle key={k} cx={866 + (k % 9) * 27.5} cy={206 + Math.floor(k / 9) * 28} r={2.4} fill="rgba(243,239,230,0.1)" />
            ))}
            {/* крыша */}
            <polygon points="0,150 580,6 1160,150" fill={C.accent} />
            <line x1={580 - 193} y1={54} x2={580 + 193} y2={54} stroke="rgba(17,19,24,0.14)" strokeWidth={3} />
            <line x1={580 - 387} y1={102} x2={580 + 387} y2={102} stroke="rgba(17,19,24,0.14)" strokeWidth={3} />
            <polygon points="0,150 1160,150 1146,164 14,164" fill="#C98A00" />
          </svg>

          {/* надпись на крыше */}
          {(() => {
            const p = sp(f, bHarness, "stamp");
            return p > 0.002 ? (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  width: 1160,
                  top: 80,
                  textAlign: "center",
                  fontFamily: SANS,
                  fontWeight: 900,
                  fontSize: 50,
                  letterSpacing: "0.16em",
                  color: C.bg,
                  lineHeight: 1,
                  opacity: Math.min(1, p * 2),
                  transform: `translateY(${(1 - p) * -34}px)`,
                }}
              >
                ХАРНЕС
              </div>
            ) : null;
          })()}

          {/* инструменты на перфопанели */}
          {TOOLS.map((ic, i) => (
            <Pop key={ic} x={872 + (i % 2) * 118} y={208 + Math.floor(i / 2) * 114} w={96} h={96} p={sp(f, wTools + i * 3, "bouncy")} from="none" s0={0.55}>
              <IconTile icon={ic} size={96} />
            </Pop>
          ))}

          {/* стикеры-инструкции */}
          <Pop x={70} y={332} w={200} p={sp(f, bStickers, "stamp")} from="above" d={34} rot={-4} r0={-10}>
            <Sticker w={200} head="ХОЛОДИЛЬНИК" line="тут еда" f={f} lineAt={wFood} glow={stickGlow} />
          </Pop>
          <Pop x={430} y={428} w={290} p={sp(f, wDesk, "stamp")} from="above" d={34} rot={3} r0={9}>
            <Sticker w={290} head="СТОЛ" line="тут работаешь" f={f} lineAt={wWork} glow={stickGlow} />
          </Pop>

          {/* Blender: кубик на столе */}
          <Pop x={610} y={260} w={141} h={141} p={sp(f, bBlender, "bouncy")} from="below" d={30} s0={0.5}>
            <Cube3D s={44} ang={0.6 + Math.max(0, f - bBlender) * 0.028} />
          </Pop>
          <Pop x={587} y={196} w={186} p={sp(f, bBlender + 5, "snap")} from="below" d={16}>
            <Chip text="Blender" icon="box" tone="surface" size={26} />
          </Pop>
          <div style={{ position: "absolute", left: 750, top: 300 }}>
            <CheckBadge f={f} start={wGreat} size={52} />
          </div>

          {/* модель живёт за столом */}
          {landed && (
            <>
              <div style={{ position: "absolute", left: GEM_HOME[0] - 60, top: GEM_HOME[1] + 30, width: 120, height: 60 }}>
                <Ripple f={f} start={L + FL} size={90} dur={24} />
              </div>
              <div
                style={{
                  position: "absolute",
                  left: GEM_HOME[0] - 55,
                  top: GEM_HOME[1] - 66,
                  transform: `translateY(${float(f, 7, 5, 84) * eo(f, L + FL, 20)}px)`,
                }}
              >
                <Gem kind="diamond" w={110} tint={C.accent} rgb="255,179,0" f={f} seed={11} />
              </div>
            </>
          )}
        </div>
      )}

      {/* кристалл Opus перелетает из карточки в домик */}
      {flying &&
        (() => {
          const sx = 300;
          const sy = 386 + float(L, 0, 5, 84);
          const ex = HX + GEM_HOME[0] + hdx;
          const ey = HY + GEM_HOME[1];
          const gw = mix(170, 110, tFly);
          const cx = mix(sx, ex, tFly);
          const cy = mix(sy, ey, tFly) - 150 * Math.sin(Math.PI * tFly);
          return (
            <div style={{ position: "absolute", left: cx - gw / 2, top: cy - gw * 0.6, transform: `rotate(${Math.sin(Math.PI * tFly) * 14}deg)` }}>
              <Gem kind="diamond" w={gw} tint={C.accent} rgb="255,179,0" f={f} seed={0} />
            </div>
          );
        })()}

      {/* ═════ ФАЗА 3: домиков много — основной агент раздаёт задания ═════ */}
      {f >= P5 && (
        <>
          {/* верхняя карточка: подпись → «вы ставите результат» */}
          <Pop x={410} y={250} w={1100} h={90} p={sp(f, P5 + 10, "snap")} from="above" d={30}>
            <Frame w={1100} h={90} kind="plain" glow={glowWin(f, bResult, Infinity)}>
              <Slide f={f} a={P5 + 10} z={wYou - 8} dy={14}>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
                  {[0, 1, 2].map((i) => {
                    const p = sp(f, P5 + 14 + i * 4, "bouncy");
                    return (
                      <div key={i} style={{ opacity: Math.min(1, p * 1.6), transform: `translateY(${(1 - p) * 14}px)` }}>
                        <Icon name="house" size={38} color={i === 0 ? C.accent : C.muted} sw={3.8} />
                      </div>
                    );
                  })}
                  <div style={{ ...TX.title, fontSize: 32, marginLeft: 12, whiteSpace: "nowrap" }}>Домик может быть не один</div>
                </div>
              </Slide>
              <Slide f={f} a={wYou} dy={14}>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", gap: 20, padding: "0 30px" }}>
                  <Avatar size={58} icon="user" />
                  <div style={{ ...TX.title, fontSize: 36, whiteSpace: "nowrap" }}>Вы</div>
                  {(() => {
                    const p = eo(f, wYou + 6, 10);
                    const st = eo(f, wYou2, 10);
                    return (
                      <div style={{ position: "relative", ...TX.label, fontSize: 28, color: C.muted, whiteSpace: "nowrap", opacity: p * (1 - 0.35 * st) }}>
                        с этим не возитесь
                        <div
                          style={{
                            position: "absolute",
                            left: -4,
                            right: -4,
                            top: "54%",
                            height: 3,
                            borderRadius: 2,
                            background: C.muted,
                            transformOrigin: "0 50%",
                            transform: `scaleX(${st})`,
                          }}
                        />
                      </div>
                    );
                  })()}
                  {(() => {
                    const p = sp(f, wYou2, "pop");
                    return p > 0.002 ? (
                      <div style={{ opacity: Math.min(1, p * 1.6), transform: `translateX(${(1 - p) * 26}px)` }}>
                        <Chip text="ставите результат" icon="target" tone="accent" size={28} />
                      </div>
                    ) : null;
                  })()}
                  <div style={{ marginLeft: "auto", width: 56, height: 56 }}>
                    <CheckBadge f={f} start={bResult} size={56} />
                  </div>
                </div>
              </Slide>
            </Frame>
          </Pop>

          {/* шина заданий */}
          <Overlay>
            <ArrowPath x1={960} y1={342} x2={960} y2={376} p={eo(f, wYou + 4, 10)} color={C.accent} width={4} />
            {busP > 0.001 && (
              <path d={`M960 ${MAIN.y + MAIN.h + 2} L960 ${BUS_Y}`} stroke="rgba(243,239,230,0.35)" strokeWidth={4} fill="none" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - busP} />
            )}
            {busH > 0.001 &&
              [subCx(0), subCx(2)].map((x, k) => (
                <path key={k} d={`M960 ${BUS_Y} L${x} ${BUS_Y}`} stroke="rgba(243,239,230,0.35)" strokeWidth={4} fill="none" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - busH} />
              ))}
            {[0, 1, 2].map((i) => (
              <ArrowPath
                key={i}
                x1={subCx(i)}
                y1={BUS_Y}
                x2={subCx(i)}
                y2={SUB_Y - 4}
                p={dropP}
                width={4}
                color={interpolateColors(subAct(i), [0, 1], ["rgba(243,239,230,0.35)", C.accent])}
              />
            ))}
          </Overlay>

          {/* основной агент */}
          <Pop x={MAIN.x} y={MAIN.y} w={MAIN.w} h={MAIN.h} p={sp(f, P5 + 8, "pop")} d={30}>
            <HouseNode w={MAIN.w} h={MAIN.h} roofH={MAIN.roofH} roof={C.accent} glow={Math.max(0.3 * bump(f, bDeal, 30), bump(f, wAg, 34))}>
              <div style={{ position: "absolute", left: 26, top: 30, transform: `translateY(${float(f, 13, 3, 80)}px)` }}>
                <Gem kind="diamond" w={64} tint={C.accent} rgb="255,179,0" f={f} seed={13} />
              </div>
              <div style={{ position: "absolute", left: 114, top: 30, ...TX.title, fontSize: 32, whiteSpace: "nowrap" }}>Основной агент</div>
              {(() => {
                const p = sp(f, bDeal, "snap");
                return p > 0.002 ? (
                  <div style={{ position: "absolute", left: 114, top: 78, ...TX.label, fontSize: 26, color: C.accent, whiteSpace: "nowrap", opacity: Math.min(1, p * 1.6), transform: `translateX(${(1 - p) * 20}px)` }}>
                    раздаёт задания
                  </div>
                ) : null;
              })()}
            </HouseNode>
          </Pop>

          {/* домики-исполнители: сначала пунктир, на своём слове — живой домик */}
          {SUBS.map((s, i) => {
            const g = eo(f, wMore + i * 5, 12) * (1 - eo(f, wSub[i], 10));
            const p = sp(f, wSub[i], s.spr);
            const lp = sp(f, wSubLine[i], "snap");
            return (
              <React.Fragment key={i}>
                {g > 0.002 && (
                  <div style={{ position: "absolute", left: s.x, top: SUB_Y, opacity: g }}>
                    <GhostHouse w={500} h={SUB_H} roofH={SUB_ROOF} />
                  </div>
                )}
                <Pop x={s.x} y={SUB_Y} w={500} h={SUB_H} p={p} d={34}>
                  <HouseNode w={500} h={SUB_H} roofH={SUB_ROOF} roof={C.raised} stroke={C.accent} glow={0.6 * bump(f, wSub[i] + 14, 24) + 0.5 * bump(f, wAg + i * 3 + 16, 22)}>
                    <div style={{ position: "absolute", left: 22, top: 24 }}>
                      {i === 0 ? (
                        <div style={{ marginLeft: 8, marginTop: -2 }}>
                          <Gem kind="octa" w={54} tint="#FFD27A" rgb="255,210,122" f={f} seed={21} halo={0.6} />
                        </div>
                      ) : (
                        <IconTile icon={i === 1 ? "team" : "eye"} size={64} />
                      )}
                    </div>
                    <div style={{ position: "absolute", left: 108, top: 10, height: 46, display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ ...TX.title, fontSize: 32, whiteSpace: "nowrap" }}>{s.title}</div>
                      {i === 1 && lp > 0.002 && (
                        <div style={{ opacity: Math.min(1, lp * 1.6), transform: `translateY(${(1 - lp) * 10}px)` }}>
                          <Chip text="×16" tone="outline" size={24} mono />
                        </div>
                      )}
                    </div>
                    {lp > 0.002 && (
                      <div style={{ position: "absolute", left: 108, top: 62, ...TX.label, fontSize: 24, color: C.muted, whiteSpace: "nowrap", opacity: Math.min(1, lp * 1.6), transform: `translateX(${(1 - lp) * 18}px)` }}>
                        {s.sub}
                      </div>
                    )}
                    <div style={{ position: "absolute", right: 24, top: 38 }}>
                      <StatusIcon s={f >= bResult + i * 3 ? "ok" : "run"} f={f} size={36} />
                    </div>
                  </HouseNode>
                </Pop>
              </React.Fragment>
            );
          })}

          {/* задания летят по шине */}
          {flyers.map((fl, k) => {
            const t = eio(f, fl.s, 18);
            if (t <= 0 || t >= 1) return null;
            const [x, y] = along(busPath(fl.i), t);
            return (
              <div
                key={k}
                style={{
                  position: "absolute",
                  left: x - 17,
                  top: y - 17,
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  background: C.accent,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 6px 16px rgba(0,0,0,0.4)",
                  opacity: safeExitAlpha(f, fl.s + 16),
                }}
              >
                <Icon name="doc" size={22} color={C.bg} sw={4.2} />
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};
