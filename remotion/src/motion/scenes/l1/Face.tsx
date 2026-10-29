import React from "react";
import { interpolateColors } from "remotion";
import { C, MONO } from "../../../theme";
import { bump, clamp01, ei, eio, eo, float, hash, lin, mix, sp } from "../../anim";
import { Icon, IconName } from "../../icons";
import { code, CodeBlock, TypeText } from "../../text";
import { SceneProps } from "../../types";
import { Avatar, Bubble, Chip, Dots, Frame, glowWin, Pop, Ripple, shadow, Strike, Tone, TX } from "../../ui";
import { CrossBadge, IconTile, Mark, Overlay, Verdict } from "../kit";

// «Слой третий: лицо» (урок 1, раздел 5, голос 245,88–311,99). Лица автора в отрезке нет — вся сцена графика.
// Страницы (каждая живёт до следующего бита):
//  1. Подиум моделей (рекомендация): четыре «генератора ?» → «новые версии старых» → подиум
//     Seedance 2.5 · Kling 4 (топ) · Wan · Higgsfield (следом); заметки «мне — одна модель», «вам — сервис в наборе».
//  2. Карточка Kie AI: Kling Avatar · InfiniTalk · OmniHuman; «один ключ» связывает все три, «одна карта», «доступен всем».
//  3. Пирог слоёв: слой «лицо» выдвигается и заменяется — «сменный слой», остальные под замком.
//  4. Схема «фото + кусок аудио → ролик 8–12 с» → наезд камеры: крупно рот и волна совпадают → сбоку форум.
//  5. Промпт: английский ✓, текст реплики внутри промпта ✗ красным, «модель скажет своё».
//  6. Действие: кивки · взгляд · ладонь ✓; «вздыхает», «шепчет» ✗ — звук уже в записи; сворачивается в строку-итог.
//  7. Ролик под прожектором — подсвечены только губы: «HeyGen / InfiniTalk чинят только губы».

// ═══ геометрия и помощники ═══════════════════════════════════════════════════════════════════════════════
const X0 = 140;
const CW = 1640;
const Y0 = 250;
const CH = 570;
const BOT = Y0 + CH; // 820

/**
 * Элемент живёт до своего следующего бита и уходит за ~9 кадров (исчезает к bNext + 3, пока новый ещё не вошёл);
 * нет следующего бита — не гаснет.
 */
const safeExitAlpha = (f: number, bNext?: number, dur = 9) =>
  bNext === undefined || !Number.isFinite(bNext) ? 1 : 1 - ei(f, bNext - 6, dur);

type Rect = { x: number; y: number; w: number; h: number };
const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), w: mix(a.w, b.w, t), h: mix(a.h, b.h, t) });

/** Огибающая речи: высота столбика k волны, 0..1 (детерминированно). */
const env = (k: number) => {
  const s = Math.abs(Math.sin(k * 0.52) * Math.sin(k * 0.17 + 0.8));
  return clamp01(0.12 + 0.88 * s * (0.62 + 0.38 * hash(k + 3)));
};
const envAt = (x: number) => {
  const k = Math.floor(x);
  return mix(env(k), env(k + 1), x - k);
};
/** Раскрытие рта = огибающая под плейхедом прокручиваемой волны (та же формула, что в ScrollWave). */
const ampAt = (f: number, start: number, play: number, speed = 3, gap = 18) => envAt((Math.max(0, f - start) * speed + play) / gap);

/** Страница: всё её содержимое уходит вместе к кадру z (следующий бит). */
const Page: React.FC<{ f: number; a: number; z?: number; children?: React.ReactNode }> = ({ f, a, z, children }) => {
  if (f < a - 1) return null;
  const al = safeExitAlpha(f, z);
  if (al <= 0.001) return null;
  const q = 1 - al;
  return <div style={{ position: "absolute", inset: 0, opacity: al, transform: q > 0 ? `translateY(${-26 * q}px)` : undefined }}>{children}</div>;
};

/** Чип, место под который зарезервировано заранее (ряд не прыгает, когда он появляется). */
const ChipIn: React.FC<{ f: number; at: number; text: string; icon?: IconName; tone?: Tone; size?: number }> = ({ f, at, text, icon, tone, size = 26 }) => {
  const p = sp(f, at, "bouncy");
  return (
    <div style={{ opacity: Math.min(1, p * 1.6), transform: `translateY(${(1 - p) * 14}px)` }}>
      <Chip text={text} icon={icon} tone={tone} size={size} />
    </div>
  );
};

/** Лёгкое парение, чтобы удержанные карточки не замирали. */
const Fl: React.FC<{ f: number; seed: number; amp?: number; children?: React.ReactNode }> = ({ f, seed, amp = 3, children }) => (
  <div style={{ transform: `translateY(${float(f, seed, amp, 120)}px)` }}>{children}</div>
);

/** Пунктирное «место» будущего элемента: видно с `a`, тает, когда приходит сам элемент (`z`). */
const DashSlot: React.FC<{ f: number; a: number; z: number; r: Rect; radius?: number; label?: string; hint?: string }> = ({ f, a, z, r, radius = 18, label, hint }) => {
  const o = eo(f, a, 12) * (1 - eo(f, z, 8));
  if (o <= 0.001) return null;
  return (
    <div style={{ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: radius, border: "2px dashed rgba(154,160,170,0.3)", opacity: o }}>
      {label && <div style={{ position: "absolute", left: 32, top: 26, ...TX.kicker, color: "rgba(154,160,170,0.6)", whiteSpace: "nowrap" }}>{label}</div>}
      {hint && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", ...TX.label, fontSize: 28, color: "rgba(154,160,170,0.7)", whiteSpace: "nowrap" }}>
          {hint}
        </div>
      )}
    </div>
  );
};

/** Чип с пунктирным «призраком» на своём месте: иконка видна заранее, текст — на слове. */
const SlotChip: React.FC<{ f: number; a: number; at: number; text: string; icon: IconName; tone?: Tone; size?: number }> = ({ f, a, at, text, icon, tone, size = 28 }) => {
  const p = sp(f, at, "bouncy");
  const g = eo(f, a, 12) * (1 - Math.min(1, p * 2));
  return (
    <div style={{ position: "relative" }}>
      {g > 0.001 && (
        <div style={{ position: "absolute", left: 0, top: 0, opacity: 0.7 * g }}>
          <Chip text={text} icon={icon} tone="muted" size={size} style={{ color: "transparent", background: "transparent", border: "2px dashed rgba(154,160,170,0.35)" }} />
        </div>
      )}
      <div style={{ opacity: Math.min(1, p * 1.6), transform: `translateY(${(1 - p) * 14}px)` }}>
        <Chip text={text} icon={icon} tone={tone} size={size} />
      </div>
    </div>
  );
};

// ── губы: контуры в рамке 300×200, o = раскрытие 0..1 ───────────────────────────────────────────────────
const lipsParts = (o: number) => {
  const v = clamp01(o);
  const g = 6 + 54 * v;
  const a = 122 - 12 * v;
  const cx = 150;
  const cy = 100;
  const up = cy - g * 0.5;
  const lo = cy + g * 0.65;
  return {
    g,
    a,
    opening: `M${cx - a} ${cy} Q${cx} ${cy - g} ${cx + a} ${cy} Q${cx} ${cy + g * 1.3} ${cx - a} ${cy} Z`,
    upper: `M${cx - a} ${cy} C${cx - a * 0.55} ${up - 40} ${cx - 26} ${up - 48} ${cx} ${up - 30} C${cx + 26} ${up - 48} ${cx + a * 0.55} ${up - 40} ${cx + a} ${cy} Q${cx} ${cy - g} ${cx - a} ${cy} Z`,
    lower: `M${cx - a} ${cy} Q${cx} ${cy + g * 1.3} ${cx + a} ${cy} C${cx + a * 0.6} ${lo + 52} ${cx - a * 0.6} ${lo + 52} ${cx - a} ${cy} Z`,
  };
};

const LipsG: React.FC<{ o: number; sw: number; uid: string }> = ({ o, sw, uid }) => {
  const L = lipsParts(o);
  return (
    <>
      <defs>
        <clipPath id={uid}>
          <path d={L.opening} />
        </clipPath>
      </defs>
      <path d={L.opening} fill="#0B0C10" />
      <rect x={150 - L.a} y={100 - L.g * 0.5 - 2} width={2 * L.a} height={Math.min(16, L.g * 0.4)} fill={C.text} opacity={0.85} clipPath={`url(#${uid})`} />
      <path d={L.upper} fill="rgba(255,179,0,0.22)" stroke={C.accent} strokeWidth={sw} strokeLinejoin="round" />
      <path d={L.lower} fill="rgba(255,179,0,0.22)" stroke={C.accent} strokeWidth={sw} strokeLinejoin="round" />
    </>
  );
};

