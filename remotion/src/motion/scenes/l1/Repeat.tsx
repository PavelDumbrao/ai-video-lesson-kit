import React from "react";
import { interpolateColors } from "remotion";
import { at, C, MONO, pad2, SANS } from "../../../theme";
import { bump, clamp01, ei, eio, eo, float, hash, lin, mix, sp, SprName, typed, typeDone } from "../../anim";
import { Icon, IconName } from "../../icons";
import { Caret } from "../../text";
import { SceneProps } from "../../types";
import { Bubble, CheckBadge, Chip, Frame, glowWin, Pop, Ripple, StatusIcon, Strike, TX } from "../../ui";
import { Burst, Ring } from "../../viz";
import { ArrowPath, Flyer, IconTile, Verdict } from "../kit";

// «Как повторить это у себя» (раздел 14, 695,37–754,90 с голоса). Лицо: во весь экран до 696,50, затем угол СЛЕВА
// до 702,18 — левая зона x 0–700 / y 280–850 пуста, карточка промпта стоит справа и уезжает влево только после 702,18.
// Три страницы под общей шапкой (заголовок меняется, справа навигатор «промпт · ключи · старт»):
//  1) карточка «под видео — промпт в одну строку» (печатается в такт голосу) → «Скопировано» → жетон летит
//     к карточке «вставьте своему агенту» (Claude Code · Codex · Antigravity · любому) → дерево репозитория
//     skills/ · scripts/ · guides/ · AGENTS.md (AGENTS.md «ведёт вас за ручку»);
//  2) три шага-вопроса агента: ключ ElevenLabs + минутная запись голоса · ключ Kie AI, фото → лицо ·
//     где рендерить: Hugging Face PRO или Modal, «подключит сам» (пустые слоты 2 и 3 ждут своих слов);
//  3) шкала 95 % агент / 5 % вы (ключи · фото · голос · текст) + что агент делает сам; затем план старта:
//     «3 минуты, не час» · таймер «72 часа» · плашка «ProAI Community — разберём вместе».

const X0 = 140;
const Y0 = 250;
const CORNER_END = at(702.18); // левый угол занят лицом до этого кадра
const PROMPT = "прочитай вот этот репозиторий и выполни всё, что там написано";
const NAV = ["промпт", "ключи", "старт"];

// ── small pieces ──────────────────────────────────────────────────────────────────────────────
/** A page that leaves as a whole (fade + lift, no scale) when the next page takes its place. */
const Page: React.FC<{ f: number; out: number; children?: React.ReactNode }> = ({ f, out, children }) => {
  const q = ei(f, out, 12);
  if (q >= 1) return null;
  return <div style={{ position: "absolute", inset: 0, opacity: 1 - q, transform: q > 0 ? `translateY(${-28 * q}px)` : undefined }}>{children}</div>;
};

/** Gentle idle drift for a held card (px, no scale). */
const Drift: React.FC<{ f: number; seed: number; children?: React.ReactNode }> = ({ f, seed, children }) => (
  <div style={{ transform: `translateY(${float(f, seed, 3, 140)}px)` }}>{children}</div>
);

/** Fades / lifts a child in at `a` (layout space is kept, so neighbours never jump). */
const In: React.FC<{ f: number; a: number; dy?: number; dx?: number; spr?: SprName; style?: React.CSSProperties; children?: React.ReactNode }> = ({
  f,
  a,
  dy = 14,
  dx = 0,
  spr = "snap",
  style,
  children,
}) => {
  const p = sp(f, a, spr);
  return (
    <div style={{ opacity: clamp01(p * 1.6), transform: `translate(${(1 - p) * dx}px, ${(1 - p) * dy}px)`, ...style }}>{children}</div>
  );
};

const NavChip: React.FC<{ n: number; text: string; act: number }> = ({ n, text, act }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      height: 46,
      padding: "0 18px 0 7px",
      borderRadius: 23,
      background: interpolateColors(act, [0, 1], ["rgba(154,160,170,0.08)", "rgba(255,179,0,0.14)"]),
      border: `2px solid ${interpolateColors(act, [0, 1], ["rgba(154,160,170,0.28)", "rgba(255,179,0,0.9)"])}`,
      whiteSpace: "nowrap",
    }}
  >
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        background: interpolateColors(act, [0, 1], [C.raised, C.accent]),
        color: interpolateColors(act, [0, 1], [C.muted, C.bg]),
        fontFamily: MONO,
        fontWeight: 700,
        fontSize: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {n}
    </div>
    <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 24, color: interpolateColors(act, [0, 1], [C.muted, C.text]) }}>{text}</span>
  </div>
);

