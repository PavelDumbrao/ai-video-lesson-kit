import React from "react";
import { interpolateColors } from "remotion";
import { at, C, MONO, SANS } from "../../../theme";
import { bump, clamp01, ei, eio, eo, float, hash, lin, mix, sp } from "../../anim";
import { Icon, IconName } from "../../icons";
import { SceneProps } from "../../types";
import { Avatar, CheckBadge, Chip, Frame, glowWin, Ripple, Tone, TX } from "../../ui";
import { FlowEdge, PulseDot } from "../../viz";
import { Flyer, IconTile, Verdict } from "../kit";

// «Слой второй: голос» (урок 1, раздел 4, голос 185,28–245,88).
// Страница 1 — «Модель, клон и теги эмоций»: сверху карточка модели ElevenLabs v4 Turbo (орб-эквалайзер, цитата,
// плитки «быстро · недорого · качество · поёт» по словам); снизу живая дорожка «Голос урока», которая уступает место
// трём карточкам: клон с минутной записи → агент читает техническую документацию модели → строка с тегами
// [warm] [serious] [laughs]. Лицо F04 во весь экран 197,73–203,52 — новых элементов в окне нет, всё переживает его.
// Страница 2 — «Проверка, дорожка и доступ»: правило «ухо над аудио (дёшево) → видео (дорого)»; одна сплошная дорожка,
// из которой вырезаются куски под лицо; карточка стартового тарифа БЕЗ цифр; ключ API летит к агенту.
// Сцена без окон угла: занимает всю зону x 140–1780 / y 130–830.

// ── Layout ──────────────────────────────────────────────────────────────────────────────────────────────
const L = 140;
const R = 1780;
const FULL = R - L; // 1640
const TY = 250; // top band
const TH = 270;
const BY = 540; // bottom band
const BH = 280;
const SW = 533; // bottom slots of page 1
const SX = [140, 693, 1247];
const RULE_W = 800; // rule card after it makes room for the plan card
const PLAN_X = 960;
const PLAN_W = 820;
const TRACK_W = 1086; // track card after it makes room for the key card
const KEY_X = 1247;
const KEY_W = 533;
// F04 (full-screen face) 197,73–203,52: nothing is scheduled inside, everything shown before it stays.
export const VOICE_FACE = [at(197.73), at(203.52)] as const;

type Dir = "below" | "above" | "left" | "right";
const DIRS: Record<Dir, [number, number]> = { below: [0, 1], above: [0, -1], left: [-1, 0], right: [1, 0] };

/** 1 while the element lives; eases to 0 over `dur` frames right before the next beat (no next beat — never fades). */
const safeExitAlpha = (f: number, bNext?: number, dur = 10) => (bNext === undefined ? 1 : 1 - ei(f, bNext - dur, dur));

/** Speech-like bar height 0.1..1 for bar id `k` (syllables + short pauses), deterministic. */
const amp = (k: number) => {
  const syl = 0.3 + 0.7 * Math.abs(Math.sin(k * 0.23 + 0.4));
  const pause = Math.sin(k * 0.071 + 1.1) > 0.84 ? 0.12 : 1;
  return Math.max(0.1, syl * (0.45 + 0.55 * hash(k * 1.37 + 0.5)) * pause);
};

// ── Small pieces ────────────────────────────────────────────────────────────────────────────────────────

/** Plain card: slides in (no scale — text never scales) and leaves upward. */
const Card: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  p: number;
  q?: number;
  from?: Dir;
  d?: number;
  glow?: number;
  children?: React.ReactNode;
}> = ({ x, y, w, h, p, q = 0, from = "below", d = 46, glow = 0, children }) => {
  if (p <= 0.002 || q >= 0.998) return null;
  const k = 1 - p;
  const [dx, dy] = DIRS[from];
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        opacity: Math.min(1, p * 1.7) * (1 - q),
        transform: `translate(${dx * d * k}px, ${dy * d * k - 24 * q}px)`,
      }}
    >
      <Frame w={w} h={h} kind="plain" glow={glow}>
        {children}
      </Frame>
    </div>
  );
};

/** Card heading: icon tile + 32 px title (top-left, padding 26/34). */
const CardTitle: React.FC<{ icon?: IconName; tile?: React.ReactNode; text: string }> = ({ icon, tile, text }) => (
  <div style={{ position: "absolute", left: 34, top: 26, display: "flex", alignItems: "center", gap: 14, whiteSpace: "nowrap" }}>
    {tile ?? (icon ? <IconTile icon={icon} size={46} /> : null)}
    <div style={{ ...TX.title, fontSize: 32 }}>{text}</div>
  </div>
);