const Lips: React.FC<{ w: number; o: number; uid: string }> = ({ w, o, uid }) => (
  <svg width={w} height={(w * 2) / 3} viewBox="0 0 300 200" style={{ display: "block", overflow: "visible" }}>
    <LipsG o={o} sw={5} uid={uid} />
  </svg>
);

/** Условный портрет (голова + плечи) в рамке 400×300; рот в точке (200, 158) рамки. */
const Portrait: React.FC<{ f: number; w: number; h: number; o: number; uid: string; still?: boolean }> = ({ f, w, h, o, uid, still = false }) => {
  const ph = ((f % 120) + 120) % 120;
  const eye = still ? 1 : 1 - 0.9 * bump(ph, 104, 8);
  const s = 0.24;
  return (
    <svg width={w} height={h} viewBox="0 0 400 300" preserveAspectRatio="xMidYMax meet" style={{ display: "block" }}>
      <path d="M64 300 C80 236 136 212 200 212 C264 212 320 236 336 300 Z" fill={C.raised} stroke="rgba(243,239,230,0.12)" strokeWidth={3} />
      <rect x={182} y={176} width={36} height={44} fill={C.raised} />
      <ellipse cx={200} cy={118} rx={66} ry={80} fill={C.raised} stroke="rgba(243,239,230,0.18)" strokeWidth={3} />
      <ellipse cx={176} cy={112} rx={8} ry={6 * eye} fill={C.text} opacity={0.7} />
      <ellipse cx={224} cy={112} rx={8} ry={6 * eye} fill={C.text} opacity={0.7} />
      <g transform={`translate(${200 - 150 * s} ${158 - 100 * s}) scale(${s})`}>
        <LipsG o={o} sw={11} uid={uid} />
      </g>
    </svg>
  );
};

/** Прокручиваемая волна; столбики левее плейхеда («прозвучало») — акцентные. */
const ScrollWave: React.FC<{ f: number; start: number; w: number; h: number; play?: number; speed?: number; gap?: number; bar?: number }> = ({
  f,
  start,
  w,
  h,
  play = -1,
  speed = 3,
  gap = 18,
  bar = 9,
}) => {
  const s = Math.max(0, f - start) * speed;
  const k0 = Math.floor(s / gap);
  const off = s - k0 * gap;
  const n = Math.ceil(w / gap) + 1;
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      {Array.from({ length: n }, (_, j) => {
        const x = j * gap - off;
        if (x < -bar || x > w) return null;
        const bh = Math.max(6, env(k0 + j) * h);
        const lit = play < 0 || x + bar / 2 <= play;
        return <rect key={j} x={x} y={(h - bh) / 2} width={bar} height={bh} rx={bar / 2} fill={lit ? C.accent : "rgba(154,160,170,0.45)"} />;
      })}
      {play >= 0 && <rect x={play - 2} y={0} width={4} height={h} rx={2} fill={C.text} />}
    </svg>
  );
};

/** Внутренняя плашка: иконка + текст. */
const Plate: React.FC<{ icon: IconName; text: string; size?: number; accent?: boolean; style?: React.CSSProperties }> = ({ icon, text, size = 26, accent = false, style }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 14,
      padding: "14px 20px",
      borderRadius: 16,
      background: C.surface2,
      border: `2px solid ${accent ? "rgba(255,179,0,0.6)" : C.line}`,
      boxShadow: "0 12px 26px rgba(0,0,0,0.3)",
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    <Icon name={icon} size={size * 1.2} color={C.accent} sw={3.6} />
    <span style={{ ...TX.label, fontSize: size }}>{text}</span>
  </div>
);

// ═══ кадры битов и слов ══════════════════════════════════════════════════════════════════════════════════
const frames = (b: number[], t0: number, w: SceneProps["w"]) => {
  const B = (i: number) => b[i] ?? Infinity;
  return {
    t0,
    bPod: B(0), // Seedance — подиум
    bKie: B(1), // Kie — карточка сервиса
    bSwap: B(2), // сменный — пирог слоёв
    bPhoto: B(3), // фотография — схема
    bLips: B(4), // губы — крупно
    bEng: B(5), // английском — промпт
    bVis: B(6), // видимое — список действий
    bFix: B(7), // HeyGen — подсвечены только губы
    wMalo: w("мало"),
    wVers: w("версии"),
    wOpyt: w("опыту"),
    wTop: w("топ"),
    wKling: w("kling"),
    wSled: w("следом"),
    wWan: w("wan"),
    wHiggs: w("higgsfield"),
    wMne: w("мне", 258),
    wNabor: w("набор"),
    wKAv: w("kling", 263),
    wInf: w("infinitalk"),
    wOmni: w("omnihuman"),
    wKey: w("ключ"),
    wCard: w("карта"),
    wAll: w("доступен"),
    wRest: w("остальное"),
    wKusok: w("кусок"),
    wRolik: w("ролик", 278),
    wSec: w("восемь"),
    wPopad: w("попадают"),
    wNuans: w("нюансы"),
    wPrompt: w("промпт", 284),
    wText: w("текст", 288),
    wNelz: w("нельзя"),
    wModel: w("модель", 290),
    wKiv: w("кивки"),
    wVzgl: w("взгляд"),
    wLad: w("ладонь"),
    wVzd: w("вздыхает"),
    wShep: w("шепчет"),
    wZvuk: w("звук", 299),
    wEsli: w("если", 301),
    wPered: w("переделывайте"),
    wOtd: w("отдельный"),
    wInf2: w("infinitalk", 307),
    wGuby2: w("губы", 309),
    wOst: w("остальной"),
  };
};
type K = ReturnType<typeof frames>;

// ═══ шапка: заголовок слева, чипы справа (flex-start) ══════════════════════════════════════════════════
type HChip = { t: string; icon?: IconName; tone?: Tone; at: number };
type HPage = { a: number; z: number; kicker: string; title: string; chips: HChip[] };

const heads = (k: K): HPage[] => [
  {
    a: k.t0,
    z: k.bKie,
    kicker: "СЛОЙ 3 · ЛИЦО",
    title: "Модели говорящего лица",
    chips: [
      { t: "по моему опыту", icon: "user", tone: "muted", at: k.wOpyt },
      { t: "рекомендация", icon: "star", tone: "outline", at: k.bPod },
    ],
  },
  { a: k.bKie, z: k.bSwap, kicker: "СЛОЙ 3 · ЛИЦО", title: "Один сервис — три модели", chips: [{ t: "в наборе урока", icon: "box", tone: "outline", at: k.bKie + 8 }] },
  { a: k.bSwap, z: k.bPhoto, kicker: "АРХИТЕКТУРА УРОКА", title: "Лицо — сменный слой", chips: [{ t: "6 слоёв", icon: "layers", tone: "muted", at: k.bSwap + 8 }] },
  { a: k.bPhoto, z: k.bEng, kicker: "СЛОЙ 3 · ЛИЦО", title: "Как это работает", chips: [{ t: "нюансы с форумов", icon: "search", tone: "outline", at: k.wNuans }] },
  { a: k.bEng, z: k.bVis, kicker: "НЮАНСЫ С ФОРУМОВ", title: "Промпт для русского липсинка", chips: [{ t: "узнал агент", icon: "bot", tone: "muted", at: k.bEng + 8 }] },
  { a: k.bVis, z: k.wEsli, kicker: "ДЕЙСТВИЕ В ПРОМПТЕ", title: "Описываем только видимое", chips: [] },
  { a: k.wEsli, z: Infinity, kicker: "ПОСЛЕДНИЙ НЮАНС", title: "Не понравился липсинк?", chips: [] },
];