type Head = { a: number; kicker: string; title: string };
/** Scene header: changing kicker + title on the left, page navigator on the right (flex-start, never flex-end). */
const Header: React.FC<{ f: number; heads: Head[]; act: number[]; p: number }> = ({ f, heads, act, p }) => (
  <div style={{ position: "absolute", left: X0, top: 128, width: 1640, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
    <div style={{ position: "relative", width: 1100, height: 82 }}>
      {heads.map((h, i) => {
        const next = heads[i + 1];
        const pin = eo(f, h.a, 16);
        const pout = next ? ei(f, next.a - 8, 9) : 0;
        if (pin <= 0.001 || pout >= 0.999) return null;
        return (
          <div key={i} style={{ position: "absolute", left: 0, top: 0, opacity: pin * (1 - pout), transform: `translateY(${(1 - pin) * 20 - pout * 16}px)` }}>
            <div style={{ ...TX.kicker, color: C.accent, whiteSpace: "nowrap" }}>{h.kicker}</div>
            <div style={{ ...TX.title, fontSize: 38, marginTop: 8, whiteSpace: "nowrap" }}>{h.title}</div>
          </div>
        );
      })}
    </div>
    <div style={{ display: "flex", gap: 12, marginTop: 6, opacity: p, transform: `translateY(${(1 - p) * -14}px)` }}>
      {NAV.map((t, i) => (
        <NavChip key={i} n={i + 1} text={t} act={act[i]} />
      ))}
    </div>
  </div>
);

/** Dashed placeholder of a slot that fills on a later word. */
const Ghost: React.FC<{ f: number; a: number; z: number; x: number; y: number; w: number; h: number; n?: number; icon: IconName }> = ({
  f,
  a,
  z,
  x,
  y,
  w,
  h,
  n,
  icon,
}) => {
  const p = eo(f, a, 14) * (1 - eo(f, z, 8));
  if (p <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: 22,
        border: "2px dashed rgba(243,239,230,0.16)",
        background: "rgba(35,40,51,0.28)",
        opacity: p,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      {n !== undefined && <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 72, lineHeight: 1, color: "rgba(154,160,170,0.3)" }}>{n}</div>}
      <Icon name={icon} size={52} color="rgba(154,160,170,0.32)" sw={3.4} />
    </div>
  );
};

const Kicker: React.FC<{ icon: IconName; text: string; color?: string; x?: number; y?: number }> = ({ icon, text, color = C.accent, x = 34, y = 24 }) => (
  <div style={{ position: "absolute", left: x, top: y, display: "flex", alignItems: "center", gap: 12, ...TX.kicker, color, whiteSpace: "nowrap" }}>
    <Icon name={icon} size={30} color={color} sw={3.8} />
    {text}
  </div>
);

// ── page 1 ────────────────────────────────────────────────────────────────────────────────────
const PW = 780;
const PH = 570;

const PromptCard: React.FC<{ f: number; start: number; typeAt: number; copyAt: number; pasteAt: number }> = ({ f, start, typeAt, copyAt, pasteAt }) => {
  const shown = typed(PROMPT, f, typeAt, 20);
  const done = f >= typeDone(PROMPT, typeAt, 20);
  const copied = eo(f, copyAt, 8);
  const play = 0.56 + 0.1 * lin(f, start, 520);
  const hint = sp(f, pasteAt, "snap");
  return (
    <Frame w={PW} h={PH} kind="plain" glow={0.55 * glowWin(f, typeAt, copyAt + 16, 0)}>
      {/* the video this prompt lies under */}
      <div style={{ position: "absolute", left: 34, top: 26, width: 712, height: 170, borderRadius: 16, background: C.bg, border: `1px solid ${C.line}`, overflow: "hidden" }}>
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            style={{ position: "absolute", left: 18 + i * 100, top: 0, width: 92, height: 170, background: `rgba(243,239,230,${0.025 + 0.02 * hash(i + 3)})` }}
          />
        ))}
        <div style={{ position: "absolute", left: 18, top: 16 }}>
          <Chip text="это видео" icon="video" tone="muted" size={24} />
        </div>
        <div
          style={{
            position: "absolute",
            left: 356 - 38,
            top: 44,
            width: 76,
            height: 76,
            borderRadius: 38,
            background: C.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
          }}
        >
          <Icon name="play" size={38} color={C.bg} style={{ marginLeft: 5 }} />
        </div>
        <div style={{ position: "absolute", left: 18, right: 18, bottom: 18, height: 8, borderRadius: 4, background: "rgba(243,239,230,0.12)" }}>
          <div style={{ width: `${play * 100}%`, height: 8, borderRadius: 4, background: C.accent }} />
          <div style={{ position: "absolute", left: `${play * 100}%`, top: -6, width: 20, height: 20, marginLeft: -10, borderRadius: 10, background: C.text }} />
        </div>
      </div>
      {/* under the video */}
      <div style={{ position: "absolute", left: 34, top: 212, display: "flex", alignItems: "center", gap: 12, ...TX.kicker, color: C.accent, whiteSpace: "nowrap" }}>
        <Icon name="arrow" size={28} color={C.accent} sw={4} style={{ transform: "rotate(90deg)" }} />
        под видео · промпт в одну строку
      </div>
      {/* the prompt */}
      <div
        style={{
          position: "absolute",
          left: 34,
          top: 256,
          width: 712,
          height: 180,
          boxSizing: "border-box",
          padding: "18px 22px",
          borderRadius: 16,
          background: C.surface2,
          border: `2px solid ${interpolateColors(copied, [0, 1], ["rgba(255,179,0,0.55)", "rgba(74,222,128,0.55)"])}`,
        }}
      >
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 36, lineHeight: 1.28, color: C.text }}>
          <span style={{ color: C.accent }}>«</span>
          {shown}
          {done && <span style={{ color: C.accent }}>»</span>}
          <Caret f={f} on={f < copyAt} solid={f >= typeAt && !done} />
        </div>
      </div>
      {/* copy → copied */}
      <div style={{ position: "absolute", left: 34, top: 466, display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ position: "relative" }}>
          <div style={{ opacity: 1 - copied }}>
            <Chip text="Копировать" icon="copy" tone="accent" size={28} />
          </div>
          {copied > 0 && (
            <div style={{ position: "absolute", left: 0, top: 0, opacity: copied }}>
              <Chip text="Скопировано" icon="check" tone="ok" size={28} />
            </div>
          )}
          <Ripple f={f} start={copyAt} size={90} color={C.ok} grow={1.4} />
        </div>
        <div style={{ ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap", marginLeft: 18, opacity: clamp01(hint * 1.6), transform: `translateX(${(1 - hint) * -16}px)` }}>
          → вставьте агенту
        </div>
      </div>
    </Frame>
  );
};

