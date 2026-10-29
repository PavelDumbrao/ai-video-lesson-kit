import React from "react";
import { interpolateColors } from "remotion";
import { C, MONO, SANS } from "../../../theme";
import { ei, eio, eo, float, hash, mix, shake, sp } from "../../anim";
import { Icon, IconName } from "../../icons";
import { Caret } from "../../text";
import { SceneProps } from "../../types";
import { Avatar, CheckBadge, Chip, Dots, Frame, glowWin, Pop, Stamp, TX } from "../../ui";
import { Burst } from "../../viz";
import { CrossBadge, IconTile } from "../kit";

// «Отпустить контроль» (раздел 13, голос 660,58–695,37 с). Лицо F11 во весь экран до 668,02 с — под ним уже
// стоят шапка и широкая карточка со словами ученицы. «ловушка» — рука хватает рычаг «КОНТРОЛЬ» и дёргает его,
// «не получится» ✗, рука отпускает рычаг → карточка сужается в левую колонку, справа «Правильно так»: печатается
// промпт и загораются три шага «назови инструмент → «найди скиллы сам» → решение ✓». «Blender?» — левая карточка
// переворачивается: крутящийся куб с вопросом «зачем вам знать?». «месяц» — справа календарь месяца: дни с ✓/✗/💬,
// правила «да» · «нет» · «по-человечески», полоса «агент учится» с навыками. «на выходе» — левая карточка
// переворачивается ещё раз: исполнитель → партнёр → «Джарвис». Уход сцены к t1 делает SceneLayer.

// ── geometry ────────────────────────────────────────────────────────────────────────────────────────────────
const ZX = 140; // scene zone x 140–1780
const ZW = 1640;
const TOP = 250; // content cards start strictly at y 250
const CH = 570; // … and are 570 high
const LW = 460; // left column (trap → cube → chain)
const RX = 640; // right column (flow → calendar)
const RW = 1140;

/** 1 until the next beat `bNext`, then a smooth ~10-frame fade; without `bNext` the element never fades. */
const safeExitAlpha = (f: number, bNext?: number) => (bNext === undefined ? 1 : 1 - ei(f, bNext, 10));

/** Card flip around Y: side 0 folds edge-on in 8 frames from `start`, side 1 unfolds with a snap spring. */
const flip = (f: number, start: number) =>
  f < start + 8 ? { side: 0, deg: 90 * ei(f, start, 8) } : { side: 1, deg: -90 * (1 - sp(f, start + 8, "snap")) };

const Kicker: React.FC<{ f: number; at: number; text: string; icon?: IconName; color?: string; x?: number; y?: number }> = ({
  f,
  at,
  text,
  icon,
  color = C.muted,
  x = 34,
  y = 26,
}) => {
  const p = sp(f, at, "snap");
  if (p <= 0.002) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        display: "flex",
        alignItems: "center",
        gap: 12,
        ...TX.kicker,
        color,
        whiteSpace: "nowrap",
        opacity: Math.min(1, p * 1.6),
        transform: `translateX(${(1 - p) * -20}px)`,
      }}
    >
      {icon && <Icon name={icon} size={30} color={color} sw={3.8} />}
      {text}
    </div>
  );
};

/** A line of title text rising out of a mask at `at`. */
const RiseRow: React.FC<{ f: number; at: number; size: number; children: React.ReactNode }> = ({ f, at, size, children }) => {
  if (f < at) return null;
  const r = eo(f, at, 16);
  return (
    <div style={{ overflow: "hidden", padding: "0.12em 0.06em 0.16em", margin: "-0.12em -0.06em -0.16em" }}>
      <div style={{ ...TX.title, fontSize: size, whiteSpace: "nowrap", transform: `translateY(${(1 - r) * 110}%)` }}>{children}</div>
    </div>
  );
};

// ── header: title + three progress chips (they light up as the scene reaches them) ────────────────────────────
const StepChip: React.FC<{ text: string; on: number; p: number }> = ({ text, on, p }) => (
  <div
    style={{
      height: 46,
      padding: "0 20px",
      borderRadius: 23,
      display: "flex",
      alignItems: "center",
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: 24,
      whiteSpace: "nowrap",
      background: interpolateColors(on, [0, 1], ["rgba(154,160,170,0.10)", C.accent]),
      border: `2px solid ${interpolateColors(on, [0, 1], ["rgba(154,160,170,0.35)", C.accent])}`,
      color: interpolateColors(on, [0, 1], [C.muted, C.bg]),
      boxShadow: on > 0 ? `0 0 26px rgba(255,179,0,${0.25 * on})` : undefined,
      opacity: Math.min(1, p * 1.6),
      transform: `translateY(${(1 - p) * -16}px)`,
    }}
  >
    {text}
  </div>
);

