import React from "react";
import { C } from "../theme";

// Hand-drawn line icons on a 48×48 grid (no packages, no brand marks). Stroke follows `color`;
// shapes listed in FILLED are solid.
const GEAR = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 === 0 ? 17 : 13;
    const a2 = a + Math.PI / 16;
    pts.push(`${24 + r * Math.cos(a)} ${24 + r * Math.sin(a)}`, `${24 + r * Math.cos(a2)} ${24 + r * Math.sin(a2)}`);
  }
  return `M${pts.join(" L")} Z M30 24a6 6 0 1 1-12 0a6 6 0 1 1 12 0`;
})();

const PATHS = {
  user: "M31 17a7 7 0 1 1-14 0a7 7 0 1 1 14 0 M10 41c1.5-8 7-12.5 14-12.5s12.5 4.5 14 12.5",
  team: "M29 15a5 5 0 1 1-10 0a5 5 0 1 1 10 0 M16 20a4 4 0 1 1-8 0a4 4 0 1 1 8 0 M40 20a4 4 0 1 1-8 0a4 4 0 1 1 8 0 M14 38c1-7 5-11 10-11s9 4 10 11 M4 37c.6-5 3.4-8 7-8.4 M44 37c-.6-5-3.4-8-7-8.4",
  keyboard: "M4 14h40v22H4z M10 21h2 M17 21h2 M24 21h2 M31 21h2 M37 21h2 M10 27h2 M17 27h2 M24 27h2 M31 27h2 M37 27h2 M15 31h18",
  laptop: "M10 11h28v20H10z M4 37h40l-3-6H7z",
  hourglass: "M13 5h22 M13 43h22 M16 5c0 11 15 12 15 19s-15 8-15 19 M32 5c0 11-15 12-15 19s15 8 15 19",
  calendar: "M7 10h34v30H7z M7 18h34 M16 5v9 M32 5v9",
  search: "M33 21a12 12 0 1 1-24 0a12 12 0 1 1 24 0 M30 30l11 11",
  sun: "M32 24a8 8 0 1 1-16 0a8 8 0 1 1 16 0 M24 4v6 M24 38v6 M4 24h6 M38 24h6 M10 10l4 4 M34 34l4 4 M38 10l-4 4 M14 34l-4 4",
  phone: "M14 4h20v40H14z M21 38h6",
  bot: "M10 15h28v22H10z M24 8v7 M6 23v7 M42 23v7 M19 30h10",
  table: "M6 9h36v30H6z M6 18h36 M6 28h36 M19 9v30 M31 9v30",
  check: "M11 25l8.5 8.5L37 15",
  cross: "M14 14l20 20 M34 14L14 34",
  link: "M20 28a7 7 0 0 0 10 0l6-6a7 7 0 0 0-10-10l-2 2 M28 20a7 7 0 0 0-10 0l-6 6a7 7 0 0 0 10 10l2-2",
  bell: "M13 34V22a11 11 0 0 1 22 0v12l3 3H10z M20 40a4 4 0 0 0 8 0",
  chart: "M7 41h34 M13 35V25 M21 35V17 M29 35V22 M37 35V11",
  bulb: "M18 35h12 M19.5 41h9 M24 6a11 11 0 0 1 7 19.5c-1.6 1.3-2 3-2 4.5H19c0-1.5-.4-3.2-2-4.5A11 11 0 0 1 24 6z",
  house: "M7 23L24 9l17 14 M12 19v22h24V19 M21 41V30h6v11",
  gear: GEAR,
  doc: "M12 5h16l9 9v29H12z M28 5v9h9 M18 23h13 M18 29h13 M18 35h8",
  warn: "M24 6l20 35H4z M24 18v11 M24 34.5v.5",
  send: "M5 22L43 6 31 43l-7-15z M24 28L43 6",
  clock: "M41 24a17 17 0 1 1-34 0a17 17 0 1 1 34 0 M24 13v11l7 5",
  code: "M16 14L6 24l10 10 M32 14l10 10-10 10 M27 9l-6 30",
  target: "M41 24a17 17 0 1 1-34 0a17 17 0 1 1 34 0 M32 24a8 8 0 1 1-16 0a8 8 0 1 1 16 0 M24 24h.01",
  blocks: "M7 7h14v14H7z M27 7h14v14H27z M7 27h14v14H7z M27 27h14v14H27z",
  chat: "M6 8h36v24H20l-9 8v-8H6z",
  briefcase: "M5 15h38v26H5z M17 15v-6h14v6 M5 26h38",
  box: "M24 4l18 9v22l-18 9-18-9V13z M6 13l18 9 18-9 M24 22v22",
  plus: "M24 10v28 M10 24h28",
  play: "M16 10v28l22-14z",
  arrow: "M8 24h30 M28 14l10 10-10 10",
  moon: "M22.7 8A16 16 0 1 0 39.7 27.2A13 13 0 0 1 22.7 8z",
  spark: "M24 5C25.6 17 31 22.4 43 24C31 25.6 25.6 31 24 43C22.4 31 17 25.6 5 24C17 22.4 22.4 17 24 5z",
  quote: "M8 33c0-9 4.5-15.5 11-18v5.5c-3.4 1.6-5 4.3-5 7.5h6v11H8z M27 33c0-9 4.5-15.5 11-18v5.5c-3.4 1.6-5 4.3-5 7.5h6v11H27z",
  zap: "M27 4L11 27h12l-3 17 17-24H25z",
  ruble: "M18 40V8h10a8 8 0 0 1 0 16H13 M13 32h16",
  key: "M26 18a8 8 0 1 1-16 0a8 8 0 1 1 16 0 M23.7 23.7L42 42 M33 33l5-5 M38 38l4-4",
  lock: "M12 22h24v20H12z M17 22v-6a7 7 0 0 1 14 0v6 M24 30v5",
  globe: "M42 24a18 18 0 1 1-36 0a18 18 0 1 1 36 0 M6 24h36 M24 6c6 5 8 11 8 18s-2 13-8 18c-6-5-8-11-8-18s2-13 8-18z",
  shield: "M24 4l16 6v12c0 10-7 18-16 22C15 40 8 32 8 22V10z M17 23l5 5 9-10",
  server: "M8 8h32v12H8z M8 28h32v12H8z M14 14h.01 M14 34h.01 M22 14h12 M22 34h12",
  disk: "M40 12c0 3.3-7.2 6-16 6S8 15.3 8 12s7.2-6 16-6 16 2.7 16 6z M8 12v24c0 3.3 7.2 6 16 6s16-2.7 16-6V12 M8 24c0 3.3 7.2 6 16 6s16-2.7 16-6",
  bug: "M16 18h16v12a8 8 0 0 1-16 0z M18 18a6 6 0 0 1 12 0 M24 22v16 M16 24H9 M32 24h7 M16 31l-6 4 M32 31l6 4 M18 13l-4-4 M30 13l4-4",
  flame: "M24 4c2 8 12 12 12 24a12 12 0 0 1-24 0c0-6 3-9 5-12 1 4 3 6 5 6-1-6 0-12 2-18z",
  rake: "M8 42L33 17 M27 9l14 14 M28.5 10.5l-4 4 M32 14l-4 4 M35.5 17.5l-4 4 M39 21l-4 4",
  wrench: "M30 6a10 10 0 0 0-9 14L6 35l7 7 15-15a10 10 0 0 0 14-9l-6 6-6-2-2-6z",
  eye: "M4 24s7-13 20-13 20 13 20 13-7 13-20 13S4 24 4 24z M30 24a6 6 0 1 1-12 0a6 6 0 1 1 12 0",
  pin: "M24 44s14-13 14-24a14 14 0 0 0-28 0c0 11 14 24 14 24z M29 20a5 5 0 1 1-10 0a5 5 0 1 1 10 0",
  undo: "M14 16H30a10 10 0 0 1 0 20H18 M20 8l-8 8 8 8",
  pencil: "M32 8l8 8-24 24H8v-8z M28 12l8 8",
  scissors: "M18 14a6 6 0 1 1-12 0a6 6 0 1 1 12 0 M18 34a6 6 0 1 1-12 0a6 6 0 1 1 12 0 M17 17l25 20 M17 31l25-20",
  mail: "M6 12h36v24H6z M6 12l18 14 18-14",
  question: "M17 17a7 7 0 1 1 10 6.3c-2 1-3 2.4-3 4.7 M24 35.5v.5",
  dollar: "M24 5v38 M33 14c-2-3-5.5-4.5-9-4.5-5 0-8.5 3-8.5 6.5 0 9 18 5 18 14 0 3.5-3.5 6.5-9 6.5-4 0-7.5-1.5-9.5-4.5",
  trend: "M6 36l12-12 8 8 16-16 M32 16h10v10",
  card: "M4 11h40v27H4z M4 18h40 M10 31h9",
  route: "M10 38a4 4 0 1 1 0 .01 M38 10a4 4 0 1 1 0 .01 M10 34V22a6 6 0 0 1 6-6h8a6 6 0 0 0 6-6V10 M34 14h-4",
  // additional generic shapes (no brand marks)
  brain:
    "M23 9c-3-3-9-2-10 3-4 0-6 4-4 7-3 2-3 7 0 9-1 4 2 8 6 8 2 3 6 3 8 1z M25 9c3-3 9-2 10 3 4 0 6 4 4 7 3 2 3 7 0 9 1 4-2 8-6 8-2 3-6 3-8 1z M15 20c2.5 0 4.5 1 5.5 3 M33 20c-2.5 0-4.5 1-5.5 3 M14 31c3-1 5.5 0 6.5 2 M34 31c-3-1-5.5 0-6.5 2",
  dumbbell: "M15 24h18 M9 17v14 M14 13v22 M34 13v22 M39 17v14 M4 24h5 M39 24h5",
  door: "M12 43V6h24v37 M6 43h36 M30 25h.01",
  trophy: "M15 7h18v10a9 9 0 0 1-18 0z M15 11H8c0 6 3 9 7 9 M33 11h7c0 6-3 9-7 9 M24 26v8 M19 34h10v7H19z M15 41h18",
  mic: "M18 10a6 6 0 0 1 12 0v12a6 6 0 0 1-12 0z M11 21a13 13 0 0 0 26 0 M24 34v8 M17 42h14",
  folder: "M5 12h14l4 5h20v23H5z M5 20h38",
  terminal: "M5 8h38v32H5z M12 18l7 6-7 6 M23 31h12",
  cap: "M4 18l20-9 20 9-20 9z M12 22v10c0 3 6 6 12 6s12-3 12-6V22 M44 18v12",
  drop: "M24 5c7 10 14 17 14 25a14 14 0 0 1-28 0c0-8 7-15 14-25z M17 31a7 7 0 0 0 7 7",
  gauge: "M8 34a16 16 0 1 1 32 0 M24 34l9-11 M12 34h.01 M36 34h.01",
  book: "M8 7h26a4 4 0 0 1 4 4v30H12a4 4 0 0 1-4-4z M8 37a4 4 0 0 1 4-4h26 M15 15h15",
  tree: "M24 4l11 15h-6l9 12H10l9-12h-6z M24 31v12",
  wheel: "M41 24a17 17 0 1 1-34 0a17 17 0 1 1 34 0 M28 24a4 4 0 1 1-8 0a4 4 0 1 1 8 0 M24 7v13 M24 28v13 M7 24h13 M28 24h13",
  cloud: "M14 38a9 9 0 0 1-1-18 12 12 0 0 1 23-3 10 10 0 0 1 2 21z",
  branch: "M14 10a4 4 0 1 1 0 .01 M14 38a4 4 0 1 1 0 .01 M34 14a4 4 0 1 1 0 .01 M14 14v20 M34 18c0 9-16 7-19 16",
  video: "M5 13h26v22H5z M31 21l12-7v20l-12-7",
  image: "M6 9h36v30H6z M6 32l11-11 9 9 6-6 10 10 M33 17a3 3 0 1 1-6 0a3 3 0 1 1 6 0",
  wave: "M6 24h3 M14 17v14 M20 10v28 M26 18v12 M32 13v22 M38 20v8 M43 24h-1",
  trash: "M8 12h32 M18 12V7h12v5 M12 12l2 30h20l2-30 M20 19v16 M28 19v16",
  star: "M24 5l5.6 12.3 13.4 1.4-10 9.1 2.8 13.2L24 34.3 12.2 41l2.8-13.2-10-9.1 13.4-1.4z",
  copy: "M17 17h24v25H17z M7 7h24v5 M7 7v25h5",
  chip: "M11 13h26v22H11z M16 13V7 M22 13V7 M28 13V7 M34 13V7 M16 35v6 M22 35v6 M28 35v6 M34 35v6 M17 19h14v10H17z",
  passport: "M11 5h26v38H11z M30 20a6 6 0 1 1-12 0a6 6 0 1 1 12 0 M17 33h14",
  logout: "M20 8H8v32h12 M30 16l8 8-8 8 M18 24h20",
  cursor: "M11 6l25 15-11 3 7 13-5 3-7-13-8 8z",
  scales: "M24 6v36 M14 42h20 M8 12h32 M8 12l-5 12a5 5 0 0 0 10 0z M40 12l-5 12a5 5 0 0 0 10 0z",
  list: "M17 12h25 M17 24h25 M17 36h25 M7 12h.01 M7 24h.01 M7 36h.01",
  layers: "M24 6l19 9-19 9-19-9z M5 24l19 9 19-9 M5 33l19 9 19-9",
  mountain: "M3 41l15-24 8 11 6-8 13 21z M18 17l-4 7 4-2 4 2",
  axe: "M8 42L29 21 M23 8c8-1 16 6 15 14l-7 1-9-9z",
  // more generic shapes (no brand marks)
  fingerprint:
    "M13 38c-2-4-3-9-3-14a14 14 0 0 1 28 0c0 3 0 6-1 8 M18 41c-2-5-3-11-3-17a9 9 0 0 1 18 0c0 6-1 11-2 15 M24 43c-1-6-2-12-2-19a2 2 0 0 1 4 0c0 7 1 12 3 17 M15 10a16 16 0 0 1 18 0",
  tablet: "M9 5h30v38H9z M21 38h6",
  monitor: "M5 8h38v26H5z M17 42h14 M24 34v8",
  crown: "M6 36l3-22 9 10 6-14 6 14 9-10 3 22z M8 42h32",
  camera: "M5 15h9l4-6h12l4 6h9v25H5z M32 27a8 8 0 1 1-16 0a8 8 0 1 1 16 0",
  wand: "M8 40L31 17 M31 6v6 M42 17h-6 M38 9l-4 4 M22 8l1 4 M40 27l-4-1",
  cart: "M4 8h6l5 24h22l5-17H13 M19 40a3 3 0 1 1 0 .01 M35 40a3 3 0 1 1 0 .01",
  heart: "M24 41S7 30 7 18a9 9 0 0 1 17-4 9 9 0 0 1 17 4c0 12-17 23-17 23z",
  hand: "M18 26V10a3 3 0 0 1 6 0v12 M24 20a3 3 0 0 1 6 0v4 M30 22a3 3 0 0 1 6 0v6 M18 26l-3-3a3 3 0 0 0-4 4l7 10c2 3 5 5 9 5h3c5 0 9-4 9-9v-5",
  chef: "M14 26a8 8 0 0 1 2-15.6A9 9 0 0 1 32 10.4 8 8 0 0 1 34 26v14H14z M14 33h20",
  plane: "M44 22c0-2-2-3-4-3H29L19 5h-5l5 14H10l-4-5H3l2 9-2 9h3l4-5h9l-5 14h5l10-14h11c2 0 4-1 4-3z",
} as const;

export type IconName = keyof typeof PATHS;
const FILLED: Partial<Record<IconName, true>> = { play: true, moon: true, spark: true, quote: true, zap: true, flame: true, star: true, heart: true };

export const Icon: React.FC<{ name: IconName; size?: number; color?: string; sw?: number; style?: React.CSSProperties }> = ({
  name,
  size = 48,
  color = C.text,
  sw = 3.4,
  style,
}) => {
  const filled = FILLED[name];
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: "block", overflow: "visible", ...style }}>
      <path
        d={PATHS[name]}
        fill={filled ? color : "none"}
        stroke={filled ? "none" : color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
