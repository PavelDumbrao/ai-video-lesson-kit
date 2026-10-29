import React from "react";
import { interpolateColors } from "remotion";
import { C, MONO, SANS } from "../../../theme";
import { bump, ei, eio, eo, float, hash, lin, mix, shake, sp } from "../../anim";
import { Icon, IconName } from "../../icons";
import { SceneProps } from "../../types";
import { CheckBadge, Chip, Frame, Pop, Tone, TX } from "../../ui";
import { ArrowPath, CrossBadge, IconTile, Leave } from "../kit";

// «Зачем это вообще нужно» (раздел 1, голос 40,71–82,48). Лицо F02 во весь экран 70,05–74,65: до окна всё
// стоит, в окне ничего не меняется, после окна сцена ещё ~1,4 с видна и только на «создавать» уходит.
// Акт A (t0 → «три»): воронка с горлышком «лидогенерация» → рутина контента (строки загораются по словам) →
// мечта: пальма, солнце, заявки летят в телефон. Акт B («три» → «создавать»): три компании + бейдж «лидген через
// нейросети» → команда из 12 силуэтов и столбик затрат → шкала себестоимости в красном («дикая») → цепочка шагов
// сливается в одного агента, стрелка падает в зелёное, качество растёт. Акт C: «учиться делать видео» ✗ →
// «учиться ставить задачу агенту» ✓.

// Элемент живёт до своего следующего бита: плавный уход за ~10 кадров (нет следующего — не гаснет).
const safeExitAlpha = (f: number, bNext?: number) => (bNext === undefined ? 1 : 1 - ei(f, bNext, 10));

// ── header: title (≤ 38 px) + chips, top-aligned (never flex-end) ─────────────────────────────────────────
type HChip = { text: string; icon?: IconName; tone?: Tone; at: number };
const Header: React.FC<{ f: number; a: number; z?: number; title: string; chips?: HChip[] }> = ({ f, a, z = Infinity, title, chips = [] }) => {
  const rise = eo(f, a, 16);
  const out = ei(f, z, 10);
  if (rise <= 0 || out >= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 140,
        top: 132,
        width: 1640,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        opacity: 1 - out,
        transform: `translateY(${-18 * out}px)`,
      }}
    >
      <div style={{ overflow: "hidden", padding: "0.12em 0.06em 0.16em", margin: "-0.12em -0.06em -0.16em" }}>
        <div style={{ ...TX.title, fontSize: 38, whiteSpace: "nowrap", transform: `translateY(${(1 - rise) * 110}%)` }}>{title}</div>
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        {chips.map((c, i) => {
          const p = sp(f, c.at, "pop");
          if (p <= 0.002) return null;
          return (
            <div key={i} style={{ opacity: Math.min(1, p * 1.7), transform: `translateY(${(1 - p) * 18}px)` }}>
              <Chip text={c.text} icon={c.icon} tone={c.tone ?? "surface"} size={24} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** A small kicker line inside a card. */
const Kicker: React.FC<{ text: string; color?: string; icon?: IconName; x?: number; y?: number }> = ({ text, color = C.muted, icon, x = 34, y = 26 }) => (
  <div style={{ position: "absolute", left: x, top: y, display: "flex", alignItems: "center", gap: 12, ...TX.kicker, color, whiteSpace: "nowrap" }}>
    {icon && <Icon name={icon} size={28} color={color} sw={3.8} />}
    {text}
  </div>
);

// ── act A, card 1: the funnel ───────────────────────────────────────────────────────────────────────────
const FW = 520;
const FCX = FW / 2;
const RIM_Y = 120;
const NECK_Y = 318;
const NECK_HW = 32;
const TUBE_B = 404;
const hwAt = (y: number) => mix(212, NECK_HW, Math.max(0, Math.min(1, (y - RIM_Y) / (NECK_Y - RIM_Y))));

const Funnel: React.FC<{ f: number; a: number }> = ({ f, a }) => {
  const draw = eo(f, a + 2, 18);
  const pill = sp(f, a + 10, "pop");
  const glow = 0.5 + 0.5 * Math.sin(f / 14);
  const flowIn = eo(f, a + 6, 20);
  const wall = `M${FCX - 212} ${RIM_Y} L${FCX - NECK_HW} ${NECK_Y} L${FCX - NECK_HW} ${TUBE_B} M${FCX + 212} ${RIM_Y} L${FCX + NECK_HW} ${NECK_Y} L${FCX + NECK_HW} ${TUBE_B}`;
  const body = `M${FCX - 212} ${RIM_Y} L${FCX + 212} ${RIM_Y} L${FCX + NECK_HW} ${NECK_Y} L${FCX + NECK_HW} ${TUBE_B} L${FCX - NECK_HW} ${TUBE_B} L${FCX - NECK_HW} ${NECK_Y} Z`;
  // particles pour in and bunch up above the neck (fast at the top, slow near the neck)
  const dots = Array.from({ length: 34 }, (_, i) => {
    const per = 64 + 26 * hash(i * 1.3);
    const t = ((((f - a) / per + hash(i * 7.7)) % 1) + 1) % 1;
    const s = 1 - (1 - t) ** 2.4;
    const y = mix(RIM_Y + 14, NECK_Y - 6, s);
    const u = hash(i * 3.1) * 2 - 1;
    const x = FCX + u * Math.max(0, hwAt(y) - 16);
    const o = Math.min(1, t / 0.1) * (t > 0.9 ? (1 - t) / 0.1 : 1);
    return { x, y, o: o * flowIn, r: 7 + 4 * hash(i * 5.3), hot: hash(i * 9.1) > 0.7 };
  });
  // a single drop leaks out of the neck every ~1.2 s
  const drops = Array.from({ length: 12 }, (_, k) => {
    const s0 = a + 24 + k * 36;
    const t = lin(f, s0, 26);
    if (t <= 0 || t >= 1) return null;
    const y = mix(TUBE_B + 4, 476, t * t);
    return <circle key={k} cx={FCX} cy={y} r={9} fill={C.accent} opacity={t < 0.75 ? 1 : (1 - t) / 0.25} />;
  });
  return (
    <>
      <Kicker text="узкое место" icon="warn" color={C.accent} />
      <svg width={FW} height={570} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <path d={body} fill="rgba(243,239,230,0.045)" opacity={draw} />
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.hot ? C.accent : C.muted} opacity={d.o * (d.hot ? 0.95 : 0.6)} />
        ))}
        <path d={wall} fill="none" stroke={C.text} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} opacity={0.8} />
        <ellipse cx={FCX} cy={RIM_Y} rx={212} ry={14} fill="none" stroke={C.text} strokeWidth={4} opacity={0.5 * draw} />
        {drops}
      </svg>
      {/* the label band sits right on the neck */}
      {pill > 0.002 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            width: FW,
            top: NECK_Y + 14,
            display: "flex",
            justifyContent: "center",
            opacity: Math.min(1, pill * 1.7),
            transform: `translateY(${(1 - pill) * 16}px)`,
          }}
        >
          <div
            style={{
              height: 58,
              padding: "0 26px",
              borderRadius: 29,
              background: C.accent,
              display: "flex",
              alignItems: "center",
              fontFamily: SANS,
              fontWeight: 900,
              fontSize: 30,
              color: C.bg,
              whiteSpace: "nowrap",
              boxShadow: `0 0 ${24 + 18 * glow}px rgba(255,179,0,${0.25 + 0.2 * glow}), 0 12px 26px rgba(0,0,0,0.35)`,
            }}
          >
            лидогенерация
          </div>
        </div>
      )}
      <div style={{ position: "absolute", left: 0, width: FW, top: 494, textAlign: "center", ...TX.label, fontSize: 26, color: C.muted, opacity: eo(f, a + 20, 14) }}>
        заявки — по капле
      </div>
    </>
  );
};

