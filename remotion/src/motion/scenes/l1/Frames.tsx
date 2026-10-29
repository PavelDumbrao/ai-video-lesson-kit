import React from "react";
import { C, MONO, SANS } from "../../../theme";
import { bump, ei, eio, eo, float, hash, mix, shake, sp } from "../../anim";
import { Icon } from "../../icons";
import { SceneProps } from "../../types";
import { CheckBadge, Chip, Frame, Pop, Stamp, TX } from "../../ui";
import { Count, Leave } from "../kit";

// «Проверка: ИИ смотрит кадрами» (раздел 7, 360,20–397,22 с голоса; 360,20–365,52 — лицо F06 во весь экран).
// Страница 1: слева «свой ролик» скачивается и счётчик «60 с → 120 кадров»; справа плёнка ролика бежит из карточки
// и режется на лист кадров 6×4 с подписями слов; лист уплотняется до 8×5 (шаг 0,3 с), агент «пробегает» кадры,
// на кадре 8,1 с — косяк (буквы на лице, карточка обрезана) → кадр крупно → сам исправляет, «без меня».
// Страница 2: шкала «90 % из сети · 10 % шлифовка под вас», облако того, что агент знает из сети,
// и две записки-правила; в шапке — «сказали раз — работает всегда».

type Rect = { x: number; y: number; w: number; h: number };
const mixR = (a: Rect, b: Rect, t: number): Rect => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), w: mix(a.w, b.w, t), h: mix(a.h, b.h, t) });

/** Элемент живёт до следующего бита и уходит за ~10 кадров; нет следующего бита — не гаснет. */
const safeExitAlpha = (f: number, bNext?: number) => (bNext === undefined ? 1 : 1 - ei(f, bNext, 10));

// ── geometry ────────────────────────────────────────────────────────────────────────────────
const SX = 600; // the sheet card (right), absolute
const SY = 250;
const SW = 1180;
const SH = 570;
const GX = 34; // its grid area, card-relative
const GY = 78;
const GW = 1112;
const GH = 466;
const cellRect = (cols: number, rows: number, gap: number, i: number): Rect => {
  const cw = (GW - (cols - 1) * gap) / cols;
  const ch = (GH - (rows - 1) * gap) / rows;
  return { x: GX + (i % cols) * (cw + gap), y: GY + Math.floor(i / cols) * (ch + gap), w: cw, h: ch };
};
const C6 = (i: number) => cellRect(6, 4, 12, i);
const C8 = (i: number) => cellRect(8, 5, 10, i);
const BIG: Rect = { x: GX, y: GY, w: 711, h: 400 }; // the defect frame, magnified (16:9)
const BAD = 27; // 27 · 0,3 с = 8,1 с on the dense sheet
const COLX = SX + GX + BIG.w + 34; // 1379 — the defect column (absolute)

// film strip (card-relative)
const FW = 280;
const FH = 158;
const PITCH = 296;
const V = 14; // px per video frame
const NSTRIP = 5;
const BAND_Y = 150;
const WAVE_Y = BAND_Y + FH + 52 + 18; // the voice track under the reel
const BAND_H = FH + 52;

const SCR = "#0C0E12";
const BUST = "#3B414D";
const MUT = "rgba(154,160,170,0.5)";
const kindOf = (i: number) => [0, 4, 2, 5, 1, 3][(i * 5 + Math.floor(i / 6)) % 6];
const sec = (v: number) => `${v.toFixed(1).replace(".", ",")} с`;