const Header: React.FC<{ f: number; pages: HPage[] }> = ({ f, pages }) => (
  <>
    {pages.map((h, i) => {
      if (f < h.a - 1) return null;
      const out = Number.isFinite(h.z) ? ei(f, h.z - 6, 8) : 0;
      if (out >= 1) return null;
      const st = i === 0 ? h.a : h.a + 3;
      if (f < st) return null;
      const p = sp(f, st, "snap");
      const rise = eo(f, st + 2, 16);
      return (
        <div
          key={i}
          style={{
            position: "absolute",
            left: X0,
            top: 140,
            width: CW,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            opacity: 1 - out,
            transform: out > 0 ? `translateY(${-18 * out}px)` : undefined,
          }}
        >
          <div>
            <div style={{ ...TX.kicker, color: C.accent, fontSize: 24, whiteSpace: "nowrap", opacity: Math.min(1, p * 1.6), transform: `translateX(${(1 - p) * -24}px)` }}>
              {h.kicker}
            </div>
            <div style={{ overflow: "hidden", padding: "0.12em 0.06em 0.16em", margin: "-0.12em -0.06em -0.16em", marginTop: 10 }}>
              <div style={{ ...TX.title, fontSize: 38, whiteSpace: "nowrap", transform: `translateY(${(1 - rise) * 110}%)` }}>{h.title}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            {h.chips.map((c, j) => (
              <ChipIn key={j} f={f} at={c.at} text={c.t} icon={c.icon} tone={c.tone} size={24} />
            ))}
          </div>
        </div>
      );
    })}
  </>
);

// ═══ 1. подиум моделей ═══════════════════════════════════════════════════════════════════════════════════
const PODIUM = [
  { name: "Seedance", ver: "2.5", sub: "", top: true },
  { name: "Kling", ver: "4", sub: "", top: true },
  { name: "Wan", ver: "", sub: "китайская модель", top: false },
  { name: "Higgsfield", ver: "", sub: "", top: false },
];
const COLW = 372;
const COLG = (CW - 4 * COLW) / 3;
const colX = (i: number) => X0 + i * (COLW + COLG);
const H_INTRO = 330;
const H_TOP = 440;
const H_NEXT = 300;

const PodiumPage: React.FC<{ f: number; k: K }> = ({ f, k }) => {
  const m = sp(f, k.wTop, "soft");
  const names = [k.bPod, k.wKling, k.wWan, k.wHiggs];
  const hOf = (i: number) => mix(H_INTRO, PODIUM[i].top ? H_TOP : H_NEXT, m);
  const introQ = ei(f, k.wTop, 10);
  const verOut = ei(f, k.bPod - 4, 10);
  const yTop = BOT - hOf(0) - 34;
  const yNext = BOT - hOf(2) - 34;
  const pTop = eo(f, k.bPod, 18);
  const pNext = eo(f, k.wSled, 18);
  const xA = colX(0);
  const xB = colX(1) + COLW;
  const xC = colX(2);
  const xD = colX(3) + COLW;
  return (
    <>
      {introQ < 1 && (
        <div
          style={{
            position: "absolute",
            left: X0,
            top: 300,
            width: CW,
            display: "flex",
            justifyContent: "center",
            gap: 24,
            opacity: 1 - introQ,
            transform: `translateY(${-20 * introQ}px)`,
          }}
        >
          <ChipIn f={f} at={k.wMalo} text="новых генераторов — мало" icon="spark" tone="muted" size={30} />
          <ChipIn f={f} at={k.wVers} text="выходят новые версии старых" icon="trend" tone="outline" size={30} />
        </div>
      )}

      {PODIUM.map((c, i) => {
        const H = hOf(i);
        const p = sp(f, k.t0 + 4 + i * 5, "heavy");
        const nP = sp(f, names[i], "pop");
        const nO = Math.min(1, nP * 1.6);
        const vP = sp(f, k.wVers + i * 4, "bouncy");
        return (
          <Pop key={i} x={colX(i)} y={BOT - H} w={COLW} h={H} p={p} from="below" d={60}>
            <Frame w={COLW} h={H} kind="plain" glow={glowWin(f, names[i], names[i] + 26, 0)}>
              {c.top && (
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,179,0,0) 30%, rgba(255,179,0,0.10) 100%)", opacity: eo(f, k.bPod, 20) }} />
              )}
              {nO < 1 && (
                <>
                  <div style={{ position: "absolute", left: 34, top: 40, width: 190, height: 22, borderRadius: 11, background: "rgba(243,239,230,0.12)", opacity: 1 - nO }} />
                  <div style={{ position: "absolute", left: 34, top: 76, width: 120, height: 16, borderRadius: 8, background: "rgba(243,239,230,0.07)", opacity: 1 - nO }} />
                  <div style={{ position: "absolute", left: 0, right: 0, top: 128, textAlign: "center", fontFamily: MONO, fontWeight: 700, fontSize: 88, lineHeight: 1, color: C.muted, opacity: 0.6 * (1 - nO) }}>
                    ?
                  </div>
                </>
              )}
              {nP > 0.002 && (
                <>
                  <div style={{ position: "absolute", left: 34, top: 26, opacity: nO, transform: `translateY(${(1 - nP) * -24}px)` }}>
                    <div style={{ ...TX.title, fontSize: 42, whiteSpace: "nowrap" }}>{c.name}</div>
                    {c.sub && <div style={{ ...TX.label, fontSize: 24, color: C.muted, marginTop: 6, whiteSpace: "nowrap" }}>{c.sub}</div>}
                  </div>
                  <div style={{ position: "absolute", left: 0, right: 0, top: 128, display: "flex", flexDirection: "column", alignItems: "center", opacity: Math.min(1, nP * 1.4) }}>
                    {c.ver ? (
                      <>
                        <div style={{ ...TX.title, fontSize: 88, lineHeight: 1, color: C.accent }}>{c.ver}</div>
                        <div style={{ ...TX.label, fontSize: 24, color: C.muted, marginTop: 10 }}>версия</div>
                      </>
                    ) : (
                      <IconTile icon="video" size={104} />
                    )}
                  </div>
                </>
              )}
              {vP > 0.002 && verOut < 1 && (
                <div style={{ position: "absolute", left: 0, right: 0, top: H - 34 - 46, display: "flex", justifyContent: "center", opacity: Math.min(1, vP * 1.6) * (1 - verOut) }}>
                  <Chip text="новая версия" icon="trend" tone="outline" size={24} />
                </div>
              )}
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 8, background: c.top ? C.accent : "rgba(154,160,170,0.4)", opacity: eo(f, k.bPod, 16) }} />
            </Frame>
          </Pop>
        );
      })}

      <Overlay>
        {pTop > 0 && (
          <path
            d={`M${xA} ${yTop + 16} V${yTop} H${xB} V${yTop + 16}`}
            fill="none"
            stroke={C.accent}
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={1 - pTop}
          />
        )}
        {pNext > 0 && (
          <path
            d={`M${xC} ${yNext + 16} V${yNext} H${xD} V${yNext + 16}`}
            fill="none"
            stroke="rgba(154,160,170,0.7)"
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={1 - pNext}
          />
        )}
      </Overlay>
      {pTop > 0 && (
        <div style={{ position: "absolute", left: xA, width: xB - xA, top: yTop - 48, textAlign: "center", ...TX.kicker, fontSize: 26, color: C.accent, opacity: pTop }}>
          ТОП СЕГОДНЯ
        </div>
      )}
      {pNext > 0 && (
        <div style={{ position: "absolute", left: xC, width: xD - xC, top: yNext - 48, textAlign: "center", ...TX.kicker, fontSize: 26, opacity: pNext }}>
          СЛЕДОМ
        </div>
      )}

      <Pop x={colX(2)} y={262} p={sp(f, k.wMne, "pop")} from="right" d={40}>
        <Plate icon="user" text="мне лицо делает одна модель" />
      </Pop>
      <Pop x={colX(2)} y={336} p={sp(f, k.wNabor, "pop")} from="right" d={40}>
        <Plate icon="box" text="вам — сервис в наборе урока" accent />
      </Pop>
    </>
  );
};

// ═══ 2. карточка Kie AI ══════════════════════════════════════════════════════════════════════════════════
const KIE_ROWS: { t: string; s: string; icon: IconName }[] = [
  { t: "Kling Avatar", s: "говорящий аватар по фото", icon: "user" },
  { t: "InfiniTalk", s: "липсинк по аудиодорожке", icon: "wave" },
  { t: "OmniHuman", s: "движение всего тела", icon: "video" },
];
const ROW_X = 660;
const ROW_W = CW - 34 - ROW_X;
const ROW_H = 140;
const rowY = (i: number) => 40 + i * 160;