// ── act A, card 2: the routine ──────────────────────────────────────────────────────────────────────────
const ROUTINE: { t: string; icon: IconName }[] = [
  { t: "писать ночами", icon: "pencil" },
  { t: "снимать", icon: "camera" },
  { t: "монтировать", icon: "scissors" },
  { t: "выкладывать", icon: "send" },
];
const Routine: React.FC<{ f: number; a: number; lit: number[] }> = ({ f, a, lit }) => (
  <>
    <Kicker text="контент руками" icon="hourglass" />
    <div style={{ position: "absolute", left: 34, top: 86, width: 452, display: "flex", flexDirection: "column", gap: 18 }}>
      {ROUTINE.map((r, i) => {
        const p = sp(f, a + 2 + i * 4, "snap");
        const l = eo(f, lit[i], 10);
        const flash = bump(f, lit[i], 18);
        return (
          <div
            key={i}
            style={{
              position: "relative",
              height: 96,
              boxSizing: "border-box",
              padding: "14px 20px",
              borderRadius: 18,
              display: "flex",
              alignItems: "center",
              gap: 20,
              background: `rgba(255,179,0,${0.04 + 0.1 * l + 0.08 * flash})`,
              border: `2px solid ${interpolateColors(l, [0, 1], ["rgba(243,239,230,0.09)", "rgba(255,179,0,0.75)"])}`,
              boxShadow: flash > 0 ? `0 0 ${30 * flash}px rgba(255,179,0,${0.35 * flash})` : undefined,
              opacity: Math.min(1, p * 1.6),
              transform: `translateX(${(1 - p) * 30}px)`,
            }}
          >
            <IconTile
              icon={r.icon}
              size={64}
              color={interpolateColors(l, [0, 1], [C.muted, C.accent])}
              bg={`rgba(255,179,0,${0.06 + 0.12 * l})`}
            />
            <span style={{ ...TX.label, fontSize: 30, color: interpolateColors(l, [0, 1], [C.muted, C.text]), whiteSpace: "nowrap" }}>{r.t}</span>
            {i === 0 && (
              <div style={{ marginLeft: "auto", opacity: 0.4 + 0.6 * l }}>
                <Icon name="moon" size={34} color={l > 0.5 ? C.accent : C.muted} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  </>
);

// ── act A, card 3: the dream ────────────────────────────────────────────────────────────────────────────
const PH = { x: 296, y: 84, w: 212, h: 362 };
const ROW0 = 66;
const ROW_STEP = 62;
const LeadPill: React.FC<{ hl?: number }> = ({ hl = 0 }) => (
  <div
    style={{
      width: 190,
      height: 52,
      boxSizing: "border-box",
      padding: "0 14px",
      borderRadius: 14,
      background: C.raised,
      border: `2px solid rgba(255,179,0,${0.3 + 0.6 * hl})`,
      boxShadow: hl > 0 ? `0 0 ${22 * hl}px rgba(255,179,0,${0.35 * hl})` : "0 8px 18px rgba(0,0,0,0.3)",
      display: "flex",
      alignItems: "center",
      gap: 10,
    }}
  >
    <Icon name="user" size={26} color={C.accent} sw={3.8} />
    <span style={{ ...TX.label, fontSize: 24, whiteSpace: "nowrap" }}>заявка</span>
  </div>
);

const leafPath = (cx: number, cy: number, deg: number, len: number, droop: number) => {
  const a = (deg * Math.PI) / 180;
  const tx = cx + len * Math.cos(a);
  const ty = cy + len * Math.sin(a) + droop;
  const mx = (cx + tx) / 2;
  const my = (cy + ty) / 2;
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  return `M${cx} ${cy} Q${mx - nx * 24} ${my - ny * 24} ${tx} ${ty} Q${mx + nx * 6} ${my + ny * 6} ${cx} ${cy} Z`;
};
const LEAVES = [
  { d: -165, l: 120, dr: 30 },
  { d: -128, l: 104, dr: 12 },
  { d: -58, l: 100, dr: 12 },
  { d: -18, l: 118, dr: 30 },
  { d: 160, l: 86, dr: 34 },
  { d: 22, l: 88, dr: 32 },
];

const Dream: React.FC<{ f: number; a: number; end: number; wLeads: number }> = ({ f, a, end, wLeads }) => {
  const sway = float(f, 2, 2.4, 120);
  const sunP = sp(f, a + 4, "pop");
  const palmP = eo(f, a, 18);
  const phoneP = sp(f, a + 8, "pop");
  // lead cards: one every 20 frames until the act leaves
  const lands: number[] = [];
  for (let k = 0; k < 8; k++) {
    const L = a + 30 + k * 20;
    if (L - 18 < end) lands.push(L);
  }
  const landed = lands.filter((L) => f >= L).length;
  const lastLand = landed > 0 ? lands[landed - 1] : -999;
  const wave = (y: number, ph: number) => {
    const pts: string[] = [];
    for (let x = 20; x <= 280; x += 10) pts.push(`${x} ${y + 5 * Math.sin(x / 26 + f / 16 + ph)}`);
    return `M${pts.join(" L")}`;
  };
  return (
    <>
      <Kicker text="мечта" icon="spark" color={C.accent} />
      <svg width={540} height={570} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {/* sun */}
        <g transform={`translate(236 96) scale(${sunP})`}>
          <g transform={`rotate(${f * 0.7})`}>
            {Array.from({ length: 12 }, (_, i) => {
              const ang = (i / 12) * Math.PI * 2;
              return <line key={i} x1={36 * Math.cos(ang)} y1={36 * Math.sin(ang)} x2={48 * Math.cos(ang)} y2={48 * Math.sin(ang)} stroke={C.accent} strokeWidth={5} strokeLinecap="round" />;
            })}
          </g>
          <circle r={28} fill={C.accent} />
        </g>
        {/* sea + sand */}
        <path d={wave(452, 0)} fill="none" stroke={C.muted} strokeWidth={3} opacity={0.45 * palmP} />
        <path d={wave(470, 1.7)} fill="none" stroke={C.muted} strokeWidth={3} opacity={0.3 * palmP} />
        <ellipse cx={136} cy={440} rx={96} ry={14} fill="rgba(255,179,0,0.2)" opacity={palmP} />
        {/* palm */}
        <g transform={`rotate(${sway} 132 440)`} opacity={palmP}>
          <path d="M132 440 Q114 336 152 252" fill="none" stroke={C.muted} strokeWidth={15} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - palmP} />
          {LEAVES.map((lf, i) => {
            const g = eo(f, a + 8 + i * 2, 14);
            return <path key={i} d={leafPath(152, 252, lf.d + sway * 1.5, lf.l * g, lf.dr * g)} fill={C.muted} opacity={0.85} />;
          })}
          <circle cx={146} cy={262} r={8} fill="rgba(255,179,0,0.7)" opacity={eo(f, a + 16, 8)} />
          <circle cx={160} cy={264} r={8} fill="rgba(255,179,0,0.7)" opacity={eo(f, a + 16, 8)} />
        </g>
      </svg>
      {/* phone */}
      {phoneP > 0.002 && (
        <div
          style={{
            position: "absolute",
            left: PH.x,
            top: PH.y,
            width: PH.w,
            height: PH.h,
            boxSizing: "border-box",
            borderRadius: 30,
            background: C.surface2,
            border: "3px solid rgba(243,239,230,0.22)",
            boxShadow: "0 24px 50px rgba(0,0,0,0.45)",
            overflow: "hidden",
            opacity: Math.min(1, phoneP * 1.6),
            transform: `translateY(${(1 - phoneP) * 40}px)`,
          }}
        >
          <div style={{ position: "absolute", left: 76, top: 8, width: 54, height: 8, borderRadius: 4, background: "rgba(243,239,230,0.18)" }} />
          <div style={{ position: "absolute", left: 14, top: 22, ...TX.label, fontSize: 24, color: C.muted }}>заявки</div>
          <div
            style={{
              position: "absolute",
              right: 12,
              top: 18,
              minWidth: 40,
              height: 36,
              padding: "0 10px",
              boxSizing: "border-box",
              borderRadius: 18,
              background: landed > 0 ? C.accent : C.raised,
              color: C.bg,
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 0 ${20 * bump(f, lastLand, 14)}px rgba(255,179,0,0.7)`,
            }}
          >
            {landed}
          </div>
          {lands.map((L, k) => {
            if (f < L) return null;
            let pos = 0;
            for (let j = k + 1; j < lands.length; j++) pos += eio(f, lands[j] - 17, 10);
            if (pos > 4.6) return null;
            const fade = pos > 3.6 ? 1 - (pos - 3.6) : 1;
            return (
              <div key={k} style={{ position: "absolute", left: 9, top: ROW0 + pos * ROW_STEP, opacity: fade }}>
                <LeadPill hl={1 - eo(f, L, 24)} />
              </div>
            );
          })}
        </div>
      )}
      {/* cards in flight (above the phone, clipped by the card) */}
      {lands.map((L, k) => {
        const t = eio(f, L - 18, 18);
        if (t <= 0 || t >= 1) return null;
        const sx = -230;
        const sy = 150 + 120 * hash(k * 4.1);
        const ex = PH.x + 9;
        const ey = PH.y + ROW0;
        return (
          <div
            key={k}
            style={{
              position: "absolute",
              left: mix(sx, ex, t),
              top: mix(sy, ey, t) + 36 * Math.sin(Math.PI * t),
              transform: `rotate(${(1 - t) * 10}deg)`,
            }}
          >
            <LeadPill hl={0.6} />
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 34, top: 494, ...TX.label, fontSize: 28, whiteSpace: "nowrap", opacity: eo(f, wLeads, 12), transform: `translateY(${(1 - eo(f, wLeads, 14)) * 14}px)` }}>
        заявки льются <span style={{ color: C.accent }}>сами</span>
      </div>
    </>
  );
};

// ── act B: companies, team, cost gauge ──────────────────────────────────────────────────────────────────
const Company: React.FC<{ f: number; i: number; a: number; boost: number; col: number }> = ({ f, i, a, boost, col }) => {
  const hl = bump(f, a + 6, 22);
  const bh = mix(300, 78, col);
  const bw = mix(86, 18, col);
  return (
    <Frame w={520} h={mix(570, 150, col)} kind="plain" glow={0.7 * hl}>
      <div style={{ position: "absolute", left: 26, top: 33 }}>
        <IconTile icon="briefcase" size={84} />
      </div>
      <div style={{ position: "absolute", left: 134, top: 30, ...TX.title, fontSize: 34, whiteSpace: "nowrap" }}>Компания {i + 1}</div>
      <div style={{ position: "absolute", left: 134, top: 82, ...TX.label, fontSize: 24, color: C.muted, whiteSpace: "nowrap" }}>лидогенерация</div>
      {col < 1 && (
        <div style={{ position: "absolute", left: 34, top: 168, ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap", opacity: 1 - Math.min(1, col * 2.5) }}>
          поток заявок
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: mix(34, 396, col),
          top: mix(218, 36, col),
          width: mix(452, 96, col),
          height: bh,
          display: "flex",
          alignItems: "flex-end",
          gap: mix(36, 8, col),
          borderBottom: col < 1 ? `3px solid rgba(243,239,230,${0.2 * (1 - col)})` : undefined,
        }}
      >
        {[0.35 + 0.1 * hash(i * 3 + 1), 0.55 + 0.1 * hash(i * 3 + 2), 0.45, 0.7].map((v, j) => {
          const g = sp(f, a + 8 + j * 3, "pop");
          const h = Math.min(bh, bh * v * g * (1 + 0.38 * boost) + mix(5, 2, col) * Math.sin(f / 12 + j + i));
          return <div key={j} style={{ width: bw, height: Math.max(0, h), borderRadius: "6px 6px 2px 2px", background: j === 3 ? C.accent : "rgba(255,179,0,0.45)" }} />;
        })}
      </div>
    </Frame>
  );
};

const SEG1 = 150;
const SEG2 = 112;
const COL_X = 664;
const COL_B = 350;
const Team: React.FC<{ f: number; a: number; wSalary: number; wNets: number }> = ({ f, a, wSalary, wNets }) => {
  const pops = Array.from({ length: 12 }, (_, i) => sp(f, a + 4 + i * 2, "bouncy"));
  const n = pops.filter((p) => p > 0.5).length;
  const s1 = SEG1 * eo(f, a + 4, 30);
  const s2 = SEG2 * sp(f, wNets, "pop");
  const salL = eo(f, wSalary, 10);
  const netL = eo(f, wNets + 4, 10);
  const salHl = bump(f, wSalary, 20);
  return (
    <>
      <Kicker text="команда нейрокреаторов" icon="team" />
      <div style={{ position: "absolute", left: 34, top: 66, display: "flex", alignItems: "baseline", gap: 14 }}>
        <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 72, color: C.accent, lineHeight: 1, fontVariantNumeric: "tabular-nums", opacity: Math.min(1, pops[0] * 1.7) }}>{Math.max(1, n)}</span>
        <span style={{ ...TX.label, fontSize: 30, color: C.text }}>человек</span>
      </div>
      <div style={{ position: "absolute", left: 34, top: 176, display: "grid", gridTemplateColumns: "repeat(6, 78px)", gap: 18 }}>
        {pops.map((p, i) => (
          <div
            key={i}
            style={{
              width: 78,
              height: 78,
              borderRadius: 39,
              background: C.raised,
              border: "2px solid rgba(243,239,230,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: Math.min(1, p * 1.7),
              transform: `translateY(${(1 - p) * 22 + float(f, i, 2, 80)}px) scale(${0.6 + 0.4 * p})`,
            }}
          >
            <Icon name="user" size={50} color={C.text} sw={3.6} />
          </div>
        ))}
      </div>
      {/* the cost column grows over the team */}
      <div style={{ position: "absolute", left: COL_X, top: 26, display: "flex", alignItems: "center", gap: 10, ...TX.kicker, color: C.accent }}>
        затраты
        <Icon name="arrow" size={28} color={C.accent} sw={4} style={{ transform: "rotate(-90deg)" }} />
      </div>
      <div style={{ position: "absolute", left: COL_X, top: COL_B - s1, width: 100, height: s1, borderRadius: s2 > 1 ? 0 : "10px 10px 0 0", background: "rgba(255,179,0,0.5)", boxShadow: salHl > 0 ? `0 0 ${26 * salHl}px rgba(255,179,0,0.5)` : undefined }} />
      {s2 > 0.5 && (
        <div style={{ position: "absolute", left: COL_X, top: COL_B - s1 - s2, width: 100, height: s2, borderRadius: "10px 10px 0 0", background: C.accent, borderBottom: `3px solid ${C.surface}` }} />
      )}
      <div style={{ position: "absolute", left: COL_X - 10, top: COL_B, width: 120, height: 4, borderRadius: 2, background: "rgba(243,239,230,0.3)" }} />
      <div style={{ position: "absolute", left: COL_X + 118, top: COL_B - SEG1 / 2 - 16, ...TX.label, fontSize: 26, whiteSpace: "nowrap", opacity: salL, transform: `translateX(${(1 - salL) * 14}px)` }}>зарплаты</div>
      <div style={{ position: "absolute", left: COL_X + 118, top: COL_B - SEG1 - SEG2 / 2 - 16, ...TX.label, fontSize: 26, color: C.accent, whiteSpace: "nowrap", opacity: netL, transform: `translateX(${(1 - netL) * 14}px)` }}>
        + нейронки
      </div>
    </>
  );
};

const STEPS = ["сценарий", "голос", "лицо", "графика"];
const STEP_W = 190;
const STEP_GAP = 52;
const stepCx = (i: number) => 34 + STEP_W / 2 + i * (STEP_W + STEP_GAP);
const Chain: React.FC<{ f: number; a: number }> = ({ f, a }) => {
  const agentP = sp(f, a + 40, "pop");
  const merge = eo(f, a + 28, 16);
  return (
    <>
      <Kicker text="последовательность действий" icon="route" color={C.accent} />
      <div style={{ position: "absolute", left: 34, top: 82, display: "flex", alignItems: "center", gap: 0 }}>
        {STEPS.map((s, i) => {
          const p = sp(f, a + 4 + i * 5, "snap");
          const lit = eo(f, a + 12 + i * 5, 8);
          return (
            <React.Fragment key={i}>
              <div
                style={{
                  width: STEP_W,
                  height: 64,
                  boxSizing: "border-box",
                  borderRadius: 16,
                  background: C.surface2,
                  border: `2px solid ${interpolateColors(lit, [0, 1], ["rgba(243,239,230,0.12)", "rgba(255,179,0,0.8)"])}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  ...TX.label,
                  fontSize: 28,
                  whiteSpace: "nowrap",
                  opacity: Math.min(1, p * 1.6),
                  transform: `translateX(${(1 - p) * -24}px)`,
                }}
              >
                {s}
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ width: STEP_GAP, display: "flex", justifyContent: "center", opacity: eo(f, a + 8 + i * 5, 8) }}>
                  <Icon name="arrow" size={30} color={C.accent} sw={4} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      <svg width={1000} height={390} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {STEPS.map((_, i) => (
          <ArrowPath key={i} x1={stepCx(i)} y1={154} x2={500 + (i - 1.5) * 40} y2={218} p={merge} bend={(i - 1.5) * -14} width={4} head={false} opacity={0.75} />
        ))}
      </svg>
      {agentP > 0.002 && (
        <div
          style={{
            position: "absolute",
            left: 290,
            top: 222,
            width: 420,
            height: 116,
            boxSizing: "border-box",
            padding: "14px 20px",
            borderRadius: 20,
            background: "rgba(255,179,0,0.1)",
            border: "2px solid rgba(255,179,0,0.85)",
            boxShadow: `0 0 ${30 + 14 * Math.sin(f / 12)}px rgba(255,179,0,0.28)`,
            display: "flex",
            alignItems: "center",
            gap: 20,
            opacity: Math.min(1, agentP * 1.6),
            transform: `translateY(${(1 - agentP) * 26}px)`,
          }}
        >
          <IconTile icon="bot" size={84} bg="rgba(255,179,0,0.2)" />
          <div>
            <div style={{ ...TX.title, fontSize: 36, whiteSpace: "nowrap" }}>один агент</div>
            <div style={{ ...TX.label, fontSize: 24, color: C.muted, whiteSpace: "nowrap", marginTop: 4 }}>вместо команды</div>
          </div>
        </div>
      )}
    </>
  );
};

const GCX = 300;
const GCY = 236;
const GR = 140;
const arcD = (v0: number, v1: number, r = GR) => {
  const a0 = Math.PI * (1 + v0);
  const a1 = Math.PI * (1 + v1);
  return `M${GCX + r * Math.cos(a0)} ${GCY + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${GCX + r * Math.cos(a1)} ${GCY + r * Math.sin(a1)}`;
};
const Gauge: React.FC<{ f: number; a: number; bCost: number; wWild: number; tDrop: number; wBetter: number; wCheaper: number; bSeq: number }> = ({
  f,
  a,
  bCost,
  wWild,
  tDrop,
  wBetter,
  wCheaper,
  bSeq,
}) => {
  const up = sp(f, bCost, "heavy");
  const down = sp(f, tDrop, "pop");
  const v1 = mix(0.1, 0.46, eo(f, a + 6, 80));
  const v2 = mix(v1, 0.93, up);
  const red = up * (1 - down);
  const v3 = mix(v2, 0.13, down) + 0.014 * Math.sin(f * 0.9) * red;
  const v = Math.max(0, Math.min(1.03, v3));
  const th = Math.PI * (1 + v);
  const kx = shake(f, wWild, 9, 18);
  const wildP = sp(f, wWild, "pop");
  const wildQ = ei(f, tDrop, 10);
  const cheapP = sp(f, wCheaper, "pop");
  const qualA = eo(f, bSeq + 6, 12);
  const qual = mix(0.32, 0.92, eo(f, wBetter, 26));
  const redGlow = red * (0.5 + 0.5 * Math.sin(f / 6));
  return (
    <>
      <Kicker text="себестоимость" icon="gauge" color={interpolateColors(red, [0, 1], [C.muted, C.err])} />
      <svg width={600} height={390} style={{ position: "absolute", left: kx, top: 0, overflow: "visible" }}>
        <path d={arcD(0, 1)} fill="none" stroke="rgba(243,239,230,0.07)" strokeWidth={34} />
        <path d={arcD(0.01, 0.33)} fill="none" stroke={C.ok} strokeWidth={26} opacity={0.35 + 0.5 * down} />
        <path d={arcD(0.35, 0.65)} fill="none" stroke={C.accent} strokeWidth={26} opacity={0.45} />
        <path d={arcD(0.67, 0.99)} fill="none" stroke={C.err} strokeWidth={26} opacity={0.45 + 0.45 * redGlow} />
        <line x1={GCX} y1={GCY} x2={GCX + 120 * Math.cos(th)} y2={GCY + 120 * Math.sin(th)} stroke={C.text} strokeWidth={8} strokeLinecap="round" />
        <circle cx={GCX} cy={GCY} r={15} fill={C.text} />
        <circle cx={GCX} cy={GCY} r={6} fill={C.surface} />
      </svg>
      <div style={{ position: "absolute", left: 0, width: 600, top: 262, display: "flex", justifyContent: "center" }}>
        {wildP > 0.002 && wildQ < 1 && (
          <div style={{ position: "absolute", opacity: Math.min(1, wildP * 1.7) * (1 - wildQ), transform: `translate(${kx}px, ${(1 - wildP) * 16}px)` }}>
            <Chip text="дикая" icon="warn" tone="err" size={26} />
          </div>
        )}
        {cheapP > 0.002 && (
          <div style={{ position: "absolute", opacity: Math.min(1, cheapP * 1.7), transform: `translateY(${(1 - cheapP) * 16}px)` }}>
            <Chip text="дешевле" icon="check" tone="ok" size={26} />
          </div>
        )}
      </div>
      {qualA > 0 && (
        <div style={{ position: "absolute", left: 34, top: 328, display: "flex", alignItems: "center", gap: 18, opacity: qualA }}>
          <span style={{ ...TX.label, fontSize: 24, color: C.text, whiteSpace: "nowrap" }}>качество</span>
          <div style={{ position: "relative", width: 380, height: 20, borderRadius: 10, background: "rgba(243,239,230,0.08)", overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, top: 0, height: 20, width: 380 * qual, borderRadius: 10, background: C.accent }} />
          </div>
        </div>
      )}
    </>
  );
};

// ── act C: the formula ──────────────────────────────────────────────────────────────────────────────────
const BigLine: React.FC<{ f: number; at: number; children: React.ReactNode; color?: string }> = ({ f, at, children, color = C.text }) => {
  const r = eo(f, at, 16);
  if (f < at) return null;
  return (
    <div style={{ overflow: "hidden", padding: "0.12em 0.06em 0.16em", margin: "-0.12em -0.06em -0.16em" }}>
      <div style={{ ...TX.title, fontSize: 52, color, whiteSpace: "nowrap", transform: `translateY(${(1 - r) * 110}%)` }}>{children}</div>
    </div>
  );
};

export const Leadgen: React.FC<SceneProps> = ({ f, b, t0, w }) => {
  const [bNeck, bContent, bThai, bThree, bTwelve, bCost, bSeq, bSet] = b;
  const lit = [w("писать"), w("снимать"), w("монтир"), w("выклад")];
  const wLeads = w("заявки");
  const wNeuro = w("нейросети");
  const wSalary = w("зарплат");
  const wNets = w("нейронки");
  const wWild = w("дикая");
  const wBetter = w("лучше");
  const wCheaper = w("дешевле");
  const wCreate = w("создавать");
  const wUseless = w("бесполезно");
  const wAgent = w("агенту");
  const wHe = w("создавал");
  const tDrop = Math.max(bSeq + 36, wBetter - 12);
  const colB = eio(f, bTwelve - 14, 18); // the tall company cards fold into the top row before the team lands

  // act A layout: the funnel opens centred, then slides left when the routine arrives
  const shiftA = eio(f, bContent - 10, 20);
  const funnelX = mix(700, 140, shiftA);
  const bob = (seed: number) => float(f, seed, 3, 130);

  // act C
  const leftP = sp(f, wCreate + 10, "pop");
  const strike = eo(f, wUseless + 4, 16);
  const dimL = eo(f, wUseless + 10, 16);
  const rightP = sp(f, bSet, "pop");
  const arrowP = eo(f, bSet - 2, 14);
  const agentHl = eo(f, wAgent, 12);
  const heP = sp(f, wHe, "pop");

  return (
    <>
      {/* ═════ headers ═════ */}
      <Header
        f={f}
        a={t0}
        z={bThree}
        title="У всех одно узкое горлышко"
        chips={[
          { text: "предприниматели", icon: "briefcase", at: t0 + 6 },
          { text: "эксперты", icon: "cap", at: t0 + 12 },
        ]}
      />
      <Header f={f} a={bThree + 6} z={wCreate} title="Начало года: три компании" chips={[{ text: "лидген через нейросети", icon: "spark", tone: "outline", at: wNeuro }]} />
      <Header f={f} a={wCreate + 8} title="Чему учиться на самом деле" chips={[{ text: "вывод", icon: "bulb", tone: "accent", at: wCreate + 14 }]} />

      {/* ═════ act A ═════ */}
      <Leave f={f} at={bThree}>
        <Pop x={funnelX} y={250 + bob(1)} w={FW} h={570} p={sp(f, bNeck, "pop")} from="below" d={50}>
          <Frame w={FW} h={570} kind="plain">
            <Funnel f={f} a={bNeck} />
          </Frame>
        </Pop>
        <Pop x={690} y={250 + bob(2)} w={520} h={570} p={sp(f, bContent + 2, "pop")} from="below" d={60}>
          <Frame w={520} h={570} kind="plain">
            <Routine f={f} a={bContent} lit={lit} />
          </Frame>
        </Pop>
        <Pop x={1240} y={250 + bob(3)} w={540} h={570} p={sp(f, bThai, "pop")} from="right" d={70}>
          <Frame w={540} h={570} kind="plain">
            <Dream f={f} a={bThai} end={bThree} wLeads={wLeads} />
          </Frame>
        </Pop>
      </Leave>

      {/* ═════ act B ═════ */}
      {f >= bThree && (
        <Leave f={f} at={wCreate}>
          {[0, 1, 2].map((i) => (
            <Pop key={i} x={140 + i * 560} y={250 + bob(4 + i) * 0.6} w={520} h={mix(570, 150, colB)} p={sp(f, bThree + 6 + i * 5, "pop")} from="below" d={40}>
              <Company f={f} i={i} a={bThree + 6 + i * 5} boost={eo(f, wBetter, 24)} col={colB} />
            </Pop>
          ))}
          <Pop x={140} y={430 + bob(7)} w={1000} h={390} p={sp(f, bTwelve + 2, "pop")} from="below" d={50}>
            <Frame w={1000} h={390} kind="plain">
              <div style={{ position: "absolute", inset: 0, opacity: safeExitAlpha(f, bSeq), transform: `translateY(${-24 * ei(f, bSeq, 10)}px)` }}>
                {f < bSeq + 10 && <Team f={f} a={bTwelve} wSalary={wSalary} wNets={wNets} />}
              </div>
              {f >= bSeq + 5 && (
                <div style={{ position: "absolute", inset: 0, opacity: eo(f, bSeq + 5, 10) }}>
                  <Chain f={f} a={bSeq + 2} />
                </div>
              )}
            </Frame>
          </Pop>
          <Pop x={1180} y={430 + bob(8)} w={600} h={390} p={sp(f, bTwelve + 12, "pop")} from="right" d={60}>
            <Frame w={600} h={390} kind="plain" glow={0.8 * (sp(f, bCost, "heavy") * (1 - sp(f, tDrop, "pop")))} tone={C.err}>
              <Gauge f={f} a={bTwelve + 12} bCost={bCost} wWild={wWild} tDrop={tDrop} wBetter={wBetter} wCheaper={wCheaper} bSeq={bSeq} />
            </Frame>
          </Pop>
        </Leave>
      )}

      {/* ═════ act C ═════ */}
      {f >= wCreate && (
        <>
          <Pop x={140} y={250 + bob(9)} w={700} h={570} p={leftP} from="left" d={60}>
            <Frame w={700} h={570} kind="plain" glow={0.6 * strike * (1 - dimL)} tone={C.err}>
              <div style={{ position: "absolute", inset: 0, opacity: 1 - 0.4 * dimL }}>
                <Kicker text="не надо" color={C.err} icon="cross" />
                <div style={{ position: "absolute", left: 34, top: 92 }}>
                  <IconTile icon="video" size={120} color={C.muted} bg="rgba(154,160,170,0.12)" />
                </div>
                <div style={{ position: "absolute", left: 34, top: 262 }}>
                  <div style={{ position: "relative" }}>
                    <BigLine f={f} at={wCreate + 12}>учиться</BigLine>
                    <BigLine f={f} at={wCreate + 16}>делать видео</BigLine>
                    <svg width={420} height={140} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
                      <path d="M-8 34 L242 28" stroke={C.err} strokeWidth={8} strokeLinecap="round" fill="none" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - Math.min(1, strike * 2)} />
                      <path d="M-8 92 L404 84" stroke={C.err} strokeWidth={8} strokeLinecap="round" fill="none" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - Math.max(0, strike * 2 - 1)} />
                    </svg>
                  </div>
                </div>
                <div style={{ position: "absolute", left: 34, top: 470, ...TX.label, fontSize: 30, color: C.muted, whiteSpace: "nowrap", opacity: eo(f, wUseless, 12) }}>
                  это бесполезно
                </div>
              </div>
              <div style={{ position: "absolute", right: 34, top: 92 }}>
                <CrossBadge f={f} start={wUseless} size={96} />
              </div>
            </Frame>
          </Pop>
          <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
            <ArrowPath x1={862} y1={535} x2={978} y2={535} p={arrowP} width={7} />
          </svg>
          <Pop x={1000} y={250 + bob(10)} w={780} h={570} p={rightP} from="right" d={60}>
            <Frame w={780} h={570} kind="plain" glow={0.55 + 0.25 * Math.sin(f / 14)}>
              <Kicker text="надо" color={C.accent} icon="check" />
              <div style={{ position: "absolute", left: 34, top: 92 }}>
                <IconTile icon="bot" size={120} bg="rgba(255,179,0,0.18)" />
              </div>
              <div style={{ position: "absolute", right: 34, top: 92 }}>
                <CheckBadge f={f} start={bSet + 12} size={96} />
              </div>
              <div style={{ position: "absolute", left: 34, top: 262 }}>
                <BigLine f={f} at={bSet + 1}>учиться ставить</BigLine>
                <BigLine f={f} at={bSet + 6}>
                  задачу{" "}
                  <span style={{ position: "relative", color: interpolateColors(agentHl, [0, 1], [C.text, C.accent]) }}>
                    агенту
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: -4,
                        height: 6,
                        borderRadius: 3,
                        background: C.accent,
                        transformOrigin: "0 50%",
                        transform: `scaleX(${agentHl})`,
                      }}
                    />
                  </span>
                </BigLine>
              </div>
              {heP > 0.002 && (
                <div style={{ position: "absolute", left: 34, top: 452, opacity: Math.min(1, heP * 1.7), transform: `translateY(${(1 - heP) * 18}px)` }}>
                  <Chip text="видео создаёт агент" icon="check" tone="ok" size={28} />
                </div>
              )}
            </Frame>
          </Pop>
        </>
      )}
    </>
  );
};