const AGENTS: { t: string; icon: IconName }[] = [
  { t: "Claude Code", icon: "bot" },
  { t: "Codex", icon: "terminal" },
  { t: "Antigravity", icon: "spark" },
];

const AgentsCard: React.FC<{ f: number; starts: number[]; anyAt: number; selfAt: number }> = ({ f, starts, anyAt, selfAt }) => (
  <Frame w={820} h={215} kind="plain" glow={0.5 * glowWin(f, starts[0], starts[0] + 24, 0)}>
    <Kicker icon="send" text="вставьте своему агенту" />
    <div style={{ position: "absolute", left: 34, top: 70, display: "flex", gap: 14 }}>
      {AGENTS.map((a, i) => (
        <In key={i} f={f} a={starts[i]} spr="pop" dy={18}>
          <Chip text={a.t} icon={a.icon} tone="surface" size={26} />
        </In>
      ))}
    </div>
    <div style={{ position: "absolute", left: 34, top: 140, display: "flex", alignItems: "center", gap: 18 }}>
      <In f={f} a={anyAt} spr="bouncy" dy={16}>
        <Chip text="или любому" icon="plus" tone="outline" size={26} />
      </In>
      <Verdict f={f} start={selfAt} text="дальше он сам" ok size={26} />
    </div>
  </Frame>
);

const REPO: { name: string; icon: IconName; desc: string }[] = [
  { name: "skills/", icon: "folder", desc: "скиллы агента" },
  { name: "scripts/", icon: "folder", desc: "программы" },
  { name: "guides/", icon: "folder", desc: "инструкции" },
  { name: "AGENTS.md", icon: "doc", desc: "инструкция агенту" },
];

const RepoCard: React.FC<{ f: number; start: number; skillsAt: number; guideAt: number; handAt: number }> = ({ f, start, skillsAt, guideAt, handAt }) => {
  const hand = eo(f, handAt, 12);
  return (
    <Frame w={820} h={325} kind="editor" title="репозиторий урока">
      {REPO.map((r, i) => {
        const a = start + 3 + i * 5;
        const p = sp(f, a, "snap");
        const scan = 0.55 * bump(f, a + 4, 16);
        const hl = Math.max(scan, i === 0 ? glowWin(f, skillsAt, guideAt, 0.15) : 0, i === 3 ? glowWin(f, guideAt, Infinity) : 0);
        const key = i === 3;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 24,
              right: 24,
              top: 18 + i * 57,
              height: 50,
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "0 16px",
              borderRadius: 12,
              background: `rgba(255,179,0,${0.13 * hl})`,
              boxShadow: hl > 0.01 ? `inset 4px 0 0 rgba(255,179,0,${0.9 * hl})` : undefined,
              opacity: clamp01(p * 1.6),
              transform: `translateX(${(1 - p) * -24}px)`,
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: 26, color: "rgba(154,160,170,0.55)" }}>{i < 3 ? "├─" : "└─"}</span>
            <Icon name={r.icon} size={30} color={C.accent} sw={3.6} />
            <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 28, color: C.text, whiteSpace: "nowrap" }}>{r.name}</span>
            <div style={{ position: "relative", marginLeft: "auto", width: 340, height: 34 }}>
              <span
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  ...TX.label,
                  fontSize: 26,
                  color: hl > 0.5 ? C.text : C.muted,
                  whiteSpace: "nowrap",
                  opacity: key ? 1 - hand : 1,
                }}
              >
                {r.desc}
              </span>
              {key && hand > 0 && (
                <span
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    ...TX.label,
                    fontSize: 26,
                    color: C.accent,
                    whiteSpace: "nowrap",
                    opacity: hand,
                    transform: `translateY(${(1 - hand) * 10}px)`,
                  }}
                >
                  <Icon name="hand" size={30} color={C.accent} sw={3.6} />
                  ведёт вас за ручку
                </span>
              )}
            </div>
          </div>
        );
      })}
    </Frame>
  );
};

// ── page 2: the three questions ─────────────────────────────────────────────────────────────────
const SW = 520;
const SH = 570;

