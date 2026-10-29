import React from "react";
import { C, MONO } from "../../theme";
import { sp } from "../anim";
import { CheckBadge, Frame, Pop, TX } from "../ui";

/** Row of numbered tiles (rules / errors). `at[i]` springs tile i in; `done[i]` puts a check on it. */
export const TileRow: React.FC<{
  f: number;
  titles: string[];
  at: number[];
  y: number;
  x0?: number;
  w?: number;
  h?: number;
  gap?: number;
  kicker?: string;
  done?: number[];
  hl?: (i: number) => number;
  dim?: (i: number) => number;
  dy?: (i: number) => number;
}> = ({ f, titles, at, y, x0 = 160, w = 387, h = 188, gap = 24, kicker = "правило", done, hl, dim, dy }) => (
  <>
    {titles.map((t, i) => {
      const p = sp(f, at[i], "pop");
      const g = hl ? hl(i) : 0;
      return (
        <Pop key={i} x={x0 + i * (w + gap)} y={y + (dy ? dy(i) : 0)} w={w} h={h} p={p} d={50} s0={0.9} style={{ perspective: 900 }}>
          <div style={{ width: "100%", height: "100%", transformOrigin: "50% 100%", transform: `rotateX(${-(1 - Math.min(1, p)) * 70}deg)`, opacity: 1 - (dim ? dim(i) : 0) }}>
            <Frame w={w} h={h} kind="plain" glow={g} tone={done && f >= done[i] ? C.ok : C.accent}>
              <div style={{ position: "absolute", left: 26, top: 22, display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 30, color: C.accent }}>{String(i + 1).padStart(2, "0")}</span>
                <span style={{ ...TX.kicker, fontSize: 24 }}>{kicker}</span>
              </div>
              <div style={{ position: "absolute", left: 26, right: 22, top: 76, ...TX.title, fontSize: Math.min(36, w / 10.5), lineHeight: 1.1 }}>{t}</div>
              {done && f >= done[i] && (
                <div style={{ position: "absolute", right: 16, top: 14, width: 56, height: 56 }}>
                  <CheckBadge f={f} start={done[i]} size={56} />
                </div>
              )}
            </Frame>
          </div>
        </Pop>
      );
    })}
  </>
);