/** Chip that is always laid out and rises in (so a flex row never jumps). */
const RiseChip: React.FC<{ f: number; at: number; text: string; icon?: IconName; tone?: Tone; size?: number; mono?: boolean }> = ({
  f,
  at: a,
  text,
  icon,
  tone = "surface",
  size = 24,
  mono = false,
}) => {
  const p = sp(f, a, "snap");
  return (
    <div style={{ display: "inline-block", opacity: clamp01(p * 1.8), transform: `translateY(${(1 - p) * 16}px)` }}>
      <Chip text={text} icon={icon} tone={tone} size={size} mono={mono} />
    </div>
  );
};

/** Ear (no such icon in the set): outer helix + inner curl. */
const Ear: React.FC<{ size: number; color?: string; sw?: number }> = ({ size, color = C.accent, sw = 3.6 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: "block", overflow: "visible" }}>
    <path
      d="M13 19C13 10.5 18.5 5 26 5S39 10.5 39 18c0 6.5-4 9-6.5 12.5S30 38 26 41c-3.5 2.5-8 1-9-2.5 M20.5 19c0-4 2.4-7 5.6-7s5.9 2.8 5.9 6.3c0 3-2.4 4.4-4 6.4"
      fill="none"
      stroke={color}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Music note («поёт»). */
const Note: React.FC<{ size: number; color?: string }> = ({ size, color = C.accent }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: "block", overflow: "visible" }}>
    <path
      d="M19 36a5.5 5.5 0 1 1-11 0a5.5 5.5 0 1 1 11 0 M19 36V11l20-5v24 M39 30a5.5 5.5 0 1 1-11 0a5.5 5.5 0 1 1 11 0 M19 18l20-5"
      fill="none"
      stroke={color}
      strokeWidth={3.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Live recording wave, anchored to the right edge: bars are born at the write head and drift left. */
const LiveWave: React.FC<{ f: number; w: number; h: number; start: number }> = ({ f, w, h, start }) => {
  const step = 14;
  const S = Math.max(0, f - start) * 3.2;
  const k0 = Math.ceil((S - w) / step);
  const k1 = Math.floor(S / step);
  const bars: React.ReactNode[] = [];
  for (let k = k0; k <= k1; k++) {
    const dist = S - k * step; // px from the right edge
    const x = w - dist;
    const grow = clamp01(dist / 46);
    const hh = Math.max(6, amp(k) * h * (0.25 + 0.75 * grow));
    bars.push(<rect key={k} x={x - 3} y={h / 2 - hh / 2} width={6} height={hh} rx={3} fill={C.accent} opacity={0.22 + 0.78 * clamp01(x / w)} />);
  }
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "hidden" }}>
      <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="rgba(243,239,230,0.08)" strokeWidth={2} />
      {bars}
    </svg>
  );
};

