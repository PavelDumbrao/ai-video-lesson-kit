import React from "react";
import { AbsoluteFill } from "remotion";
import { at, CARD_HOLD, cardStart, Keyword, Timeline } from "../theme";
import { ei } from "./anim";
import { SCENES } from "./scenes";
import { SceneDef, Storyboard } from "./types";

export const EXIT = 12; // frames a scene takes to leave
const EXIT_LEAD = 14; // the exit starts this many frames before the next section (its card starts 9 frames before)

export const sceneWindow = (sc: SceneDef, tl: Timeline) => {
  const sec = tl.sections[sc.section] ?? { title: sc.title, s: sc.s, e: sc.e };
  const end = at(sc.e);
  return { t0: cardStart(sec) + CARD_HOLD - 2, t1: end - EXIT_LEAD, end };
};

/** True when the lesson has at least one scene type we can draw → motion layout. */
export const isMotion = (sb?: Storyboard) => !!sb && sb.scenes.some((s) => SCENES[s.type]);

/** Section index → its drawable scene (unknown types are left to the v1 keyword fallback). */
export const sceneFor = (sb: Storyboard | undefined, section: number) =>
  sb?.scenes.find((s) => s.section === section && SCENES[s.type]);

/** Frame at which the scene owning keyword `k` starts leaving (background keywords end with it). */
export const keywordSceneEnd = (sb: Storyboard | undefined, tl: Timeline, k: Keyword) => {
  const sc = sceneFor(sb, k.sec);
  return sc ? sceneWindow(sc, tl).t1 : Infinity;
};

const strip = (t: string) => t.toLowerCase().replace(/^[«"„(]+/, "");

export const SceneLayer: React.FC<{ frame: number; tl: Timeline; sb: Storyboard }> = ({ frame, tl, sb }) => (
  <>
    {sb.scenes.map((sc, i) => {
      const Comp = SCENES[sc.type];
      if (!Comp) return null;
      const { t0, t1, end } = sceneWindow(sc, tl);
      if (frame < t0 - 1 || frame > end + 1) return null;
      const b = sc.beats.map((bt) => Math.max(at(bt.t) - 3, t0));
      const words = tl.words.filter((wd) => wd.sec === sc.section);
      const w = (prefix: string, after = -1) => {
        const p = prefix.toLowerCase();
        const hit = words.find((wd) => wd.s >= after && strip(wd.t).startsWith(p));
        return hit ? Math.max(at(hit.s) - 3, t0) : t0;
      };
      const x = ei(frame, t1, EXIT);
      return (
        <AbsoluteFill key={i} style={{ opacity: 1 - x, transform: `translateY(${-22 * x}px) scale(${1 - 0.025 * x})` }}>
          <Comp f={frame} b={b} t0={t0} t1={t1} w={w} scene={sc} tl={tl} />
        </AbsoluteFill>
      );
    })}
  </>
);
