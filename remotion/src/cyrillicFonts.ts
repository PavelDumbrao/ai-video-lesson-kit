import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";

// Local Cyrillic font library: public/fonts/<id>/{cyrillic,latin}-<weight>-<style>.woff2.
const RANGE = {
  cyrillic: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116",
  latin:
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
};

export type CyrFont = { id: string; family: string; weights: number[]; style?: "normal" | "italic" };

const faces = new Map<string, Promise<boolean>>();

/** Registers the woff2 files of each font and resolves per font: true when every file loaded. */
export const loadCyrillicFonts = (fonts: CyrFont[]): Promise<boolean[]> =>
  Promise.all(
    fonts.map((f) =>
      Promise.all(
        f.weights.flatMap((w) =>
          (["cyrillic", "latin"] as const).map((sub) => {
            const key = `${f.id}/${sub}-${w}-${f.style ?? "normal"}`;
            if (!faces.has(key)) {
              const face = new FontFace(f.family, `url("${staticFile(`fonts/${key}.woff2`)}") format("woff2")`, {
                weight: String(w),
                style: f.style ?? "normal",
                unicodeRange: RANGE[sub],
              });
              faces.set(
                key,
                face.load().then(
                  (ff) => {
                    document.fonts.add(ff);
                    return true;
                  },
                  (e) => {
                    console.error(`font ${key} failed to load`, e);
                    return false;
                  },
                ),
              );
            }
            return faces.get(key) as Promise<boolean>;
          }),
        ),
      ).then((r) => r.every(Boolean)),
    ),
  );

/** Holds the render until the fonts are loaded; returns per-font load status (null while loading). */
export const useCyrillicFonts = (fonts: CyrFont[]): boolean[] | null => {
  const [handle] = useState(() => delayRender("cyrillic-fonts", { timeoutInMilliseconds: 60000 }));
  const [ok, setOk] = useState<boolean[] | null>(null);
  useEffect(() => {
    loadCyrillicFonts(fonts).then(setOk);
    // fonts is a static list per composition
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (ok) continueRender(handle);
  }, [ok, handle]);
  return ok;
};