/** One frame of «this very lesson» in a 160×90 box: cards, a gauge, the face, tiles, a chart, a bust in the corner. */
const Art: React.FC<{ kind: number; seed: number }> = ({ kind, seed }) => {
  const a = 0.45 + 0.5 * hash(seed * 1.3 + 0.2);
  const kara = (
    <>
      <rect x={44} y={82} width={72} height={3} rx={1.5} fill="rgba(243,239,230,0.3)" />
      <rect x={58 + 30 * a} y={82} width={14} height={3} rx={1.5} fill={C.accent} />
    </>
  );
  if (kind === 0)
    return (
      <>
        <rect x={10} y={9} width={54} height={6} rx={2} fill={C.text} opacity={0.8} />
        <rect x={10} y={21} width={68} height={56} rx={5} fill={C.surface} />
        <rect x={84} y={21} width={66} height={56} rx={5} fill={C.surface} />
        <rect x={17} y={30} width={50 * a} height={6} rx={2} fill={C.accent} />
        <rect x={17} y={43} width={48} height={3.5} rx={1.5} fill={MUT} />
        <rect x={17} y={51} width={38} height={3.5} rx={1.5} fill={MUT} />
        <rect x={91} y={30} width={36} height={6} rx={2} fill={C.text} opacity={0.7} />
        <rect x={91} y={43} width={48} height={3.5} rx={1.5} fill={MUT} />
        <rect x={91} y={51} width={30} height={3.5} rx={1.5} fill={MUT} />
        {kara}
      </>
    );
  if (kind === 1)
    return (
      <>
        <rect x={10} y={9} width={46} height={6} rx={2} fill={C.text} opacity={0.8} />
        <rect x={10} y={21} width={140} height={56} rx={5} fill={C.surface} />
        <circle cx={44} cy={49} r={17} fill="none" stroke={C.raised} strokeWidth={7} />
        <circle cx={44} cy={49} r={17} fill="none" stroke={C.accent} strokeWidth={7} pathLength={1} strokeDasharray={`${0.3 + 0.6 * a} 1`} transform="rotate(-90 44 49)" />
        <rect x={76} y={36} width={60} height={7} rx={2} fill={C.text} opacity={0.75} />
        <rect x={76} y={50} width={50} height={3.5} rx={1.5} fill={MUT} />
        <rect x={76} y={58} width={40} height={3.5} rx={1.5} fill={MUT} />
        {kara}
      </>
    );
  if (kind === 2)
    return (
      <>
        <rect x={0} y={0} width={160} height={90} fill="#151820" />
        <ellipse cx={80} cy={100} rx={46} ry={36} fill={BUST} />
        <circle cx={80} cy={40} r={17} fill={BUST} />
        <circle cx={80} cy={40} r={17} fill="none" stroke="rgba(243,239,230,0.16)" strokeWidth={1.2} />
      </>
    );
  if (kind === 3) {
    const hot = Math.floor(hash(seed + 4.1) * 6);
    return (
      <>
        {Array.from({ length: 6 }, (_, k) => (
          <rect
            key={k}
            x={10 + (k % 3) * 48}
            y={10 + Math.floor(k / 3) * 35}
            width={44}
            height={31}
            rx={4}
            fill={C.surface}
            stroke={k === hot ? C.accent : "none"}
            strokeWidth={1.4}
          />
        ))}
        <rect x={16 + (hot % 3) * 48} y={17 + Math.floor(hot / 3) * 35} width={20} height={4} rx={1.5} fill={C.accent} />
        {kara}
      </>
    );
  }
  if (kind === 4)
    return (
      <>
        <rect x={10} y={12} width={94} height={62} rx={5} fill={C.surface} />
        <rect x={18} y={21} width={44 * a + 10} height={6} rx={2} fill={C.accent} />
        <rect x={18} y={34} width={70} height={3.5} rx={1.5} fill={MUT} />
        <rect x={18} y={42} width={58} height={3.5} rx={1.5} fill={MUT} />
        <rect x={18} y={54} width={34} height={12} rx={3} fill={C.raised} />
        <ellipse cx={134} cy={90} rx={24} ry={19} fill={BUST} />
        <circle cx={134} cy={50} r={11} fill={BUST} />
      </>
    );
  return (
    <>
      <rect x={10} y={10} width={140} height={68} rx={5} fill={C.surface} />
      {Array.from({ length: 6 }, (_, k) => {
        const h = 12 + 38 * hash(seed + k * 1.7);
        return <rect key={k} x={22 + k * 21} y={70 - h} width={13} height={h} rx={2} fill={k === 2 ? C.accent : "rgba(243,239,230,0.32)"} />;
      })}
      {kara}
    </>
  );
};

/** The defect frame: the title sits on the face, the card is cut by the right edge; `fxT`/`fxC` move them into place. */
const BadArt: React.FC<{ fxT: number; fxC: number; txt: number; red1: number; red2: number; grn: number }> = ({ fxT, fxC, txt, red1, red2, grn }) => (
  <>
    <rect x={8} y={8} width={40} height={4} rx={1.5} fill={C.muted} opacity={0.6} />
    <rect x={8} y={18} width={56} height={34} rx={3} fill={C.surface} />
    <rect x={13} y={24} width={24} height={4} rx={1.5} fill={C.accent} />
    <rect x={13} y={33} width={42} height={2.5} rx={1} fill={MUT} />
    <rect x={13} y={40} width={34} height={2.5} rx={1} fill={MUT} />
    <ellipse cx={128} cy={93} rx={30} ry={22} fill={BUST} />
    <circle cx={128} cy={50} r={13} fill={BUST} />
    <circle cx={128} cy={50} r={13} fill="none" stroke="rgba(243,239,230,0.18)" strokeWidth={0.6} />
    <g transform={`translate(${mix(112, 70, fxC)} 8)`}>
      <rect width={64} height={22} rx={3} fill={C.raised} stroke={C.accent} strokeOpacity={0.6} strokeWidth={0.6} />
      <text x={5} y={14.4} fontFamily={SANS} fontWeight={800} fontSize={8} fill={C.text} opacity={txt}>
        Шаг 2: голос
      </text>
      <rect x={5} y={9} width={48} height={4} rx={1.5} fill={C.text} opacity={0.75 * (1 - txt)} />
    </g>
    <g transform={`translate(${mix(92, 8, fxT)} ${mix(57, 74, fxT)})`}>
      <text x={0} y={0} fontFamily={SANS} fontWeight={900} fontSize={17} fill={C.text} opacity={txt}>
        ГОЛОС
      </text>
      <rect x={0} y={-12.5} width={60} height={12.5} rx={2} fill={C.text} opacity={0.85 * (1 - txt)} />
    </g>
    {red1 > 0 && (
      <g opacity={red1}>
        <rect x={88} y={39} width={70} height={22} rx={2} fill="rgba(248,113,113,0.12)" stroke={C.err} strokeWidth={1.1} />
        <circle cx={88} cy={39} r={5.5} fill={C.err} />
        <text x={88} y={41.6} textAnchor="middle" fontFamily={SANS} fontWeight={900} fontSize={7} fill={C.bg}>
          1
        </text>
      </g>
    )}
    {red2 > 0 && (
      <g opacity={red2}>
        <rect x={108} y={4.5} width={51.5} height={29} rx={2} fill="rgba(248,113,113,0.12)" stroke={C.err} strokeWidth={1.1} />
        <circle cx={108} cy={19} r={5.5} fill={C.err} />
        <text x={108} y={21.6} textAnchor="middle" fontFamily={SANS} fontWeight={900} fontSize={7} fill={C.bg}>
          2
        </text>
      </g>
    )}
    {grn > 0 && (
      <g opacity={grn}>
        <rect x={4} y={58} width={71} height={20} rx={2} fill="none" stroke={C.ok} strokeWidth={0.9} />
        <rect x={66} y={4.5} width={72} height={29} rx={2} fill="none" stroke={C.ok} strokeWidth={0.9} />
        {[
          [75, 78],
          [138, 33.5],
        ].map(([cx, cy], k) => (
          <g key={k}>
            <circle cx={cx} cy={cy} r={5.5} fill={C.ok} />
            <path d={`M${cx - 2.6} ${cy + 0.2}l1.9 1.9 3.6-3.8`} fill="none" stroke={C.bg} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ))}
      </g>
    )}
  </>
);