const KiePage: React.FC<{ f: number; k: K }> = ({ f, k }) => {
  const p = sp(f, k.bKie + 3, "pop");
  const ats = [k.wKAv, k.wInf, k.wOmni];
  const nameP = eo(f, k.bKie + 6, 16);
  return (
    <Pop x={X0} y={Y0} w={CW} h={CH} p={p} from="below" d={50}>
      <Frame w={CW} h={CH} kind="plain">
        <div style={{ position: "absolute", left: 34, top: 30, display: "flex", alignItems: "center", gap: 12, ...TX.kicker, whiteSpace: "nowrap" }}>
          <Icon name="blocks" size={30} color={C.accent} sw={3.8} />
          ОДИН СЕРВИС — МНОГО МОДЕЛЕЙ
        </div>
        <div style={{ position: "absolute", left: 34, top: 78, overflow: "hidden", padding: "0.1em 0.06em 0.14em", margin: "-0.1em -0.06em -0.14em" }}>
          <div style={{ ...TX.title, fontSize: 84, whiteSpace: "nowrap", transform: `translateY(${(1 - nameP) * 110}%)` }}>
            Kie <span style={{ color: C.accent }}>AI</span>
          </div>
        </div>
        <div style={{ position: "absolute", left: 34, top: 186, ...TX.label, fontSize: 28, color: C.muted, whiteSpace: "nowrap", opacity: eo(f, k.bKie + 14, 12) }}>
          модели лица через один сервис
        </div>
        <div style={{ position: "absolute", left: 34, top: 330, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 17 }}>
          <SlotChip f={f} a={k.bKie + 14} at={k.wKey} text="один ключ" icon="key" tone="outline" />
          <SlotChip f={f} a={k.bKie + 17} at={k.wCard} text="одна карта" icon="card" tone="outline" />
          <SlotChip f={f} a={k.bKie + 20} at={k.wAll} text="доступен всем" icon="globe" tone="surface" />
        </div>

        <svg width={CW} height={CH} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          {KIE_ROWS.map((_, i) => {
            const lp = eo(f, k.wKey + 6 + i * 4, 16);
            if (lp <= 0) return null;
            const yr = rowY(i) + ROW_H / 2;
            return (
              <path
                key={i}
                d={`M292 356 H560 C610 356 610 ${yr} ${ROW_X - 4} ${yr}`}
                fill="none"
                stroke={C.accent}
                strokeWidth={3}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="1 1"
                strokeDashoffset={1 - lp}
                opacity={0.85}
              />
            );
          })}
          {eo(f, k.wKey + 4, 8) > 0 && <circle cx={292} cy={356} r={7} fill={C.accent} opacity={eo(f, k.wKey + 4, 8)} />}
        </svg>

        {KIE_ROWS.map((_, i) => (
          <DashSlot key={i} f={f} a={k.bKie + 10 + i * 3} z={ats[i]} r={{ x: ROW_X, y: rowY(i), w: ROW_W, h: ROW_H }} label={`МОДЕЛЬ ${i + 1}`} />
        ))}
        {KIE_ROWS.map((r, i) => {
          const rp = sp(f, ats[i], "snap");
          const lit = glowWin(f, k.wKey + 16 + i * 4, k.wKey + 40 + i * 4, 0.35);
          const kp = sp(f, k.wKey + 18 + i * 4, "bouncy");
          return (
            <Pop key={i} x={ROW_X} y={rowY(i)} w={ROW_W} h={ROW_H} p={rp} from="right" d={60}>
              <div
                style={{
                  position: "relative",
                  width: ROW_W,
                  height: ROW_H,
                  borderRadius: 18,
                  background: C.surface2,
                  border: `2px solid ${C.line}`,
                  boxShadow: shadow(lit),
                  transform: `translateY(${float(f, i + 2, 2.5, 110)}px)`,
                }}
              >
                <div style={{ position: "absolute", left: 22, top: 22 }}>
                  <IconTile icon={r.icon} size={92} />
                </div>
                <div style={{ position: "absolute", left: 140, top: 22, ...TX.title, fontSize: 42, whiteSpace: "nowrap" }}>{r.t}</div>
                <div style={{ position: "absolute", left: 140, top: 80, ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap" }}>{r.s}</div>
                {kp > 0.002 && (
                  <div
                    style={{
                      position: "absolute",
                      right: 26,
                      top: 38,
                      width: 64,
                      height: 64,
                      borderRadius: 32,
                      background: "rgba(255,179,0,0.14)",
                      border: "2px solid rgba(255,179,0,0.6)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: Math.min(1, kp * 1.6),
                      transform: `scale(${0.5 + 0.5 * kp})`,
                    }}
                  >
                    <Icon name="key" size={36} color={C.accent} sw={3.8} />
                  </div>
                )}
              </div>
            </Pop>
          );
        })}
      </Frame>
    </Pop>
  );
};

// ═══ 3. пирог слоёв: лицо — сменный слой ═════════════════════════════════════════════════════════════════
const LAYERS: { t: string; icon: IconName }[] = [
  { t: "музыка", icon: "wave" },
  { t: "субтитры", icon: "chat" },
  { t: "графика", icon: "image" },
  { t: "лицо", icon: "user" },
  { t: "голос", icon: "mic" },
  { t: "сценарий", icon: "doc" },
];
const FACE_I = 3;
const SLW = 760;
const SLH = 72;
const SLP = 86;
const SLY = 282;
const RZ = 1000; // левый край правой зоны

const Slab: React.FC<{ icon: IconName; t: string; face?: boolean; right?: React.ReactNode; glow?: number }> = ({ icon, t, face = false, right, glow = 0 }) => (
  <div
    style={{
      width: SLW,
      height: SLH,
      boxSizing: "border-box",
      borderRadius: 16,
      background: face ? `linear-gradient(rgba(255,179,0,0.1), rgba(255,179,0,0.1)), ${C.surface}` : C.surface,
      border: `2px solid ${face ? C.accent : C.line}`,
      boxShadow: shadow(glow),
      display: "flex",
      alignItems: "center",
      gap: 18,
      padding: "0 24px",
    }}
  >
    <Icon name={icon} size={38} color={face ? C.accent : C.muted} sw={3.6} />
    <div style={{ ...TX.label, fontSize: 30, whiteSpace: "nowrap" }}>{t}</div>
    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>{right}</div>
  </div>
);

const StackPage: React.FC<{ f: number; k: K }> = ({ f, k }) => {
  const ej = k.bSwap + 20; // старый слой выдвигается
  const nIn = ej + 14; // новый въезжает
  const prov = (t: string) => <span style={{ ...TX.label, fontSize: 26, color: C.accent, whiteSpace: "nowrap" }}>{t}</span>;
  const tP = eo(f, k.bSwap + 8, 16);
  return (
    <>
      {LAYERS.map((L, i) => {
        const y = SLY + i * SLP;
        const p = sp(f, k.bSwap + 3 + (5 - i) * 2, "heavy");
        if (i === FACE_I) {
          const dxOld = 600 * eio(f, ej, 16);
          const oOld = 1 - lin(f, ej + 6, 10);
          const pn = sp(f, nIn, "snap");
          return (
            <React.Fragment key={i}>
              {oOld > 0.001 && (
                <Pop x={X0} y={y} w={SLW} h={SLH} p={p} from="above" d={36}>
                  <div style={{ opacity: oOld, transform: `translateX(${dxOld}px)` }}>
                    <Slab icon={L.icon} t={L.t} face right={prov("Kling Avatar")} />
                  </div>
                </Pop>
              )}
              {pn > 0.002 && (
                <div style={{ position: "absolute", left: X0 + 600 * (1 - pn), top: y, opacity: Math.min(1, pn * 1.8) }}>
                  <Slab icon={L.icon} t={L.t} face glow={glowWin(f, nIn + 10, nIn + 34, 0.35)} right={prov("InfiniTalk")} />
                </div>
              )}
            </React.Fragment>
          );
        }
        const j = i < FACE_I ? i : i - 1;
        const lp = sp(f, k.wRest + j * 3, "bouncy");
        return (
          <Pop key={i} x={X0} y={y} w={SLW} h={SLH} p={p} from="above" d={36}>
            <Slab
              icon={L.icon}
              t={L.t}
              right={
                lp > 0.002 ? (
                  <div style={{ opacity: Math.min(1, lp * 1.6), transform: `scale(${0.6 + 0.4 * lp})` }}>
                    <Icon name="lock" size={32} color={C.muted} sw={3.6} />
                  </div>
                ) : null
              }
            />
          </Pop>
        );
      })}

      <div style={{ position: "absolute", left: RZ, top: 292, ...TX.kicker, whiteSpace: "nowrap", opacity: eo(f, k.bSwap + 6, 10) }}>ПРОВАЙДЕР ЛИЦА</div>
      <div style={{ position: "absolute", left: RZ, top: 332, overflow: "hidden", padding: "0.1em 0.06em 0.14em", margin: "-0.1em -0.06em -0.14em" }}>
        <div style={{ ...TX.title, fontSize: 60, color: C.accent, whiteSpace: "nowrap", transform: `translateY(${(1 - tP) * 110}%)` }}>сменный слой</div>
      </div>
      <div style={{ position: "absolute", left: RZ, top: 418, ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap", opacity: eo(f, k.bSwap + 16, 12) }}>
        поменяли модель — пирог тот же
      </div>
      <div style={{ position: "absolute", left: RZ, top: 548, display: "flex", gap: 14 }}>
        <ChipIn f={f} at={nIn + 18} text="Kling Avatar" tone="surface" size={24} />
        <ChipIn f={f} at={nIn + 22} text="InfiniTalk" tone="outline" size={24} />
        <ChipIn f={f} at={nIn + 26} text="OmniHuman" tone="surface" size={24} />
      </div>
      <div style={{ position: "absolute", left: RZ, top: 690 }}>
        <Verdict f={f} start={k.wRest} text="остальное не меняется" ok size={32} />
      </div>
    </>
  );
};

// ═══ 4. схема «фото + аудио → ролик» → крупно губы и звук → форум ═══════════════════════════════════════
const PH: Rect = { x: 140, y: 270, w: 440, h: 500 };
const AU: Rect = { x: 680, y: 270, w: 480, h: 500 };
const OUT0: Rect = { x: 1280, y: 270, w: 500, h: 500 };
const FULL: Rect = { x: X0, y: Y0, w: CW, h: CH };
const COMP: Rect = { x: X0, y: Y0, w: 960, h: CH };
const FORUM: Rect = { x: 1140, y: Y0, w: 640, h: CH };
const VID = { x: 34, y: 76, h: 290 };

const VideoBox: React.FC<{ w: number; h: number; children?: React.ReactNode }> = ({ w, h, children }) => (
  <div
    style={{
      position: "relative",
      width: w,
      height: h,
      borderRadius: 14,
      overflow: "hidden",
      background: `linear-gradient(160deg, #1D222C 0%, #14171D 100%)`,
      border: `1px solid ${C.line}`,
    }}
  >
    {children}
  </div>
);

const AudioCut: React.FC<{ f: number; at: number; w: number }> = ({ f, at, w }) => {
  const n = 52;
  const gap = w / n;
  const i0 = Math.floor(n * 0.38);
  const i1 = Math.ceil(n * 0.62);
  const hl = eo(f, at + 4, 10);
  const drop = eo(f, at + 14, 18);
  const pieces = i1 - i0;
  const pg = w / pieces;
  return (
    <div style={{ position: "relative", width: w, height: 280 }}>
      <svg width={w} height={60} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {hl > 0 && (
          <rect x={i0 * gap - 4} y={-4} width={pieces * gap + 4} height={60} rx={10} fill="rgba(255,179,0,0.12)" stroke={C.accent} strokeWidth={3} opacity={hl} />
        )}
        {Array.from({ length: n }, (_, i) => {
          const bh = Math.max(4, env(i + 40) * 44);
          const inWin = i >= i0 && i < i1;
          return <rect key={i} x={i * gap + gap * 0.2} y={26 - bh / 2} width={gap * 0.55} height={bh} rx={2} fill={inWin && hl > 0.5 ? C.accent : "rgba(154,160,170,0.5)"} />;
        })}
      </svg>
      {drop > 0 && (
        <svg width={w} height={170} style={{ position: "absolute", left: 0, top: 110, opacity: drop, transform: `translateY(${(1 - drop) * -70}px)` }}>
          {Array.from({ length: pieces }, (_, j) => {
            const bh = Math.max(10, env(i0 + j + 40) * 160);
            return <rect key={j} x={j * pg + pg * 0.22} y={85 - bh / 2} width={pg * 0.56} height={bh} rx={8} fill={C.accent} />;
          })}
        </svg>
      )}
    </div>
  );
};

const CloseUp: React.FC<{ f: number; W: number; H: number; start: number; okAt: number }> = ({ f, W, H, start, okAt }) => {
  const mouthW = Math.min(440, W * 0.34);
  const waveL = 34 + mouthW + 70;
  const waveW = Math.max(200, Math.round(W - 34 - waveL));
  const waveTop = 110;
  const waveH = H - 260;
  const play = Math.round(waveW * 0.42);
  const o = ampAt(f, start, play);
  const midY = waveTop + waveH / 2;
  return (
    <>
      <div style={{ position: "absolute", left: 34, top: 28, ...TX.kicker, whiteSpace: "nowrap" }}>КРУПНО: РОТ И ЗВУК</div>
      <div style={{ position: "absolute", left: 34, top: midY - mouthW / 3 }}>
        <Lips w={mouthW} o={o} uid="l1face-cu" />
      </div>
      <div style={{ position: "absolute", left: 34 + mouthW + 35 - 18, top: midY - 36, ...TX.title, fontSize: 60, color: C.accent }}>=</div>
      <div style={{ position: "absolute", left: waveL, top: waveTop }}>
        <ScrollWave f={f} start={start} w={waveW} h={waveH} play={play} />
      </div>
      <div style={{ position: "absolute", left: 34, width: mouthW, top: waveTop + waveH + 12, textAlign: "center", ...TX.label, fontSize: 24, color: C.muted }}>рот</div>
      <div style={{ position: "absolute", left: waveL, width: waveW, top: waveTop + waveH + 12, textAlign: "center", ...TX.label, fontSize: 24, color: C.muted }}>звук</div>
      <div style={{ position: "absolute", left: 34, top: H - 92 }}>
        <Verdict f={f} start={okAt} text="губы попадают в звук" ok size={30} />
      </div>
    </>
  );
};

const Forum: React.FC<{ f: number; at: number; hlAt: number; w: number }> = ({ f, at, hlAt, w }) => {
  const scan = lin(f, at + 10, Math.max(1, hlAt - at - 10));
  const back = eo(f, hlAt, 12);
  const my = mix(mix(40, 40 + 2 * 156, scan), 40, back);
  return (
    <>
      {[0, 1, 2].map((i) => {
        const pp = sp(f, at + 8 + i * 6, "snap");
        if (pp <= 0.002) return null;
        const hl = i === 0 ? glowWin(f, hlAt, hlAt + 200, 1) : 0;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 24,
              top: 24 + i * 156,
              width: w - 48,
              height: 136,
              borderRadius: 16,
              background: C.surface2,
              border: `2px solid ${hl > 0 ? `rgba(255,179,0,${0.7 * hl})` : C.line}`,
              opacity: Math.min(1, pp * 1.6),
              transform: `translateX(${(1 - pp) * 30}px)`,
            }}
          >
            <div style={{ position: "absolute", left: 20, top: 20 }}>
              <Avatar size={60} icon="user" ring="rgba(154,160,170,0.5)" tone={C.muted} />
            </div>
            <div style={{ position: "absolute", left: 100, top: 26, width: 300, height: 16, borderRadius: 8, background: "rgba(243,239,230,0.12)" }} />
            <div style={{ position: "absolute", left: 100, top: 56, width: 220 - i * 30, height: 16, borderRadius: 8, background: "rgba(243,239,230,0.07)" }} />
            {i === 0 ? (
              <div style={{ position: "absolute", left: 100, top: 86, fontFamily: MONO, fontWeight: 700, fontSize: 24, color: C.accent, whiteSpace: "nowrap" }}>
                <TypeText text="промпт — на английском" f={f} start={hlAt + 4} cps={30} caretUntil={hlAt + 70} />
              </div>
            ) : (
              <div style={{ position: "absolute", left: 100, top: 92 }}>
                <Dots f={f + i * 7} size={10} />
              </div>
            )}
          </div>
        );
      })}
      {sp(f, at + 10, "pop") > 0.01 && (
        <div style={{ position: "absolute", left: w - 96, top: my, opacity: Math.min(1, sp(f, at + 10, "pop") * 1.6) }}>
          <Icon name="search" size={52} color={C.accent} sw={4} />
        </div>
      )}
    </>
  );
};

const SchemePage: React.FC<{ f: number; k: K }> = ({ f, k }) => {
  const qIn = ei(f, k.bLips - 8, 10); // фото и аудио уходят перед наездом
  const pz = sp(f, k.bLips + 2, "soft");
  const pc = eio(f, k.wNuans, 16);
  const r = lerpRect(lerpRect(OUT0, FULL, pz), COMP, pc);
  const aA = 1 - clamp01(pz * 2.5);
  const aB = clamp01((pz - 0.4) / 0.4);
  const pOut = sp(f, k.wRolik, "pop");
  const vidW = OUT0.w - 68;
  return (
    <>
      {qIn < 1 && (
        <div style={{ position: "absolute", inset: 0, opacity: 1 - qIn, transform: qIn > 0 ? `translateX(${-60 * qIn}px)` : undefined }}>
          <DashSlot f={f} a={k.bPhoto + 8} z={k.wKusok} r={AU} radius={22} label="ВХОД" hint="звук?" />
          <DashSlot f={f} a={k.bPhoto + 12} z={k.wRolik} r={OUT0} radius={22} label="ВЫХОД" hint="ролик?" />
          <Pop x={PH.x} y={PH.y} w={PH.w} h={PH.h} p={sp(f, k.bPhoto + 3, "pop")} from="left" d={50}>
            <Fl f={f} seed={1}>
              <Frame w={PH.w} h={PH.h} kind="plain">
                <div style={{ position: "absolute", left: 34, top: 28, ...TX.kicker }}>ВХОД</div>
                <div style={{ position: "absolute", left: VID.x, top: VID.y }}>
                  <VideoBox w={PH.w - 68} h={VID.h}>
                    <Portrait f={f} w={PH.w - 68} h={VID.h} o={0.05} uid="l1face-ph" still />
                    <div style={{ position: "absolute", left: 14, top: 14 }}>
                      <Icon name="image" size={34} color={C.muted} sw={3.4} />
                    </div>
                  </VideoBox>
                </div>
                <div style={{ position: "absolute", left: 34, top: 396, ...TX.title, fontSize: 34, whiteSpace: "nowrap" }}>фотография</div>
              </Frame>
            </Fl>
          </Pop>
          <Pop x={600} y={490} w={60} h={60} p={sp(f, k.wKusok - 6, "bouncy")} from="none" s0={0.4}>
            <Icon name="plus" size={60} color={C.accent} sw={5} />
          </Pop>
          <Pop x={AU.x} y={AU.y} w={AU.w} h={AU.h} p={sp(f, k.wKusok, "pop")} from="below" d={50}>
            <Fl f={f} seed={2}>
              <Frame w={AU.w} h={AU.h} kind="plain">
                <div style={{ position: "absolute", left: 34, top: 28, ...TX.kicker }}>ВХОД</div>
                <div style={{ position: "absolute", left: 34, top: 92 }}>
                  <AudioCut f={f} at={k.wKusok} w={AU.w - 68} />
                </div>
                <div style={{ position: "absolute", left: 34, top: 396, ...TX.title, fontSize: 34, whiteSpace: "nowrap" }}>кусок аудиодорожки</div>
              </Frame>
            </Fl>
          </Pop>
          <Pop x={1188} y={488} w={64} h={64} p={sp(f, k.wRolik - 6, "snap")} from="left" d={24}>
            <Icon name="arrow" size={64} color={C.accent} sw={5} />
          </Pop>
        </div>
      )}

      <Pop x={r.x} y={r.y} w={r.w} h={r.h} p={pOut} from="right" d={60}>
        <Frame w={r.w} h={r.h} kind="plain" glow={glowWin(f, k.bLips + 10, k.bLips + 40, 0)}>
          {aA > 0.001 && (
            <div style={{ position: "absolute", inset: 0, opacity: aA }}>
              <div style={{ position: "absolute", left: 34, top: 28, ...TX.kicker }}>ВЫХОД</div>
              <div style={{ position: "absolute", left: VID.x, top: VID.y }}>
                <VideoBox w={vidW} h={VID.h}>
                  <Portrait f={f} w={vidW} h={VID.h} o={ampAt(f, k.wRolik, 200)} uid="l1face-out" />
                  <div
                    style={{
                      position: "absolute",
                      left: 14,
                      top: 14,
                      width: 46,
                      height: 46,
                      borderRadius: 23,
                      background: C.accent,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="play" size={24} color={C.bg} style={{ marginLeft: 3 }} />
                  </div>
                  <div style={{ position: "absolute", left: 14, right: 14, bottom: 12, height: 8, borderRadius: 4, background: "rgba(243,239,230,0.12)" }}>
                    <div style={{ width: `${100 * lin(f, k.wRolik, 90)}%`, height: 8, borderRadius: 4, background: C.accent }} />
                  </div>
                </VideoBox>
              </div>
              <div style={{ position: "absolute", left: 34, top: 396, ...TX.title, fontSize: 34, whiteSpace: "nowrap" }}>ролик</div>
              <div style={{ position: "absolute", left: 172, top: 392 }}>
                <ChipIn f={f} at={k.wSec} text="8–12 с" icon="clock" tone="outline" size={26} />
              </div>
            </div>
          )}
          {aB > 0.001 && (
            <div style={{ position: "absolute", inset: 0, opacity: aB }}>
              <CloseUp f={f} W={r.w} H={r.h} start={k.bLips} okAt={k.wPopad} />
            </div>
          )}
        </Frame>
      </Pop>

      <Pop x={FORUM.x} y={FORUM.y} w={FORUM.w} h={FORUM.h} p={sp(f, k.wNuans + 12, "pop")} from="right" d={80}>
        <Fl f={f} seed={4}>
          <Frame w={FORUM.w} h={FORUM.h} kind="browser" title="форум · русский липсинк">
            <Forum f={f} at={k.wNuans + 12} hlAt={k.wPrompt} w={FORUM.w} />
          </Frame>
        </Fl>
      </Pop>
    </>
  );
};

// ═══ 5. промпт: английский ✓, текст реплики ✗ ═══════════════════════════════════════════════════════════
const PROMPT = [
  code("c:# lipsync prompt · English"),
  code("t:Close-up. A man talks to the camera."),
  code("t:Calm voice, natural pace."),
  code("t:Lips move in sync with the audio."),
];
const ED: Rect = { x: X0, y: Y0, w: 900, h: CH };
const RP = { x: 1080, w: 700 };

const PromptPage: React.FC<{ f: number; k: K }> = ({ f, k }) => {
  const pE = sp(f, k.bEng + 3, "pop");
  const rP = sp(f, k.wText, "snap");
  const strike = eo(f, k.wNelz, 10);
  const enP = sp(f, k.bEng + 10, "bouncy");
  return (
    <>
      <Pop x={ED.x} y={ED.y} w={ED.w} h={ED.h} p={pE} from="left" d={50}>
        <Frame
          w={ED.w}
          h={ED.h}
          kind="editor"
          title="prompt.txt"
          right={
            <div style={{ opacity: Math.min(1, enP * 1.6), transform: `translateY(${(1 - enP) * -10}px)` }}>
              <Chip text="EN" tone="outline" size={24} mono />
            </div>
          }
        >
          <div style={{ position: "absolute", left: 20, top: 26 }}>
            <CodeBlock lines={PROMPT} f={f} start={k.bEng + 6} cps={48} size={26} caretUntil={k.wText} />
          </div>
          {rP > 0.002 && (
            <div
              style={{
                position: "absolute",
                left: 20 + 57,
                top: 26 + 5 * 41.6,
                display: "flex",
                alignItems: "center",
                gap: 18,
                opacity: Math.min(1, rP * 1.6),
                transform: `translateX(${(1 - rP) * 40}px)`,
              }}
            >
              <div
                style={{
                  position: "relative",
                  padding: "14px 20px",
                  borderRadius: 12,
                  background: "rgba(248,113,113,0.1)",
                  border: "2px solid rgba(248,113,113,0.55)",
                  fontFamily: MONO,
                  fontSize: 26,
                  color: C.text,
                  whiteSpace: "nowrap",
                }}
              >
                «Привет! Сегодня я покажу…»
                {strike > 0 && (
                  <div style={{ position: "absolute", left: 20, top: 0 }}>
                    <Strike w={420} h={64} p={strike} flat width={6} />
                  </div>
                )}
              </div>
              <div style={{ width: 52, height: 52 }}>
                <CrossBadge f={f} start={k.wNelz + 2} size={52} />
              </div>
            </div>
          )}
          <div style={{ position: "absolute", left: 34, top: CH - 58 - 26 - 50, display: "flex", gap: 14 }}>
            <ChipIn f={f} at={k.bEng + 24} text="язык промпта: EN" icon="globe" tone="outline" size={24} />
            <ChipIn f={f} at={k.wNelz + 14} text="реплика — только в аудио" icon="wave" tone="surface" size={24} />
          </div>
        </Frame>
      </Pop>

      <Pop x={RP.x} y={250} w={RP.w} h={160} p={sp(f, k.bEng + 3, "pop")} from="right" d={50}>
        <Frame w={RP.w} h={160} kind="plain" glow={glowWin(f, k.bEng + 6, k.bEng + 32, 0)} tone={C.ok}>
          <div style={{ position: "absolute", left: 26, top: 50 }}>
            <Mark f={f} start={k.bEng + 6} ok size={60} />
          </div>
          <div style={{ position: "absolute", left: 112, top: 34, ...TX.label, fontSize: 32, whiteSpace: "nowrap" }}>промпт — на английском</div>
          <div style={{ position: "absolute", left: 112, top: 88, ...TX.label, fontSize: 26, color: C.muted, whiteSpace: "nowrap" }}>даже для русской речи</div>
        </Frame>
      </Pop>
      <Pop x={RP.x} y={440} w={RP.w} h={160} p={sp(f, k.wText, "pop")} from="right" d={50}>
        <Frame w={RP.w} h={160} kind="plain" glow={glowWin(f, k.wNelz, k.wNelz + 30, 0.35)} tone={C.err}>
          <div style={{ position: "absolute", left: 26, top: 50, width: 60, height: 60 }}>
            <CrossBadge f={f} start={k.wNelz} size={60} />
          </div>
          <div style={{ position: "absolute", left: 112, top: 34, ...TX.label, fontSize: 32, whiteSpace: "nowrap" }}>текст реплики в промпте</div>
          <div style={{ position: "absolute", left: 112, top: 88, ...TX.label, fontSize: 26, color: C.err, whiteSpace: "nowrap", opacity: eo(f, k.wNelz + 4, 10) }}>
            вставлять нельзя
          </div>
        </Frame>
      </Pop>
      <Pop x={RP.x} y={630} w={RP.w} h={190} p={sp(f, k.wModel, "pop")} from="right" d={50}>
        <Fl f={f} seed={6}>
          <Frame w={RP.w} h={190} kind="plain">
            <div style={{ position: "absolute", left: 26, top: 30 }}>
              <IconTile icon="warn" size={84} color={C.err} bg="rgba(248,113,113,0.14)" />
            </div>
            <div style={{ position: "absolute", left: 132, top: 30, ...TX.label, fontSize: 32, whiteSpace: "nowrap" }}>иначе модель скажет своё</div>
            <div style={{ position: "absolute", left: 132, top: 88 }}>
              <Bubble size={24} maxW={520}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
                  «…не то, что в аудио» <Dots f={f} color={C.text} size={9} />
                </span>
              </Bubble>
            </div>
          </Frame>
        </Fl>
      </Pop>
    </>
  );
};

// ═══ 6. действие: только видимое ═════════════════════════════════════════════════════════════════════════
const ACT_W = 800;
const ACT_L = X0;
const ACT_R = X0 + CW - ACT_W; // 980
const ROW_IN_W = ACT_W - 68;
const actRowY = (i: number) => 84 + i * 152;

const ActRow: React.FC<{ f: number; at: number; icon: IconName; text: string; ok: boolean; anim: "nod" | "look" | "wave" | "none" }> = ({ f, at, icon, text, ok, anim }) => {
  const p = sp(f, at, "snap");
  if (p <= 0.002) return null;
  const strike = ok ? 0 : eo(f, at + 8, 10);
  const t = f - at;
  const tr =
    anim === "nod"
      ? `rotate(${7 * Math.sin(t / 5)}deg)`
      : anim === "look"
        ? `translateX(${6 * Math.sin(t / 8)}px)`
        : anim === "wave"
          ? `rotate(${14 * Math.sin(t / 4)}deg)`
          : undefined;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: ROW_IN_W,
        height: 130,
        borderRadius: 18,
        background: ok ? C.surface2 : "rgba(248,113,113,0.06)",
        border: `2px solid ${ok ? C.line : "rgba(248,113,113,0.35)"}`,
        opacity: Math.min(1, p * 1.6),
        transform: `translateX(${(1 - p) * 30}px)`,
      }}
    >
      <div style={{ position: "absolute", left: 20, top: 20 }}>
        <div
          style={{
            width: 90,
            height: 90,
            borderRadius: 25,
            background: ok ? "rgba(255,179,0,0.14)" : "rgba(154,160,170,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ transform: tr, transformOrigin: "50% 80%" }}>
            <Icon name={icon} size={54} color={ok ? C.accent : C.muted} sw={3.6} />
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 134, top: 36, ...TX.label, fontSize: 44, color: ok ? C.text : C.muted, whiteSpace: "nowrap" }}>
        <span style={{ position: "relative" }}>
          {text}
          {!ok && (
            <span
              style={{
                position: "absolute",
                left: -6,
                right: -6,
                top: "54%",
                height: 4,
                borderRadius: 2,
                background: C.err,
                transformOrigin: "0 50%",
                transform: `scaleX(${strike})`,
              }}
            />
          )}
        </span>
      </div>
      <div style={{ position: "absolute", right: 26, top: 35 }}>
        <Mark f={f} start={at + 4} ok={ok} size={60} />
      </div>
    </div>
  );
};