const StepCard: React.FC<{
  f: number;
  a: number;
  n: number;
  icon: IconName;
  title: string;
  sub: string;
  spr: SprName;
  foot?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ f, a, n, icon, title, sub, spr, foot, children }) => (
  <Pop x={X0 + (n - 1) * 560} y={Y0} w={SW} h={SH} p={sp(f, a, spr)} from="below" d={56}>
    <Drift f={f} seed={n * 2.1}>
      <Frame w={SW} h={SH} kind="plain" glow={0.45 * glowWin(f, a, a + 30, 0)}>
        <div style={{ position: "absolute", left: 34, top: 26, display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              background: C.accent,
              color: C.bg,
              fontFamily: SANS,
              fontWeight: 900,
              fontSize: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {n}
          </div>
          <div style={{ ...TX.kicker, whiteSpace: "nowrap" }}>ВОПРОС {n}</div>
        </div>
        <div style={{ position: "absolute", right: 34, top: 22 }}>
          <IconTile icon={icon} size={64} />
        </div>
        <div style={{ position: "absolute", left: 34, top: 106, ...TX.title, fontSize: 34, whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ position: "absolute", left: 34, top: 156, ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap" }}>{sub}</div>
        <div
          style={{
            position: "absolute",
            left: 34,
            top: 214,
            width: 452,
            height: 226,
            borderRadius: 16,
            background: C.surface2,
            border: `1px solid ${C.line}`,
            overflow: "hidden",
          }}
        >
          {children}
        </div>
        <div style={{ position: "absolute", left: 34, top: 466, width: 452, height: 64, display: "flex", alignItems: "center" }}>{foot}</div>
      </Frame>
    </Drift>
  </Pop>
);

const KeyField: React.FC<{ f: number; start: number }> = ({ f, start }) => {
  const dots = "••••••••••••";
  const shown = typed(dots, f, start, 30);
  const doneAt = typeDone(dots, start, 30) + 4;
  const ok = eo(f, doneAt, 10);
  return (
    <div
      style={{
        width: 452,
        height: 64,
        boxSizing: "border-box",
        borderRadius: 14,
        background: C.surface2,
        border: `2px solid ${interpolateColors(ok, [0, 1], ["rgba(255,179,0,0.6)", "rgba(74,222,128,0.6)"])}`,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "0 14px 0 18px",
      }}
    >
      <Icon name="key" size={32} color={C.accent} sw={3.6} />
      <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 28, color: C.text, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
        {shown}
        <Caret f={f} on={f >= start - 6 && f < doneAt} solid />
      </span>
      <div style={{ marginLeft: "auto" }}>
        <CheckBadge f={f} start={doneAt} size={40} ring={false} />
      </div>
    </div>
  );
};

const VoicePlate: React.FC<{ f: number; recAt: number; doneAt: number }> = ({ f, recAt, doneAt }) => {
  const rp = eio(f, recAt, 34);
  const sec = Math.min(60, Math.floor(rp * 60));
  const N = 26;
  const step = 412 / N;
  const live = rp > 0 && rp < 1;
  return (
    <>
      <div style={{ position: "absolute", left: 20, top: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <Icon name="mic" size={32} color={C.accent} sw={3.6} />
        <span style={{ ...TX.label, fontSize: 26, whiteSpace: "nowrap" }}>запись голоса</span>
      </div>
      <div style={{ position: "absolute", right: 20, top: 18, fontFamily: MONO, fontWeight: 700, fontSize: 28, color: rp >= 1 ? C.accent : C.text }}>
        {`${Math.floor(sec / 60)}:${pad2(sec % 60)}`}
      </div>
      <svg width={412} height={84} style={{ position: "absolute", left: 20, top: 66, overflow: "visible" }}>
        {Array.from({ length: N }, (_, i) => {
          const lit = i / N < rp;
          const base = 0.3 + 0.7 * hash(i * 1.37 + 5);
          const wob = live && lit ? 0.6 + 0.4 * Math.abs(Math.sin(f * 0.33 + i * 1.1)) : 1;
          const h = 8 + 70 * base * (lit ? wob : 0.35);
          return <rect key={i} x={i * step + (step - 8) / 2} y={42 - h / 2} width={8} height={h} rx={4} fill={lit ? C.accent : "rgba(154,160,170,0.35)"} />;
        })}
      </svg>
      <In f={f} a={doneAt} spr="bouncy" style={{ position: "absolute", left: 20, top: 164 }}>
        <Chip text="клон голоса готов" icon="check" tone="ok" size={24} />
      </In>
    </>
  );
};

const FacePlate: React.FC<{ f: number; arrowAt: number }> = ({ f, arrowAt }) => {
  const a = eo(f, arrowAt, 14);
  const pf = sp(f, arrowAt + 10, "bouncy");
  const loop = f > arrowAt + 10 ? (((f - arrowAt - 10) / 36) % 1 + 1) % 1 : -1;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 30,
          top: 18,
          width: 140,
          height: 146,
          borderRadius: 14,
          background: C.raised,
          border: `1px solid ${C.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="user" size={96} color={C.muted} sw={3} />
      </div>
      <div style={{ position: "absolute", left: 30, top: 176, width: 140, textAlign: "center", ...TX.label, fontSize: 24, color: C.muted }}>фото</div>
      <svg width={452} height={226} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <ArrowPath x1={188} y1={91} x2={266} y2={91} p={a} width={5} />
      </svg>
      <div style={{ position: "absolute", left: 282, top: 18, width: 140, height: 146, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {loop >= 0 && (
          <div
            style={{
              position: "absolute",
              left: 5,
              top: 8,
              width: 130,
              height: 130,
              borderRadius: "50%",
              border: `3px solid ${C.accent}`,
              opacity: 0.6 * (1 - loop),
              transform: `scale(${1 + 0.24 * loop})`,
            }}
          />
        )}
        <div style={{ opacity: clamp01(pf * 1.6), transform: `translateY(${(1 - pf) * 16}px)` }}>
          <div
            style={{
              width: 130,
              height: 130,
              borderRadius: "50%",
              background: `radial-gradient(circle at 35% 30%, ${C.raised}, ${C.surface2})`,
              border: `3px solid ${C.accent}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="user" size={80} color={C.accent} sw={3.2} />
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 282, top: 176, width: 140, textAlign: "center", ...TX.label, fontSize: 24, color: C.accent, opacity: clamp01(pf * 1.6) }}>
        лицо
      </div>
    </>
  );
};

const OptRow: React.FC<{ y: number; name: string; sel: number; p: number }> = ({ y, name, sel, p }) => (
  <div
    style={{
      position: "absolute",
      left: 18,
      top: y,
      width: 416,
      height: 76,
      boxSizing: "border-box",
      borderRadius: 14,
      background: interpolateColors(clamp01(sel), [0, 1], [C.raised, "rgba(255,179,0,0.14)"]),
      border: `2px solid ${interpolateColors(clamp01(sel), [0, 1], ["rgba(243,239,230,0.09)", "rgba(255,179,0,0.9)"])}`,
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: "0 18px",
      opacity: clamp01(p * 1.6),
      transform: `translateX(${(1 - p) * 22}px)`,
    }}
  >
    <div
      style={{
        width: 30,
        height: 30,
        flex: "none",
        borderRadius: 15,
        border: `3px solid ${interpolateColors(clamp01(sel), [0, 1], [C.muted, C.accent])}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ width: 14, height: 14, borderRadius: 7, background: C.accent, opacity: clamp01((sel - 0.45) * 2.2) }} />
    </div>
    <span style={{ ...TX.label, fontSize: 28, whiteSpace: "nowrap" }}>{name}</span>
  </div>
);

// ── page 3: who does what + the start plan ───────────────────────────────────────────────────────
const BW = 1572;
const YOU: { t: string; icon: IconName }[] = [
  { t: "ключи", icon: "key" },
  { t: "фото", icon: "image" },
  { t: "голос", icon: "mic" },
  { t: "текст", icon: "doc" },
];

const ScaleCard: React.FC<{ f: number; a: number; fromAt: number; you: number[] }> = ({ f, a, fromAt, you }) => {
  const fill = eio(f, a + 6, 30);
  const youP = sp(f, a + 30, "bouncy");
  const txt = clamp01((fill - 0.3) / 0.25);
  return (
    <Frame w={1640} h={200} kind="plain" glow={0.4 * glowWin(f, fromAt, fromAt + 40, 0)}>
      <div style={{ position: "absolute", left: 34, top: 26, width: BW, height: 76, borderRadius: 20, background: "rgba(243,239,230,0.07)", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: BW * 0.95 * fill, height: 76, background: C.accent }} />
        <div style={{ position: "absolute", left: 28, top: 0, height: 76, display: "flex", alignItems: "center", gap: 18, opacity: txt, color: C.bg, whiteSpace: "nowrap" }}>
          <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 48 }}>{Math.round(95 * fill)}&nbsp;%</span>
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 30 }}>делает агент</span>
        </div>
        <div
          style={{
            position: "absolute",
            left: BW * 0.95 + 4,
            top: 0,
            width: BW * 0.05 - 4,
            height: 76,
            background: C.text,
            opacity: clamp01(youP * 1.6),
            transform: `translateX(${(1 - youP) * 30}px)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="user" size={40} color={C.bg} sw={4} />
        </div>
      </div>
      {/* legend */}
      <div style={{ position: "absolute", left: 34, top: 128, display: "flex", alignItems: "center", gap: 14, ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap" }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: C.accent }} />
        агент
        <div style={{ width: 22, height: 22, borderRadius: 6, background: C.text, marginLeft: 16 }} />
        вы
      </div>
      {/* your 5 % */}
      <div style={{ position: "absolute", right: 34, top: 118, height: 52, display: "flex", alignItems: "center", gap: 12 }}>
        <In f={f} a={a + 32} dx={-16} dy={0}>
          <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 30, color: C.text, whiteSpace: "nowrap", marginRight: 6 }}>5&nbsp;% — от вас:</span>
        </In>
        {YOU.map((y, i) => (
          <In key={i} f={f} a={you[i]} spr="pop" dy={16}>
            <Chip text={y.t} icon={y.icon} tone="surface" size={26} />
          </In>
        ))}
      </div>
    </Frame>
  );
};

const TASKS: { t: string; icon: IconName }[] = [
  { t: "ставит программы", icon: "box" },
  { t: "пишет код", icon: "code" },
  { t: "запускает", icon: "play" },
  { t: "проверяет кадрами", icon: "image" },
];

const WorkCard: React.FC<{ f: number; starts: number[] }> = ({ f, starts }) => {
  const all = f >= starts[3] + 16;
  return (
    <Frame w={1640} h={340} kind="plain">
      <Kicker icon="bot" text="агент делает сам" />
      <div style={{ position: "absolute", right: 34, top: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <StatusIcon s={all ? "ok" : "run"} f={f} size={34} />
        <span style={{ ...TX.label, fontSize: 24, color: all ? C.ok : C.muted, whiteSpace: "nowrap" }}>{all ? "проверено" : "работает"}</span>
      </div>
      {TASKS.map((t, i) => {
        const lit = eo(f, starts[i], 10);
        const col = i % 2;
        const row = Math.floor(i / 2);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 34 + col * 806,
              top: 78 + row * 120,
              width: 766,
              height: 100,
              boxSizing: "border-box",
              borderRadius: 16,
              background: interpolateColors(lit, [0, 1], [C.surface2, "rgba(255,179,0,0.09)"]),
              border: `2px solid ${interpolateColors(lit, [0, 1], ["rgba(243,239,230,0.07)", "rgba(255,179,0,0.55)"])}`,
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "0 22px 0 18px",
            }}
          >
            <IconTile
              icon={t.icon}
              size={64}
              color={interpolateColors(lit, [0, 1], [C.muted, C.accent])}
              bg={interpolateColors(lit, [0, 1], ["rgba(154,160,170,0.10)", "rgba(255,179,0,0.16)"])}
            />
            <span style={{ ...TX.label, fontSize: 32, color: interpolateColors(lit, [0, 1], [C.muted, C.text]), whiteSpace: "nowrap" }}>{t.t}</span>
            <div style={{ marginLeft: "auto" }}>
              <CheckBadge f={f} start={starts[i] + 10} size={52} />
            </div>
          </div>
        );
      })}
    </Frame>
  );
};

const PW3 = 520;
const PH3 = 340;

const ThreeMinCard: React.FC<{ f: number; a: number; notAt: number }> = ({ f, a, notAt }) => {
  const bar = eo(f, a + 6, 18);
  const pb = sp(f, a + 12, "snap");
  return (
    <Frame w={PW3} h={PH3} kind="plain">
      <Kicker icon="video" text="первый ролик" />
      <div style={{ position: "absolute", left: 34, top: 66, ...TX.title, fontSize: 64, color: C.accent, whiteSpace: "nowrap" }}>3 минуты</div>
      <div style={{ position: "absolute", left: 34, top: 186, height: 40, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 96 * bar, height: 26, borderRadius: 13, background: C.accent }} />
        <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, color: C.text, opacity: bar, whiteSpace: "nowrap" }}>3 мин</span>
        <CheckBadge f={f} start={a + 20} size={36} ring={false} />
      </div>
      <div style={{ position: "absolute", left: 34, top: 256, width: 452, height: 40, opacity: clamp01(pb * 1.6) }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: 40, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 300, height: 26, borderRadius: 13, background: "rgba(154,160,170,0.28)" }} />
          <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, color: C.muted, whiteSpace: "nowrap" }}>60 мин</span>
        </div>
        <div style={{ position: "absolute", left: 12, top: 0 }}>
          <Strike w={404} h={40} p={eo(f, notAt, 10)} flat width={6} />
        </div>
      </div>
    </Frame>
  );
};