/** A frame on screen: dark screen, art scaled to the box (slice), optional coloured ring on top. */
const Screen: React.FC<{ r: Rect; o?: number; dx?: number; ring?: string; ringW?: number; radius?: number; children?: React.ReactNode; over?: React.ReactNode }> = ({
  r,
  o = 1,
  dx = 0,
  ring = "rgba(243,239,230,0.12)",
  ringW = 1,
  radius = 10,
  children,
  over,
}) => (
  <div style={{ position: "absolute", left: r.x + dx, top: r.y, width: r.w, height: r.h, borderRadius: radius, overflow: "hidden", background: SCR, opacity: o }}>
    <svg width={r.w} height={r.h} viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", left: 0, top: 0, display: "block" }}>
      {children}
    </svg>
    {over}
    <div style={{ position: "absolute", inset: 0, borderRadius: radius, boxShadow: `inset 0 0 0 ${ringW}px ${ring}` }} />
  </div>
);

/** Download glyph: the arrow bobs into the tray while loading, then turns into a green tick. */
const DlIcon: React.FC<{ f: number; done: number; size?: number }> = ({ f, done, size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: "block", overflow: "visible", flex: "none" }}>
    <path d="M8 33v8h32v-8" fill="none" stroke={C.accent} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    <g transform={`translate(0 ${(1 - done) * 3.5 * Math.sin(f / 3.5)})`} opacity={1 - done}>
      <path d="M24 5v24 M14 19l10 10 10-10" fill="none" stroke={C.accent} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <path d="M13 17l8 8 15-15" fill="none" stroke={C.ok} strokeWidth={4.4} strokeLinecap="round" strokeLinejoin="round" opacity={done} />
  </svg>
);

/** One defect line: number badge + text; at `fixAt` it turns into a green tick with the fixed wording. */
const DefectRow: React.FC<{ f: number; at: number; fixAt: number; n: number; bad: string; good: string }> = ({ f, at, fixAt, n, bad, good }) => {
  const p = sp(f, at, "snap");
  if (p <= 0.002) return null;
  const g = eo(f, fixAt, 10);
  const ok = g >= 0.5;
  const tone = ok ? "74,222,128" : "248,113,113";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        height: 56,
        padding: "0 18px 0 10px",
        borderRadius: 28,
        background: `rgba(${tone},0.12)`,
        border: `2px solid rgba(${tone},0.6)`,
        opacity: Math.min(1, p * 1.6),
        transform: `translateX(${(1 - p) * 34}px)`,
        whiteSpace: "nowrap",
      }}
    >
      <div style={{ width: 36, height: 36, flex: "none", borderRadius: 18, background: ok ? C.ok : C.err, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {ok ? (
          <svg width={26} height={26} viewBox="0 0 48 48" style={{ display: "block", transform: `scale(${0.6 + 0.4 * sp(f, fixAt + 5, "bouncy")})` }}>
            <path d="M12 25l8 8 16-17" fill="none" stroke={C.bg} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 24, color: C.bg, lineHeight: 1 }}>{n}</span>
        )}
      </div>
      <div style={{ position: "relative", ...TX.label, fontSize: 26 }}>
        <span style={{ opacity: Math.max(0, 1 - 2 * g) }}>{bad}</span>
        <span style={{ position: "absolute", left: 0, top: 0, opacity: Math.max(0, 2 * g - 1) }}>{good}</span>
      </div>
    </div>
  );
};