const Slot: React.FC<{ hide: number }> = ({ hide }) =>
  hide >= 1 ? null : <div style={{ position: "absolute", left: 0, top: 0, width: ROW_IN_W, height: 130, borderRadius: 18, border: "2px dashed rgba(154,160,170,0.28)", opacity: 1 - hide }} />;

const ActionsPage: React.FC<{ f: number; k: K }> = ({ f, k }) => {
  const pL = sp(f, k.bVis + 2, "pop");
  const pR = sp(f, k.bVis + 8, "pop");
  const ok = [
    { at: k.wKiv, icon: "user" as IconName, t: "кивки", anim: "nod" as const },
    { at: k.wVzgl, icon: "eye" as IconName, t: "взгляд", anim: "look" as const },
    { at: k.wLad, icon: "hand" as IconName, t: "ладонь", anim: "wave" as const },
  ];
  const bad = [
    { at: k.wVzd, icon: "wave" as IconName, t: "«вздыхает»" },
    { at: k.wShep, icon: "mic" as IconName, t: "«шепчет»" },
  ];
  const zP = sp(f, k.wZvuk, "snap");
  return (
    <>
      <Pop x={ACT_L} y={Y0} w={ACT_W} h={CH} p={pL} from="left" d={50}>
        <Frame w={ACT_W} h={CH} kind="plain">
          <div style={{ position: "absolute", left: 34, top: 28, display: "flex", alignItems: "center", gap: 12, ...TX.kicker, color: C.accent, whiteSpace: "nowrap" }}>
            <Icon name="eye" size={30} color={C.accent} sw={3.8} />
            ВИДНО В КАДРЕ
          </div>
          {ok.map((r, i) => (
            <div key={i} style={{ position: "absolute", left: 34, top: actRowY(i) }}>
              <Slot hide={eo(f, r.at, 8)} />
              <ActRow f={f} at={r.at} icon={r.icon} text={r.t} ok anim={r.anim} />
            </div>
          ))}
        </Frame>
      </Pop>
      <Pop x={ACT_R} y={Y0} w={ACT_W} h={CH} p={pR} from="right" d={50}>
        <Frame w={ACT_W} h={CH} kind="plain">
          <div style={{ position: "absolute", left: 34, top: 28, display: "flex", alignItems: "center", gap: 12, ...TX.kicker, whiteSpace: "nowrap" }}>
            <Icon name="mic" size={30} color={C.muted} sw={3.8} />
            СЛЫШНО — НЕ ПИШЕМ
          </div>
          {bad.map((r, i) => (
            <div key={i} style={{ position: "absolute", left: 34, top: actRowY(i) }}>
              <Slot hide={eo(f, r.at, 8)} />
              <ActRow f={f} at={r.at} icon={r.icon} text={r.t} ok={false} anim="none" />
            </div>
          ))}
          <div style={{ position: "absolute", left: 34, top: actRowY(2) }}>
            <Slot hide={eo(f, k.wZvuk, 8)} />
            {zP > 0.002 && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: ROW_IN_W,
                  height: 130,
                  borderRadius: 18,
                  background: "rgba(255,179,0,0.08)",
                  border: "2px solid rgba(255,179,0,0.55)",
                  opacity: Math.min(1, zP * 1.6),
                  transform: `translateY(${(1 - zP) * 20}px)`,
                }}
              >
                <div style={{ position: "absolute", left: 20, top: 20 }}>
                  <IconTile icon="wave" size={90} />
                </div>
                <div style={{ position: "absolute", left: 134, top: 42, ...TX.label, fontSize: 36, whiteSpace: "nowrap" }}>звук уже в записи</div>
                <div style={{ position: "absolute", right: 24, top: 30 }}>
                  <ScrollWave f={f} start={k.wZvuk} w={140} h={70} gap={14} bar={7} speed={2} />
                </div>
              </div>
            )}
          </div>
        </Frame>
      </Pop>
    </>
  );
};

