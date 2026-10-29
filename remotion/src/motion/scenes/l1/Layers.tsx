import React from "react";
import { interpolateColors } from "remotion";
import { C, MONO, SANS, textWidth } from "../../../theme";
import { bump, clamp01, ei, eio, eo, float, hash, mix, shake, sp } from "../../anim";
import { Icon, IconName } from "../../icons";
import { Caret, Roll } from "../../text";
import { SceneProps } from "../../types";
import { Bubble, CheckBadge, Chip, Frame, Pop, shadow, Strike, TX } from "../../ui";
import { Burst } from "../../viz";
import { CrossBadge, IconTile } from "../kit";

// «Главная ошибка» (раздел 2, голос 82,48–126,56 с). Лицо F03 во весь экран 87,84–94,20 — чат его переживает.
// Чат «сделай мне красивый ролик» → плашка «ИИ мыслит кодом»: картинка рассыпается в JSON с таймингами,
// хрустальный шар перечёркнут → слоёный пирожок, слои подписываются по словам (сценарий → … → музыка),
// «отдельно» — слои расходятся, «великолепно» — галочка-вишенка → «кашу»: слева пирог ✓, справа куча ✗ →
// «дообучение»: у каждого слоя бейджи «инструмент · документация · нюансы».

/** Элемент живёт до своего следующего бита: плавный уход за `dur` кадров; без следующего бита не гаснет. */
const safeExitAlpha = (f: number, bNext?: number, dur = 10) =>
  bNext === undefined || !Number.isFinite(bNext) ? 1 : 1 - ei(f, bNext, dur);

const typedN = (len: number, f: number, start: number, cps: number) => Math.max(0, Math.min(len, Math.floor(((f - start) * cps) / 30)));

// ── header ───────────────────────────────────────────────────────────────────────────────────────────────
const HEAD = [
  { k: "ТИПИЧНЫЙ СТАРТ", t: "Как делает большинство" },
  { k: "КАК ДУМАЕТ ИИ", t: "Для агента видео — это код" },
  { k: "СЛОЁНЫЙ ПИРОЖОК", t: "Делим задачу на слои" },
  { k: "ДВА ПУТИ", t: "По слоям — или каша" },
  { k: "ДООБУЧЕНИЕ", t: "Каждый слой — отдельное дообучение" },
];

// ── the pie ──────────────────────────────────────────────────────────────────────────────────────────────
type LayerDef = { name: string; icon: IconName; fill: string };
const LAYERS: LayerDef[] = [
  { name: "сценарий", icon: "doc", fill: "#C48B06" },
  { name: "голос", icon: "mic", fill: "#F3EFE6" },
  { name: "лицо", icon: "user", fill: "#FFB300" },
  { name: "графика", icon: "image", fill: "#D8D5CD" },
  { name: "субтитры", icon: "chat", fill: "#E2A003" },
  { name: "музыка", icon: "wave", fill: "#F3EFE6" },
];
const LH = 64; // layer pitch
const YBOT = 750; // top of the plate = bottom of the lowest layer
const GAP = 10; // extra gap per layer when the pie opens on «отдельно»
const LABEL_FONT = `700 36px ${SANS}`;
const labelW = (name: string) => 46 + 14 + 38 + 12 + textWidth(name, LABEL_FONT);

// «каша»: where each layer lands in the heap (card-local, centre 400 / 360)
const PILE = [
  { dx: -150, dy: 120, r: -14 },
  { dx: 130, dy: 105, r: 17 },
  { dx: -30, dy: 50, r: 6 },
  { dx: 150, dy: 0, r: -21 },
  { dx: -160, dy: -10, r: 24 },
  { dx: 30, dy: -70, r: -9 },
];

const COLS: { t: string; icon: IconName }[] = [
  { t: "инструмент", icon: "wrench" },
  { t: "документация", icon: "book" },
  { t: "нюансы", icon: "bulb" },
];
const colX = (j: number) => 1040 + j * 280;

// ── the «video picture» that dissolves into JSON (440×248) ──────────────────────────────────────────────
const PIC_W = 440;
const PIC_H = 248;
const TC = 11;
const TR = 8;
const TW = PIC_W / TC; // 40
const TH = PIC_H / TR; // 31
const PictureArt: React.FC = () => (
  <>
    <rect x={0} y={0} width={PIC_W} height={PIC_H} rx={16} fill={C.surface2} />
    <rect x={28} y={34} width={190} height={22} rx={11} fill={C.accent} />
    <rect x={28} y={68} width={130} height={14} rx={7} fill="rgba(243,239,230,0.45)" />
    {[46, 70, 38, 92, 60].map((h, k) => (
      <rect key={k} x={32 + k * 30} y={176 - h} width={20} height={h} rx={5} fill={k === 3 ? C.accent : "rgba(243,239,230,0.28)"} />
    ))}
    <rect x={258} y={28} width={146} height={146} rx={18} fill={C.raised} stroke="rgba(255,179,0,0.6)" strokeWidth={3} />
    <circle cx={331} cy={84} r={26} fill="rgba(243,239,230,0.6)" />
    <path d="M276 174 Q278 122 331 118 Q384 122 386 174 Z" fill="rgba(243,239,230,0.6)" />
    <rect x={70} y={192} width={300} height={32} rx={10} fill="rgba(0,0,0,0.6)" />
    <rect x={92} y={203} width={170} height={10} rx={5} fill={C.text} />
    <rect x={272} y={203} width={76} height={10} rx={5} fill={C.accent} />
    <rect x={0} y={240} width={PIC_W} height={8} fill="rgba(243,239,230,0.12)" />
    <rect x={0} y={240} width={160} height={8} fill={C.accent} />
  </>
);

