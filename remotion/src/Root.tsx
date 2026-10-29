import React from "react";
import { Composition } from "remotion";
import { Lesson } from "./Lesson";
import { LESSONS, LessonEntry } from "./lessons";
import { Aroll, FPS, H, lessonFrames, W } from "./theme";

/** Вшивает трек лица (стиль "circle") в каждый непрерывный дубль раскладки. */
const withFace = (a: Aroll, face: NonNullable<LessonEntry["face"]>): Aroll => ({
  ...a,
  segments: a.segments.map((s) => (s.trans ? { ...s, trans: { ...s.trans, face } } : s)),
});

export const Root: React.FC = () => (
  <>
    {LESSONS.map((l) => (
      <Composition
        key={l.n}
        id={`Lesson${l.n}`}
        component={Lesson}
        width={W}
        height={H}
        fps={FPS}
        // голос + 0,5 с (LEAD) + 3 с финальной карточки
        durationInFrames={lessonFrames(l.timeline)}
        defaultProps={{
          lesson: l.n,
          timeline: l.timeline,
          storyboard: l.storyboard,
          ...(l.aroll ? { aroll: l.face ? withFace(l.aroll, l.face) : l.aroll, trStyle: l.trStyle ?? "corner" } : {}),
          ...(l.screens ? { screens: l.screens } : {}),
        }}
      />
    ))}
  </>
);