const Header: React.FC<{ f: number; t0: number; lit: number[] }> = ({ f, t0, lit }) => {
  const r = eo(f, t0 + 2, 18);
  const names = ["инструмент", "навыки", "партнёр"];
  return (
    <div
      style={{ position: "absolute", left: ZX, top: 146, width: ZW, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
    >
      <div style={{ overflow: "hidden", padding: "0.12em 0.06em 0.16em", margin: "-0.12em -0.06em -0.16em" }}>
        <div style={{ ...TX.title, fontSize: 38, whiteSpace: "nowrap", transform: `translateY(${(1 - r) * 110}%)` }}>
          Не контролируйте — <span style={{ color: C.accent }}>научите</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {names.map((n, i) => {
          const p = sp(f, t0 + 8 + i * 4, "snap");
          const ap = eo(f, lit[i] - 6, 10);
          return (
            <React.Fragment key={n}>
              {i > 0 && (
                <div style={{ opacity: Math.min(1, p * 1.6) * (0.45 + 0.55 * ap) }}>
                  <Icon name="arrow" size={28} color={ap > 0.5 ? C.accent : C.muted} sw={4} />
                </div>
              )}
              <StepChip text={n} p={p} on={eo(f, lit[i], 10)} />
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// ── page 1: the lever «КОНТРОЛЬ» with a hand on it ───────────────────────────────────────────────────────────
const PIV = { x: 196, y: 270 }; // lever pivot inside the 392×390 svg

const Lever: React.FC<{ f: number; bTrap: number; wCtl: number; wFail: number; wLet: number }> = ({ f, bTrap, wCtl, wFail, wLet }) => {
  // hard pulls back and forth while «контролировать нейронку, как человека»; jams on «не получится»
  const yank = (g: number) => 4 - 36 * Math.pow(Math.abs(Math.sin((Math.PI * (g - wCtl)) / 22)), 0.7);
  let th: number;
  if (f < bTrap + 8) th = 10;
  else if (f < wCtl) th = mix(10, 4, eo(f, bTrap + 8, 10)) + 1.5 * Math.sin((f - bTrap) / 4);
  else if (f < wFail) th = yank(f);
  else th = mix(yank(wFail), -3, eo(f, wFail, 10));
  th = mix(th, 0, sp(f, wLet + 4, "bouncy")); // released → springs back upright
  const sx = shake(f, wFail, 10, 18);
  // the hand grabs on «ловушка», lets go on «правильно»
  const hp = sp(f, bTrap, "pop");
  const rel = eo(f, wLet, 16);
  const ha = Math.min(1, hp * 1.6) * (1 - rel);
  const hx = -70 * (1 - hp) - 40 * rel;
  const hy = 50 * (1 - hp) - 90 * rel;
  return (
    <svg width={392} height={390} viewBox="0 0 392 390" style={{ display: "block", overflow: "visible" }}>
      <ellipse cx={196} cy={374} rx={156} ry={12} fill="rgba(0,0,0,0.32)" />
      <g transform={`translate(${sx} 0)`}>
        <rect x={46} y={270} width={300} height={92} rx={18} fill={C.surface2} stroke="rgba(243,239,230,0.14)" strokeWidth={2} />
        <rect x={118} y={258} width={156} height={20} rx={10} fill="#0B0D11" />
        <g transform={`rotate(${th} ${PIV.x} ${PIV.y})`}>
          <line x1={PIV.x} y1={PIV.y} x2={PIV.x} y2={110} stroke="#0B0D11" strokeWidth={24} strokeLinecap="round" />
          <line x1={PIV.x} y1={PIV.y} x2={PIV.x} y2={110} stroke={C.muted} strokeWidth={15} strokeLinecap="round" />
          <circle cx={PIV.x} cy={92} r={32} fill={C.accent} />
          <circle cx={PIV.x - 10} cy={81} r={9} fill="rgba(255,255,255,0.4)" />
          {ha > 0.01 && (
            <g transform={`translate(${PIV.x + hx} ${160 + hy})`} opacity={ha}>
              {/* forearm from the lower left */}
              <path d="M-24 -12 L-114 28 Q-130 36 -122 52 L-116 62 Q-108 74 -94 66 L-16 26 Z" fill={C.text} />
              {/* fist around the stick */}
              <rect x={-38} y={-36} width={78} height={72} rx={24} fill={C.text} />
              <path d="M10 -18 H34 M10 0 H36 M10 18 H34" stroke={C.bg} strokeWidth={4} strokeLinecap="round" />
              <rect x={-32} y={-48} width={48} height={26} rx={13} fill={C.text} stroke={C.bg} strokeWidth={3} />
            </g>
          )}
        </g>
        <circle cx={PIV.x} cy={PIV.y} r={20} fill={C.raised} stroke="rgba(243,239,230,0.22)" strokeWidth={2} />
        <text x={PIV.x + 4} y={330} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={28} letterSpacing="0.14em" fill={C.accent}>
          КОНТРОЛЬ
        </text>
      </g>
    </svg>
  );
};

const TrapSide: React.FC<{ f: number; t0: number; bTrap: number; wCtl: number; wHow: number; wFail: number; wRight: number }> = ({
  f,
  t0,
  bTrap,
  wCtl,
  wHow,
  wFail,
  wRight,
}) => {
  const rightA = 1 - ei(f, wRight, 8); // the wide part leaves before the card narrows
  const qp = sp(f, t0 + 14, "pop");
  const lp = sp(f, bTrap - 4, "pop");
  const fp = sp(f, wRight + 6, "snap");
  return (
    <>
      <Kicker f={f} at={bTrap} icon="warn" text="ЛОВУШКА" color={C.accent} />
      {lp > 0.002 && (
        <div style={{ position: "absolute", left: 34, top: 70, opacity: Math.min(1, lp * 1.6), transform: `translateY(${(1 - lp) * 40}px)` }}>
          <Lever f={f} bTrap={bTrap} wCtl={wCtl} wFail={wFail} wLet={wRight} />
        </div>
      )}
      {f >= wFail && (
        <div style={{ position: "absolute", left: 34 + 302, top: 78 }}>
          <CrossBadge f={f} start={wFail} size={78} />
        </div>
      )}
      {fp > 0.002 && (
        <div
          style={{
            position: "absolute",
            left: 34,
            top: 476,
            width: 392,
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            borderRadius: 32,
            background: "rgba(248,113,113,0.12)",
            border: "2px solid rgba(248,113,113,0.55)",
            opacity: Math.min(1, fp * 1.6),
            transform: `translateY(${(1 - fp) * 20}px)`,
          }}
        >
          <CrossBadge f={f} start={wFail + 6} size={38} />
          <span style={{ ...TX.label, fontSize: 30, whiteSpace: "nowrap" }}>не получится</span>
        </div>
      )}
      {rightA > 0.002 && (
        <div style={{ position: "absolute", left: 480, top: 0, width: 1126, height: CH, opacity: rightA, transform: `translateX(${-40 * (1 - rightA)}px)` }}>
          <Kicker f={f} at={t0 + 10} text="СЛОВА УЧЕНИЦЫ" x={0} />
          {qp > 0.002 && (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 76,
                display: "flex",
                alignItems: "center",
                gap: 20,
                padding: "22px 30px",
                borderRadius: 22,
                borderTopLeftRadius: 6,
                background: C.raised,
                border: `1px solid ${C.line}`,
                boxShadow: "0 14px 30px rgba(0,0,0,0.28)",
                opacity: Math.min(1, qp * 1.6),
                transform: `translateY(${(1 - qp) * 24}px)`,
              }}
            >
              <Icon name="quote" size={40} color={C.accent} />
              <span style={{ ...TX.label, fontSize: 32, whiteSpace: "nowrap" }}>«Я всё проверяю — он постоянно косячит»</span>
            </div>
          )}
          <div style={{ position: "absolute", left: 0, top: 250 }}>
            <RiseRow f={f} at={wCtl} size={54}>
              Контролируем нейронку,
            </RiseRow>
          </div>
          <div style={{ position: "absolute", left: 0, top: 326 }}>
            <RiseRow f={f} at={wHow} size={54}>
              <span style={{ color: C.accent }}>как человека</span>
            </RiseRow>
          </div>
          <div style={{ position: "absolute", left: 16, top: 418 }}>
            <Stamp text="НЕ ПОЛУЧИТСЯ" f={f} start={wFail} color={C.err} size={44} rot={-5} />
          </div>
        </div>
      )}
    </>
  );
};

// ── page 2 (right): «Правильно так» — prompt + three steps ─────────────────────────────────────────────────────
const TILE_X = [34, 420, 806];
const TILE_Y = 226;
const TILE_W = 300;
const TILE_H = 310;

const StepTile: React.FC<{
  f: number;
  x: number;
  appear: number;
  lit: number;
  n: string;
  icon: IconName;
  children: React.ReactNode;
  bottom?: React.ReactNode;
}> = ({ f, x, appear, lit, n, icon, children, bottom }) => {
  const p = sp(f, appear, "pop");
  if (p <= 0.002) return null;
  const on = eo(f, lit, 10);
  const glow = glowWin(f, lit, lit + 18, 0.35);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: TILE_Y,
        width: TILE_W,
        height: TILE_H,
        borderRadius: 20,
        background: C.surface2,
        border: `2px solid ${interpolateColors(on, [0, 1], ["rgba(243,239,230,0.10)", "rgba(255,179,0,0.85)"])}`,
        boxShadow: glow > 0 ? `0 0 44px rgba(255,179,0,${0.3 * glow})` : undefined,
        opacity: Math.min(1, p * 1.6),
        transform: `translateY(${(1 - p) * 30}px)`,
      }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: 0.38 + 0.62 * on }}>
        <div style={{ position: "absolute", left: 24, top: 24 }}>
          <IconTile icon={icon} size={72} color={on > 0.5 ? C.accent : C.muted} bg={on > 0.5 ? "rgba(255,179,0,0.14)" : "rgba(154,160,170,0.12)"} />
        </div>
        <div style={{ position: "absolute", right: 26, top: 36, fontFamily: MONO, fontWeight: 700, fontSize: 26, color: on > 0.5 ? C.accent : C.muted }}>{n}</div>
        <div style={{ position: "absolute", left: 24, top: 118, width: 252 }}>{children}</div>
        {bottom && <div style={{ position: "absolute", left: 24, top: 222 }}>{bottom}</div>}
      </div>
    </div>
  );
};

const P1 = "Реши мою задачу с его помощью.";
const P2A = "А как им пользоваться — ";
const P2B = "найди сам.";

const FlowSide: React.FC<{ f: number; rin: number; wSo: number; bTool: number; wSolve: number; wA: number; wFind: number; wSelf: number }> = ({
  f,
  rin,
  wSo,
  bTool,
  wSolve,
  wA,
  wFind,
  wSelf,
}) => {
  const lit = [bTool, wFind, wSelf + 8];
  const bp = sp(f, rin + 6, "pop");
  const n1 = f < wSolve ? 0 : Math.min(P1.length, Math.floor(((f - wSolve) * 24) / 30));
  const n2 = f < wA ? 0 : Math.min(P2A.length + P2B.length, Math.floor(((f - wA) * 26) / 30));
  const typing1 = f >= wSolve && n1 < P1.length && f < wA;
  const onLine2 = f >= wA;
  const tTitle: React.CSSProperties = { ...TX.label, fontSize: 32, lineHeight: 1.16 };
  return (
    <>
      <Kicker f={f} at={Math.max(rin, wSo)} icon="check" text="ПРАВИЛЬНО ТАК" color={C.accent} />
      {bp > 0.002 && (
        <div
          style={{
            position: "absolute",
            left: 34,
            top: 82,
            display: "flex",
            alignItems: "flex-start",
            gap: 18,
            opacity: Math.min(1, bp * 1.6),
            transform: `translateY(${(1 - bp) * 22}px)`,
          }}
        >
          <Avatar size={64} icon="user" />
          <div
            style={{
              width: 960,
              height: 110,
              boxSizing: "border-box",
              padding: "16px 26px",
              borderRadius: 22,
              borderTopLeftRadius: 6,
              background: C.raised,
              border: `1px solid ${C.line}`,
              boxShadow: "0 12px 26px rgba(0,0,0,0.25)",
              ...TX.label,
              fontSize: 30,
              lineHeight: "39px",
              whiteSpace: "nowrap",
            }}
          >
            <div style={{ height: 39 }}>
              {f < wSolve ? <Dots f={f} size={11} /> : P1.slice(0, n1)}
              {(typing1 || (f >= wSolve && !onLine2)) && <Caret f={f} solid={typing1} />}
            </div>
            <div style={{ height: 39 }}>
              <span>{P2A.slice(0, Math.min(n2, P2A.length))}</span>
              <span style={{ color: C.accent }}>{n2 > P2A.length ? P2B.slice(0, n2 - P2A.length) : ""}</span>
              {onLine2 && <Caret f={f} solid={n2 < P2A.length + P2B.length} />}
            </div>
          </div>
        </div>
      )}
      <StepTile
        f={f}
        x={TILE_X[0]}
        appear={rin + 10}
        lit={lit[0]}
        n="01"
        icon="wrench"
        bottom={f >= lit[0] ? <Chip text="Blender" tone="outline" size={24} mono /> : undefined}
      >
        <div style={tTitle}>Назови</div>
        <div style={tTitle}>инструмент</div>
      </StepTile>
      <StepTile f={f} x={TILE_X[1]} appear={rin + 15} lit={lit[1]} n="02" icon="search" bottom={f >= lit[1] ? <Chip text="агент ищет" tone="dark" size={24} /> : undefined}>
        <div style={tTitle}>«Найди</div>
        <div style={tTitle}>скиллы сам»</div>
      </StepTile>
      <StepTile f={f} x={TILE_X[2]} appear={rin + 20} lit={lit[2]} n="03" icon="target" bottom={<CheckBadge f={f} start={lit[2] + 2} size={58} />}>
        <div style={{ ...TX.title, fontSize: 34 }}>Решение</div>
        <div style={{ ...TX.label, fontSize: 26, color: C.muted, marginTop: 6 }}>задача закрыта</div>
      </StepTile>
      {/* arrows between the tiles; a dot runs along when the next step lights */}
      {[0, 1].map((i) => {
        const ap = sp(f, rin + 18 + i * 5, "snap");
        if (ap <= 0.002) return null;
        const d = eo(f, lit[i + 1] - 8, 10);
        const ax = TILE_X[i] + TILE_W;
        const run = (f - (lit[i + 1] - 8)) / 9;
        return (
          <div key={i} style={{ position: "absolute", left: ax, top: TILE_Y + TILE_H / 2 - 20, width: 86, height: 40, opacity: Math.min(1, ap * 1.6) }}>
            <svg width={86} height={40} style={{ overflow: "visible" }}>
              <path d="M14 20 H70" stroke="rgba(154,160,170,0.4)" strokeWidth={4} strokeLinecap="round" strokeDasharray="2 10" />
              <path d="M14 20 H70" stroke={C.accent} strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - d} />
              <path d="M58 9 L72 20 L58 31" fill="none" stroke={d > 0.8 ? C.accent : "rgba(154,160,170,0.5)"} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
              {run > 0 && run < 1 && <circle cx={mix(8, 78, run)} cy={20} r={9} fill={C.accent} />}
            </svg>
          </div>
        );
      })}
    </>
  );
};

// ── page 3 (left): the Blender cube with «зачем вам знать?» ───────────────────────────────────────────────────
type V3 = [number, number, number];
const CV: V3[] = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, 1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [1, 1, 1],
  [-1, 1, 1],
];
const CF: { v: number[]; n: V3 }[] = [
  { v: [0, 1, 2, 3], n: [0, 0, -1] },
  { v: [4, 5, 6, 7], n: [0, 0, 1] },
  { v: [0, 1, 5, 4], n: [0, -1, 0] },
  { v: [3, 2, 6, 7], n: [0, 1, 0] },
  { v: [1, 2, 6, 5], n: [1, 0, 0] },
  { v: [0, 3, 7, 4], n: [-1, 0, 0] },
];
const rot3 = ([x, y, z]: V3, a: number, p: number): V3 => {
  const x1 = x * Math.cos(a) + z * Math.sin(a);
  const z1 = -x * Math.sin(a) + z * Math.cos(a);
  return [x1, y * Math.cos(p) - z1 * Math.sin(p), y * Math.sin(p) + z1 * Math.cos(p)];
};
const LIGHT: V3 = (() => {
  const l: V3 = [-0.45, -0.85, 0.55];
  const m = Math.hypot(...l);
  return [l[0] / m, l[1] / m, l[2] / m];
})();