/** A crooked «one pass» result thumbnail (280×158). */
const MessyPic: React.FC<{ jit: number }> = ({ jit }) => (
  <svg width={280} height={158} viewBox="0 0 280 158" style={{ display: "block", borderRadius: 12 }}>
    <rect width={280} height={158} rx={12} fill={C.bg} stroke="rgba(243,239,230,0.12)" strokeWidth={2} />
    <g transform={`translate(${jit} 0)`}>
      <rect x={146} y={16} width={104} height={96} rx={10} fill={C.raised} transform="rotate(9 198 64)" />
      <circle cx={204} cy={50} r={17} fill="rgba(243,239,230,0.5)" />
      <rect x={18} y={20} width={150} height={16} rx={8} fill={C.accent} transform="rotate(-7 93 28)" />
      <rect x={34} y={66} width={220} height={26} rx={7} fill="rgba(0,0,0,0.65)" transform="rotate(5 144 79)" />
      <rect x={50} y={75} width={124} height={8} rx={4} fill={C.text} transform="rotate(5 144 79)" />
      <rect x={-24} y={116} width={190} height={14} rx={7} fill="rgba(255,179,0,0.55)" transform="rotate(-4 71 123)" />
      <circle cx={246} cy={128} r={24} fill="rgba(255,179,0,0.3)" />
      <rect x={96} y={40} width={60} height={60} rx={6} fill="rgba(243,239,230,0.14)" transform="rotate(-18 126 70)" />
    </g>
  </svg>
);

// JSON rows: real words of this section with their voice timings
const ROWS: [string, string, string][] = [
  ["ИИ", "95.36", "95.68"],
  ["мыслит", "95.80", "96.16"],
  ["кодом", "96.24", "96.76"],
  ["видео", "97.28", "97.64"],
  ["строки", "98.00", "98.52"],
  ["JSON", "98.56", "99.04"],
];
const TK = { p: C.muted, k: "#FFD27A", s: "#F3D9A4", n: "#FFC94D" };