/** Итог страницы «действие» — строка вердиктов; живёт до конца сцены. */
const SUM: { t: string; ok: boolean }[] = [
  { t: "кивки", ok: true },
  { t: "взгляд", ok: true },
  { t: "ладонь", ok: true },
  { t: "«вздыхает»", ok: false },
  { t: "«шепчет»", ok: false },
];
const SummaryBar: React.FC<{ f: number; k: K }> = ({ f, k }) => (
  <div style={{ position: "absolute", left: X0, top: 252, height: 50, display: "flex", alignItems: "center", gap: 16 }}>
    <div style={{ ...TX.kicker, fontSize: 24, whiteSpace: "nowrap", opacity: eo(f, k.wEsli + 4, 10) }}>ДЕЙСТВИЕ:</div>
    {SUM.map((s, i) => (
      <Verdict key={i} f={f} start={k.wEsli + 12 + i * 3} text={s.t} ok={s.ok} size={26} />
    ))}
  </div>
);

// ═══ 7. чиним только губы ════════════════════════════════════════════════════════════════════════════════
const PL: Rect = { x: X0, y: 350, w: 860, h: 470 };
const PV = { x: 26, y: 26, w: 808, h: 360 };
const MOUTH = { x: 404, y: 190 }; // центр рта в кадре видео (портрет 400×300 → ×1,2, сдвиг 164)
const RC = 1040;

