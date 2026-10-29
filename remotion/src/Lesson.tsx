import React, { useMemo } from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { ArollLayer, arollChapters, ArollPlate } from "./Aroll";
import { CyrFont, useCyrillicFonts } from "./cyrillicFonts";
import { KaraokeLayer, KeywordBackdrop, KeywordLayer } from "./Captions";
import { isMotion, keywordSceneEnd, SceneLayer, sceneFor } from "./motion/SceneLayer";
import { SectionCard, SectionTexture, TopBar } from "./Sections";
import { at, C, CL, contentDim, EASE_IN, EASE_IO, EASE_OUT, FPS, LEAD, lessonNo, LessonProps, LOGO, MONO, SANS, seriesOf } from "./theme";
import { ScreenLayer, screenPresence } from "./ScreenInsert";
import { LessonFrame, lessonPanel, TransOver, transState, TransUnder, transWindow } from "./Transition";

const FONTS: CyrFont[] = [
  { id: "montserrat", family: "Montserrat", weights: [700, 900] },
  { id: "jetbrains-mono", family: "JetBrains Mono", weights: [400, 700] },
];

// Slow drifting warm light + a cool counter-light, a faint grid, a vignette. Pure function of frame.
const Backdrop: React.FC<{ frame: number; outro: number }> = ({ frame, outro }) => {
  const t = frame / FPS;
  const tau = 2 * Math.PI;
  const x1 = 960 + 560 * Math.sin((t * tau) / 46);
  const y1 = 470 + 230 * Math.cos((t * tau) / 58);
  const x2 = 960 - 620 * Math.sin((t * tau) / 71 + 1.3);
  const y2 = 640 - 200 * Math.cos((t * tau) / 53 + 0.7);
  // in the outro the warm light gathers behind the final card
  const cx = x1 + (960 - x1) * outro;
  const cy = y1 + (500 - y1) * outro;
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1000px circle at ${cx}px ${cy}px, rgba(255,179,0,${0.1 + 0.07 * outro}), rgba(255,179,0,0) 70%)`,
        }}
      />
      <AbsoluteFill
        style={{ background: `radial-gradient(900px circle at ${x2}px ${y2}px, rgba(35,40,51,0.9), rgba(35,40,51,0) 70%)` }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(243,239,230,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(243,239,230,0.05) 1px, transparent 1px)",
          backgroundSize: "96px 96px",
          backgroundPosition: "0 12px",
          WebkitMaskImage: "radial-gradient(ellipse 70% 75% at 50% 50%, #000 15%, transparent 100%)",
        }}
      />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 85% 85% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.42) 100%)" }} />
    </AbsoluteFill>
  );
};

const FinalCard: React.FC<{ frame: number; lesson: number; start: number }> = ({ frame, lesson, start }) => {
  const r = frame - start;
  if (r < 0) return null;
  const series = seriesOf(lesson);
  // hideNo: вместо «Урок N» показываем название урока `sub` (если оно задано), иначе строку не рисуем
  const subLine = series.hideNo ? series.sub : undefined;
  const rise = (d: number) => interpolate(r, [d, d + 24], [0, 1], { ...CL, easing: EASE_OUT });
  const a = rise(0);
  const b = rise(10);
  const c = rise(16);
  const line = interpolate(r, [6, 30], [0, 1], { ...CL, easing: EASE_IO });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          fontFamily: SANS,
          fontWeight: 900,
          fontSize: 120,
          lineHeight: 1.05,
          color: C.accent,
          letterSpacing: `${0.16 - 0.14 * a}em`,
          marginRight: `${-(0.16 - 0.14 * a)}em`, // keep the tracked word optically centred
          textShadow: "0 0 60px rgba(255,179,0,0.3)",
          opacity: a,
          transform: `translateY(${(1 - a) * 30}px)`,
          filter: a < 1 ? `blur(${(1 - a) * 12}px)` : undefined,
        }}
      >
        {series.title}
      </div>
      <div style={{ width: 200, height: 6, margin: "34px 0 30px", background: C.accent, transform: `scaleX(${line})` }} />
      {(subLine || series.hideNo !== true) && (
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 48,
            color: C.text,
            opacity: b,
            transform: `translateY(${(1 - b) * 24}px)`,
          }}
        >
          {subLine ?? (
            <>
              Урок {lessonNo(lesson)}
              {series.total ? ` из ${series.total}` : ""}
            </>
          )}
        </div>
      )}
      {series.author && (
        <div
          style={{
            fontFamily: MONO,
            fontWeight: 400,
            fontSize: 32,
            marginTop: 22,
            letterSpacing: "0.06em",
            color: C.muted,
            opacity: c,
            transform: `translateY(${(1 - c) * 20}px)`,
          }}
        >
          {series.author}
        </div>
      )}
    </AbsoluteFill>
  );
};

// Motion layout: a soft dark band under the karaoke so graphics and captions never compete.
const BottomBand: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      top: 846,
      bottom: 0,
      background: "linear-gradient(180deg, rgba(17,19,24,0) 0px, rgba(17,19,24,0.82) 46px, rgba(17,19,24,0.9) 100%)",
    }}
  />
);

/** Series logo (seriesOf(lesson).logo): static for the whole lesson, bottom-right, above every other layer. */
const SeriesLogo: React.FC<{ src: string }> = ({ src }) => (
  <Img
    src={staticFile(src)}
    style={{ position: "absolute", right: LOGO.right, bottom: LOGO.bottom, height: LOGO.h, width: "auto", opacity: LOGO.opacity }}
  />
);

/** Dims the scene while a real-screen insert is up; without screens it adds no element at all. */
const Dim: React.FC<{ k?: number; children: React.ReactNode }> = ({ k, children }) =>
  k === undefined ? <>{children}</> : <AbsoluteFill style={{ opacity: k }}>{children}</AbsoluteFill>;

export const Lesson: React.FC<LessonProps> = ({ lesson, timeline: tl, storyboard: sb, aroll, trStyle = "corner", screens }) => {
  const frame = useCurrentFrame();
  const fonts = useCyrillicFonts(FONTS);
  const endF = at(tl.duration); // the frame the voice ends
  const outro = interpolate(frame, [endF - 12, endF + 4], [0, 1], { ...CL, easing: EASE_IN });
  const intro = interpolate(frame, [0, 12], [0, 1], CL);
  // Sections that open on an A-roll shot show a chapter plate instead of the big card → nothing to dim for them.
  const chapters = useMemo(() => arollChapters(tl, aroll), [tl, aroll]);
  const dimSections = useMemo(() => (chapters.size ? tl.sections.filter((_, i) => !chapters.has(i)) : tl.sections), [tl, chapters]);
  const dim = contentDim(frame, dimSections);
  const motion = isMotion(sb);
  // Segments with `trans` play as continuous takes (Transition.tsx) instead of hard cuts; "cut" keeps the cuts.
  // Their windows never overlap, so at most one is live at a frame.
  const trWins = useMemo(
    () =>
      trStyle === "cut" || !aroll
        ? []
        : aroll.segments.flatMap((seg) => (seg.trans ? [{ seg, spec: seg.trans, w: transWindow(seg, seg.trans) }] : [])),
    [aroll, trStyle],
  );
  const trSkip = useMemo(() => new Set(trWins.map((x) => x.seg.id)), [trWins]);
  const live = trWins.find((x) => frame >= x.w.start && frame < x.w.end);
  const ts = live ? transState(frame, live.w) : null;
  const tr = ts && live ? { spec: live.spec, w: live.w, ts } : null;
  const trSeg = tr ? live?.seg : undefined;
  // Inside that window the band and karaoke are drawn above the presenter; everywhere else they stay in the content layer.
  const karaoke = motion ? <KaraokeLayer frame={frame} tl={tl} y={936} size={52} /> : <KaraokeLayer frame={frame} tl={tl} />;
  const logo = seriesOf(lesson).logo;

  return (
    <AbsoluteFill style={{ background: C.bg, overflow: "hidden" }}>
      <Sequence from={LEAD} layout="none">
        <Audio src={staticFile(`lesson${lesson}/voice.wav`)} />
      </Sequence>
      {tr && <TransUnder frame={frame} {...tr} style={trStyle} />}
      <LessonFrame panel={lessonPanel(trStyle, ts)}>
        <Backdrop frame={frame} outro={interpolate(frame, [endF - 6, endF + 40], [0, 1], { ...CL, easing: EASE_IO })} />
        {fonts && (
          <AbsoluteFill
            style={{ opacity: dim * (1 - outro), filter: dim < 1 ? `blur(${((1 - dim) / 0.9) * 8}px)` : undefined }}
          >
            {motion && sb ? (
              <>
                <Dim k={screens ? 1 - 0.8 * screenPresence(frame, screens) : undefined}>
                  <KeywordBackdrop frame={frame} tl={tl} filter={(k) => !!sceneFor(sb, k.sec)} until={(k) => keywordSceneEnd(sb, tl, k)} />
                  <SceneLayer frame={frame} tl={tl} sb={sb} />
                </Dim>
                {/* sections without a drawable scene keep the v1 centre keyword */}
                <KeywordLayer frame={frame} tl={tl} filter={(k) => !sceneFor(sb, k.sec)} />
                {/* real-screen inserts sit over the scene, under the karaoke band */}
                {screens && <ScreenLayer frame={frame} screens={screens} />}
                {!tr && (
                  <>
                    <BottomBand />
                    {karaoke}
                  </>
                )}
              </>
            ) : (
              <>
                <SectionTexture frame={frame} tl={tl} />
                <KeywordLayer frame={frame} tl={tl} />
                {!tr && karaoke}
              </>
            )}
          </AbsoluteFill>
        )}
      </LessonFrame>
      {fonts && (
        <>
          {/* under the presenter: a shot that cuts in while a card is still flying off hides the card's tail, and a last
              shot that outlasts the voice (e.g. ends 0.08 s after the voice) cuts away to a final card already rising */}
          <SectionCard frame={frame} tl={tl} skip={chapters} />
          <FinalCard frame={frame} lesson={lesson} start={endF} />
          {tr && trSeg && (
            <>
              <TransOver frame={frame} {...tr} style={trStyle} />
              {motion && <BottomBand />}
              <AbsoluteFill style={{ opacity: 1 - outro }}>{karaoke}</AbsoluteFill>
              <ArollPlate frame={frame} tl={tl} seg={trSeg} />
            </>
          )}
          {aroll && (
            // Presenter full frame over the scenes and keywords (they keep running underneath), never dimmed;
            // the karaoke and its band stay on top of him.
            <ArollLayer frame={frame} tl={tl} aroll={aroll} skip={trSkip}>
              {motion && <BottomBand />}
              <AbsoluteFill style={{ opacity: 1 - outro }}>{karaoke}</AbsoluteFill>
            </ArollLayer>
          )}
          <TopBar frame={frame} tl={tl} lesson={lesson} fade={intro * (1 - outro)} />
        </>
      )}
      {/* last child = on top of everything: graphics, screens, karaoke, presenter full frame, transitions, final card */}
      {logo && <SeriesLogo src={logo} />}
    </AbsoluteFill>
  );
};