export const Layers: React.FC<SceneProps> = ({ f, b, t0, w }) => {
  const [bChat, bRule, bLines, bTele, bPie, bScript, bVoice, bFace, bGfx, bSubs, bMush, bTrain] = b;
  const wWrite = w("пишет");
  const wYes = w("да", 88);
  const wSlap = w("лепит");
  const wPass = w("проход");
  const wAsIs = w("как", 93);
  const wAI = w("ии", 95);
  const wThink = w("мыслит");
  const wCode = w("кодом");
  const wJson = w("json");
  const wTimes = w("тайминги");
  const wPic = w("картинка");
  const wExplain = w("объясните");
  const wSep = w("отдельно");
  const wGreat = w("великолепно");
  const wAll = w("всё", 118);
  const wAtOnce = w("сразу", 118);
  const wMusic = Math.max(bSubs + 8, w("музыка"));
  const colAt = [w("инструменты"), w("документация"), w("нюансы")];
  const labAt = [bScript, bVoice, bFace, bGfx, bSubs, wMusic];
  const ph = [t0, bRule, bPie, bMush, bTrain];

  // ═══ header: kicker + title (≤ 38 px) and a chip; rows swap through masks ═══
  const nLab = labAt.reduce((a, at) => a + eo(f, at, 10), 0);
  const chipA = sp(f, bChat + 6, "snap") * safeExitAlpha(f, bRule, 8);
  const chipB = sp(f, bRule + 8, "snap") * safeExitAlpha(f, bPie, 8);
  const chipC = sp(f, bPie + 8, "snap");
  const header = (
    <div style={{ position: "absolute", left: 140, top: 130, width: 1640, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div style={{ position: "relative", width: 1180, height: 80 }}>
        {HEAD.map((h, i) => {
          const inP = eo(f, i === 0 ? t0 : ph[i] + 8, 16);
          const outP = i < HEAD.length - 1 ? eio(f, ph[i + 1], 8) : 0;
          if (inP <= 0 || outP >= 1) return null;
          return (
            <div key={i} style={{ position: "absolute", left: 0, top: 0, width: 1180 }}>
              <div style={{ overflow: "hidden", height: 30 }}>
                <div style={{ ...TX.kicker, color: C.accent, fontSize: 24, whiteSpace: "nowrap", transform: `translateY(${(1 - inP) * 105 - outP * 105}%)` }}>{h.k}</div>
              </div>
              <div style={{ overflow: "hidden", height: 46, marginTop: 4 }}>
                <div style={{ ...TX.title, fontSize: 38, whiteSpace: "nowrap", transform: `translateY(${(1 - inP) * 112 - outP * 112}%)` }}>{h.t}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "relative", width: 420, height: 54 }}>
        {chipA > 0.002 && (
          <div style={{ position: "absolute", right: 0, top: 0, opacity: Math.min(1, chipA * 1.6), transform: `translateY(${(1 - chipA) * -16}px)` }}>
            <Chip text="один промпт на всё" icon="chat" tone="muted" size={26} />
          </div>
        )}
        {chipB > 0.002 && (
          <div style={{ position: "absolute", right: 0, top: 0, opacity: Math.min(1, chipB * 1.6), transform: `translateY(${(1 - chipB) * -16}px)` }}>
            <Chip text="ИИ = код" icon="code" tone="outline" size={26} />
          </div>
        )}
        {chipC > 0.002 && (
          <div style={{ position: "absolute", right: 0, top: 0, opacity: Math.min(1, chipC * 1.6), transform: `translateY(${(1 - chipC) * -16}px)` }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 11,
                height: 50,
                padding: "0 20px 0 15px",
                borderRadius: 26,
                background: "rgba(255,179,0,0.08)",
                border: "2px solid rgba(255,179,0,0.65)",
                color: C.accent,
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: 26,
                whiteSpace: "nowrap",
              }}
            >
              <Icon name="layers" size={30} color={C.accent} sw={4} />
              <span>слоёв:</span>
              <Roll v={Math.min(6, nLab)} style={{ fontFamily: MONO }} />
              <span>из 6</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ═══ phase A: the chat — «сделай мне красивый ролик с субтитрами» (survives the full-frame face) ═══
  // Empty chat: «Чем помочь?» + a big input in the middle, the message types there → sent → bubble on top.
  const MSG = "сделай мне красивый ролик с субтитрами";
  const nMsg = typedN(MSG.length, f, wWrite, 16);
  const sendAt = wWrite + Math.ceil((MSG.length * 30) / 16) + 4;
  const chatP = sp(f, bChat, "pop");
  const chatQ = ei(f, bRule, 9);
  const heroA = 1 - eo(f, sendAt, 8);
  const ubP = sp(f, sendAt, "snap");
  const barP = eo(f, sendAt + 4, 10);
  const abP = sp(f, wYes, "pop");
  const resP = sp(f, wSlap - 6, "pop");
  const passP = eo(f, wSlap, Math.max(10, wPass - wSlap));
  const asIsP = sp(f, wAsIs, "bouncy");
  const sendGlow = f < sendAt ? (nMsg >= MSG.length ? 1 : 0.35) : 0;
  const chat =
    chatQ < 1 && chatP > 0.002 ? (
      <Pop x={240} y={250} w={1440} h={570} p={chatP} q={chatQ} s0={0.95} d={50}>
        <Frame w={1440} h={570} kind="chat" title="ИИ-агент" sub="онлайн" icon="bot">
          {heroA > 0 && (
            <div style={{ position: "absolute", inset: 0, opacity: heroA, transform: `translateY(${(1 - heroA) * 30}px)` }}>
              <div style={{ position: "absolute", left: 0, right: 0, top: 104, display: "flex", justifyContent: "center", alignItems: "center", gap: 18 }}>
                <IconTile icon="bot" size={72} />
                <span style={{ ...TX.title, fontSize: 48, whiteSpace: "nowrap" }}>Чем помочь?</span>
              </div>
              <div
                style={{
                  position: "absolute",
                  left: 170,
                  top: 230,
                  width: 1100,
                  height: 96,
                  borderRadius: 28,
                  background: C.surface2,
                  border: `2px solid ${f >= wWrite ? "rgba(255,179,0,0.7)" : C.line}`,
                  boxShadow: f >= wWrite ? "0 0 0 6px rgba(255,179,0,0.08), 0 20px 40px rgba(0,0,0,0.3)" : "0 20px 40px rgba(0,0,0,0.3)",
                }}
              >
                <div style={{ position: "absolute", left: 34, top: 0, height: 96, display: "flex", alignItems: "center", fontFamily: SANS, fontWeight: 700, fontSize: 36, whiteSpace: "nowrap" }}>
                  {nMsg > 0 ? (
                    <span style={{ color: C.text }}>{MSG.slice(0, nMsg)}</span>
                  ) : (
                    <span style={{ color: C.muted, fontWeight: 600 }}>Напишите задачу агенту…</span>
                  )}
                  {f >= wWrite - 10 && <Caret f={f} solid={nMsg > 0 && nMsg < MSG.length} />}
                </div>
                <div
                  style={{
                    position: "absolute",
                    right: 16,
                    top: 16,
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    background: interpolateColors(sendGlow, [0, 1], [C.raised, C.accent]),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: sendGlow >= 1 ? `0 0 0 ${4 + 6 * bump(f, sendAt - 6, 10)}px rgba(255,179,0,0.25)` : undefined,
                  }}
                >
                  <Icon name="send" size={34} color={sendGlow >= 1 ? C.bg : C.muted} sw={3.8} />
                </div>
              </div>
            </div>
          )}
          {ubP > 0.002 && (
            <div style={{ position: "absolute", right: 36, top: 22, opacity: Math.min(1, ubP * 1.7), transform: `translateY(${(1 - ubP) * 120}px)` }}>
              <Bubble me size={32} maxW={1200}>
                <span style={{ whiteSpace: "nowrap" }}>{MSG}</span>
              </Bubble>
            </div>
          )}
          {abP > 0.002 && (
            <div style={{ position: "absolute", left: 36, top: 112, opacity: Math.min(1, abP * 1.7), transform: `translateY(${(1 - abP) * 26}px)` }}>
              <Bubble size={30} maxW={1100} name="агент">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 12, whiteSpace: "nowrap" }}>
                  <Icon name="zap" size={30} color={C.accent} />
                  Да, сейчас! Леплю всё за один проход
                </span>
              </Bubble>
            </div>
          )}
          {resP > 0.002 && (
            <div
              style={{
                position: "absolute",
                left: 36,
                top: 234,
                width: 1100,
                height: 180,
                borderRadius: 18,
                background: C.surface2,
                border: `1px solid ${C.line}`,
                opacity: Math.min(1, resP * 1.7),
                transform: `translateY(${(1 - resP) * 30}px)`,
              }}
            >
              <div style={{ position: "absolute", left: 20, top: 16, width: 262, height: 148, overflow: "hidden", borderRadius: 12 }}>
                <div style={{ transform: "scale(0.935)", transformOrigin: "0 0" }}>
                  <MessyPic jit={shake(f, wSlap + 4, 5, 40)} />
                </div>
              </div>
              <div style={{ position: "absolute", left: 312, top: 18, fontFamily: MONO, fontWeight: 700, fontSize: 30, color: C.text, whiteSpace: "nowrap" }}>ролик_final.mp4</div>
              <div style={{ position: "absolute", left: 312, top: 70, width: 640, height: 22, borderRadius: 11, background: "rgba(243,239,230,0.08)", overflow: "hidden" }}>
                <div style={{ width: `${passP * 100}%`, height: "100%", background: C.muted }} />
              </div>
              <div style={{ position: "absolute", left: 972, top: 62, fontFamily: MONO, fontWeight: 700, fontSize: 28, color: C.muted, whiteSpace: "nowrap" }}>
                {Math.round(passP * 100)}%
              </div>
              <div style={{ position: "absolute", left: 312, top: 116, ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap" }}>за один проход</div>
              {asIsP > 0.002 && (
                <div style={{ position: "absolute", left: 540, top: 106, opacity: Math.min(1, asIsP * 1.6), transform: `translateX(${(1 - asIsP) * -20}px)` }}>
                  <Chip text="ну… как есть" icon="warn" tone="muted" size={24} />
                </div>
              )}
            </div>
          )}
          {barP > 0 && (
            <div
              style={{
                position: "absolute",
                left: 36,
                top: 432,
                width: 1368,
                height: 62,
                borderRadius: 22,
                background: C.surface2,
                border: `1px solid ${C.line}`,
                opacity: barP,
                display: "flex",
                alignItems: "center",
                padding: "0 26px",
                fontFamily: SANS,
                fontWeight: 600,
                fontSize: 26,
                color: C.muted,
                whiteSpace: "nowrap",
              }}
            >
              Напишите задачу агенту…
            </div>
          )}
        </Frame>
      </Pop>
    ) : null;

  // ═══ phase B: rule plate «ИИ мыслит кодом» + picture → JSON + crossed crystal ball ═══
  const plateP = sp(f, bRule + 4, "stamp");
  const outB = ei(f, bPie, 8);
  const RULE = [
    { t: "ИИ", at: Math.max(bRule + 8, wAI), hl: false },
    { t: "мыслит", at: Math.max(bRule + 12, wThink), hl: false },
    { t: "кодом", at: Math.max(bRule + 16, wCode), hl: true },
  ];
  const plate =
    plateP > 0.002 && outB < 1 ? (
      <Pop x={140} y={250} w={1640} h={180} p={plateP} q={outB} s0={1.06} d={0}>
        <div
          style={{
            position: "relative",
            width: 1640,
            height: 180,
            borderRadius: 24,
            background: C.surface,
            border: "2px solid rgba(255,179,0,0.55)",
            boxShadow: shadow(0.35 + 0.5 * bump(f, wCode, 24)),
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", left: 34, top: 32 }}>
            <IconTile icon="code" size={116} />
          </div>
          <div style={{ position: "absolute", left: 184, top: 26, ...TX.kicker, color: C.accent, fontSize: 26, whiteSpace: "nowrap" }}>ЗАПОМНИТЕ</div>
          <div style={{ position: "absolute", left: 184, top: 66, display: "flex", gap: 24 }}>
            {RULE.map((r, i) => {
              const rr = eo(f, r.at, 14);
              const ul = eo(f, r.at + 8, 12);
              return (
                <div key={i} style={{ position: "relative", overflow: "hidden", padding: "0.1em 0.04em 0.18em", margin: "-0.1em -0.04em -0.18em" }}>
                  <div style={{ ...TX.title, fontSize: 76, color: r.hl ? C.accent : C.text, whiteSpace: "nowrap", transform: `translateY(${(1 - rr) * 115}%)` }}>{r.t}</div>
                  {r.hl && (
                    <div style={{ position: "absolute", left: 4, right: 4, bottom: 4, height: 6, borderRadius: 3, background: C.accent, transformOrigin: "0 50%", transform: `scaleX(${ul})` }} />
                  )}
                </div>
              );
            })}
          </div>
          <div
            style={{
              position: "absolute",
              right: 64,
              top: 18,
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 120,
              lineHeight: 1.1,
              color: "rgba(255,179,0,0.22)",
              whiteSpace: "nowrap",
              transform: `translateY(${float(f, 3, 4, 80)}px)`,
            }}
          >
            {"{"}
            <span style={{ fontSize: 80, verticalAlign: "0.12em" }}>
              <Caret f={f} color="rgba(255,179,0,0.55)" />
            </span>
            {"}"}
          </div>
        </div>
      </Pop>
    ) : null;

  // picture card (left): picture → tiles fly into the JSON → ghost «картинка» ✗ → crystal ball ✗
  const picP = sp(f, bRule + 14, "pop");
  const ghostA = eo(f, bLines + 14, 14) * safeExitAlpha(f, bTele, 6);
  const picStrike = eo(f, wPic + 6, 10);
  const kick1 = safeExitAlpha(f, bTele, 6);
  const kick2 = eo(f, bTele + 6, 10);
  const ballP = sp(f, bTele + 6, "pop");
  const ballStrike = eo(f, bTele + 16, 10);
  const ballShake = shake(f, bTele + 20, 9, 16);
  const teleP = eo(f, bTele + 10, 14);
  const picCard =
    picP > 0.002 && outB < 1 ? (
      <Pop x={140} y={460} w={560} h={360} p={picP} q={outB} from="below">
        <Frame w={560} h={360} kind="plain">
          {kick1 > 0 && (
            <div style={{ position: "absolute", left: 28, top: 24, ...TX.kicker, fontSize: 24, opacity: kick1, whiteSpace: "nowrap" }}>ВЫ ВИДИТЕ КАРТИНКУ</div>
          )}
          {kick2 > 0 && (
            <div style={{ position: "absolute", left: 28, top: 24, ...TX.kicker, fontSize: 24, color: C.accent, opacity: kick2, whiteSpace: "nowrap" }}>
              ИИ НЕ ЧИТАЕТ МЫСЛИ
            </div>
          )}
          {f < bLines ? (
            <svg width={PIC_W} height={PIC_H} viewBox={`0 0 ${PIC_W} ${PIC_H}`} style={{ position: "absolute", left: 60, top: 80, overflow: "visible" }}>
              <PictureArt />
            </svg>
          ) : (
            Array.from({ length: TC * TR }, (_, n) => {
              const c = n % TC;
              const r = Math.floor(n / TC);
              const k = ei(f, bLines + c * 2 + hash(r * 13 + c) * 6, 16);
              if (k >= 1) return null;
              const tx = k * (240 + 200 * hash(c * 7 + r));
              const ty = k * ((hash(r * 3 + c * 5) - 0.5) * 150);
              const rot = k * (hash(c + r * 17) - 0.5) * 120;
              return (
                <svg
                  key={n}
                  width={TW}
                  height={TH}
                  viewBox={`${c * TW} ${r * TH} ${TW} ${TH}`}
                  style={{
                    position: "absolute",
                    left: 60 + c * TW,
                    top: 80 + r * TH,
                    opacity: 1 - k,
                    transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${1 - 0.45 * k})`,
                  }}
                >
                  <PictureArt />
                </svg>
              );
            })
          )}
          {ghostA > 0 && (
            <div
              style={{
                position: "absolute",
                left: 60,
                top: 80,
                width: PIC_W,
                height: PIC_H,
                borderRadius: 16,
                border: "3px dashed rgba(154,160,170,0.5)",
                opacity: ghostA,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {f >= wPic && (
                <div style={{ position: "relative", opacity: eo(f, wPic, 8) }}>
                  <div style={{ ...TX.title, fontSize: 48, color: C.muted, whiteSpace: "nowrap" }}>картинка</div>
                  <Strike w={230} h={52} p={picStrike} flat width={7} />
                </div>
              )}
            </div>
          )}
          {ballP > 0.002 && (
            <>
              <div style={{ position: "absolute", left: 50, top: 86, opacity: Math.min(1, ballP * 1.7), transform: `translate(${ballShake}px, ${(1 - ballP) * 40}px)` }}>
                <svg width={220} height={240} viewBox="0 0 220 240" style={{ display: "block", overflow: "visible" }}>
                  <defs>
                    <radialGradient id="l1lyOrb" cx="38%" cy="34%" r="72%">
                      <stop offset="0" stopColor="rgba(255,179,0,0.6)" />
                      <stop offset="0.55" stopColor="rgba(255,179,0,0.2)" />
                      <stop offset="1" stopColor="rgba(46,52,66,0.95)" />
                    </radialGradient>
                  </defs>
                  <path d="M66 196 L154 196 L176 234 L44 234 Z" fill={C.raised} stroke="rgba(243,239,230,0.14)" strokeWidth={2} />
                  <rect x={58} y={188} width={104} height={14} rx={7} fill={C.surface2} />
                  <circle cx={110} cy={104} r={86} fill="url(#l1lyOrb)" stroke="rgba(255,179,0,0.65)" strokeWidth={3} />
                  <g transform={`rotate(${f * 1.6} 110 104)`}>
                    <path d="M70 104 Q90 70 120 84 Q146 98 132 124 Q118 146 94 132" fill="none" stroke="rgba(243,239,230,0.35)" strokeWidth={4} strokeLinecap="round" />
                  </g>
                  {[
                    [86, 78, 16],
                    [140, 124, 12],
                    [118, 66, 9],
                  ].map(([x, y, s], i) => (
                    <path
                      key={i}
                      transform={`translate(${x - s} ${y - s}) scale(${s / 24})`}
                      d="M24 5C25.6 17 31 22.4 43 24C31 25.6 25.6 31 24 43C22.4 31 17 25.6 5 24C17 22.4 22.4 17 24 5z"
                      fill={C.accent}
                      opacity={0.5 + 0.5 * Math.sin(f / 9 + i * 2)}
                    />
                  ))}
                  <ellipse cx={80} cy={64} rx={24} ry={13} fill="rgba(255,255,255,0.28)" transform="rotate(-30 80 64)" />
                </svg>
                <div style={{ position: "absolute", left: -5, top: -11 }}>
                  <Strike w={230} h={230} p={ballStrike} width={12} />
                </div>
              </div>
              <div style={{ position: "absolute", left: 286, top: 118, opacity: teleP, transform: `translateY(${(1 - teleP) * 24}px)` }}>
                <div style={{ ...TX.title, fontSize: 48, color: C.muted, whiteSpace: "nowrap" }}>он не</div>
                <div style={{ ...TX.title, fontSize: 48, color: C.text, whiteSpace: "nowrap", marginTop: 6 }}>телепат</div>
                <div style={{ ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap", marginTop: 14 }}>нужно объяснять</div>
              </div>
            </>
          )}
        </Frame>
      </Pop>
    ) : null;

  // JSON editor (right)
  const edP = sp(f, bRule + 22, "pop");
  const rowAt = (i: number) => bLines + 4 + i * 5;
  const visRows = ROWS.filter((_, i) => f >= rowAt(i)).length;
  const editor =
    edP > 0.002 && outB < 1 ? (
      <Pop x={740} y={460} w={1040} h={360} p={edP} q={outB} from="right">
        <Frame w={1040} h={360} kind="editor" title="timeline.json" glow={0.9 * bump(f, wJson, 26)}>
          <div style={{ position: "absolute", left: 18, top: 14, fontFamily: MONO, fontSize: 26, lineHeight: "39px", whiteSpace: "pre" }}>
            {[-1, 0, 1, 2, 3, 4, 5].map((i) => {
              const ln = i + 2;
              const gut = <span style={{ display: "inline-block", width: 52, color: "rgba(154,160,170,0.45)" }}>{String(ln).padStart(2, " ")}</span>;
              if (i < 0) {
                return (
                  <div key="h" style={{ height: 39 }}>
                    {gut}
                    <span style={{ color: TK.k }}>"words"</span>
                    <span style={{ color: TK.p }}>{": ["}</span>
                    {visRows === 0 && <Caret f={f} />}
                  </div>
                );
              }
              const a = rowAt(i);
              const p = eo(f, a, 8);
              if (p <= 0) return <div key={i} style={{ height: 39 }} />;
              const [wd, s0, s1] = ROWS[i];
              const pad = " ".repeat(Math.max(0, 8 - (wd.length + 2)));
              const hl = eo(f, wTimes + i * 3, 8);
              const num = (v: string) => (
                <span
                  style={{
                    color: interpolateColors(hl, [0, 1], [TK.n, C.bg]),
                    background: `rgba(255,179,0,${0.95 * hl})`,
                    borderRadius: 6,
                    padding: "0 3px",
                    margin: "0 -3px",
                    fontWeight: 700,
                  }}
                >
                  {v}
                </span>
              );
              return (
                <div key={i} style={{ height: 39, opacity: p, transform: `translateX(${(1 - p) * 18}px)` }}>
                  {gut}
                  <span style={{ color: TK.p }}>{"  { "}</span>
                  <span style={{ color: TK.k }}>"t"</span>
                  <span style={{ color: TK.p }}>: </span>
                  <span style={{ color: TK.s }}>"{wd}"</span>
                  <span style={{ color: TK.p }}>,{pad} </span>
                  <span style={{ color: TK.k }}>"s"</span>
                  <span style={{ color: TK.p }}>: </span>
                  {num(s0)}
                  <span style={{ color: TK.p }}>, </span>
                  <span style={{ color: TK.k }}>"e"</span>
                  <span style={{ color: TK.p }}>: </span>
                  {num(s1)}
                  <span style={{ color: TK.p }}>{" },"}</span>
                  {i === visRows - 1 && <Caret f={f} />}
                </div>
              );
            })}
          </div>
          {f >= wTimes && (
            <div style={{ position: "absolute", right: 22, bottom: 18, opacity: eo(f, wTimes + 10, 10) }}>
              <Chip text="тайминги" icon="clock" tone="accent" size={24} />
            </div>
          )}
        </Frame>
      </Pop>
    ) : null;

  // ═══ phases C–E: the pie ═══
  const mv = sp(f, bMush - 2, "soft"); // centre → left card
  const g = GAP * Math.max(0, eo(f, wSep, 18) - eo(f, wAll, 12));
  const cakeCX = mix(960, 340, mv);
  const cakeW = mix(600, 300, mv);
  const cakeL = cakeCX - cakeW / 2;
  const cakeR = cakeCX + cakeW / 2;
  const layerTop = (i: number) => YBOT - (i + 1) * LH - i * g;
  const layerCY = (i: number) => layerTop(i) + (LH - 3) / 2;
  const cakeOn = f >= bPie + 8; // the code cards are gone by then
  const fy = float(f, 2, 3, 110);
  const sx = shake(f, wAtOnce, 7, 16);
  const aC = 1 - clamp01(mv / 0.35); // left-side labels while the pie is centred
  const aD = clamp01((mv - 0.6) / 0.4); // the same labels on the right of the pie in the card

  const labelBody = (i: number) => (
    <div style={{ display: "flex", alignItems: "center", height: 50, whiteSpace: "nowrap" }}>
      <div
        style={{
          width: 46,
          height: 46,
          flex: "none",
          borderRadius: 23,
          border: `3px solid ${C.accent}`,
          background: C.surface2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: MONO,
          fontWeight: 700,
          fontSize: 24,
          color: C.accent,
        }}
      >
        {i + 1}
      </div>
      <div style={{ marginLeft: 14 }}>
        <Icon name={LAYERS[i].icon} size={38} color={C.accent} sw={3.6} />
      </div>
      <div style={{ marginLeft: 12, fontFamily: SANS, fontWeight: 700, fontSize: 36, color: C.text }}>{LAYERS[i].name}</div>
    </div>
  );

  const cardIn = eo(f, bMush, 16);
  const cw = mix(800, 1640, sp(f, bTrain + 2, "soft"));
  const leftCard =
    cardIn > 0 ? (
      <div
        style={{
          position: "absolute",
          left: 140,
          top: 250,
          width: cw,
          height: 570,
          borderRadius: 24,
          background: C.surface,
          border: `1px solid ${C.line}`,
          boxShadow: shadow(),
          opacity: cardIn,
          transform: `translateY(${(1 - cardIn) * 18}px)`,
        }}
      >
        <div style={{ position: "absolute", left: 420, top: 24, display: "flex", alignItems: "center", gap: 12, ...TX.kicker, fontSize: 24, color: C.accent, whiteSpace: "nowrap" }}>
          <Icon name="layers" size={30} color={C.accent} sw={3.8} />
          ПО СЛОЯМ
        </div>
      </div>
    ) : null;

  // «каша» card
  const mushP = sp(f, bMush + 12, "pop");
  const mushQ = ei(f, bTrain, 10);
  const mushCard =
    mushP > 0.002 && mushQ < 1 ? (
      <Pop x={980} y={250} w={800} h={570} p={mushP} q={mushQ} from="right" d={60}>
        <div
          style={{
            position: "relative",
            width: 800,
            height: 570,
            borderRadius: 24,
            background: C.surface,
            border: "2px solid rgba(248,113,113,0.45)",
            boxShadow: shadow(),
            overflow: "hidden",
            transform: `translateX(${60 * mushQ}px)`,
          }}
        >
          <div style={{ position: "absolute", left: 28, top: 24, ...TX.kicker, fontSize: 24, color: C.err, whiteSpace: "nowrap" }}>ВСЁ СРАЗУ</div>
          <div style={{ position: "absolute", left: 28, top: 62, ...TX.title, fontSize: 72, whiteSpace: "nowrap" }}>каша</div>
          <div style={{ position: "absolute", right: 30, top: 30 }}>
            <CrossBadge f={f} start={bMush + 22} size={72} />
          </div>
          <div style={{ position: "absolute", inset: 0, transform: `translateX(${shake(f, bMush + 30, 9, 20)}px)` }}>
            {PILE.map((pl, i) => {
              const pS = sp(f, bMush + 16 + i * 3, "heavy");
              if (pS <= 0.002) return null;
              const L = LAYERS[i];
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: 400 + pl.dx - 135,
                    top: 360 + pl.dy - 29,
                    width: 270,
                    height: 58,
                    borderRadius: 12,
                    background: L.fill,
                    boxShadow: "inset 0 3px 0 rgba(255,255,255,0.28), inset 0 -5px 0 rgba(17,19,24,0.18), 0 12px 26px rgba(0,0,0,0.45)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "0 18px",
                    opacity: Math.min(1, pS * 3),
                    transform: `translateY(${-(1 - pS) * 420}px) rotate(${pl.r + (1 - pS) * (i % 2 ? 40 : -40)}deg)`,
                  }}
                >
                  <Icon name={L.icon} size={30} color={C.bg} sw={3.8} />
                  <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 28, color: C.bg, whiteSpace: "nowrap" }}>{L.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Pop>
    ) : null;

  const cake = cakeOn ? (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transform: `translate(${sx}px, ${fy}px)` }}>
      {/* plate */}
      {(() => {
        const p = sp(f, bPie + 10, "snap");
        return (
          <div
            style={{
              position: "absolute",
              left: cakeCX - (cakeW + 60) / 2,
              top: YBOT + 4,
              width: cakeW + 60,
              height: 20,
              borderRadius: 10,
              background: C.raised,
              border: `1px solid ${C.line}`,
              boxShadow: "0 16px 30px rgba(0,0,0,0.45)",
              opacity: Math.min(1, p * 1.6),
              transform: `scaleX(${0.6 + 0.4 * p})`,
            }}
          />
        );
      })()}
      {/* layers */}
      {LAYERS.map((L, i) => {
        const pi = sp(f, bPie + 12 + i * 4, "heavy");
        if (pi <= 0.002) return null;
        const glow = Math.max(bump(f, labAt[i], 22), 0.8 * bump(f, wExplain + i * 5, 18), bump(f, wSep + 6 + i * 5, 16));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: cakeL,
              top: layerTop(i) - (1 - pi) * 240,
              width: cakeW,
              height: LH - 3,
              borderRadius: 12,
              background: L.fill,
              opacity: Math.min(1, pi * 2.2),
              boxShadow: `inset 0 3px 0 rgba(255,255,255,0.28), inset 0 -5px 0 rgba(17,19,24,0.18), 0 10px 22px rgba(0,0,0,0.35)${
                glow > 0.01 ? `, 0 0 0 3px rgba(243,239,230,${0.85 * glow}), 0 0 40px rgba(255,179,0,${0.5 * glow})` : ""
              }`,
            }}
          >
            {[0.3, 0.42, 0.55, 0.66, 0.78, 0.9].map((fx, k) => (
              <div
                key={k}
                style={{
                  position: "absolute",
                  left: `${fx * 100}%`,
                  top: 14 + hash(i * 9 + k) * 26,
                  width: 9,
                  height: 6,
                  borderRadius: 4,
                  background: "rgba(17,19,24,0.16)",
                }}
              />
            ))}
            <div style={{ position: "absolute", left: 18, top: (LH - 3 - 34) / 2 }}>
              <Icon name={L.icon} size={34} color={C.bg} sw={3.8} />
            </div>
          </div>
        );
      })}
      {/* leader lines */}
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
        {LAYERS.map((_, i) => {
          if (f < labAt[i]) return null;
          const dl = eo(f, labAt[i], 10);
          const cy = layerCY(i);
          const right = (alpha: number) => {
            if (alpha <= 0) return null;
            const x1 = cakeR + 6;
            const x2 = cakeR + mix(80, 60, mv) - 12;
            return (
              <g opacity={alpha}>
                <line x1={x1} y1={cy} x2={mix(x1, x2, dl)} y2={cy} stroke={C.accent} strokeWidth={3} strokeLinecap="round" />
                <circle cx={x1} cy={cy} r={6} fill={C.accent} />
              </g>
            );
          };
          const left = (alpha: number) => {
            if (alpha <= 0) return null;
            const x1 = cakeL - 6;
            const x2 = cakeL - 80 + 12;
            return (
              <g opacity={alpha}>
                <line x1={x1} y1={cy} x2={mix(x1, x2, dl)} y2={cy} stroke={C.accent} strokeWidth={3} strokeLinecap="round" />
                <circle cx={x1} cy={cy} r={6} fill={C.accent} />
              </g>
            );
          };
          return <g key={i}>{i % 2 === 1 ? right(1) : [left(aC), right(aD)]}</g>;
        })}
      </svg>
      {/* labels */}
      {LAYERS.map((L, i) => {
        const p = sp(f, labAt[i], "pop");
        if (p <= 0.002) return null;
        const top = layerCY(i) - 25;
        const op = Math.min(1, p * 1.7);
        const xRight = cakeR + mix(80, 60, mv);
        if (i % 2 === 1) {
          return (
            <div key={i} style={{ position: "absolute", left: xRight, top, opacity: op, transform: `translateX(${(1 - p) * -30}px)` }}>
              {labelBody(i)}
            </div>
          );
        }
        const xLeft = cakeL - 80 - labelW(L.name);
        return (
          <React.Fragment key={i}>
            {aC > 0 && (
              <div style={{ position: "absolute", left: xLeft, top, opacity: op * aC, transform: `translateX(${(1 - p) * 30 - (1 - aC) * 30}px)` }}>{labelBody(i)}</div>
            )}
            {aD > 0 && (
              <div style={{ position: "absolute", left: xRight, top, opacity: op * aD, transform: `translateX(${(1 - aD) * 24}px)` }}>{labelBody(i)}</div>
            )}
          </React.Fragment>
        );
      })}
      {/* cherry ✓ on «великолепно» */}
      {f >= wGreat && (
        <div style={{ position: "absolute", left: cakeCX - 38, top: layerTop(5) - 84, width: 76, height: 76 }}>
          <Burst f={f} start={wGreat + 2} r0={48} r1={96} n={10} color={C.accent} width={5} />
          <CheckBadge f={f} start={wGreat} size={76} />
        </div>
      )}
      {/* badges on «дообучение» */}
      {f >= bTrain && (
        <>
          <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
            {LAYERS.map((_, i) => {
              const a = eo(f, bTrain + 10 + (5 - i) * 2, 12);
              if (a <= 0) return null;
              const cy = layerCY(i);
              return <line key={i} x1={880} y1={cy} x2={mix(880, 1740, a)} y2={cy} stroke="rgba(154,160,170,0.35)" strokeWidth={2} strokeDasharray="4 10" strokeLinecap="round" />;
            })}
          </svg>
          {COLS.map((col, j) => {
            const hp = sp(f, bTrain + 10 + j * 5, "snap");
            if (hp <= 0.002) return null;
            const hc = eo(f, colAt[j], 10);
            const tone = interpolateColors(hc, [0, 1], [C.text, C.accent]);
            return (
              <div
                key={j}
                style={{
                  position: "absolute",
                  left: colX(j) - 140,
                  top: 282,
                  width: 280,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 10,
                  opacity: Math.min(1, hp * 1.6),
                  transform: `translateY(${(1 - hp) * 20}px)`,
                  whiteSpace: "nowrap",
                }}
              >
                <Icon name={col.icon} size={34} color={tone} sw={3.8} />
                <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 28, color: tone }}>{col.t}</span>
              </div>
            );
          })}
          {LAYERS.map((_, i) =>
            COLS.map((col, j) => {
              const tp = sp(f, bTrain + 14 + (5 - i) * 3 + j * 5, "bouncy");
              if (tp <= 0.002) return null;
              const hc = eo(f, colAt[j] + (5 - i) * 2, 10);
              const fl = bump(f, colAt[j] + (5 - i) * 2, 16);
              return (
                <div
                  key={`${i}-${j}`}
                  style={{
                    position: "absolute",
                    left: colX(j) - 30,
                    top: layerCY(i) - 30,
                    width: 60,
                    height: 60,
                    borderRadius: 17,
                    background: interpolateColors(hc, [0, 1], ["rgba(255,179,0,0.12)", C.accent]),
                    border: "2px solid rgba(255,179,0,0.6)",
                    boxShadow: fl > 0.01 ? `0 0 0 3px rgba(255,179,0,${0.6 * fl}), 0 0 30px rgba(255,179,0,${0.5 * fl})` : "0 8px 18px rgba(0,0,0,0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: Math.min(1, tp * 2),
                    transform: `scale(${tp})`,
                  }}
                >
                  <Icon name={col.icon} size={34} color={interpolateColors(hc, [0, 1], [C.accent, C.bg])} sw={3.8} />
                </div>
              );
            }),
          )}
        </>
      )}
    </div>
  ) : null;

  return (
    <>
      {header}
      {leftCard}
      {chat}
      {plate}
      {picCard}
      {editor}
      {mushCard}
      {cake}
    </>
  );
};
