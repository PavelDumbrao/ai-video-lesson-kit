import React from "react";
import { interpolate, interpolateColors } from "remotion";
import { C, CL, MONO, pad2 } from "../../../theme";
import { blink, bump, clamp01, eio, eo, float, hash, lin, mix, sp, typeDone } from "../../anim";
import { Icon, IconName } from "../../icons";
import { TypeText } from "../../text";
import { SceneProps } from "../../types";
import { CheckBadge, Chip, Dots, Frame, glowWin, Pop, Ripple, shadow, TX } from "../../ui";
import { ArrowPath, CrossBadge, IconTile, Overlay } from "../kit";

// Сцена 0 урока 1 «Это видео сделал агент» (тип l1_hook). Всё — чистые функции кадра.
// Лицо: во весь экран до 6,40 с, затем угол СПРАВА 6,40–9,08 (x 1220–1920 / y 280–850 свободны с первого
// кадра окна) — поэтому обложка живёт только левее x 1180. Дальше три «страницы»:
// 1) факты + агент + «этот ролик», 2) слои + рендер + стоимость, 3) промпт + «за ручку» → две плашки.

const ZX = 140; // левый край зоны сцены
const ZW = 1640; // ширина зоны сцены
const YC = 250; // верх контента
const HC = 570; // высота контента (→ y 820)

/** 1 while the element lives; it leaves smoothly over `dur` frames from its next beat (no next beat → stays). */
const safeExitAlpha = (f: number, bNext?: number, dur = 10) =>
  bNext === undefined || !Number.isFinite(bNext) ? 1 : 1 - eo(f, bNext, dur);

/** A group of elements that leaves together (slides by dx/dy and fades) from its next beat `out`. */
const Page: React.FC<{ f: number; out?: number; dx?: number; dy?: number; children?: React.ReactNode }> = ({
  f,
  out,
  dx = -110,
  dy = 0,
  children,
}) => {
  const a = safeExitAlpha(f, out, 12);
  if (a <= 0.002) return null;
  const q = 1 - a;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        opacity: a,
        transform: q > 0 ? `translate(${dx * q}px, ${dy * q}px)` : undefined,
      }}
    >
      {children}
    </div>
  );
};

/** Idle float (translation only) so held cards never look frozen. */
const Fl: React.FC<{ f: number; seed: number; amp?: number; children?: React.ReactNode }> = ({ f, seed, amp = 3, children }) => (
  <div style={{ transform: `translateY(${float(f, seed, amp, 130)}px)` }}>{children}</div>
);

/** Content swap inside a card: comes up at `a`, leaves upward at `z`. */
const Swap: React.FC<{ f: number; a: number; z?: number; children?: React.ReactNode }> = ({ f, a, z = Infinity, children }) => {
  const i = eo(f, a, 12);
  const o = Number.isFinite(z) ? eo(f, z, 6) : 0;
  if (i <= 0.002 || o >= 0.998) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: i * (1 - o),
        transform: `translateY(${(1 - i) * 30 - o * 30}px)`,
      }}
    >
      {children}
    </div>
  );
};

// ── Фон: тёплое пятно, плывёт медленнее контента (параллакс) ─────────────────────────────────
const Backdrop: React.FC<{ f: number; b0: number; cam: number }> = ({ f, b0, cam }) => {
  const a = eo(f, b0 - 4, 24);
  const cx = 560 - 80 * cam;
  const cy = 480 + float(f, 2, 14, 260);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        opacity: a,
        background: `radial-gradient(circle at ${cx}px ${cy}px, rgba(255,179,0,0.09) 0px, rgba(255,179,0,0.035) 320px, rgba(255,179,0,0) 620px)`,
      }}
    />
  );
};

// ── Обложка → шапка ─────────────────────────────────────────────────────────────────────────
const T1A = "КАК";
const T1B = "СДЕЛАНО";
const T1 = `${T1A} ${T1B}`;
const T2 = "ЭТО ВИДЕО";
const KICK = "PROAI COMMUNITY · ИИ-ВИДЕО";
const HERO = 112; // размер титула на обложке
const HEAD = 38; // размер заголовка сцены (шапка)
const K = HEAD / HERO;
const BP = 24; // поля плашки «ЭТО ВИДЕО» на обложке (в шапке ≈ 9 px)
const HX = 196; // левый край текста обложки
const HKY = 222; // кикер обложки
const HY1 = 272; // строка 1 обложки
const HY2 = 402; // строка 2 обложки (плашка)
const HDY = 130; // кикер шапки
const HDT = 167; // заголовок шапки (кикер 30 + 7)
const GAP = 12; // зазор «КАК СДЕЛАНО» → плашка в шапке
const VF = { x: 150, y: 150, w: 1030, h: 660 }; // видоискатель обложки (правее x 1180 — угол с лицом)

const KickerRow: React.FC<{ bar: number; p: number }> = ({ bar, p }) => (
  <div style={{ display: "flex", alignItems: "center", height: 30 }}>
    <div style={{ width: 48 * bar, height: 4, borderRadius: 2, background: C.accent, marginRight: 14 * bar, flex: "none" }} />
    <div
      style={{
        ...TX.kicker,
        color: C.accent,
        lineHeight: "30px",
        whiteSpace: "nowrap",
        opacity: p,
        transform: `translateX(${(1 - p) * -18}px)`,
      }}
    >
      {KICK}
    </div>
  </div>
);