const TimerCard: React.FC<{ f: number; a: number; daysAt: number; nothingAt: number; neverAt: number }> = ({ f, a, daysAt, nothingAt, neverAt }) => {
  const pin = eo(f, a + 2, 22);
  const left = pin * (1 - 0.22 * lin(f, a + 24, 330));
  const S = 190;
  const r = S / 2 - 7 - 2;
  const ang = -Math.PI / 2 + 2 * Math.PI * left;
  return (
    <Frame w={PW3} h={PH3} kind="plain">
      <Kicker icon="clock" text="правило 72 часов" />
      <div style={{ position: "absolute", left: 34, top: 92, width: S, height: S }}>
        <Ring size={S} p={left} width={14} />
        {pin > 0.05 && (
          <div
            style={{
              position: "absolute",
              left: S / 2 + r * Math.cos(ang) - 9,
              top: S / 2 + r * Math.sin(ang) - 9,
              width: 18,
              height: 18,
              borderRadius: 9,
              background: C.text,
              boxShadow: `0 0 0 4px ${C.surface}`,
            }}
          />
        )}
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 64, lineHeight: 1, color: C.accent }}>72</div>
          <div style={{ ...TX.label, fontSize: 24, color: C.muted, marginTop: 4 }}>часа</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 252, top: 112, display: "flex", flexDirection: "column", gap: 10 }}>
        <In f={f} a={daysAt} spr="pop">
          <div style={{ ...TX.title, fontSize: 44, whiteSpace: "nowrap" }}>3 дня</div>
        </In>
        <In f={f} a={nothingAt}>
          <div style={{ ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap" }}>без шага —</div>
        </In>
        <In f={f} a={neverAt}>
          <div style={{ ...TX.label, fontSize: 26, color: C.text, whiteSpace: "nowrap" }}>не вернётесь</div>
        </In>
      </div>
    </Frame>
  );
};