/** Pulsing voice orb: equalizer bars inside a glowing ring. */
const VoiceOrb: React.FC<{ f: number; p: number; size?: number; start: number }> = ({ f, p, size = 170, start }) => {
  if (p <= 0.002) return null;
  const loop = start + Math.floor(Math.max(0, f - start) / 46) * 46;
  return (
    <div style={{ position: "relative", width: size, height: size, transform: `scale(${p})` }}>
      <Ripple f={f} start={loop} size={size} dur={40} grow={0.35} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: `radial-gradient(circle at 35% 30%, ${C.raised}, ${C.surface2})`,
          border: `3px solid ${C.accent}`,
          boxShadow: `0 0 ${34 + 12 * Math.sin(f / 9)}px rgba(255,179,0,0.22)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 9,
        }}
      >
        {Array.from({ length: 7 }, (_, i) => {
          const e = 0.22 + 0.78 * Math.abs(Math.sin(f / 6.5 + i * 0.85)) * (0.55 + 0.45 * hash(i + 3));
          return <div key={i} style={{ width: 10, height: 18 + 68 * e * (1 - Math.abs(i - 3) * 0.12), borderRadius: 5, background: C.accent }} />;
        })}
      </div>
    </div>
  );
};

/** Feature tile of the model card: dashed placeholder until its word, then fills. */
const FeatureTile: React.FC<{ f: number; at: number; text: string; icon: React.ReactNode; x: number; y: number }> = ({ f, at: a, text, icon, x, y }) => {
  const p = sp(f, a, "pop");
  const g = bump(f, a, 26);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 276, height: 98 }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 18, border: "2px dashed rgba(154,160,170,0.32)", opacity: 1 - clamp01(p * 1.4) }} />
      {p > 0.002 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 18,
            background: C.raised,
            border: `2px solid rgba(255,179,0,${0.28 + 0.6 * g})`,
            boxShadow: `0 0 ${34 * g}px rgba(255,179,0,${0.32 * g})`,
            opacity: clamp01(p * 1.8),
            transform: `translateY(${(1 - p) * 18}px)`,
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "0 18px",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              flex: "none",
              borderRadius: 15,
              background: "rgba(255,179,0,0.14)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: `scale(${sp(f, a + 3, "bouncy")})`,
            }}
          >
            {icon}
          </div>
          <div style={{ ...TX.label, fontSize: 30, whiteSpace: "nowrap" }}>{text}</div>
        </div>
      )}
    </div>
  );
};

/** Tag pill of the tags card: muted until lit, then accent. */
const Tag: React.FC<{ text: string; lit: number; g: number }> = ({ text, lit, g }) => (
  <span
    style={{
      display: "inline-block",
      padding: "0 8px",
      marginRight: 12,
      borderRadius: 8,
      fontWeight: 700,
      background: interpolateColors(lit, [0, 1], ["rgba(154,160,170,0.12)", C.accent]),
      border: `2px solid ${interpolateColors(lit, [0, 1], ["rgba(154,160,170,0.4)", C.accent])}`,
      color: interpolateColors(lit, [0, 1], [C.muted, C.bg]),
      boxShadow: `0 0 ${26 * g}px rgba(255,179,0,${0.5 * g})`,
    }}
  >
    {text}
  </span>
);

// ── Page 1 cards ────────────────────────────────────────────────────────────────────────────────────────

const ModelCard: React.FC<{ f: number; a: number; q: number; w: SceneProps["w"] }> = ({ f, a, q, w }) => {
  const p = sp(f, a, "pop");
  const name = eo(f, a + 4, 16);
  const quote = sp(f, w("лучше"), "snap");
  const fy = float(f, 1, 2.5, 120);
  const tiles: { t: string; node: React.ReactNode; word: string }[] = [
    { t: "быстро", node: <Icon name="zap" size={32} color={C.accent} />, word: "быстро" },
    { t: "недорого", node: <Icon name="dollar" size={32} color={C.accent} sw={3.8} />, word: "недорого" },
    { t: "качество", node: <Icon name="star" size={32} color={C.accent} />, word: "качество" },
    { t: "поёт", node: <Note size={32} />, word: "петь" },
  ];
  return (
    <Card x={L} y={TY + fy} w={FULL} h={TH} p={p} q={q} from="below">
      <div style={{ position: "absolute", left: 34, top: 50 }}>
        <VoiceOrb f={f} p={sp(f, a + 2, "bouncy")} start={a + 8} />
      </div>
      <div style={{ position: "absolute", left: 234, top: 30, opacity: clamp01(name * 1.5), transform: `translateX(${(1 - name) * 24}px)` }}>
        <div style={{ ...TX.kicker, whiteSpace: "nowrap" }}>МОДЕЛЬ ГОЛОСА</div>
        <div style={{ ...TX.title, fontSize: 60, marginTop: 6, whiteSpace: "nowrap" }}>
          ElevenLabs <span style={{ color: C.accent }}>v4 Turbo</span>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 234,
          top: 168,
          display: "flex",
          alignItems: "center",
          gap: 12,
          opacity: clamp01(quote * 1.6),
          transform: `translateY(${(1 - quote) * 16}px)`,
          whiteSpace: "nowrap",
        }}
      >
        <Icon name="quote" size={28} color={C.accent} />
        <span style={{ ...TX.label, fontSize: 28 }}>«Лучше на рынке нет»</span>
        <span style={{ ...TX.label, fontSize: 28, color: C.muted }}>· по моему опыту</span>
      </div>
      {tiles.map((t, i) => (
        <FeatureTile key={i} f={f} at={w(t.word)} text={t.t} icon={t.node} x={1038 + (i % 2) * 292} y={29 + Math.floor(i / 2) * 114} />
      ))}
    </Card>
  );
};

/** «Голос урока» — the live track that fills the bottom band and gives way to the three cards. */
const LessonWave: React.FC<{ f: number; a: number; bClone: number; bDoc: number; bTags: number }> = ({ f, a, bClone, bDoc, bTags }) => {
  const p = sp(f, a, "soft");
  const q = 1 - safeExitAlpha(f, bTags);
  const m1 = eio(f, bClone - 12, 14);
  const m2 = eio(f, bDoc - 12, 14);
  const x = mix(mix(L, SX[1], m1), SX[2], m2);
  const wd = R - x;
  return (
    <Card x={x} y={BY + float(f, 2, 2, 130)} w={wd} h={BH} p={p} q={q} from="below" d={60}>
      <CardTitle icon="wave" text="Голос урока" />
      <div style={{ position: "absolute", right: 40, top: 40 }}>
        <PulseDot f={f} start={a + 6} size={18} />
      </div>
      <div style={{ position: "absolute", left: 34, top: 96 }}>
        <LiveWave f={f} w={wd - 68} h={150} start={a} />
      </div>
    </Card>
  );
};

const CloneCard: React.FC<{ f: number; a: number; q: number }> = ({ f, a, q }) => {
  const p = sp(f, a, "snap");
  const draw = lin(f, a + 6, 20);
  const edge = eo(f, a + 18, 12);
  const av = sp(f, a + 26, "bouncy");
  const copy = eo(f, a + 34, 16);
  const lab = eo(f, a + 30, 12);
  return (
    <Card x={SX[0]} y={BY + float(f, 3, 2.5, 110)} w={SW} h={BH} p={p} q={q} from="left">
      <CardTitle icon="mic" text="Клон голоса" />
      <div style={{ position: "absolute", left: 34, top: 100, width: 196, height: 92, borderRadius: 14, background: C.surface2, border: `1px solid ${C.line}` }}>
        <svg width={196} height={92} style={{ display: "block" }}>
          {Array.from({ length: 13 }, (_, i) => {
            const v = clamp01((draw * 13 - i) * 1.2);
            const hh = Math.max(4, amp(i * 3 + 11) * 68 * v);
            return <rect key={i} x={20 + i * 13 - 3} y={46 - hh / 2} width={6} height={hh} rx={3} fill={C.accent} opacity={v > 0 ? 0.5 + 0.5 * v : 0} />;
          })}
        </svg>
      </div>
      <div style={{ position: "absolute", left: 34, top: 206, width: 196, textAlign: "center", ...TX.label, fontSize: 24, color: C.muted, whiteSpace: "nowrap", opacity: clamp01(draw * 2) }}>
        минута записи
      </div>
      <svg width={SW} height={BH} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <FlowEdge a={{ x: 242, y: 146 }} b={{ x: 318, y: 146 }} p={edge} f={f} dots={1} period={30} width={4} />
      </svg>
      {av > 0.002 && (
        <div style={{ position: "absolute", left: 337, top: 91 }}>
          <div
            style={{
              position: "absolute",
              left: 22 * copy,
              top: -6 * copy,
              width: 110,
              height: 110,
              borderRadius: "50%",
              border: `3px dashed rgba(255,179,0,${0.75 * copy})`,
              background: `rgba(255,179,0,${0.06 * copy})`,
            }}
          />
          <div style={{ position: "relative", transform: `scale(${av})` }}>
            <Ripple f={f} start={a + 26} size={110} />
            <Avatar size={110} icon="mic" />
          </div>
        </div>
      )}
      <div style={{ position: "absolute", left: 300, top: 206, width: 184, textAlign: "center", ...TX.label, fontSize: 24, whiteSpace: "nowrap", opacity: lab }}>
        голос-клон
      </div>
    </Card>
  );
};

const DocCard: React.FC<{ f: number; a: number; q: number; w: SceneProps["w"] }> = ({ f, a, q, w }) => {
  const p = sp(f, a, "heavy");
  const bot = sp(f, a + 6, "pop");
  const sheet = sp(f, a + 8, "heavy");
  const read = w("прочитал");
  const scanOn = f >= a + 18 && f < read + 8 ? 1 - ei(f, read, 8) : 0;
  const ph = ((Math.max(0, f - a - 18) % 44) + 44) % 44;
  return (
    <Card x={SX[1]} y={BY + float(f, 4, 2.5, 120)} w={SW} h={BH} p={p} q={q} from="below">
      <CardTitle icon="doc" text="Изучи документацию" />
      {bot > 0.002 && (
        <div style={{ position: "absolute", left: 34, top: 116, transform: `scale(${bot})` }}>
          <Avatar size={96} icon="bot" />
        </div>
      )}
      {/* reading beam: dots running from the agent to the sheet */}
      {scanOn > 0 &&
        [0, 1, 2].map((i) => {
          const t = ((f / 14 + i / 3) % 1 + 1) % 1;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 138 + 40 * t,
                top: 160,
                width: 8,
                height: 8,
                borderRadius: 4,
                background: C.accent,
                opacity: scanOn * Math.min(1, t * 5, (1 - t) * 5),
              }}
            />
          );
        })}
      {sheet > 0.002 && (
        <div
          style={{
            position: "absolute",
            left: 186,
            top: 92,
            width: 313,
            height: 158,
            borderRadius: 14,
            background: C.surface2,
            border: `1px solid ${C.line}`,
            overflow: "hidden",
            opacity: clamp01(sheet * 1.7),
            transform: `translateX(${(1 - sheet) * 40}px)`,
          }}
        >
          {scanOn > 0 && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 10 + (ph / 44) * 112,
                height: 30,
                background: `rgba(255,179,0,${0.14 * scanOn})`,
                boxShadow: `inset 3px 0 0 rgba(255,179,0,${0.9 * scanOn})`,
              }}
            />
          )}
          <div style={{ position: "absolute", left: 20, top: 14, ...TX.label, fontSize: 24, lineHeight: "30px", whiteSpace: "nowrap" }}>
            Техническая
            <br />
            документация
            <br />
            <span style={{ color: C.accent }}>модели</span>
          </div>
          <div style={{ position: "absolute", left: 20, top: 120, width: 220, height: 8, borderRadius: 4, background: "rgba(243,239,230,0.12)" }} />
          <div style={{ position: "absolute", left: 20, top: 136, width: 150, height: 8, borderRadius: 4, background: "rgba(243,239,230,0.12)" }} />
          <div style={{ position: "absolute", left: 249, top: 12 }}>
            <CheckBadge f={f} start={read} size={44} />
          </div>
        </div>
      )}
    </Card>
  );
};

const TagsCard: React.FC<{ f: number; a: number; q: number; w: SceneProps["w"] }> = ({ f, a, q, w }) => {
  const p = sp(f, a, "pop");
  const lines: { tag: string; text: string; lit: number }[] = [
    { tag: "[warm]", text: "Привет! Это урок.", lit: a + 8 },
    { tag: "[serious]", text: "Голос — слой два.", lit: w("пауз") },
    { tag: "[laughs]", text: "Звучит живо!", lit: w("тембра") },
  ];
  const hear = w("слышите");
  const glow = 0.8 * glowWin(f, hear, hear + 30, 0);
  return (
    <Card x={SX[2]} y={BY + float(f, 5, 2.5, 115)} w={SW} h={BH} p={p} q={q} from="right" glow={glow}>
      <CardTitle icon="spark" text="Теги эмоций и пауз" />
      {lines.map((l, i) => {
        const r = eo(f, a + 4 + i * 4, 12);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 34,
              top: 100 + i * 50,
              fontFamily: MONO,
              fontSize: 24,
              lineHeight: "38px",
              color: C.text,
              whiteSpace: "nowrap",
              opacity: r,
              transform: `translateX(${(1 - r) * 20}px)`,
            }}
          >
            <Tag text={l.tag} lit={eo(f, l.lit, 8)} g={bump(f, l.lit, 22)} />
            {l.text}
          </div>
        );
      })}
    </Card>
  );
};

// ── Page 2 cards ────────────────────────────────────────────────────────────────────────────────────────

/** A node of the rule: tile + word + chip. */
const RuleNode: React.FC<{ f: number; x: number; tile: React.ReactNode; word: string; chip: string; chipAt: number; chipTone: Tone; lit: number }> = ({
  f,
  x,
  tile,
  word,
  chip,
  chipAt,
  chipTone,
  lit,
}) => (
  <div style={{ position: "absolute", left: x, top: 98, display: "flex", alignItems: "center", gap: 18 }}>
    <div
      style={{
        width: 120,
        height: 120,
        flex: "none",
        borderRadius: 32,
        background: `rgba(255,179,0,${0.06 + 0.1 * lit})`,
        border: `2px solid rgba(255,179,0,${0.2 + 0.6 * lit})`,
        boxShadow: `0 0 ${30 * lit}px rgba(255,179,0,${0.22 * lit})`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        opacity: 0.45 + 0.55 * lit,
      }}
    >
      {tile}
    </div>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
      <div style={{ ...TX.title, fontSize: 34, whiteSpace: "nowrap", color: lit > 0.5 ? C.text : C.muted }}>{word}</div>
      <RiseChip f={f} at={chipAt} text={chip} tone={chipTone} />
    </div>
  </div>
);

const RuleCard: React.FC<{ f: number; a: number; bPlan: number; w: SceneProps["w"] }> = ({ f, a, bPlan, w }) => {
  const p = sp(f, a, "snap");
  const shrink = eio(f, bPlan - 12, 14);
  const wd = mix(FULL, RULE_W, shrink);
  const gen = w("генерировать");
  const arrow = eo(f, gen, 16);
  const vidLit = eo(f, w("видео"), 12);
  const ax = 34 + 268 + 24;
  const bx = wd - 34 - 268;
  const gate = sp(f, a + 10, "snap") * (1 - shrink);
  const tok = arrow >= 1 ? ((((f - gen - 16) / 48) % 1) + 1) % 1 : -1;
  const ear = (
    <>
      <Ear size={60} />
      <svg width={70} height={22} style={{ display: "block" }}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const hh = 6 + 16 * Math.abs(Math.sin(f / 7 + i * 0.9));
          return <rect key={i} x={2 + i * 10} y={11 - hh / 2} width={5} height={hh} rx={2.5} fill={C.accent} />;
        })}
      </svg>
    </>
  );
  return (
    <Card x={L} y={TY + float(f, 6, 2.5, 120)} w={wd} h={TH} p={p} from="above" d={40}>
      <CardTitle tile={<IconTile icon="eye" size={46} />} text="Сначала слушаю, потом видео" />
      <RuleNode f={f} x={34} tile={ear} word="аудио" chip="дёшево" chipAt={w("дёшево")} chipTone="outline" lit={eo(f, a + 4, 12)} />
      <RuleNode
        f={f}
        x={bx}
        tile={<Icon name="video" size={66} color={C.accent} sw={3.4} />}
        word="видео"
        chip="дорого"
        chipAt={w("дорого")}
        chipTone="muted"
        lit={vidLit}
      />
      <svg width={wd} height={TH} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {arrow > 0 && (
          <>
            <line x1={ax} y1={158} x2={mix(ax, bx - 24, arrow)} y2={158} stroke={C.accent} strokeWidth={5} strokeLinecap="round" opacity={0.75} />
            {arrow > 0.85 && (
              <path
                d={`M${bx - 40} 146 L${bx - 24} 158 L${bx - 40} 170`}
                fill="none"
                stroke={C.accent}
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={lin(arrow, 0.85, 0.15)}
              />
            )}
            {tok >= 0 && <circle cx={mix(ax, bx - 30, tok)} cy={158} r={9} fill={C.accent} opacity={Math.min(1, tok * 6, (1 - tok) * 6)} />}
          </>
        )}
      </svg>
      {gate > 0.002 && (
        <div
          style={{
            position: "absolute",
            left: (ax + bx - 24) / 2,
            top: 92,
            transform: `translate(-50%, ${(1 - gate) * 14}px)`,
            opacity: clamp01(gate * 1.6),
          }}
        >
          <Chip text="сначала на слух" icon="check" tone="outline" size={24} />
        </div>
      )}
    </Card>
  );
};

const SEGS: [number, number][] = [
  [0.1, 0.24],
  [0.42, 0.55],
  [0.72, 0.87],
];

const TrackCard: React.FC<{ f: number; a: number; bKey: number; t1: number; w: SceneProps["w"] }> = ({ f, a, bKey, t1, w }) => {
  const p = sp(f, a, "soft");
  const wd = mix(FULL, TRACK_W, eio(f, bKey - 12, 14));
  const iw = wd - 68;
  const N = 120;
  const step = iw / N;
  const draw = lin(f, a + 4, 26);
  const cut = w("режутся");
  const face = w("лицо");
  const fin = w("финале");
  const head = lin(f, fin, Math.max(30, t1 - fin));
  const glow = 0.7 * glowWin(f, fin, fin + 36, 0);
  return (
    <Card x={L} y={BY + float(f, 7, 2, 130)} w={wd} h={BH} p={p} from="below" d={60} glow={glow}>
      <CardTitle icon="wave" text="Одна сплошная дорожка" />
      <div style={{ position: "absolute", right: 34, top: 26 }}>
        <RiseChip f={f} at={a + 8} text="голос всего урока" icon="mic" tone="surface" />
      </div>
      {SEGS.map(([s0, s1], i) => (
        <div key={i} style={{ position: "absolute", left: 34 + iw * ((s0 + s1) / 2), top: 80, transform: "translateX(-50%)" }}>
          <RiseChip f={f} at={face + i * 4} text="под лицо" icon="scissors" tone="accent" />
        </div>
      ))}
      <svg width={iw} height={70} style={{ position: "absolute", left: 34, top: 134, overflow: "visible" }}>
        <line x1={0} y1={35} x2={iw * draw} y2={35} stroke="rgba(243,239,230,0.12)" strokeWidth={2} />
        {Array.from({ length: N }, (_, k) => {
          const u = (k + 0.5) / N;
          const v = clamp01((draw * N - k) * 0.8);
          if (v <= 0) return null;
          const si = SEGS.findIndex(([s0, s1]) => u >= s0 && u <= s1);
          const c = si >= 0 ? eo(f, cut + si * 5, 12) : 0;
          const played = u <= head;
          const hh = Math.max(4, amp(k * 1.9 + 40) * 60 * v);
          const col = c > 0.5 ? C.accent : played ? C.text : C.muted;
          return (
            <rect
              key={k}
              x={u * iw - step * 0.25}
              y={35 - hh / 2 - 4 * c}
              width={step * 0.5}
              height={hh}
              rx={Math.min(3, step * 0.25)}
              fill={col}
              opacity={c > 0.5 ? 1 : played ? 0.9 : 0.55}
            />
          );
        })}
        {SEGS.map(([s0, s1], i) => {
          const c = eo(f, cut + i * 5, 12);
          if (c <= 0) return null;
          return (
            <rect
              key={`b${i}`}
              x={s0 * iw - 6}
              y={-2 - 4 * c}
              width={(s1 - s0) * iw + 12}
              height={74}
              rx={12}
              fill={`rgba(255,179,0,${0.08 * c})`}
              stroke={C.accent}
              strokeWidth={3}
              strokeDasharray="10 8"
              opacity={c}
            />
          );
        })}
        {head > 0 && head < 1 && <line x1={head * iw} y1={-2} x2={head * iw} y2={72} stroke={C.accent} strokeWidth={4} strokeLinecap="round" />}
      </svg>
      <div style={{ position: "absolute", left: 34, top: 210, display: "flex", gap: 20 }}>
        <Verdict f={f} start={fin} text="в финале звучит эта дорожка" ok size={24} />
        <Verdict f={f} start={w("придумала")} text="звук видеомодели" ok={false} size={24} />
      </div>
    </Card>
  );
};

/** Checklist row that is visible (muted, empty box) from `show` and ticks on its word. */
const CheckRow: React.FC<{ f: number; show: number; tick: number; text: string }> = ({ f, show, tick, text }) => {
  const p = sp(f, show, "snap");
  const d = eo(f, tick, 9);
  const g = bump(f, tick, 20);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 15, opacity: clamp01(p * 1.6), transform: `translateX(${(1 - p) * 24}px)` }}>
      <svg width={31} height={31} viewBox="0 0 48 48" style={{ flex: "none", overflow: "visible" }}>
        <rect x={4} y={4} width={40} height={40} rx={10} fill={d > 0 ? C.ok : "none"} fillOpacity={d} stroke={d > 0 ? C.ok : C.muted} strokeWidth={4} />
        <path d="M13 25l7.5 7.5L35 17" fill="none" stroke={C.bg} strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - d} />
      </svg>
      <span style={{ ...TX.label, fontSize: 28, color: d > 0.5 ? C.text : C.muted, whiteSpace: "nowrap", textShadow: g > 0 ? `0 0 ${18 * g}px rgba(74,222,128,${0.5 * g})` : undefined }}>{text}</span>
    </div>
  );
};

const PlanCard: React.FC<{ f: number; a: number; w: SceneProps["w"] }> = ({ f, a, w }) => {
  const p = sp(f, a, "pop");
  const two = w("пару");
  return (
    <Card x={PLAN_X} y={TY + float(f, 8, 2.5, 115)} w={PLAN_W} h={TH} p={p} from="right">
      <CardTitle icon="card" text="Стартовый тариф" />
      <div style={{ position: "absolute", left: 34, top: 104 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <CheckRow f={f} show={a + 8} tick={w("клонирование")} text="клонирование включено" />
          <CheckRow f={f} show={a + 12} tick={w("хватает")} text="хватит на пару уроков" />
        </div>
      </div>
      {[0, 1].map((i) => {
        const fill = sp(f, two + i * 5, "pop");
        const g = bump(f, two + i * 5, 24);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 520 + i * 136,
              top: 96,
              width: 120,
              height: 120,
              borderRadius: 26,
              border: fill > 0.05 ? `2px solid rgba(255,179,0,${0.35 + 0.55 * g})` : "2px dashed rgba(154,160,170,0.35)",
              background: `rgba(255,179,0,${0.12 * clamp01(fill)})`,
              boxShadow: `0 0 ${30 * g}px rgba(255,179,0,${0.3 * g})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ opacity: 0.3 + 0.7 * clamp01(fill), transform: `translateY(${(1 - clamp01(fill)) * 6}px)` }}>
              <Icon name="video" size={58} color={fill > 0.05 ? C.accent : C.muted} sw={3.4} />
            </div>
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          left: 520,
          top: 222,
          width: 256,
          textAlign: "center",
          ...TX.label,
          fontSize: 24,
          color: C.muted,
          whiteSpace: "nowrap",
          opacity: eo(f, two + 6, 12),
        }}
      >
        пара уроков
      </div>
    </Card>
  );
};

