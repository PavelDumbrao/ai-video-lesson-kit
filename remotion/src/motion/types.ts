import { Timeline } from "../theme";

export type Beat = { t: number; word: string; label: string };
export type SceneDef = { section: number; title: string; type: string; s: number; e: number; beats: Beat[] };
export type Storyboard = { scenes: SceneDef[] };

/** What every scene component receives. All values are absolute video frames. */
export type SceneProps = {
  f: number; // current frame
  b: number[]; // beat frames: 3 frames of anticipation before the word, never before t0
  t0: number; // the section card starts flying off — the scene may enter
  t1: number; // the scene starts leaving (~10 frames before the next section)
  w: (prefix: string, after?: number) => number; // frame of the first word in this section starting with `prefix` (optionally spoken at/after `after` s)
  scene: SceneDef;
  tl: Timeline;
};