/** «ЭТО ВИДЕО» on an accent band that wipes in from the left (r 0→1), with one glint pass. */
const BandText: React.FC<{ size: number; pad: number; r: number; glint?: number }> = ({ size, pad, r, glint = -1 }) => (
  <div style={{ position: "relative", padding: `0 ${pad}px`, height: size * 1.1, overflow: "hidden", borderRadius: size * 0.2, flex: "none" }}>
    <div style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, background: C.accent, transformOrigin: "0 50%", transform: `scaleX(${r})` }} />
    {glint > 0 && glint < 1 && (
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${mix(-30, 120, glint)}%`,
          width: "22%",
          background: "linear-gradient(100deg, rgba(243,239,230,0) 0%, rgba(243,239,230,0.5) 50%, rgba(243,239,230,0) 100%)",
        }}
      />
    )}
    <div
      style={{
        position: "relative",
        ...TX.title,
        fontSize: size,
        lineHeight: 1.1,
        color: C.bg,
        whiteSpace: "nowrap",
        clipPath: `inset(0 ${(1 - r) * 100}% 0 0)`,
      }}
    >
      {T2}
    </div>
  </div>
);

const tcode = (f: number) => {
  const fr = Math.max(0, f - 15);
  const s = Math.floor(fr / 30);
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}:${pad2(fr % 30)}`;
};

const Viewfinder: React.FC<{ o: number; off: number }> = ({ o, off }) => {
  if (o <= 0.002) return null;
  const L = 60;
  const { x, y, w, h } = VF;
  const cs: [number, number, number, number][] = [
    [x - off, y - off, 1, 1],
    [x + w + off, y - off, -1, 1],
    [x - off, y + h + off, 1, -1],
    [x + w + off, y + h + off, -1, -1],
  ];
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, opacity: o, overflow: "visible" }}>
      {cs.map(([cx, cy, sx, sy], i) => (
        <path
          key={i}
          d={`M${cx} ${cy + sy * L} L${cx} ${cy} L${cx + sx * L} ${cy}`}
          fill="none"
          stroke={C.accent}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
};

/** Beat 0: the cover on the left (the right corner is the face). At beat 1 «КАК СДЕЛАНО» flies into the header,
 * the band fades on the spot and wipes in again next to it (no line ever crosses another). */
const Cover: React.FC<{ f: number; b0: number; b1: number }> = ({ f, b0, b1 }) => {
  if (f < b0 - 4 || f > b1 + 24) return null;
  const m = eio(f, b1, 14); // полёт титула в шапку
  const fo = 1 - clamp01((f - b1 - 14) / 6); // летящий титул передаёт эстафету настоящей шапке
  const out = 1 - eo(f, b1, 10); // видоискатель, подзаголовок, таймкод уходят
  const fl = (x0: number, y0: number, x1: number, y1: number, k: number): React.CSSProperties => ({
    position: "absolute",
    left: x0,
    top: y0,
    transformOrigin: "0 0",
    transform: `translate(${(x1 - x0) * m}px, ${(y1 - y0) * m}px) scale(${mix(1, k, m)})`,
  });
  const kb = eo(f, b0 - 2, 12);
  const kp = eo(f, b0 + 2, 14);
  const r1 = [eo(f, b0, 16), eo(f, b0 + 4, 16)];
  const rb = eo(f, b0 + 9, 14);
  const gl = lin(f, b0 + 30, 22);
  const vf = eo(f, b0 - 2, 18);
  const ps = sp(f, b0 + 14, "pop");
  const tc = eo(f, b0 + 20, 12);
  return (
    <>
      <Viewfinder o={vf * out} off={(1 - vf) * 30} />
      <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, opacity: fo }}>
        <div style={fl(HX, HKY, ZX, HDY, 1)}>
          <KickerRow bar={kb} p={kp} />
        </div>
        <div style={fl(HX, HY1, ZX, HDT, K)}>
          <div style={{ display: "flex", gap: HERO * 0.26 }}>
            {[T1A, T1B].map((t, i) => (
              <div key={t} style={{ overflow: "hidden", padding: "0.12em 0.06em 0.16em", margin: "-0.12em -0.06em -0.16em", fontSize: HERO }}>
                <div style={{ ...TX.title, fontSize: HERO, lineHeight: 1.08, whiteSpace: "nowrap", transform: `translateY(${(1 - r1[i]) * 125}%)` }}>{t}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: "absolute", left: HX - BP, top: HY2, opacity: 1 - eo(f, b1, 8), transform: `translateX(${-40 * eo(f, b1, 8)}px)` }}>
          <BandText size={HERO} pad={BP} r={rb} glint={gl} />
        </div>
      </div>
      {ps > 0.002 && (
        <div
          style={{
            position: "absolute",
            left: HX,
            top: 566,
            display: "flex",
            alignItems: "center",
            gap: 24,
            opacity: Math.min(1, ps * 1.6) * out,
            transform: `translate(${(1 - ps) * -50}px, ${(1 - out) * -24}px)`,
          }}
        >
          <IconTile icon="zap" size={84} />
          <div style={{ ...TX.title, fontSize: 52, whiteSpace: "nowrap" }}>ИИ-студия за час</div>
        </div>
      )}
      {tc > 0.002 && (
        <div style={{ position: "absolute", left: HX, top: 740, display: "flex", alignItems: "center", gap: 14, opacity: tc * out }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: C.accent, opacity: 0.35 + 0.65 * blink(f, 40) }} />
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 24, color: C.muted, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>TC {tcode(f)}</div>
        </div>
      )}
    </>
  );
};