/** Blender's default cube: grey shaded faces, orange «selected» outline, floor grid; turns slowly. */
const Cube: React.FC<{ f: number; start: number }> = ({ f, start }) => {
  const a = 0.785 + 0.36 * Math.sin((f - start) / 34);
  const p = -0.55;
  const s = 70;
  const cx = 160;
  const cy = 132;
  const pt = (v: V3) => {
    const r = rot3(v, a, p);
    return { x: cx + s * r[0], y: cy + s * r[1], z: r[2] };
  };
  const grid: React.ReactNode[] = [];
  const G = 1.5;
  const FY = 1.32;
  for (let i = -2; i <= 2; i++) {
    const k = (i / 2) * G;
    const a1 = pt([k, FY, -G]);
    const a2 = pt([k, FY, G]);
    const b1 = pt([-G, FY, k]);
    const b2 = pt([G, FY, k]);
    grid.push(<line key={`a${i}`} x1={a1.x} y1={a1.y} x2={a2.x} y2={a2.y} />, <line key={`b${i}`} x1={b1.x} y1={b1.y} x2={b2.x} y2={b2.y} />);
  }
  const shadowPts = [3, 2, 6, 7].map((i) => pt([CV[i][0] * 1.08, FY, CV[i][2] * 1.08]));
  const faces = CF.map((fc) => {
    const n = rot3(fc.n, a, p);
    return { fc, n, z: n[2] };
  })
    .filter((x) => x.z > 0.01)
    .sort((u, v) => u.z - v.z);
  const sc = sp(f, start, "pop");
  return (
    <svg width={320} height={290} viewBox="0 0 320 290" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <radialGradient id="l1ctl-floor" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff" stopOpacity={1} />
          <stop offset="100%" stopColor="#fff" stopOpacity={0} />
        </radialGradient>
        <mask id="l1ctl-floor-mask">
          <rect x={-60} y={60} width={440} height={240} fill="url(#l1ctl-floor)" />
        </mask>
      </defs>
      <g opacity={Math.min(1, sc * 1.4)} mask="url(#l1ctl-floor-mask)" stroke="rgba(243,239,230,0.13)" strokeWidth={1.5}>
        {grid}
      </g>
      <g transform={`translate(${cx} ${cy}) scale(${sc}) translate(${-cx} ${-cy})`}>
        <polygon points={shadowPts.map((q) => `${q.x},${q.y}`).join(" ")} fill="rgba(0,0,0,0.38)" />
        {faces.map(({ fc, n }, j) => {
          const lum = 0.32 + 0.68 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
          const ch = (lo: number, hi: number) => Math.round(mix(lo, hi, lum));
          const fill = `rgb(${ch(46, 196)},${ch(52, 200)},${ch(64, 208)})`;
          const pts = fc.v.map((i) => pt(CV[i]));
          return (
            <polygon
              key={j}
              points={pts.map((q) => `${q.x},${q.y}`).join(" ")}
              fill={fill}
              stroke={C.accent}
              strokeWidth={3.5}
              strokeLinejoin="round"
            />
          );
        })}
      </g>
    </svg>
  );
};

