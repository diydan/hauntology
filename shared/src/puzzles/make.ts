import { hash, mulberry32, randInt, range, shuffle, type Rng } from "./rng";
import type { BuiltKind, Level, Lock } from "./types";

/** Number of wire looks (colour, pattern and end shape) the screens can draw. */
export const WIRE_STYLES = 6;

function uniqueSpaced(r: Rng, n: number, lo: number, hi: number, minGap: number): number[] {
  for (let tries = 0; tries < 200; tries++) {
    const xs = range(n).map(() => lo + r() * (hi - lo));
    let ok = true;
    for (let i = 1; i < n; i++) if (Math.abs((xs[i] as number) - (xs[i - 1] as number)) < minGap) ok = false;
    if (ok) return xs.map((x) => Math.round(x * 10) / 10);
  }
  return range(n).map((i) => lo + ((hi - lo) * i) / Math.max(1, n - 1)); // never reached in practice; always valid
}

/**
 * Make a Lock. Deterministic, and it takes nothing but a Kind, a level and a seed, so it cannot depend on the
 * Solution, a Hand or a Residue position (Property 1).
 */
export function makeLock(kind: BuiltKind, level: Level, seed: number): Lock {
  const r = mulberry32(hash("lock", kind, level, seed));
  const easy = level === "easy";
  switch (kind) {
    case "lockpick": {
      const pins = easy ? 3 : 4;
      const width = easy ? 14 : 10;
      const centers = uniqueSpaced(r, pins, -40 + width / 2 + 2, 40 - width / 2 - 2, 20);
      return {
        kind, level, seed, sight: null,
        view: { kind, pins, range: [-40, 40], windowDeg: width, dwellMs: 400, centers },
        secret: { kind, centers, width },
      };
    }
    case "wires": {
      const n = easy ? 4 : 5;
      const ids = shuffle(r, range(WIRE_STYLES)).slice(0, n);
      const order = shuffle(r, ids); // top to bottom, shown in the Sight
      const leftOrder = shuffle(r, ids);
      const terminalOf: Record<number, number> = {};
      for (const w of ids) terminalOf[w] = order.indexOf(w);
      return { kind, level, seed, view: { kind, n, leftOrder }, secret: { kind, terminalOf }, sight: { kind, order } };
    }
    case "clock": {
      let h: number;
      let m: number;
      do { h = 1 + randInt(r, 12); m = 5 * randInt(r, 12); } while (h === 12 && m === 0); // not the resting hands
      return { kind, level, seed, view: { kind, stepMin: 5 }, secret: { kind, h, m }, sight: { kind, h, m } };
    }
  }
}