/** The scene header (flex row: title block left, chips right, aligned to the top). */
const Header: React.FC<{ f: number; b1: number; tUrok: number }> = ({ f, b1, tUrok }) => {
  if (f < b1 + 6) return null;
  const ho = clamp01((f - b1 - 12) / 6);
  const c1 = sp(f, b1 + 8, "snap");
  const c2 = sp(f, Math.max(tUrok, b1 + 16), "snap");
  return (
    <div
      style={{
        position: "absolute",
        left: ZX,
        top: HDY,
        width: ZW,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
      }}
    >
      <div style={{ opacity: ho }}>
        <KickerRow bar={1} p={1} />
        <div style={{ display: "flex", alignItems: "center", gap: GAP, marginTop: HDT - HDY - 30 }}>
          <div style={{ ...TX.title, fontSize: HEAD, lineHeight: 1.08, whiteSpace: "nowrap" }}>{T1}</div>
          <BandText size={HEAD} pad={BP * K} r={eo(f, b1 + 12, 12)} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        {c2 > 0.002 && (
          <div style={{ opacity: Math.min(1, c2 * 1.6), transform: `translateY(${(1 - c2) * -16}px)` }}>
            <Chip text="урок об уроке" icon="video" tone="surface" size={26} />
          </div>
        )}
        {c1 > 0.002 && (
          <div style={{ opacity: Math.min(1, c1 * 1.6), transform: `translateY(${(1 - c1) * -16}px)` }}>
            <Chip text="ИИ-студия за час" icon="zap" tone="outline" size={26} />
          </div>
        )}
      </div>
    </div>
  );
};

// ── Страница 1: три факта, агент в центре, «этот ролик» справа ────────────────────────────────
const FACTS: { icon: IconName; name: string; tag: string; sub: string }[] = [
  { icon: "mic", name: "Голос", tag: "клон", sub: "без микрофона" },
  { icon: "user", name: "Лицо", tag: "модель", sub: "без камеры" },
  { icon: "code", name: "Графика", tag: "код", sub: "без рисования" },
];
const FW = 520;
const FH = 160;
const FY = [250, 455, 660];
const HUB = { x: 930, y: 500, r: 96 };
const PL = { x: 1180, y: YC, w: 600, h: HC };

const FactCard: React.FC<{ f: number; at: number; i: number }> = ({ f, at, i }) => {
  const p = sp(f, at, "pop");
  const fc = FACTS[i];
  return (
    <Pop x={ZX} y={FY[i]} w={FW} h={FH} p={p} from="left" d={70}>
      <Frame w={FW} h={FH} kind="plain">
        <div style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, padding: "26px 34px", display: "flex", alignItems: "center", gap: 24 }}>
          <IconTile icon={fc.icon} size={88} />
          <div>
            <div style={{ ...TX.title, fontSize: 36, whiteSpace: "nowrap" }}>
              {fc.name} <span style={{ color: C.accent }}>— {fc.tag}</span>
            </div>
            <div style={{ ...TX.label, fontSize: 26, color: C.muted, marginTop: 8, whiteSpace: "nowrap" }}>{fc.sub}</div>
          </div>
        </div>
      </Frame>
    </Pop>
  );
};

const Threads: React.FC<{ f: number; at: number }> = ({ f, at }) => {
  if (f < at) return null;
  const x1 = HUB.x - HUB.r - 22;
  const x2 = ZX + FW + 6;
  return (
    <Overlay>
      {FY.map((fy, i) => {
        const y2 = fy + FH / 2;
        const d = `M${x1} ${HUB.y} C${x1 - 70} ${HUB.y}, ${x2 + 70} ${y2}, ${x2} ${y2}`;
        const p = eo(f, at + 4 + i * 4, 16);
        if (p <= 0.001) return null;
        const flow = eo(f, at + 20 + i * 4, 10);
        return (
          <g key={i}>
            <path d={d} fill="none" stroke={C.accent} strokeOpacity={0.55} strokeWidth={3} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} />
            {flow > 0 && (
              <path
                d={d}
                fill="none"
                stroke={C.accent}
                strokeWidth={6}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="0.05 0.28"
                strokeDashoffset={-((f - at) * 0.011 + i * 0.1)}
                opacity={flow}
              />
            )}
            <circle cx={x2} cy={y2} r={7 * clamp01((p - 0.85) * 7)} fill={C.accent} />
          </g>
        );
      })}
      <ArrowPath x1={HUB.x + HUB.r + 24} y1={HUB.y} x2={PL.x - 14} y2={HUB.y} p={eo(f, at + 12, 14)} width={4} />
    </Overlay>
  );
};