const CommunityCard: React.FC<{ f: number; a: number; sortAt: number; solveAt: number; dopaAt: number }> = ({ f, a, sortAt, solveAt, dopaAt }) => (
  <Frame w={PW3} h={PH3} kind="plain" glow={eo(f, a, 14) * (0.55 + 0.2 * Math.sin(f / 16))}>
    <div style={{ position: "absolute", left: 34, top: 26 }}>
      <IconTile icon="team" size={72} />
    </div>
    <div style={{ position: "absolute", left: 124, top: 28, ...TX.title, fontSize: 32, whiteSpace: "nowrap" }}>ProAI Community</div>
    <div style={{ position: "absolute", left: 124, top: 70, ...TX.label, fontSize: 24, color: C.muted, whiteSpace: "nowrap" }}>сообщество</div>
    <In f={f} a={a + 8} spr="pop" dx={20} dy={6} style={{ position: "absolute", right: 34, top: 122 }}>
      <Bubble me size={26} maxW={420}>
        Застрял — помогите
      </Bubble>
    </In>
    <In f={f} a={sortAt} spr="pop" dx={-20} dy={6} style={{ position: "absolute", left: 34, top: 196 }}>
      <Bubble size={26} maxW={420}>
        Разберём вместе!
      </Bubble>
    </In>
    <div style={{ position: "absolute", left: 34, top: 274 }}>
      <In f={f} a={solveAt} spr="bouncy">
        <div style={{ position: "relative" }}>
          <Chip text="решили → дофамин" icon="spark" tone="outline" size={24} />
          <Burst f={f} start={dopaAt} r0={70} r1={130} n={10} />
        </div>
      </In>
    </div>
  </Frame>
);