const CubeSide: React.FC<{ f: number; start: number; bBlender: number }> = ({ f, start, bBlender }) => {
  const bq = sp(f, Math.max(start + 6, bBlender), "bouncy");
  const tp = sp(f, start + 10, "snap");
  const by = float(f, 3, 4, 70);
  return (
    <>
      <Kicker f={f} at={start} icon="box" text="ИНСТРУМЕНТ" />
      {bq > 0.002 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 70 + by, display: "flex", justifyContent: "center" }}>
          <div
            style={{
              position: "relative",
              padding: "14px 28px",
              borderRadius: 22,
              background: C.raised,
              border: "2px solid rgba(255,179,0,0.65)",
              boxShadow: "0 12px 26px rgba(0,0,0,0.3)",
              ...TX.label,
              fontSize: 30,
              whiteSpace: "nowrap",
              opacity: Math.min(1, bq * 1.6),
              transform: `translateY(${(1 - bq) * 18}px)`,
            }}
          >
            зачем вам знать?
            <div
              style={{
                position: "absolute",
                left: "50%",
                bottom: -12,
                width: 22,
                height: 22,
                marginLeft: -11,
                background: C.raised,
                borderRight: "2px solid rgba(255,179,0,0.65)",
                borderBottom: "2px solid rgba(255,179,0,0.65)",
                transform: "rotate(45deg)",
              }}
            />
          </div>
        </div>
      )}
      <div style={{ position: "absolute", left: 70, top: 152 }}>
        <Cube f={f} start={start} />
      </div>
      {tp > 0.002 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 448, textAlign: "center", opacity: Math.min(1, tp * 1.6), transform: `translateY(${(1 - tp) * 16}px)` }}>
          <div style={{ ...TX.title, fontSize: 44 }}>Blender</div>
          <div style={{ ...TX.label, fontSize: 26, color: C.muted, marginTop: 8 }}>разберётся агент</div>
        </div>
      )}
    </>
  );
};