const KeyCard: React.FC<{ f: number; a: number; w: SceneProps["w"] }> = ({ f, a, w }) => {
  const p = sp(f, a, "heavy");
  const fly = eio(f, a + 10, 24);
  const dock = a + 34;
  const docked = sp(f, dock, "bouncy");
  const path = eo(f, a + 4, 14);
  const cap = eo(f, w("ваш"), 12);
  const ring = interpolateColors(eo(f, dock, 10), [0, 1], ["rgba(154,160,170,0.6)", C.accent]);
  return (
    <Card x={KEY_X} y={BY + float(f, 9, 2.5, 110)} w={KEY_W} h={BH} p={p} from="below">
      <CardTitle icon="key" text="Ключ по API" />
      <svg width={KEY_W} height={BH} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {path > 0 && <path d="M150 152 Q268 92 386 152" fill="none" stroke={C.accent} strokeWidth={3} strokeDasharray="4 12" strokeLinecap="round" opacity={0.6 * path} />}
      </svg>
      <div style={{ position: "absolute", left: 40, top: 104, opacity: fly > 0 && fly < 1 ? 0.45 : f >= dock ? 0.45 : 1 }}>
        <IconTile icon="key" size={96} />
      </div>
      <div style={{ position: "absolute", left: 395, top: 100 }}>
        <Ripple f={f} start={dock} size={104} grow={0.45} dur={18} />
        <Avatar size={104} icon="bot" ring={ring} />
        {docked > 0.002 && (
          <div style={{ position: "absolute", left: 68, top: 66, transform: `scale(${docked})` }}>
            <IconTile icon="key" size={44} color={C.bg} bg={C.accent} />
          </div>
        )}
        <div style={{ position: "absolute", left: 70, top: -8 }}>
          <CheckBadge f={f} start={w("сделает")} size={40} />
        </div>
      </div>
      <Flyer t={fly} ax={88} ay={152} bx={447} by={152} arc={60}>
        <div style={{ transform: `rotate(${-30 * Math.sin(Math.PI * fly)}deg)` }}>
          <Icon name="key" size={56} color={C.accent} sw={4} />
        </div>
      </Flyer>
      <div
        style={{
          position: "absolute",
          left: 34,
          right: 34,
          top: 226,
          textAlign: "center",
          ...TX.label,
          fontSize: 24,
          color: C.muted,
          whiteSpace: "nowrap",
          opacity: cap,
          transform: `translateY(${(1 - cap) * 10}px)`,
        }}
      >
        агент сам попросит ключ
      </div>
    </Card>
  );
};