// ── the scene ───────────────────────────────────────────────────────────────────────────────────
export const Repeat: React.FC<SceneProps> = ({ f, b, t0, w }) => {
  const [bPrompt, bAgents, bRepo, bEleven, bKie, bRender, bScale, bThree, bTimer, bComm] = b;

  const P1OUT = bEleven - 14;
  const P2OUT = bScale - 12;
  const P3OUT = bThree - 12;

  // words of the section
  const wType = w("прочитай");
  const wCopy = w("копируете");
  const wPaste = w("вставляете");
  const wAgents = [bAgents + 4, Math.max(bAgents + 10, w("codex")), Math.max(bAgents + 16, w("antigravity"))];
  const wAny = w("любому");
  const wSelf = w("дальше");
  const wSkills = w("скиллы");
  const wGuide = w("инструкция");
  const wHand = w("вести");
  const wVoice = w("голос", 717);
  const wRecord = w("записи", 718);
  const wFace = w("лица");
  const wHF = w("hugging");
  const wModal = w("modal");
  const wConnect = w("подключит");
  const wTasks = [w("ставит"), w("пишет"), w("запускает"), w("проверяет")];
  const wFrom = w("от", 735);
  const wYou = [w("ключи", 735), w("фотографии"), w("голос", 737.5), w("текст")];
  const wNot = w("часового");
  const wDays = w("три", 744);
  const wNothing = w("ничего");
  const wNever = w("вернётесь");
  const wSort = w("разберём");
  const wSolve = w("решите");
  const wDopa = w("дофамина");

  // header
  const heads: Head[] = [
    { a: t0, kicker: "практика · один промпт", title: "Один промпт — дальше агент ведёт сам" },
    { a: bEleven - 4, kicker: "дальше агент спросит", title: "Три вопроса — и он всё подключит сам" },
    { a: bScale - 2, kicker: "разделение труда", title: "95 % делает агент — от вас только 5 %" },
    { a: bThree - 2, kicker: "как не бросить", title: "Начните с малого — и не застревайте" },
  ];
  const s2 = eo(f, bEleven - 6, 12);
  const s3 = eo(f, bScale - 6, 12);
  const act = [1 - s2, s2 * (1 - s3), s3];

  // page 1 geometry: the prompt card waits on the right while the left corner is busy, then glides left
  const glide = sp(f, CORNER_END, "soft");
  const promptX = mix(860, X0, glide);
  const AX = 960;
  const AY = 250;
  const RY = 495;
  const fly = eio(f, wPaste, Math.max(8, bAgents + 2 - wPaste));

  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080 }}>
      <Header f={f} heads={heads} act={act} p={eo(f, t0, 14)} />

      {/* ═══ page 1: prompt → agent → repository ═══ */}
      <Page f={f} out={P1OUT}>
        <Pop x={promptX} y={Y0} w={PW} h={PH} p={sp(f, bPrompt, "pop")} from="right" d={60}>
          <Drift f={f} seed={1}>
            <PromptCard f={f} start={bPrompt} typeAt={wType} copyAt={wCopy} pasteAt={wPaste} />
          </Drift>
        </Pop>
        <Pop x={AX} y={AY} w={820} h={215} p={sp(f, bAgents, "snap")} from="right" d={60}>
          <Drift f={f} seed={2}>
            <AgentsCard f={f} starts={wAgents} anyAt={wAny} selfAt={wSelf} />
          </Drift>
        </Pop>
        <div style={{ position: "absolute", left: AX, top: AY, width: 820, height: 215 }}>
          <Ripple f={f} start={bAgents + 2} size={170} grow={0.9} />
        </div>
        <Pop x={AX} y={RY} w={820} h={325} p={sp(f, bRepo, "heavy")} from="below" d={60}>
          <Drift f={f} seed={3}>
            <RepoCard f={f} start={bRepo} skillsAt={wSkills} guideAt={wGuide} handAt={wHand} />
          </Drift>
        </Pop>
        <Flyer t={fly} ax={promptX + 34 + 130} ay={Y0 + 466 + 27} bx={AX + 410} by={AY + 108} arc={130}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              height: 50,
              padding: "0 20px 0 14px",
              borderRadius: 25,
              background: C.accent,
              color: C.bg,
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 24,
              whiteSpace: "nowrap",
              boxShadow: "0 14px 34px rgba(0,0,0,0.45)",
            }}
          >
            <Icon name="copy" size={28} color={C.bg} sw={4} />
            промпт
          </div>
        </Flyer>
      </Page>

      {/* ═══ page 2: the agent asks three things ═══ */}
      <Page f={f} out={P2OUT}>
        <Ghost f={f} a={bEleven + 2} z={bKie} x={X0 + 560} y={Y0} w={SW} h={SH} n={2} icon="key" />
        <Ghost f={f} a={bEleven + 5} z={bRender} x={X0 + 1120} y={Y0} w={SW} h={SH} n={3} icon="server" />
        <StepCard f={f} a={bEleven} n={1} icon="key" title="Ключ ElevenLabs" sub="голос — с минутной записи" spr="pop" foot={<KeyField f={f} start={bEleven + 10} />}>
          <VoicePlate f={f} recAt={wVoice} doneAt={wRecord + 8} />
        </StepCard>
        <StepCard f={f} a={bKie} n={2} icon="key" title="Ключ Kie AI" sub="ваше фото → живое лицо" spr="heavy" foot={<KeyField f={f} start={bKie + 10} />}>
          <FacePlate f={f} arrowAt={wFace} />
        </StepCard>
        <StepCard
          f={f}
          a={bRender}
          n={3}
          icon="server"
          title="Где рендерить?"
          sub="выбор за вами"
          spr="snap"
          foot={<Verdict f={f} start={wConnect} text="подключит сам" ok size={28} />}
        >
          <OptRow y={18} name="Hugging Face PRO" sel={glowWin(f, wHF, wModal, 0.35)} p={sp(f, bRender + 8, "snap")} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 98, textAlign: "center", ...TX.label, fontSize: 24, color: C.muted, opacity: eo(f, bRender + 12, 10) }}>
            или
          </div>
          <OptRow y={132} name="Modal" sel={glowWin(f, wModal, wConnect, 0.35)} p={sp(f, bRender + 14, "snap")} />
        </StepCard>
      </Page>

      {/* ═══ page 3: 95 / 5, then the start plan ═══ */}
      <Pop x={X0} y={Y0} w={1640} h={200} p={sp(f, bScale, "snap")} from="below" d={40}>
        <Drift f={f} seed={6}>
          <ScaleCard f={f} a={bScale} fromAt={wFrom} you={wYou} />
        </Drift>
      </Pop>
      <Page f={f} out={P3OUT}>
        <Pop x={X0} y={480} w={1640} h={340} p={sp(f, bScale + 10, "heavy")} from="below" d={60}>
          <Drift f={f} seed={7}>
            <WorkCard f={f} starts={wTasks} />
          </Drift>
        </Pop>
      </Page>
      <Ghost f={f} a={bThree + 2} z={bTimer} x={X0 + 560} y={480} w={PW3} h={PH3} icon="clock" />
      <Ghost f={f} a={bThree + 5} z={bComm} x={X0 + 1120} y={480} w={PW3} h={PH3} icon="team" />
      <Pop x={X0} y={480} w={PW3} h={PH3} p={sp(f, bThree, "pop")} from="below" d={50}>
        <Drift f={f} seed={8}>
          <ThreeMinCard f={f} a={bThree} notAt={wNot} />
        </Drift>
      </Pop>
      <Pop x={X0 + 560} y={480} w={PW3} h={PH3} p={sp(f, bTimer, "heavy")} from="below" d={50}>
        <Drift f={f} seed={9}>
          <TimerCard f={f} a={bTimer} daysAt={wDays} nothingAt={wNothing} neverAt={wNever} />
        </Drift>
      </Pop>
      <Pop x={X0 + 1120} y={480} w={PW3} h={PH3} p={sp(f, bComm, "bouncy")} from="below" d={50}>
        <Drift f={f} seed={10}>
          <CommunityCard f={f} a={bComm} sortAt={wSort} solveAt={wSolve} dopaAt={wDopa} />
        </Drift>
      </Pop>
    </div>
  );
};