/** A rule note that drops into its slot (heavy spring); a green tick lands at its right end at `checkAt`. */
const Note: React.FC<{ f: number; at: number; text: string; checkAt: number; rot: number }> = ({ f, at, text, checkAt, rot }) => {
  const p = sp(f, at, "heavy");
  if (p <= 0.002) return null;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: Math.min(1, p * 1.8), transform: `translateY(${(1 - p) * -70}px) rotate(${rot * (1 - p)}deg)`, transformOrigin: "50% 0%" }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          borderRadius: 16,
          background: C.raised,
          border: "2px solid rgba(255,179,0,0.55)",
          boxShadow: "0 16px 34px rgba(0,0,0,0.35)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 18px 0 26px",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, background: C.accent }} />
        <Icon name="pin" size={36} color={C.accent} sw={3.8} />
        <div style={{ ...TX.label, fontSize: 30, whiteSpace: "nowrap", flex: 1 }}>{text}</div>
        <div style={{ width: 44, height: 44, flex: "none" }}>
          <CheckBadge f={f} start={checkAt} size={44} ring={false} />
        </div>
      </div>
    </div>
  );
};

/** Card title row: icon + 32 px title. */
const CardTitle: React.FC<{ icon?: React.ReactNode; text: string; style?: React.CSSProperties }> = ({ icon, text, style }) => (
  <div style={{ position: "absolute", left: 34, top: 26, height: 40, display: "flex", alignItems: "center", gap: 14, whiteSpace: "nowrap", ...style }}>
    {icon}
    <div style={{ ...TX.title, fontSize: 32 }}>{text}</div>
  </div>
);

/** Sequential swap of a few texts: each fades out right before the next fades in (never on top of each other). */
const swapO = (f: number, ats: number[], i: number) => {
  const inn = eo(f, ats[i] + (i > 0 ? 5 : 0), 8);
  const out = i + 1 < ats.length ? ei(f, ats[i + 1], 5) : 0;
  return inn * (1 - out);
};

