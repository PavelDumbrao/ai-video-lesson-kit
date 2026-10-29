/**
 * src/motion/validate.ts
 * Runtime and build-time layout assertion helper.
 * Catches visual collision bugs (Lessons 27-28) before expensive cloud rendering.
 */

import { LAYOUT } from "./constants";

export interface SceneLayoutProps {
  titleFontSize?: number;
  cardsTop?: number;
  sceneName?: string;
  headerAlignItems?: string;
}

export function validateSceneLayout(props: SceneLayoutProps): void {
  const { titleFontSize, cardsTop, sceneName = "Scene", headerAlignItems } = props;

  if (headerAlignItems && headerAlignItems === "flex-end") {
    console.warn(
      `[LayoutWarning] ${sceneName}: header row has alignItems: "flex-end". ` +
      `When title wraps to 2 lines, chips will be pushed down into content cards. Use "flex-start".`
    );
  }

  if (titleFontSize !== undefined && titleFontSize > LAYOUT.TITLE_MAX_FONT) {
    console.warn(
      `[LayoutWarning] ${sceneName}: titleFontSize ${titleFontSize}px exceeds max safe limit ${LAYOUT.TITLE_MAX_FONT}px. ` +
      `Multi-line wraps may collide with content cards below.`
    );
  }

  if (cardsTop !== undefined && cardsTop < LAYOUT.CONTENT_CARDS_TOP) {
    console.warn(
      `[LayoutWarning] ${sceneName}: cardsTop ${cardsTop}px < required ${LAYOUT.CONTENT_CARDS_TOP}px. ` +
      `Insufficient vertical clearance from title.`
    );
  }
}
