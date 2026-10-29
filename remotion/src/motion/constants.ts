/**
 * src/motion/constants.ts
 * Shared layout and timing constants for Remotion scenes.
 * Eliminates magic numbers and enforces hard-learned production standards (Lessons 27-28).
 */

export const LAYOUT = {
  // Safe container positioning for content cards
  CONTENT_CARDS_TOP: 250,
  CONTENT_CARDS_HEIGHT: 570,
  CONTAINER_LEFT: 140,
  CONTAINER_WIDTH: 1640,

  // Typography limits to avoid 2-line title collisions
  TITLE_MAX_FONT: 38,
  TITLE_DEFAULT_FONT: 36,
  MIN_GAP_TITLE_CARDS: 35,

  // Padding standards (protects against border-radius clipping)
  CARD_PADDING_OUTER: "26px 34px",
  CARD_PADDING_INNER: "14px 20px",
  CARD_BORDER_RADIUS: 20,
} as const;

export const ANIM_TIMING = {
  // Exit transition timing relative to next beat (bNext)
  EXIT_LEAD: 6,       // Frames before bNext to initiate exit
  EXIT_DURATION: 10,  // Standard duration for soft exit transition
} as const;