export const Frames: React.FC<SceneProps> = ({ f, b, t0, w, scene, tl }) => {
  const [bDl, bSheet, bCount, bDense, bBug, bFix, bNinety, bRules] = b;
  const wBukvy = w("буквы");
  const wKart = w("карточка");
  const wBez = w("без");
  const wZnaet = w("знает");
  const wDes = w("десять");
  const wShl = w("шлифовка");
  const wSnach = w("сначала");
  const wOne = w("один", 394);
  const wWork = w("работает", 395);

  // the word sounding at voice second t (captions of the sheet = words of this very section)
  const words = tl.words.filter((wd) => wd.sec === scene.section);
  const wordAt = (t: number) => {
    let cur = "";
    for (const wd of words) if (wd.s <= t + 1e-3) cur = wd.t;
    return cur.toLowerCase().replace(/[«»"„.,:;!?—…()]/g, "");
  };

  // ── header ──
  const hdr = sp(f, t0, "snap");
  const tA = 1 - ei(f, bNinety, 6);
  const tB = eo(f, bNinety + 6, 10);
  const pOne = sp(f, wOne, "pop");

  // ── page 1: video card ──
  const pV = sp(f, bDl, "pop");
  const dl = eio(f, bDl + 4, 46);
  const done = eo(f, bDl + 50, 6);
  const play = eio(f, bSheet, bBug - bSheet);

  // ── page 1: counter ──
  const pN = sp(f, bCount, "pop");
  const nFrames = 120 * eo(f, bCount + 6, 34) + 80 * eio(f, bDense + 4, 22);

  // ── page 1: sheet ──
  const pS = sp(f, bSheet, "snap");
  const E0 = bDl + 8;
  const g0 = Math.min(f, bSheet);
  const bandIn = eo(f, bDl + 4, 22);
  const bandO = Math.min(1, eo(f, bDl + 4, 8)) * (1 - eo(f, bSheet, 12));
  const shift = Math.max(0, V * (g0 - E0));
  const holeOff = (((V * (g0 - E0)) % 32) + 32) % 32;
  const sheetGlow = f >= bFix ? 0.8 * eo(f, bFix, 10) : 0.8 * eo(f, bBug, 8);
  const sheetTone = f >= bFix ? C.ok : C.err;
  const heads = [bSheet, bDense, bBug, bFix];

  // scan: a soft glow runs over the frames (pass 1 on 6×4, pass 2 on 8×5, decelerating into the defect)
  const s1 = bSheet + 44;
  const e1 = bDense - 2;
  const s2 = bDense + 28;
  const e2 = bBug;
  let fi = -9;
  let nScan = 0;
  if (f >= s1 && f < e1) {
    fi = ((f - s1) / (e1 - s1)) * 23;
    nScan = 24;
  } else if (f >= s2 && f < e2 + 1) {
    fi = Math.min(BAD, eo(f, s2, e2 - s2) * BAD);
    nScan = 40;
  }
  const scanLbl = eo(f, s1, 8) * (1 - eo(f, e1, 5)) + eo(f, s2, 8) * safeExitAlpha(f, bBug);

  const base = (i: number) => (i < 24 ? mixR(C6(i), C8(i), eio(f, bDense + i * 0.5, 16)) : C8(i));
  const gridFade = 1 - eo(f, bBug + 6, 12);
  const zoomOn = f >= bBug + 8;

  const cells: React.ReactNode[] = [];
  if (f >= bDl && f < bBug + 20) {
    for (let i = 0; i < 40; i++) {
      let r: Rect;
      let land: number; // frame the cell has settled on the sheet
      let o = 1;
      if (i < NSTRIP) {
        const fl = bSheet + 2 + i * 3;
        const sx = -FW + V * (g0 - E0) - PITCH * i;
        if (f < fl && sx <= -FW + 0.5) continue; // not out of the reel yet
        const strip: Rect = { x: sx, y: BAND_Y + 26, w: FW, h: FH };
        r = f < fl ? strip : mixR(strip, base(i), eio(f, fl, 16));
        land = fl + 16;
      } else {
        const a = i < 24 ? bSheet + 8 + (i - NSTRIP) * 1.5 : bDense + 10 + (i - 24) * 1.2;
        const p = sp(f, a, "pop");
        if (p <= 0.002) continue;
        const r0 = base(i);
        const s = 0.72 + 0.28 * Math.min(1, p);
        r = { x: r0.x + (r0.w * (1 - s)) / 2, y: r0.y + (r0.h * (1 - s)) / 2, w: r0.w * s, h: r0.h * s };
        o = Math.min(1, p * 1.8);
        land = a + 6;
      }
      const bad = i === BAD;
      if (bad && zoomOn) continue;
      if (!bad) o *= gridFade;
      if (o <= 0.002) continue;
      const wordO = eo(f, land + 2, 8) * (1 - eo(f, bDense, 8));
      const timeO = eo(f, Math.max(bDense + 12, land + 4), 8);
      const glow = nScan > i ? Math.max(0, 1 - Math.abs(fi - i) / 1.4) : 0;
      const red = bad && f >= bBug;
      cells.push(
        <Screen
          key={i}
          r={r}
          o={o}
          dx={red ? shake(f, bBug, 7, 16) : 0}
          ring={red ? C.err : glow > 0.02 ? `rgba(255,179,0,${glow})` : "rgba(243,239,230,0.12)"}
          ringW={red ? 4 : glow > 0.02 ? 1 + 3 * glow : 1}
          over={
            <>
              {wordO > 0.01 && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: 32,
                    background: "rgba(10,11,14,0.86)",
                    opacity: wordO,
                    textAlign: "center",
                    fontFamily: SANS,
                    fontWeight: 700,
                    fontSize: 24,
                    lineHeight: "32px",
                    letterSpacing: "-0.01em",
                    color: C.text,
                    whiteSpace: "nowrap",
                  }}
                >
                  {wordAt(366 + i * 0.5)}
                </div>
              )}
              {timeO > 0.01 && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: 30,
                    background: "rgba(10,11,14,0.86)",
                    opacity: timeO,
                    textAlign: "center",
                    fontFamily: MONO,
                    fontWeight: 700,
                    fontSize: 24,
                    lineHeight: "30px",
                    color: red ? C.err : glow > 0.5 ? C.accent : C.text,
                    whiteSpace: "nowrap",
                  }}
                >
                  {sec(i * 0.3)}
                </div>
              )}
            </>
          }
        >
          {bad ? <BadArt fxT={0} fxC={0} txt={0} red1={0} red2={0} grn={0} /> : <Art kind={kindOf(i)} seed={i} />}
        </Screen>,
      );
    }
  }

  // ── page 1: the defect, magnified ──
  const z = eio(f, bBug + 8, 18);
  const zr = mixR(C8(BAD), BIG, z);
  const redOut = 1 - eo(f, bFix, 6);
  const fxT = sp(f, bFix + 2, "snap");
  const fxC = sp(f, bFix + 8, "snap");
  const grn = eo(f, bFix + 18, 10);
  const zOk = f >= bFix + 10;
  const ticks = eo(f, bBug + 24, 10);
  const qTitle = [bBug + 12, bFix];

  // ── page 2 ──
  const pBar = sp(f, bNinety + 4, "pop");
  const fill = eio(f, bNinety + 8, 26);
  const BW = 1572;
  const SEG = 0.9 * BW;
  const p10 = Math.min(1, sp(f, wDes, "pop"));
  const pShl = sp(f, wShl, "snap");
  const pK = sp(f, bNinety + 10, "pop");
  const pR = sp(f, Math.min(wDes + 4, w("вот", 387)), "pop");
  const pArrow = eo(f, wShl + 4, 10);
  const KNOW = ["Remotion", "ffmpeg", "вёрстка", "анимация", "шрифты", "тайминг", "монтаж", "цвет", "рендер"];

  return (
    <>
      {/* ══ header ══ */}
      <div
        style={{
          position: "absolute",
          left: 140,
          top: 130,
          width: 1640,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          opacity: Math.min(1, hdr * 1.6),
          transform: `translateY(${(1 - hdr) * -16}px)`,
        }}
      >
        <div style={{ position: "relative", width: 980 }}>
          <div style={{ ...TX.kicker, color: C.accent, fontSize: 26 }}>Самопроверка</div>
          <div style={{ position: "relative", height: 42, marginTop: 8 }}>
            {tA > 0.01 && (
              <div style={{ position: "absolute", left: 0, top: 0, ...TX.title, fontSize: 38, whiteSpace: "nowrap", opacity: tA, transform: `translateY(${-14 * (1 - tA)}px)` }}>
                Агент сам смотрит свой ролик
              </div>
            )}
            {tB > 0.01 && (
              <div style={{ position: "absolute", left: 0, top: 0, ...TX.title, fontSize: 38, whiteSpace: "nowrap", opacity: tB, transform: `translateY(${14 * (1 - tB)}px)` }}>
                90 % знает сам, 10 % — ваши правила
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {pOne > 0.002 && (
            <div style={{ opacity: Math.min(1, pOne * 1.6), transform: `translateY(${(1 - pOne) * 16}px)` }}>
              <Chip text="сказали раз — работает всегда" icon="check" tone="outline" size={26} />
            </div>
          )}
        </div>
      </div>

      {/* ══ page 1: download → frames → defect → fixed ══ */}
      <Leave f={f} at={bNinety} dur={12}>
        {/* the sheet card */}
        <Pop x={SX} y={SY} w={SW} h={SH} p={pS} from="none" s0={0.97}>
          <Frame w={SW} h={SH} kind="plain" glow={sheetGlow} tone={sheetTone}>
            {[
              "Раскадровка · кадр каждые 0,5 с",
              "Раскадровка · кадр каждые 0,3 с",
              "Кадр 8,1 с — что не так?",
              "Кадр 8,1 с — исправлен сам",
            ].map((t, i) => {
              const o = swapO(f, heads, i);
              if (o <= 0.01) return null;
              return <CardTitle key={i} text={t} style={{ opacity: o, transform: `translateY(${(1 - o) * 10}px)` }} />;
            })}
            {scanLbl > 0.01 && (
              <div
                style={{
                  position: "absolute",
                  right: 34,
                  top: 26,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  opacity: scanLbl,
                  fontFamily: MONO,
                  fontWeight: 700,
                  fontSize: 24,
                  color: C.muted,
                  whiteSpace: "nowrap",
                }}
              >
                <Icon name="eye" size={30} color={C.accent} sw={3.6} />
                кадр {Math.min(nScan || 24, Math.max(1, Math.round(fi) + 1))} / {nScan || (f < bDense ? 24 : 40)}
              </div>
            )}
          </Frame>
        </Pop>

        {/* the reel, the frames and the magnified defect — clipped to the card */}
        <div style={{ position: "absolute", left: SX, top: SY, width: SW, height: SH, overflow: "hidden", borderRadius: 22 }}>
          {bandO > 0.01 && (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: BAND_Y,
                width: SW * bandIn,
                height: BAND_H,
                overflow: "hidden",
                background: "#08090C",
                borderTop: `1px solid ${C.line}`,
                borderBottom: `1px solid ${C.line}`,
                opacity: bandO,
              }}
            >
              {Array.from({ length: 40 }, (_, k) => (
                <React.Fragment key={k}>
                  <div style={{ position: "absolute", left: k * 32 - 32 + holeOff, top: 8, width: 16, height: 10, borderRadius: 3, background: C.raised }} />
                  <div style={{ position: "absolute", left: k * 32 - 32 + holeOff, top: BAND_H - 18, width: 16, height: 10, borderRadius: 3, background: C.raised }} />
                </React.Fragment>
              ))}
              <div style={{ position: "absolute", left: 0, top: 0, width: 6, height: BAND_H, background: C.accent, boxShadow: "0 0 24px rgba(255,179,0,0.6)" }} />
            </div>
          )}
          {bandO > 0.01 && (
            <div style={{ position: "absolute", left: 0, top: WAVE_Y, width: SW * bandIn, height: 64, overflow: "hidden", background: "#08090C", borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`, opacity: bandO }}>
              {Array.from({ length: Math.max(0, Math.floor((shift - 120) / 9)) }, (_, k) => {
                const j = -k;
                const x = j * 9 + shift;
                const h = 6 + 44 * hash(j * 0.37 + 2) * (0.45 + 0.55 * hash(j * 1.9 + 5));
                return <div key={k} style={{ position: "absolute", left: x - 6, top: 32 - h / 2, width: 5, height: h, borderRadius: 3, background: x > shift - 60 ? C.accent : "rgba(243,239,230,0.34)" }} />;
              })}
              <div style={{ position: "absolute", left: 6, top: 0, height: 64, display: "flex", alignItems: "center", padding: "0 16px", background: "#08090C", fontFamily: MONO, fontWeight: 700, fontSize: 24, color: C.muted }}>
                голос
              </div>
              <div style={{ position: "absolute", left: 0, top: 0, width: 6, height: 64, background: C.accent }} />
            </div>
          )}
          {cells}
          {zoomOn && (
            <Screen
              r={zr}
              ring={zOk ? C.ok : C.err}
              ringW={3 + z}
              radius={10 + 6 * z}
            >
              <BadArt
                fxT={fxT}
                fxC={fxC}
                txt={z}
                red1={eo(f, wBukvy, 8) * redOut}
                red2={eo(f, wKart, 8) * redOut}
                grn={grn}
              />
            </Screen>
          )}
          {ticks > 0.01 && (
            <div style={{ position: "absolute", left: GX, top: GY + BIG.h + 24, width: BIG.w, height: 22, display: "flex", gap: 5, opacity: ticks }}>
              {Array.from({ length: 40 }, (_, k) => (
                <div
                  key={k}
                  style={{
                    flex: 1,
                    height: 22,
                    borderRadius: 4,
                    background: k === BAD ? (zOk ? C.ok : C.err) : k < BAD ? "rgba(255,179,0,0.5)" : C.raised,
                    transform: k === BAD ? `scaleY(${1 + 0.35 * bump(f, bBug + 24, 14)})` : undefined,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* defect column */}
        <div style={{ position: "absolute", left: COLX, top: SY + 26, width: 367, height: 520 }}>
          {["Что не так?", "Переделал сам"].map((t, i) => {
            const o = swapO(f, qTitle, i);
            if (o <= 0.01) return null;
            return (
              <div key={i} style={{ position: "absolute", left: 0, top: 0, height: 40, display: "flex", alignItems: "center", ...TX.title, fontSize: 32, whiteSpace: "nowrap", opacity: o, transform: `translateY(${(1 - o) * 10}px)` }}>
                {t}
              </div>
            );
          })}
          <div style={{ position: "absolute", left: 0, top: 62, display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
            <DefectRow f={f} at={wBukvy} fixAt={bFix + 4} n={1} bad="буквы на лице" good="лицо свободно" />
            <DefectRow f={f} at={wKart} fixAt={bFix + 10} n={2} bad="карточка обрезана" good="карточка целиком" />
          </div>
          {f >= bFix + 12 && (
            <div style={{ position: "absolute", left: 0, top: 232, display: "flex", alignItems: "center", gap: 16 }}>
              <CheckBadge f={f} start={bFix + 12} size={72} />
              <span style={{ ...TX.title, fontSize: 28, whiteSpace: "nowrap", opacity: eo(f, bFix + 16, 8) }}>кадр в порядке</span>
            </div>
          )}
          <div style={{ position: "absolute", left: 6, top: 360 }}>
            <Stamp text="БЕЗ МЕНЯ" f={f} start={Math.min(wBez - 6, bFix + 14)} size={40} rot={-5} />
          </div>
        </div>

        {/* left column: the video */}
        <Pop x={140} y={250} w={420} h={352} p={pV} from="left" d={60}>
          <div style={{ position: "absolute", inset: 0, transform: `translateY(${float(f, 1, 2.5, 120)}px)` }}>
            <Frame w={420} h={352} kind="plain" glow={0.55 * bump(f, bDl + 50, 26)} tone={C.ok}>
              <CardTitle icon={<DlIcon f={f} done={done} />} text="Свой ролик" />
              <div style={{ position: "absolute", left: 34, top: 82, width: 352, height: 198, borderRadius: 12, overflow: "hidden", background: SCR, boxShadow: `inset 0 0 0 1px ${C.line}` }}>
                <svg width={352} height={198} viewBox="0 0 160 90" style={{ position: "absolute", left: 0, top: 0 }}>
                  <Art kind={4} seed={3} />
                </svg>
                <div
                  style={{
                    position: "absolute",
                    left: 144,
                    top: 67,
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    background: "rgba(17,19,24,0.72)",
                    border: "2px solid rgba(243,239,230,0.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: safeExitAlpha(f, bSheet),
                  }}
                >
                  <Icon name="play" size={30} color={C.text} />
                </div>
                <div style={{ position: "absolute", left: 0, bottom: 0, width: 352, height: 8, background: "rgba(243,239,230,0.12)" }} />
                <div style={{ position: "absolute", left: 0, bottom: 0, width: 352 * (f < bSheet ? dl : play), height: 8, background: C.accent }} />
              </div>
              <div style={{ position: "absolute", left: 34, top: 294, width: 352, height: 34, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: MONO, fontSize: 26, color: C.text }}>ролик.mp4</span>
                {done < 0.5 ? (
                  <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, color: C.accent }}>{Math.round(dl * 100)} %</span>
                ) : (
                  <span style={{ display: "flex", alignItems: "center", gap: 10, ...TX.label, fontSize: 26 }}>
                    <CheckBadge f={f} start={bDl + 52} size={32} ring={false} />
                    скачан
                  </span>
                )}
              </div>
            </Frame>
          </div>
        </Pop>

        {/* left column: seconds → frames */}
        <Pop x={140} y={632} w={420} h={188} p={pN} from="left" d={60}>
          <div style={{ position: "absolute", inset: 0, transform: `translateY(${float(f, 2.3, 2.5, 120)}px)` }}>
            <Frame w={420} h={188} kind="plain" glow={0.6 * bump(f, bDense + 4, 26)}>
              <CardTitle text="Секунды → кадры" />
              <div style={{ position: "absolute", left: 34, top: 84, height: 74, display: "flex", alignItems: "center", gap: 14, whiteSpace: "nowrap" }}>
                <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 48, color: C.text }}>60 с</span>
                <Icon name="arrow" size={40} color={C.accent} sw={4} />
                <Count v={nFrames} style={{ fontSize: 66, color: C.accent }} />
              </div>
            </Frame>
          </div>
        </Pop>
      </Leave>

      {/* ══ page 2: 90 / 10 and the rules ══ */}
      <Pop x={140} y={250} w={1640} h={204} p={pBar} from="below" d={50}>
        <Frame w={1640} h={204} kind="plain" glow={0.6 * bump(f, wDes, 30)}>
          <CardTitle icon={<Icon name="brain" size={36} color={C.accent} sw={3.6} />} text="Что агент знает сам" />
          <div style={{ position: "absolute", left: 34, top: 78, width: BW, height: 56, borderRadius: 16, background: "rgba(243,239,230,0.06)" }}>
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: Math.max(0, (SEG - 6) * fill),
                height: 56,
                boxSizing: "border-box",
                borderRadius: 16,
                background: C.raised,
                border: "2px solid rgba(243,239,230,0.16)",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                gap: 18,
                padding: "0 24px",
                whiteSpace: "nowrap",
              }}
            >
              <Count v={90 * fill} suffix=" %" style={{ fontSize: 36, color: C.text }} />
              <span style={{ ...TX.label, fontSize: 28, color: C.muted, opacity: eo(f, bNinety + 22, 10) }}>из сети</span>
            </div>
            {p10 > 0.002 && (
              <div
                style={{
                  position: "absolute",
                  left: SEG,
                  top: 0,
                  width: (BW - SEG) * p10,
                  height: 56,
                  borderRadius: 16,
                  background: C.accent,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  fontFamily: MONO,
                  fontWeight: 700,
                  fontSize: 32,
                  color: C.bg,
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ opacity: eo(f, wDes + 6, 8) }}>10 %</span>
              </div>
            )}
          </div>
          {pShl > 0.002 && (
            <div
              style={{
                position: "absolute",
                right: 34,
                top: 144,
                height: 36,
                display: "flex",
                alignItems: "center",
                gap: 10,
                ...TX.label,
                fontSize: 28,
                color: C.accent,
                whiteSpace: "nowrap",
                opacity: Math.min(1, pShl * 1.6),
                transform: `translateY(${(1 - pShl) * 10}px)`,
              }}
            >
              шлифовка под вас
            </div>
          )}
        </Frame>
      </Pop>

      {/* connector: the 10 % segment → the rules */}
      {pArrow > 0.01 && (
        <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
          <path
            d={`M${174 + SEG + (BW - SEG) / 2} 456 L${174 + SEG + (BW - SEG) / 2} 486`}
            stroke={C.accent}
            strokeWidth={4}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={1 - pArrow}
          />
        </svg>
      )}

      <Pop x={140} y={490} w={820} h={330} p={pK} from="left" d={50}>
        <div style={{ position: "absolute", inset: 0, transform: `translateY(${float(f, 4.1, 2.5, 130)}px)` }}>
          <Frame w={820} h={330} kind="plain">
            <CardTitle icon={<Icon name="globe" size={36} color={C.accent} sw={3.6} />} text="90 % — из сети, уже знает" />
            <div style={{ position: "absolute", left: 34, top: 92, width: 752, display: "flex", flexWrap: "wrap", gap: 14 }}>
              {KNOW.map((k, i) => {
                const p = sp(f, wZnaet - 4 + i * 4, "pop");
                return (
                  <div key={k} style={{ opacity: Math.min(1, p * 1.7), transform: `translateY(${(1 - Math.min(1, p)) * 22 + float(f, i, 2, 100)}px)` }}>
                    <Chip text={k} tone="surface" size={26} />
                  </div>
                );
              })}
            </div>
          </Frame>
        </div>
      </Pop>

      <Pop x={1000} y={490} w={780} h={330} p={pR} from="right" d={50}>
        <Frame w={780} h={330} kind="plain" glow={0.5 * bump(f, bRules, 26) + 0.5 * bump(f, wSnach, 26)}>
          <CardTitle icon={<Icon name="pin" size={36} color={C.accent} sw={3.6} />} text="10 % — ваши правила" />
          {[
            { at: bRules, text: "«не налезай текстом на лицо»", y: 88, rot: -3 },
            { at: wSnach, text: "«сначала сценарий, потом промпт»", y: 198, rot: 3 },
          ].map((n, i) => (
            <div key={i} style={{ position: "absolute", left: 34, top: n.y, width: 712, height: 96 }}>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 16,
                  border: "2px dashed rgba(154,160,170,0.4)",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 26px",
                  ...TX.label,
                  fontSize: 26,
                  color: C.muted,
                  opacity: 1 - eo(f, n.at + 4, 8),
                }}
              >
                правило {i + 1}
              </div>
              <Note f={f} at={n.at} text={n.text} checkAt={wWork + i * 5} rot={n.rot} />
            </div>
          ))}
        </Frame>
      </Pop>
    </>
  );
};