// ── Header: kicker + swapping title (left), chips (right) ────────────────────────────────────────────────

const Header: React.FC<{ f: number; t0: number; swap: number; chip2: number }> = ({ f, t0, swap, chip2 }) => {
  const k = sp(f, t0, "snap");
  const r1 = eo(f, t0 + 2, 16);
  const out1 = eio(f, swap - 10, 14);
  const r2 = eo(f, swap + 2, 16);
  const title: React.CSSProperties = { position: "absolute", left: 0, top: 0, ...TX.title, fontSize: 38, whiteSpace: "nowrap" };
  return (
    <div style={{ position: "absolute", left: L, top: 130, width: FULL, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <div style={{ ...TX.kicker, color: C.accent, whiteSpace: "nowrap", opacity: clamp01(k * 1.6), transform: `translateX(${(1 - k) * -24}px)` }}>
          СЛОЙ 2 · ГОЛОС
        </div>
        <div style={{ position: "relative", width: 900, height: 54, marginTop: 8, overflow: "hidden" }}>
          {out1 < 1 && r1 > 0 && <div style={{ ...title, transform: `translateY(${(1 - r1) * 110 - out1 * 110}%)` }}>Модель, клон и теги эмоций</div>}
          {r2 > 0 && <div style={{ ...title, transform: `translateY(${(1 - r2) * 110}%)` }}>Проверка, дорожка и доступ</div>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, paddingTop: 8 }}>
        <RiseChip f={f} at={t0 + 6} text="ElevenLabs v4 Turbo" icon="wave" tone="outline" />
        <RiseChip f={f} at={chip2} text="клон голоса" icon="mic" />
      </div>
    </div>
  );
};

// ── Scene ───────────────────────────────────────────────────────────────────────────────────────────────

export const Voice: React.FC<SceneProps> = ({ f, b, t0, t1, w }) => {
  const [bModel, bClone, bDoc, bTags, bRule, bTrack, bPlan, bKey] = b;
  const qTop1 = 1 - safeExitAlpha(f, bRule); // page 1 top (model) gives way to the rule
  const qBot1 = 1 - safeExitAlpha(f, bTrack); // page 1 bottom (clone · doc · tags) gives way to the track
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, fontFamily: SANS }}>
      <Header f={f} t0={t0} swap={bRule} chip2={bClone + 6} />

      {/* page 1 */}
      <ModelCard f={f} a={bModel} q={qTop1} w={w} />
      <LessonWave f={f} a={bModel + 6} bClone={bClone} bDoc={bDoc} bTags={bTags} />
      <CloneCard f={f} a={bClone + 2} q={qBot1} />
      <DocCard f={f} a={bDoc + 2} q={qBot1} w={w} />
      <TagsCard f={f} a={bTags + 1} q={qBot1} w={w} />

      {/* page 2 */}
      {f >= bRule && <RuleCard f={f} a={bRule + 1} bPlan={bPlan} w={w} />}
      {f >= bTrack && <TrackCard f={f} a={bTrack + 1} bKey={bKey} t1={t1} w={w} />}
      {f >= bPlan && <PlanCard f={f} a={bPlan + 2} w={w} />}
      {f >= bKey && <KeyCard f={f} a={bKey + 2} w={w} />}
    </div>
  );
};