// ── page 4 (right): the first month — days, rules, the agent learning ─────────────────────────────────────────
type DayKind = "dot" | "ok" | "err" | "chat";
const CELL = 56;
const GAP = 8;

const DayCell: React.FC<{ f: number; at: number; kind: DayKind }> = ({ f, at, kind }) => {
  const on = eo(f, at, 8);
  const g = sp(f, at, "bouncy");
  const tone = kind === "ok" ? "74,222,128" : kind === "err" ? "248,113,113" : "255,179,0";
  return (
    <div
      style={{
        width: CELL,
        height: CELL,
        boxSizing: "border-box",
        borderRadius: 14,
        background: on > 0 ? `rgba(${tone},${0.05 + 0.11 * on})` : C.surface2,
        border: `2px solid ${on > 0 ? `rgba(${tone},${0.22 + 0.4 * on})` : "rgba(243,239,230,0.08)"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {g > 0.01 &&
        (kind === "dot" ? (
          <div style={{ width: 14, height: 14, borderRadius: 7, background: C.accent, transform: `scale(${g})` }} />
        ) : (
          <div style={{ transform: `scale(${g})` }}>
            <Icon name={kind === "ok" ? "check" : kind === "err" ? "cross" : "chat"} size={32} color={kind === "ok" ? C.ok : kind === "err" ? C.err : C.accent} sw={4.4} />
          </div>
        ))}
    </div>
  );
};

const ChatBadge: React.FC<{ f: number; start: number; size?: number }> = ({ f, start, size = 52 }) => {
  if (f < start) return null;
  const p = sp(f, start, "bouncy");
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${p})` }}>
      <Icon name="chat" size={size * 0.56} color={C.bg} sw={4.2} />
    </div>
  );
};