const Hub: React.FC<{ f: number; at: number; tPoka: number }> = ({ f, at, tPoka }) => {
  const p = sp(f, at, "bouncy");
  if (p <= 0.002) return null;
  const { x, y, r } = HUB;
  const R = r + 22;
  const k = eo(f, at + 6, 12);
  const cap = eo(f, at + 10, 14);
  const ch = sp(f, Math.max(tPoka, at + 16), "snap");
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: x - 200,
          top: 326,
          width: 400,
          textAlign: "center",
          ...TX.kicker,
          color: C.accent,
          opacity: k,
          transform: `translateY(${(1 - k) * 12}px)`,
        }}
      >
        ИИ-агент
      </div>
      <div style={{ position: "absolute", left: x - R, top: y - R, width: 2 * R, height: 2 * R }}>
        <Ripple f={f} start={at + 2} size={2 * r} grow={0.9} />
        <svg
          width={2 * R}
          height={2 * R}
          style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: k, transform: `rotate(${(f - at) * 0.7}deg)` }}
        >
          <circle cx={R} cy={R} r={R - 3} fill="none" stroke={C.accent} strokeWidth={3} strokeDasharray="10 14" strokeOpacity={0.7} />
        </svg>
        <div
          style={{
            position: "absolute",
            left: R - r,
            top: R - r,
            width: 2 * r,
            height: 2 * r,
            borderRadius: "50%",
            background: `radial-gradient(circle at 35% 30%, ${C.raised}, ${C.surface2})`,
            border: `3px solid ${C.accent}`,
            boxShadow: shadow(0.6),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `scale(${p})`,
          }}
        >
          <Icon name="bot" size={112} color={C.accent} sw={3.2} />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: x - 250,
          top: 640,
          width: 500,
          textAlign: "center",
          ...TX.title,
          fontSize: 36,
          opacity: cap,
          transform: `translateY(${(1 - cap) * 18}px)`,
        }}
      >
        Собрал агент
      </div>
      {ch > 0.002 && (
        <div
          style={{
            position: "absolute",
            left: x - 250,
            top: 706,
            width: 500,
            display: "flex",
            justifyContent: "center",
            opacity: Math.min(1, ch * 1.6),
            transform: `translateY(${(1 - ch) * 14}px)`,
          }}
        >
          <Chip text="а я — другими делами" tone="muted" size={24} />
        </div>
      )}
    </>
  );
};

const TRACKS = ["голос", "лицо", "графика"];
const FACE_SEG = [
  [0, 0.34],
  [0.5, 0.68],
  [0.86, 1],
];
const GFX_SEG = [
  [0, 0.12],
  [0.14, 0.3],
  [0.33, 0.41],
  [0.44, 0.63],
  [0.66, 0.74],
  [0.77, 0.95],
  [0.97, 1],
];