const FixPage: React.FC<{ f: number; k: K }> = ({ f, k }) => {
  const pP = sp(f, k.wEsli + 8, "pop");
  const spot = eo(f, k.bFix, 12);
  const lay = eo(f, k.wOtd, 10) * (1 - spot);
  const lchip = sp(f, k.wOtd + 4, "bouncy");
  const pCard = sp(f, k.bFix, "pop");
  const hg = interpolateColors(eo(f, k.bFix + 4, 10), [0, 1], [C.text, C.accent]);
  const it = interpolateColors(eo(f, k.wInf2, 10), [0, 1], [C.text, C.accent]);
  const prog = lin(f, k.wEsli + 8, 300);
  return (
    <>
      <Pop x={PL.x} y={PL.y} w={PL.w} h={PL.h} p={pP} from="left" d={50}>
        <Frame w={PL.w} h={PL.h} kind="plain">
          <div style={{ position: "absolute", left: PV.x, top: PV.y }}>
            <VideoBox w={PV.w} h={PV.h}>
              <Portrait f={f} w={PV.w} h={PV.h} o={ampAt(f, k.wEsli, 200)} uid="l1face-fix" />
              {spot > 0 && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    opacity: spot,
                    background: `radial-gradient(circle at ${MOUTH.x}px ${MOUTH.y}px, rgba(11,12,16,0) 50px, rgba(11,12,16,0.8) 54px)`,
                  }}
                />
              )}
              {spot > 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: MOUTH.x - 54,
                    top: MOUTH.y - 54,
                    width: 108,
                    height: 108,
                    borderRadius: "50%",
                    border: `4px solid ${C.accent}`,
                    boxShadow: "0 0 30px rgba(255,179,0,0.45)",
                    opacity: spot,
                  }}
                />
              )}
              <div style={{ position: "absolute", left: MOUTH.x - 54, top: MOUTH.y - 54, width: 108, height: 108 }}>
                <Ripple f={f} start={k.bFix + 4} size={108} />
                <Ripple f={f} start={k.wGuby2} size={108} />
              </div>
              {lay > 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: MOUTH.x - 90,
                    top: MOUTH.y - 46,
                    width: 180,
                    height: 92,
                    borderRadius: 18,
                    border: `3px dashed ${C.accent}`,
                    opacity: lay,
                  }}
                />
              )}
              {lchip > 0.002 && (
                <div style={{ position: "absolute", left: MOUTH.x + 110, top: MOUTH.y - 23, opacity: Math.min(1, lchip * 1.6), transform: `translateX(${(1 - lchip) * -20}px)` }}>
                  <Chip text="слой: губы" icon="layers" tone="outline" size={24} />
                </div>
              )}
              <div style={{ position: "absolute", left: 16, top: 14, ...TX.kicker, fontSize: 24 }}>РОЛИК</div>
            </VideoBox>
          </div>
          <div style={{ position: "absolute", left: PV.x, top: 412, width: PV.w, height: 10, borderRadius: 5, background: "rgba(243,239,230,0.1)" }}>
            <div style={{ width: `${100 * prog}%`, height: 10, borderRadius: 5, background: C.accent, opacity: 0.85 }} />
            <div style={{ position: "absolute", left: `calc(${100 * prog}% - 9px)`, top: -4, width: 18, height: 18, borderRadius: 9, background: C.text }} />
          </div>
        </Frame>
      </Pop>

      <DashSlot f={f} a={k.wEsli + 14} z={k.bFix} r={{ x: RC, y: 557, w: 740, h: 170 }} radius={22} hint="чем чинить губы?" />
      <DashSlot f={f} a={k.wEsli + 18} z={k.wOst} r={{ x: RC, y: 757, w: 600, h: 57 }} radius={29} />
      <div style={{ position: "absolute", left: RC, top: 360 }}>
        <Verdict f={f} start={k.wPered} text="переделывать весь ролик" ok={false} size={30} />
      </div>
      <Pop x={RC} y={447} p={sp(f, k.wOtd, "pop")} from="right" d={40}>
        <Plate icon="layers" text="отдельный маленький слой" size={30} accent />
      </Pop>
      <Pop x={RC} y={557} w={740} h={170} p={pCard} from="right" d={60}>
        <Fl f={f} seed={8}>
          <Frame w={740} h={170} kind="plain" glow={glowWin(f, k.bFix, k.bFix + 30, 0.4)}>
            <div style={{ position: "absolute", left: 34, top: 26, ...TX.title, fontSize: 44, whiteSpace: "nowrap" }}>
              <span style={{ color: hg }}>HeyGen</span>
              <span style={{ color: C.muted }}> / </span>
              <span style={{ color: it }}>InfiniTalk</span>
            </div>
            <div style={{ position: "absolute", left: 34, top: 96, ...TX.label, fontSize: 30, whiteSpace: "nowrap" }}>
              чинят только <span style={{ color: C.accent }}>губы</span>
            </div>
          </Frame>
        </Fl>
      </Pop>
      <div style={{ position: "absolute", left: RC, top: 757 }}>
        <Verdict f={f} start={k.wOst} text="остальной ролик не трогают" ok size={30} />
      </div>
    </>
  );
};

// ═══ сцена ═══════════════════════════════════════════════════════════════════════════════════════════════
export const Face: React.FC<SceneProps> = ({ f, b, t0, w }) => {
  const k = frames(b, t0, w);
  return (
    <>
      <Header f={f} pages={heads(k)} />
      <Page f={f} a={k.t0} z={k.bKie}>
        <PodiumPage f={f} k={k} />
      </Page>
      <Page f={f} a={k.bKie} z={k.bSwap}>
        <KiePage f={f} k={k} />
      </Page>
      <Page f={f} a={k.bSwap} z={k.bPhoto}>
        <StackPage f={f} k={k} />
      </Page>
      <Page f={f} a={k.bPhoto} z={k.bEng}>
        <SchemePage f={f} k={k} />
      </Page>
      <Page f={f} a={k.bEng} z={k.bVis}>
        <PromptPage f={f} k={k} />
      </Page>
      <Page f={f} a={k.bVis} z={k.wEsli}>
        <ActionsPage f={f} k={k} />
      </Page>
      <Page f={f} a={k.wEsli}>
        <SummaryBar f={f} k={k} />
        <FixPage f={f} k={k} />
      </Page>
    </>
  );
};
