import React from "react";
import { SceneProps } from "../../types";
import { Axe } from "./Axe";
import { Control } from "./Control";
import { Cost } from "./Cost";
import { Face } from "./Face";
import { Forums } from "./Forums";
import { Frames } from "./Frames";
import { Harness } from "./Harness";
import { Hook } from "./Hook";
import { Layers } from "./Layers";
import { Leadgen } from "./Leadgen";
import { Motion } from "./Motion";
import { Outro } from "./Outro";
import { Parallel } from "./Parallel";
import { Repeat } from "./Repeat";
import { Script } from "./Script";
import { Voice } from "./Voice";

/** Урок 1 (композиция Lesson1, «Как сделано это видео»): тип сцены → компонент. Файл собирает scripts/skeleton.py. */
export const L1_SCENES: Record<string, React.FC<SceneProps>> = {
  l1_hook: Hook,
  l1_leadgen: Leadgen,
  l1_layers: Layers,
  l1_script: Script,
  l1_voice: Voice,
  l1_face: Face,
  l1_motion: Motion,
  l1_frames: Frames,
  l1_forums: Forums,
  l1_axe: Axe,
  l1_harness: Harness,
  l1_parallel: Parallel,
  l1_cost: Cost,
  l1_control: Control,
  l1_repeat: Repeat,
  l1_outro: Outro,
};