const Player: React.FC<{ f: number; at: number }> = ({ f, at }) => {
  const p = sp(f, at, "heavy");
  if (p <= 0.002) return null;
  const { x, y, w, h } = PL;
  const ph = (Math.max(0, f - at) * 0.0042) % 1;
  const TL = 156; // левый край дорожек
  const TW = 410; // ширина дорожек
  const head = eo(f, at + 36, 10);
  const ring = ((f - at) % 48) / 48;
  return (
    <Pop x={x} y={y} w={w} h={h} p={p} from="right" d={90}>
      <Fl f={f} seed={7}>
        <Frame w={w} h={h} kind="plain">
          <div style={{ position: "absolute", left: 34, top: 24, display: "flex", alignItems: "center", gap: 14 }}>
            <Icon name="video" size={38} color={C.accent} sw={3.6} />
            <div style={{ ...TX.title, fontSize: 32, whiteSpace: "nowrap" }}>Этот ролик</div>
          </div>
          <div
            style={{
              position: "absolute",
              left: 34,
              top: 82,
              width: 532,
              height: 299,
              borderRadius: 14,
              background: `linear-gradient(135deg, ${C.surface2}, ${C.bg})`,
              border: `1px solid ${C.line}`,
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", left: 26, top: 28, width: 210, height: 18, borderRadius: 9, background: C.raised }} />
            <div style={{ position: "absolute", left: 26, top: 58, width: 150, height: 12, borderRadius: 6, background: C.raised, opacity: 0.7 }} />
            <div style={{ position: "absolute", left: 26, top: 84, width: 92, height: 12, borderRadius: 6, background: C.accent, opacity: 0.6 }} />
            <div
              style={{
                position: "absolute",
                right: 22,
                bottom: 32,
                width: 92,
                height: 92,
                borderRadius: 46,
                background: C.raised,
                border: "2px solid rgba(255,179,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="user" size={56} color={C.muted} sw={3.2} />
            </div>
            <div style={{ position: "absolute", left: 266 - 46, top: 146 - 46, width: 92, height: 92 }}>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: 92,
                  height: 92,
                  borderRadius: 46,
                  border: `3px solid ${C.accent}`,
                  opacity: 0.6 * (1 - ring),
                  transform: `scale(${1 + 0.55 * ring})`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: 92,
                  height: 92,
                  borderRadius: 46,
                  background: C.accent,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="play" size={44} color={C.bg} style={{ marginLeft: 6 }} />
              </div>
            </div>
            <div style={{ position: "absolute", left: 22, right: 22, bottom: 14, height: 6, borderRadius: 3, background: "rgba(243,239,230,0.12)" }}>
              <div style={{ width: `${ph * 100}%`, height: 6, borderRadius: 3, background: C.accent }} />
            </div>
          </div>
          {TRACKS.map((t, i) => {
            const tr = eo(f, at + 14 + i * 7, 16);
            const top = 404 + i * 52;
            return (
              <React.Fragment key={t}>
                <div style={{ position: "absolute", left: 34, top, height: 30, ...TX.label, fontSize: 24, lineHeight: "30px", color: C.muted, opacity: tr }}>{t}</div>
                <div
                  style={{
                    position: "absolute",
                    left: TL,
                    top,
                    width: TW,
                    height: 30,
                    borderRadius: 8,
                    background: C.surface2,
                    overflow: "hidden",
                    clipPath: `inset(0 ${(1 - tr) * 100}% 0 0)`,
                  }}
                >
                  {i === 0 &&
                    Array.from({ length: 41 }, (_, j) => {
                      const hh = (0.25 + 0.75 * hash(j * 3.1)) * 22 * (0.72 + 0.28 * Math.sin(f * 0.22 + j));
                      return (
                        <div key={j} style={{ position: "absolute", left: 4 + j * 10, top: 15 - hh / 2, width: 5, height: hh, borderRadius: 3, background: C.accent }} />
                      );
                    })}
                  {i === 1 &&
                    FACE_SEG.map(([a, z], j) => (
                      <div key={j} style={{ position: "absolute", left: a * TW + 2, top: 4, width: (z - a) * TW - 4, height: 22, borderRadius: 6, background: "rgba(243,239,230,0.32)" }} />
                    ))}
                  {i === 2 &&
                    GFX_SEG.map(([a, z], j) => (
                      <div
                        key={j}
                        style={{
                          position: "absolute",
                          left: a * TW + 2,
                          top: 4,
                          width: (z - a) * TW - 4,
                          height: 22,
                          borderRadius: 6,
                          background: `rgba(255,179,0,${j % 2 ? 0.32 : 0.6})`,
                        }}
                      />
                    ))}
                </div>
              </React.Fragment>
            );
          })}
          {head > 0 && (
            <div style={{ position: "absolute", left: TL + TW * ph - 1.5, top: 394, width: 3, height: 150, borderRadius: 2, background: C.accent, opacity: head }} />
          )}
        </Frame>
      </Fl>
    </Pop>
  );
};

// ── Страница 2: стек слоёв + карточка-фокус (слой → таймер рендера) + чек ────────────────────────
const LAYERS: { n: string; name: string; sub: string; icon: IconName }[] = [
  { n: "01", name: "Сценарий", sub: "пишет агент", icon: "doc" },
  { n: "02", name: "Голос", sub: "клон голоса", icon: "mic" },
  { n: "03", name: "Лицо", sub: "видеомодель", icon: "user" },
  { n: "04", name: "Графика", sub: "код, Remotion", icon: "code" },
  { n: "05", name: "Рендер", sub: "в облаке", icon: "cloud" },
];
const SW = 740; // ширина слоя
const SFH = 86; // высота лицевой грани
const SDEP = 14; // толщина слоя
const SSTEP = 112;
const PX = 940; // карточка-фокус
const PW = 840;

const Slab: React.FC<{ f: number; at: number; i: number; s: number; e: number }> = ({ f, at, i, s, e }) => {
  const p = sp(f, at, "heavy");
  if (p <= 0.002) return null;
  const L = LAYERS[i];
  const act = glowWin(f, s, e, 0);
  const hl = glowWin(f, s, e, 0.32);
  return (
    <div
      style={{
        position: "absolute",
        left: ZX,
        top: YC + i * SSTEP,
        width: SW,
        height: SFH + SDEP,
        opacity: Math.min(1, p * 2),
        transform: `translate(${22 * act}px, ${(1 - p) * -80}px)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: SDEP,
          width: SW,
          height: SFH,
          borderRadius: 18,
          background: `linear-gradient(rgba(255,179,0,${0.42 * hl}), rgba(255,179,0,${0.42 * hl})), #15181E`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: SW,
          height: SFH,
          boxSizing: "border-box",
          borderRadius: 18,
          padding: "0 30px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          background: `linear-gradient(90deg, rgba(255,179,0,${0.16 * act}) 0%, rgba(255,179,0,0) 75%), ${C.surface}`,
          border: `1px solid ${C.line}`,
          boxShadow: `inset 5px 0 0 rgba(255,179,0,${hl}), ${shadow(act)}`,
        }}
      >
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 24, width: 34, flex: "none", color: interpolateColors(act, [0, 1], [C.muted, C.accent]) }}>{L.n}</div>
        <IconTile icon={L.icon} size={56} color={interpolateColors(act, [0, 1], [C.accent, C.bg])} bg={`rgba(255,179,0,${0.14 + 0.86 * act})`} />
        <div style={{ ...TX.title, fontSize: 34, whiteSpace: "nowrap" }}>{L.name}</div>
        <div style={{ marginLeft: "auto", ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap" }}>{L.sub}</div>
      </div>
    </div>
  );
};

const FocusRow: React.FC<{ visual: React.ReactNode; children?: React.ReactNode }> = ({ visual, children }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 40, width: 750 }}>
    <div style={{ width: 150, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>{visual}</div>
    <div style={{ width: 560, flex: "none", position: "relative", height: 172 }}>{children}</div>
  </div>
);

const FocusText: React.FC<{ kicker: string; name: string; sub: string; size?: number }> = ({ kicker, name, sub, size = 62 }) => (
  <div style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
    <div style={{ ...TX.kicker, color: C.accent, whiteSpace: "nowrap" }}>{kicker}</div>
    <div style={{ ...TX.title, fontSize: size, marginTop: 10, whiteSpace: "nowrap" }}>{name}</div>
    <div style={{ ...TX.label, fontSize: 32, color: C.muted, marginTop: 10, whiteSpace: "nowrap" }}>{sub}</div>
  </div>
);

/** Render clock: idle tick, then a fast time-lapse spin from `fast`, progress ring fills. */
const Clock: React.FC<{ f: number; s: number; fast: number; size?: number }> = ({ f, s, fast, size = 150 }) => {
  const ang = Math.max(0, f - s) * 4 + 1080 * eio(f, fast, 40);
  const arc = eo(f, fast + 4, 40);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block", overflow: "visible" }}>
      <circle cx={50} cy={50} r={44} fill={C.surface2} stroke="rgba(243,239,230,0.18)" strokeWidth={4} />
      {arc > 0.01 && (
        <circle
          cx={50}
          cy={50}
          r={44}
          fill="none"
          stroke={C.accent}
          strokeWidth={5}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${arc} 1`}
          transform="rotate(-90 50 50)"
        />
      )}
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} x1={50} y1={13} x2={50} y2={i % 3 ? 17 : 20} stroke="rgba(243,239,230,0.45)" strokeWidth={2.5} strokeLinecap="round" transform={`rotate(${i * 30} 50 50)`} />
      ))}
      <line x1={50} y1={50} x2={50} y2={32} stroke={C.text} strokeWidth={5} strokeLinecap="round" transform={`rotate(${ang / 12} 50 50)`} />
      <line x1={50} y1={50} x2={50} y2={22} stroke={C.accent} strokeWidth={4} strokeLinecap="round" transform={`rotate(${ang} 50 50)`} />
      <circle cx={50} cy={50} r={5} fill={C.accent} />
    </svg>
  );
};

const TimerText: React.FC<{ f: number; at: number; tHours: number }> = ({ f, at, tHours }) => {
  const a1 = eo(f, at, 12);
  const ar = eo(f, at + 6, 12);
  const a2 = sp(f, at + 10, "pop");
  const st = eo(f, Math.max(tHours, at + 16), 12);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ ...TX.kicker, color: C.accent, whiteSpace: "nowrap" }}>Рендер в облаке</div>
      <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 14, height: 90 }}>
        <div style={{ position: "relative", opacity: a1, transform: `translateY(${(1 - a1) * 20}px)` }}>
          <span style={{ ...TX.title, fontSize: 60, color: C.muted, whiteSpace: "nowrap" }}>3 ч</span>
          <div
            style={{
              position: "absolute",
              left: -8,
              right: -8,
              top: "50%",
              height: 6,
              marginTop: -3,
              borderRadius: 3,
              background: C.text,
              opacity: 0.8,
              transformOrigin: "0 50%",
              transform: `scaleX(${st})`,
            }}
          />
        </div>
        <svg width={64} height={32} viewBox="0 0 64 32" style={{ overflow: "visible", flex: "none" }}>
          <path
            d="M4 16 H54 M42 5 L56 16 L42 27"
            fill="none"
            stroke={C.accent}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={1 - ar}
          />
        </svg>
        {a2 > 0.002 && (
          <span style={{ ...TX.title, fontSize: 72, color: C.accent, whiteSpace: "nowrap", opacity: Math.min(1, a2 * 1.6), transform: `translateY(${(1 - a2) * 26}px)` }}>
            3 мин
          </span>
        )}
      </div>
    </div>
  );
};

const Panel: React.FC<{ f: number; at: number; b4: number; b5: number; lw: number[]; tHours: number }> = ({ f, at, b4, b5, lw, tHours }) => {
  const p = sp(f, at, "pop");
  if (p <= 0.002) return null;
  const sh = sp(f, b5 - 4, "snap");
  const h = mix(HC, 300, sh);
  const glow = 0.5 * eo(f, b4, 12);
  return (
    <Pop x={PX} y={YC} w={PW} h={HC} p={p} from="right" d={80} origin="50% 0%">
      <Frame w={PW} h={h} kind="plain" glow={glow}>
        <Swap f={f} a={at + 2} z={lw[0]}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
            <IconTile icon="layers" size={130} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
              <span style={{ ...TX.title, fontSize: 72, color: C.accent }}>5</span>
              <span style={{ ...TX.title, fontSize: 56 }}>слоёв</span>
            </div>
            <div style={{ ...TX.label, fontSize: 30, color: C.muted, whiteSpace: "nowrap" }}>из них собран этот ролик</div>
          </div>
        </Swap>
        <Swap f={f} a={lw[0] + 3} z={lw[1]}>
          <FocusRow visual={<IconTile icon="doc" size={150} />}>
            <FocusText kicker="Слой 01" name="Сценарий" sub="пишет агент" />
          </FocusRow>
        </Swap>
        <Swap f={f} a={lw[1] + 3} z={lw[2]}>
          <FocusRow visual={<IconTile icon="mic" size={150} />}>
            <FocusText kicker="Слой 02" name="Голос" sub="клон голоса" />
          </FocusRow>
        </Swap>
        <Swap f={f} a={lw[2] + 3} z={lw[4]}>
          <FocusRow
            visual={
              <>
                <IconTile icon="user" size={110} />
                <IconTile icon="code" size={110} />
              </>
            }
          >
            <FocusText kicker="Слои 03 · 04" name="Лицо и графика" sub="видеомодель + код" size={54} />
          </FocusRow>
        </Swap>
        <Swap f={f} a={lw[4] + 3}>
          <FocusRow visual={<Clock f={f} s={lw[4]} fast={b4} />}>
            <Swap f={f} a={lw[4] + 3} z={b4}>
              <FocusText kicker="Слой 05" name="Рендер" sub="в облаке" />
            </Swap>
            {f >= b4 + 3 && <TimerText f={f} at={b4 + 3} tHours={tHours} />}
          </FocusRow>
        </Swap>
      </Frame>
    </Pop>
  );
};

const ZIG = (() => {
  const pts = ["0px 0px", "132px 0px", "132px 162px"];
  for (let j = 1; j <= 16; j++) pts.push(`${132 - j * 8.25}px ${j % 2 ? 172 : 162}px`);
  return pts.join(", ");
})();

const Receipt: React.FC<{ f: number; pr: number }> = ({ f, pr }) => (
  <div style={{ position: "absolute", left: 44, top: 24, width: 160, height: 192 }}>
    <div style={{ position: "absolute", left: 14, top: 8, width: 132, height: 184, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 132,
          height: 172,
          background: C.text,
          clipPath: `polygon(${ZIG})`,
          transform: `translateY(${(pr - 1) * 172}px)`,
        }}
      >
        {[96, 72, 100, 60].map((bw, i) => (
          <div key={i} style={{ position: "absolute", left: 16, top: 22 + i * 22, width: bw, height: 9, borderRadius: 5, background: "rgba(17,19,24,0.22)" }} />
        ))}
        <div style={{ position: "absolute", left: 16, right: 16, top: 116, borderTop: "3px dashed rgba(17,19,24,0.3)" }} />
        <div style={{ position: "absolute", left: 16, top: 130, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 10, borderRadius: 5, background: "rgba(17,19,24,0.7)" }} />
          <Dots f={f} color={C.bg} size={9} />
        </div>
      </div>
    </div>
    <div style={{ position: "absolute", left: 0, top: 0, width: 160, height: 14, borderRadius: 7, background: C.surface2, boxShadow: "inset 0 2px 4px rgba(0,0,0,0.6)" }} />
  </div>
);

const Cost: React.FC<{ f: number; at: number }> = ({ f, at }) => {
  const p = sp(f, at, "pop");
  if (p <= 0.002) return null;
  const pr = eo(f, at + 6, 26);
  return (
    <Pop x={PX} y={580} w={PW} h={240} p={p} from="below" d={60}>
      <Fl f={f} seed={11}>
        <Frame w={PW} h={240} kind="plain">
          <Receipt f={f} pr={pr} />
          <div style={{ position: "absolute", left: 240, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ ...TX.kicker, color: C.accent, whiteSpace: "nowrap" }}>Бюджет</div>
            <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 10 }}>
              <span style={{ ...TX.title, fontSize: 44, whiteSpace: "nowrap" }}>Сколько это стоит</span>
              <Dots f={f} color={C.accent} size={12} />
            </div>
          </div>
        </Frame>
      </Fl>
    </Pop>
  );
};

// ── Страница 3: промпт в одну строку → агент ведёт за ручку → две плашки ─────────────────────────
const PROMPT = "прочитай вот этот репозиторий и выполни всё, что там написано";
const PCPS = 42;

const PromptCard: React.FC<{ f: number; at: number; chipAt: number }> = ({ f, at, chipAt }) => {
  const p = sp(f, at, "pop");
  if (p <= 0.002) return null;
  const ca = sp(f, chipAt, "snap");
  const ar = eo(f, chipAt - 2, 12);
  return (
    <Pop x={ZX} y={YC} w={ZW} h={200} p={p} from="below" d={60}>
      <Fl f={f} seed={13} amp={2}>
        <Frame w={ZW} h={200} kind="plain" glow={0.35 * eo(f, at + 4, 16)}>
          <div style={{ position: "absolute", left: 34, top: 26, display: "flex", alignItems: "center", gap: 14 }}>
            <Icon name="terminal" size={38} color={C.accent} sw={3.6} />
            <div style={{ ...TX.title, fontSize: 32, whiteSpace: "nowrap" }}>Промпт в одну строку</div>
          </div>
          <div
            style={{
              position: "absolute",
              left: 34,
              top: 104,
              height: 50,
              display: "flex",
              alignItems: "center",
              fontFamily: MONO,
              fontSize: 28,
              color: C.text,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: C.accent, fontWeight: 700, marginRight: 16 }}>›</span>
            <TypeText text={PROMPT} f={f} start={at + 4} cps={PCPS} style={{ fontFamily: MONO, fontSize: 28 }} />
          </div>
          {ar > 0 && (
            <div style={{ position: "absolute", right: 34, top: 98, height: 62, display: "flex", alignItems: "center", gap: 18 }}>
              <svg width={70} height={30} viewBox="0 0 70 30" style={{ overflow: "visible", flex: "none" }}>
                <path
                  d="M4 15 H60 M48 4 L62 15 L48 26"
                  fill="none"
                  stroke={C.accent}
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  strokeDasharray="1 1"
                  strokeDashoffset={1 - ar}
                />
              </svg>
              {ca > 0.002 && (
                <div style={{ opacity: Math.min(1, ca * 1.6), transform: `translateX(${(1 - ca) * 20}px)` }}>
                  <Chip text="ваш агент" icon="bot" tone="accent" size={28} />
                </div>
              )}
            </div>
          )}
        </Frame>
      </Fl>
    </Pop>
  );
};

const STEPS: { name: string; icon: IconName }[] = [
  { name: "сценарий", icon: "doc" },
  { name: "голос", icon: "mic" },
  { name: "лицо", icon: "user" },
  { name: "графика", icon: "code" },
  { name: "рендер", icon: "cloud" },
  { name: "ролик", icon: "video" },
];

const Stepper: React.FC<{ f: number; at: number; s: number; e: number }> = ({ f, at, s, e }) => {
  const p = sp(f, at, "pop");
  if (p <= 0.002) return null;
  const pr = interpolate(f, [s, e], [0, 5], CL);
  const STEP = 276;
  const nx = (i: number) => 130 + i * STEP;
  const NY = 178;
  const hand = eo(f, at + 10, 12);
  return (
    <Pop x={ZX} y={500} w={ZW} h={300} p={p} from="below" d={60}>
      <Frame w={ZW} h={300} kind="plain">
        <div style={{ position: "absolute", left: 34, top: 24, display: "flex", alignItems: "center", gap: 14 }}>
          <Icon name="route" size={38} color={C.accent} sw={3.6} />
          <div style={{ ...TX.title, fontSize: 32, whiteSpace: "nowrap" }}>Агент ведёт за ручку</div>
        </div>
        <div style={{ position: "absolute", left: nx(0), top: NY - 3, width: nx(5) - nx(0), height: 6, borderRadius: 3, background: "rgba(243,239,230,0.1)" }}>
          <div style={{ width: pr * STEP, height: 6, borderRadius: 3, background: C.accent }} />
        </div>
        {hand > 0 && (
          <div style={{ position: "absolute", left: nx(0) + pr * STEP - 22, top: 84, opacity: hand, transform: `translateY(${float(f, 3, 4, 40)}px)` }}>
            <Icon name="hand" size={44} color={C.accent} sw={3.6} />
          </div>
        )}
        {STEPS.map((st, i) => {
          const en = eo(f, at + 6 + i * 3, 12);
          const ta = s + (i * (e - s)) / 5;
          const ai = sp(f, ta, "bouncy");
          const last = i === STEPS.length - 1;
          return (
            <div
              key={st.name}
              style={{
                position: "absolute",
                left: nx(i) - 80,
                top: NY - 42,
                width: 160,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                opacity: en,
                transform: `translateY(${(1 - en) * 20}px)`,
              }}
            >
              <div style={{ position: "relative", width: 84, height: 84 }}>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: 84,
                    height: 84,
                    boxSizing: "border-box",
                    borderRadius: 42,
                    background: C.surface2,
                    border: "2px solid rgba(154,160,170,0.35)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={st.icon} size={44} color={C.muted} sw={3.4} />
                </div>
                {!last && ai > 0.002 && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      width: 84,
                      height: 84,
                      borderRadius: 42,
                      background: C.accent,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transform: `scale(${ai})`,
                    }}
                  >
                    <Icon name={st.icon} size={44} color={C.bg} sw={3.6} />
                  </div>
                )}
                {last && f >= ta && (
                  <div style={{ position: "absolute", left: 0, top: 0 }}>
                    <CheckBadge f={f} start={ta} size={84} />
                  </div>
                )}
              </div>
              <div style={{ ...TX.label, fontSize: 26, marginTop: 14, whiteSpace: "nowrap", color: interpolateColors(clamp01(ai), [0, 1], [C.muted, C.text]) }}>{st.name}</div>
            </div>
          );
        })}
      </Frame>
    </Pop>
  );
};

const Plate: React.FC<{ f: number; at: number; x: number; w: number; ok: boolean; text: string; pulse?: number }> = ({ f, at, x, w, ok, text, pulse = Infinity }) => {
  const p = sp(f, at, ok ? "pop" : "snap");
  if (p <= 0.002) return null;
  const g = ok ? 0.55 * eo(f, at + 6, 14) + 0.45 * bump(f, pulse, 30) : 0;
  return (
    <Pop x={x} y={530} w={w} h={220} p={p} from="below" d={50}>
      <Fl f={f} seed={ok ? 17 : 19}>
        <Frame w={w} h={220} kind="plain" glow={g}>
          <div style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, padding: "26px 34px", display: "flex", alignItems: "center", gap: 28 }}>
            <div style={{ width: 84, height: 84, flex: "none" }}>
              {ok ? <CheckBadge f={f} start={at + 4} size={84} /> : <CrossBadge f={f} start={at + 4} size={84} />}
            </div>
            <div style={{ ...TX.title, fontSize: 42, color: ok ? C.text : "rgba(243,239,230,0.8)", whiteSpace: "nowrap" }}>{text}</div>
          </div>
        </Frame>
      </Fl>
    </Pop>
  );
};

export const Hook: React.FC<SceneProps> = ({ f, b, w }) => {
  const [b0, b1, b2, b3, b4, b5, b6, b7] = b;
  if (f < b0 - 4) return null;
  const cam = sp(f, b3, "soft") + sp(f, b6, "soft");
  // кадры слов слоёв (сценарий · голос · лицо · графика · рендер) и окна их подсветки
  const lw = [w("сценарий"), w("голос", 20), w("лицо", 20), w("графика"), w("рендер")];
  const le = [lw[1], lw[2], lw[4], lw[4], Infinity];
  const pAt = b6 + 6;
  const chipAt = Math.min(typeDone(PROMPT, pAt + 4, PCPS) + 4, w("агенту"));
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080 }}>
      <Backdrop f={f} b0={b0} cam={cam} />
      <Cover f={f} b0={b0} b1={b1} />
      <Header f={f} b1={b1} tUrok={w("урок", 15)} />
      <Page f={f} out={b3}>
        {FACTS.map((_, i) => (
          <FactCard key={i} f={f} at={b1 + 12 + i * 10} i={i} />
        ))}
        <Threads f={f} at={b2} />
        <Hub f={f} at={b2} tPoka={w("пока")} />
        <Player f={f} at={b1 + 30} />
      </Page>
      {f >= b3 && (
        <Page f={f} out={b6}>
          {LAYERS.map((_, i) => (
            <Slab key={i} f={f} at={b3 + 6 + (4 - i) * 5} i={i} s={lw[i]} e={le[i]} />
          ))}
          <Panel f={f} at={b3 + 12} b4={b4} b5={b5} lw={lw} tHours={w("часов")} />
          <Cost f={f} at={b5 + 6} />
        </Page>
      )}
      {f >= b6 && (
        <>
          <PromptCard f={f} at={pAt} chipAt={chipAt} />
          <Page f={f} out={b7} dx={0} dy={50}>
            <Stepper f={f} at={chipAt + 6} s={w("ведёт")} e={w("ролика")} />
          </Page>
          <Plate f={f} at={b7 + 6} x={ZX} w={640} ok={false} text="не программист" />
          <Plate f={f} at={Math.max(w("инженер"), b7 + 14)} x={820} w={960} ok text="инженер и предприниматель" pulse={w("получится")} />
        </>
      )}
    </div>
  );
};