const RULE_X = 524;
const RULE_W = 582;
const RULE_Y = 80;
const RULE_H = 88;
const RULE_STEP = 100;

const CalendarSide: React.FC<{
  f: number;
  bMonth: number;
  wYes: number;
  wNo: number;
  wPlain: number;
  wRead: number;
  wSkill: number;
  wThrough: number;
}> = ({ f, bMonth, wYes, wNo, wPlain, wRead, wSkill, wThrough }) => {
  const d0 = bMonth + 14;
  const step = (wThrough + 8 - d0) / 29;
  const dayAt = (i: number) => Math.round(d0 + i * step);
  const kindOf = (i: number): DayKind => {
    const at = dayAt(i);
    if (at < wYes) return "dot";
    const learn = i / 29; // later days: fewer «нет», fewer re-explanations — the agent learns
    const r = hash(i * 3.7 + 1.3);
    const pErr = at >= wNo ? 0.42 * (1 - learn) : 0;
    const pChat = at >= wPlain ? 0.3 * (1 - 0.8 * learn) : 0;
    if (r < pErr) return "err";
    if (r < pErr + pChat) return "chat";
    return "ok";
  };
  const rules: { at: number; badge: React.ReactNode; main: string; sub?: string; size: number }[] = [
    { at: wYes, badge: <CheckBadge f={f} start={wYes + 2} size={52} ring={false} />, main: "«да»", sub: "— делай так", size: 34 },
    { at: wNo, badge: <CrossBadge f={f} start={wNo + 2} size={52} />, main: "«нет»", sub: "— так не надо", size: 34 },
    { at: wPlain, badge: <ChatBadge f={f} start={wPlain + 2} size={52} />, main: "«объясни по-человечески»", size: 30 },
  ];
  const sp0 = sp(f, bMonth + 18, "pop"); // learner strip placeholder
  const readP = eo(f, wRead, 12);
  const skills: { icon: IconName; color: string }[] = [
    { icon: "check", color: C.ok },
    { icon: "cross", color: C.err },
    { icon: "chat", color: C.accent },
  ];
  return (
    <>
      <Kicker f={f} at={bMonth + 2} icon="calendar" text="ПЕРВЫЙ МЕСЯЦ · ВЫ УЧИТЕ" color={C.accent} />
      <div style={{ position: "absolute", left: 34, top: RULE_Y, display: "grid", gridTemplateColumns: `repeat(7, ${CELL}px)`, gap: GAP }}>
        {Array.from({ length: 35 }, (_, i) => {
          const cp = sp(f, bMonth + 4 + (i % 7) + Math.floor(i / 7) * 2, "snap");
          return (
            <div key={i} style={{ opacity: Math.min(1, cp * 1.6) * (i < 30 ? 1 : 0.35), transform: `translateY(${(1 - cp) * 14}px)` }}>
              {i < 30 ? <DayCell f={f} at={dayAt(i)} kind={kindOf(i)} /> : <div style={{ width: CELL, height: CELL, boxSizing: "border-box", borderRadius: 14, border: "2px dashed rgba(243,239,230,0.1)" }} />}
            </div>
          );
        })}
      </div>
      {rules.map((r, i) => {
        const ph = sp(f, bMonth + 10 + i * 4, "snap");
        if (ph <= 0.002) return null;
        const cp = sp(f, r.at, "snap");
        const lit = eo(f, r.at, 10);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: RULE_X,
              top: RULE_Y + i * RULE_STEP,
              width: RULE_W,
              height: RULE_H,
              boxSizing: "border-box",
              borderRadius: 18,
              background: lit > 0 ? `rgba(26,30,38,${lit})` : "transparent",
              border: `2px ${lit > 0.5 ? "solid" : "dashed"} ${interpolateColors(lit, [0, 1], ["rgba(154,160,170,0.28)", "rgba(243,239,230,0.12)"])}`,
              opacity: Math.min(1, ph * 1.6),
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "0 24px",
            }}
          >
            <div style={{ width: 52, height: 52, flex: "none" }}>{r.badge}</div>
            {cp > 0.002 && (
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, opacity: Math.min(1, cp * 1.6), transform: `translateX(${(1 - cp) * 24}px)`, whiteSpace: "nowrap" }}>
                <span style={{ ...TX.title, fontSize: r.size }}>{r.main}</span>
                {r.sub && <span style={{ ...TX.label, fontSize: 26, color: C.muted }}>{r.sub}</span>}
              </div>
            )}
          </div>
        );
      })}
      {/* the rules fly into the agent on «считывает» */}
      {[0, 1, 2].map((i) => {
        const st = wRead + i * 5;
        const t = (f - st) / 16;
        if (t <= 0 || t >= 1) return null;
        const e = eio(f, st, 16);
        const ax = RULE_X + 24 + 26;
        const ay = RULE_Y + i * RULE_STEP + RULE_H / 2;
        const bx = 34 + 20 + 38;
        const by = 420 + 58;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: mix(ax, bx, e) - 9,
              top: mix(ay, by, e) - 9 - 90 * Math.sin(Math.PI * e),
              width: 18,
              height: 18,
              borderRadius: 9,
              background: skills[i].color,
              boxShadow: `0 0 16px ${skills[i].color}`,
            }}
          />
        );
      })}
      {sp0 > 0.002 && (
        <div
          style={{
            position: "absolute",
            left: 34,
            top: 420,
            width: 1072,
            height: 116,
            boxSizing: "border-box",
            borderRadius: 20,
            background: C.surface2,
            border: `2px solid ${interpolateColors(readP, [0, 1], ["rgba(243,239,230,0.08)", "rgba(255,179,0,0.55)"])}`,
            display: "flex",
            alignItems: "center",
            gap: 22,
            padding: "0 20px",
            opacity: Math.min(1, sp0 * 1.6),
            transform: `translateY(${(1 - sp0) * 24}px)`,
          }}
        >
          <IconTile icon="brain" size={76} color={readP > 0.5 ? C.accent : C.muted} bg={readP > 0.5 ? "rgba(255,179,0,0.16)" : "rgba(154,160,170,0.12)"} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TX.title, fontSize: 32, whiteSpace: "nowrap" }}>
              Агент учится {f < wRead && <Dots f={f} size={10} />}
            </div>
            <div style={{ ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap", opacity: readP, marginTop: 4 }}>считывает и ставит себе навыки</div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            {skills.map((s, i) => {
              const k = sp(f, wSkill + i * 5, "bouncy");
              const on = eo(f, wSkill + i * 5, 8);
              return (
                <div
                  key={i}
                  style={{
                    width: 60,
                    height: 60,
                    boxSizing: "border-box",
                    borderRadius: 16,
                    border: `2px ${on > 0.5 ? "solid" : "dashed"} ${on > 0.5 ? "rgba(255,179,0,0.75)" : "rgba(154,160,170,0.3)"}`,
                    background: on > 0 ? `rgba(255,179,0,${0.12 * on})` : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {k > 0.01 && (
                    <div style={{ transform: `scale(${k})` }}>
                      <Icon name={s.icon} size={34} color={s.color} sw={4.4} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
};

// ── page 5 (left): исполнитель → партнёр → «Джарвис» ──────────────────────────────────────────────────────────
const ChainArrow: React.FC<{ f: number; at: number; y: number }> = ({ f, at, y }) => {
  const p = sp(f, at, "snap");
  if (p <= 0.002) return null;
  return (
    <div style={{ position: "absolute", left: LW / 2 - 24, top: y, opacity: Math.min(1, p * 1.6), transform: `translateY(${(1 - p) * -12}px) rotate(90deg)` }}>
      <Icon name="arrow" size={48} color={C.accent} sw={4.2} />
    </div>
  );
};

const ChainSide: React.FC<{ f: number; start: number; wExec: number; bPartner: number; wYour: number }> = ({ f, start, wExec, bPartner, wYour }) => {
  const e = sp(f, wExec, "snap");
  const strike = eo(f, wExec + 10, 10);
  const pp = sp(f, bPartner, "pop");
  const pg = glowWin(f, bPartner, bPartner + 20, 0.35);
  const jp = sp(f, wYour, "stamp");
  return (
    <>
      <Kicker f={f} at={start} icon="clock" text="МЕСЯЦ-ПОЛТОРА" color={C.accent} />
      {e > 0.002 && (
        <div
          style={{
            position: "absolute",
            left: 34,
            top: 92,
            width: 392,
            height: 84,
            boxSizing: "border-box",
            borderRadius: 20,
            background: C.surface2,
            border: "2px solid rgba(243,239,230,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: Math.min(1, e * 1.6),
            transform: `translateY(${(1 - e) * 20}px)`,
          }}
        >
          <span style={{ position: "relative", ...TX.label, fontSize: 34, color: C.muted, whiteSpace: "nowrap" }}>
            исполнитель
            <span
              style={{
                position: "absolute",
                left: -6,
                right: -6,
                top: "54%",
                height: 4,
                borderRadius: 2,
                background: C.muted,
                transformOrigin: "0 50%",
                transform: `scaleX(${strike})`,
              }}
            />
          </span>
        </div>
      )}
      <ChainArrow f={f} at={bPartner - 4} y={192} />
      {pp > 0.002 && (
        <div
          style={{
            position: "absolute",
            left: 34,
            top: 252,
            width: 392,
            height: 84,
            boxSizing: "border-box",
            borderRadius: 20,
            background: C.raised,
            border: `2px solid ${C.accent}`,
            boxShadow: `0 0 ${20 + 30 * pg}px rgba(255,179,0,${0.18 + 0.25 * pg})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            opacity: Math.min(1, pp * 1.6),
            transform: `translateY(${(1 - pp) * 24}px)`,
          }}
        >
          <Icon name="team" size={40} color={C.accent} sw={3.6} />
          <span style={{ ...TX.title, fontSize: 38, whiteSpace: "nowrap" }}>партнёр</span>
        </div>
      )}
      <ChainArrow f={f} at={wYour - 4} y={352} />
      {jp > 0.002 && (
        <div style={{ position: "absolute", left: 34, top: 412, width: 392, height: 120 }}>
          <Burst f={f} start={wYour + 3} r0={110} r1={190} n={10} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 24,
              background: C.accent,
              boxShadow: "0 0 50px rgba(255,179,0,0.35), 0 24px 50px rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              opacity: Math.min(1, (f - wYour) / 3),
              transform: `translateY(${(1 - Math.min(1, jp)) * -30}px)`,
            }}
          >
            <Icon name="crown" size={52} color={C.bg} sw={4} />
            <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 46, color: C.bg, whiteSpace: "nowrap" }}>«Джарвис»</span>
          </div>
        </div>
      )}
    </>
  );
};

// ── scene ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const Control: React.FC<SceneProps> = ({ f, b, t0, w }) => {
  const [bTrap, bTool, bBlender, bMonth, bPartner] = b;
  const wCtl = w("контролировать");
  const wHow = w("как"); // «как человека»
  const wFail = w("получится");
  const wRight = w("правильно");
  const wSo = w("так");
  const wSolve = w("реши");
  const wA = w("а", 678.3);
  const wFind = w("найди");
  const wSelf = w("сам");
  const wWhy = w("зачем");
  const wYes = w("да", 684);
  const wNo = w("нет", 684);
  const wPlain = w("объясни");
  const wRead = w("считывает");
  const wSkill = w("навыки");
  const wThrough = w("через", 690);
  const wExit = w("выходе");
  const wExec = w("исполнитель");
  const wYour = w("ваш");

  // layout moves
  const NARROW = wRight + 4; // the wide trap card shrinks into the left column
  const RIN = NARROW + 18; // then the right card comes in
  const FA = wWhy + 6; // flip: trap → cube (cube is up by «Blender?»)
  const FB = wExit; // flip: cube → chain (before «исполнитель»)

  // left card: width + flips
  const tw = mix(ZW, LW, eio(f, NARROW, 18));
  const pL = sp(f, t0 + 8, "pop");
  let side = 0;
  let deg = 0;
  if (f >= FB) {
    const k = flip(f, FB);
    side = k.side ? 2 : 1;
    deg = k.deg;
  } else if (f >= FA) {
    const k = flip(f, FA);
    side = k.side;
    deg = k.deg;
  }
  const glowL = side === 2 ? glowWin(f, bPartner, bPartner + 24, 0) : 0;

  // right card: flow → calendar
  const pR = sp(f, RIN, "pop");
  const aFlow = safeExitAlpha(f, bMonth);
  const aCal = eo(f, bMonth + 5, 12);
  const glowR = glowWin(f, wThrough, wThrough + 24, 0);

  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080 }}>
      <Header f={f} t0={t0} lit={[bTool, wSkill, bPartner]} />

      <Pop x={ZX} y={TOP} w={tw} h={CH} p={pL} from="below">
        <div style={{ width: tw, height: CH, transform: `perspective(1800px) rotateY(${deg}deg)` }}>
          <Frame w={tw} h={CH} kind="plain" glow={glowL}>
            {side === 0 && <TrapSide f={f} t0={t0} bTrap={bTrap} wCtl={wCtl} wHow={wHow} wFail={wFail} wRight={wRight} />}
            {side === 1 && <CubeSide f={f} start={FA + 8} bBlender={bBlender} />}
            {side === 2 && <ChainSide f={f} start={FB + 8} wExec={wExec} bPartner={bPartner} wYour={wYour} />}
          </Frame>
        </div>
      </Pop>

      <Pop x={RX} y={TOP} w={RW} h={CH} p={pR} from="right" d={60}>
        <Frame w={RW} h={CH} kind="plain" glow={glowR}>
          {aFlow > 0.002 && (
            <div style={{ position: "absolute", inset: 0, opacity: aFlow, transform: `translateY(${-24 * (1 - aFlow)}px)` }}>
              <FlowSide f={f} rin={RIN} wSo={wSo} bTool={bTool} wSolve={wSolve} wA={wA} wFind={wFind} wSelf={wSelf} />
            </div>
          )}
          {aCal > 0.002 && (
            <div style={{ position: "absolute", inset: 0, opacity: aCal, transform: `translateY(${24 * (1 - aCal)}px)` }}>
              <CalendarSide f={f} bMonth={bMonth} wYes={wYes} wNo={wNo} wPlain={wPlain} wRead={wRead} wSkill={wSkill} wThrough={wThrough} />
            </div>
          )}
        </Frame>
      </Pop>
    </div>
  );
};
