import { MAZES } from "./mazes";
import { hash, mulberry32, randInt, range, shuffle, type Rng } from "./rng";
import type { Kind, Level, Lock, Picture } from "./types";
import { BOARD_CLUES, BOARD_WORDS_3, BOARD_WORDS_4, BOARD_WORDS_5, READ_WORDS_4, READ_WORDS_5, READ_WORDS_6, type BoardWord } from "./words";

/** Number of wire looks (colour, pattern and end shape) the screens can draw. */
export const WIRE_STYLES = 6;
/** Number of shelf item looks the screens can draw. */
export const SHELF_ITEMS = 12;

/** A picture drawn from simple shapes; the same picture is the Sight and the pieces. */
export function makePicture(r: Rng): Picture {
  const hue = randInt(r, 360);
  const shapes = range(9).map((i) => ({
    t: (["circle", "rect", "tri"] as const)[i % 3] as "circle" | "rect" | "tri",
    x: Math.round((0.08 + r() * 0.84) * 1000) / 1000,
    y: Math.round((0.1 + r() * 0.8) * 1000) / 1000,
    s: Math.round((0.1 + r() * 0.16) * 1000) / 1000,
    c: `hsl(${(hue + 40 * (i + 1) + randInt(r, 25)) % 360} ${55 + randInt(r, 25)}% ${45 + randInt(r, 20)}%)`,
    a: randInt(r, 4) * 90,
  }));
  return { top: `hsl(${hue} 45% 22%)`, bottom: `hsl(${(hue + 30) % 360} 55% 58%)`, shapes };
}

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
/** Pick by level: the easy, medium and hard value. */
const by = <T>(level: Level, easy: T, medium: T, hard: T): T => (level === "easy" ? easy : level === "medium" ? medium : hard);

export function makeLock(kind: Kind, level: Level, seed: number): Lock {
  const r = mulberry32(hash("lock", kind, level, seed));
  const pick = <T>(easy: T, medium: T, hard: T): T => by(level, easy, medium, hard);
  switch (kind) {
    case "lockpick": {
      const pins = pick(3, 4, 5);
      const width = pick(14, 10, 8);
      const centers = uniqueSpaced(r, pins, -40 + width / 2 + 2, 40 - width / 2 - 2, 20);
      return {
        kind, level, seed, sight: null,
        view: { kind, pins, range: [-40, 40], windowDeg: width, dwellMs: 400, centers },
        secret: { kind, centers, width },
      };
    }
    case "wires": {
      const n = pick(4, 5, 6);
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
      const stepMin = pick(15, 5, 1) as 15 | 5 | 1; // quarter hours, five minutes, any minute
      do { h = 1 + randInt(r, 12); m = stepMin * randInt(r, 60 / stepMin); } while (h === 12 && m === 0); // not the resting hands
      return { kind, level, seed, view: { kind, stepMin }, secret: { kind, h, m }, sight: { kind, h, m } };
    }
    case "safe": {
      const n = pick(3, 4, 5);
      let code: number[];
      do { code = range(n).map(() => randInt(r, 10)); } while (code.every((d) => d === code[0])); // not all one digit
      return { kind, level, seed, view: { kind, digits: n }, secret: { kind, code }, sight: { kind, code } };
    }
    case "musicbox": {
      const n = pick(3, 4, 5);
      let tune: number[];
      do { tune = range(n).map(() => randInt(r, 5)); } while (tune.every((d) => d === tune[0]));
      return { kind, level, seed, view: { kind, n, plays: pick(3, 3, 2), tune }, secret: { kind, tune }, sight: null };
    }
    case "candles": {
      const n = pick(4, 5, 6);
      const order = shuffle(r, range(n));
      return { kind, level, seed, view: { kind, n, shows: pick(2, 2, 1), order }, secret: { kind, order }, sight: null };
    }
    case "moved": {
      const slots = pick(6, 8, 9);
      const k = pick(2, 3, 4);
      const maxMissing = pick(1, 1, 2);
      const before = shuffle(r, range(SHELF_ITEMS)).slice(0, slots);
      const unused = shuffle(r, range(SHELF_ITEMS).filter((i) => !before.includes(i)));
      const changed = shuffle(r, range(slots)).slice(0, k).sort((a, b) => a - b);
      const after = before.slice();
      let missing = 0;
      let fresh = 0;
      changed.forEach((slot) => {
        const noneLeft = fresh >= unused.length; // hard uses more changes than there are spare things: the rest go missing
        if (noneLeft || (missing < maxMissing && r() < 0.35)) { after[slot] = -1; missing++; } // one thing at most goes missing (two on hard)
        else after[slot] = unused[fresh++] as number;
      });
      return { kind, level, seed, view: { kind, slots, darkMs: pick(2000, 2000, 1500), after }, secret: { kind, changed }, sight: { kind, shelf: before } };
    }
    case "photo": {
      const cols = pick(2, 3, 3);
      const rows = pick(2, 2, 3);
      const picture = makePicture(r);
      const turning = level !== "easy"; // easy: no turning, every piece starts the right way up
      const turns0: number[] = range(cols * rows).map(() => (turning ? randInt(r, 4) : 0));
      if (turning && !turns0.some((t) => t !== 0)) turns0[0] = 1; // at least one piece starts turned
      return { kind, level, seed, view: { kind, cols, rows, picture, turns0, turning }, secret: { kind, turns0 }, sight: { kind, picture, cols, rows } };
    }
    case "words": {
      const list = pick<readonly string[]>(READ_WORDS_4, READ_WORDS_5, READ_WORDS_6);
      const word = list[randInt(r, list.length)] as string;
      const n = word.length;
      const placed = [...word].map((ch, i) => ({ ch, x: Math.round(((i + 0.5) / n + (r() - 0.5) * 0.06) * 1000) / 1000, y: Math.round((0.2 + r() * 0.6) * 1000) / 1000 }));
      const letters = shuffle(r, range(n)).map((i) => placed[i] as (typeof placed)[number]);
      const order = letters.map((l, idx) => [l.x, idx] as const).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
      return { kind, level, seed, view: { kind, n, letters }, secret: { kind, order, word }, sight: null };
    }
    case "board": {
      const list = pick<readonly BoardWord[]>(BOARD_WORDS_3, BOARD_WORDS_4, BOARD_WORDS_5);
      const word = list[randInt(r, list.length)] as BoardWord;
      return { kind, level, seed, view: { kind, length: word.length, plays: pick(2, 2, 1), dwellMs: 350, clue: BOARD_CLUES[word] }, secret: { kind, word }, sight: null };
    }
    case "maze": {
      const list = MAZES[level];
      const grid = list[randInt(r, list.length)] as readonly string[];
      return { kind, level, seed, view: { kind, grid }, secret: { kind }, sight: null };
    }
    case "knock": {
      // 2 groups on easy, 3 on medium and hard; 1 to 4 knocks a group, never two equal groups side by side; easy has at least four knocks
      const n = pick(2, 3, 3);
      const groups: number[] = [];
      while (groups.length < n) {
        const g = 1 + randInt(r, 4);
        if (groups.length > 0 && groups[groups.length - 1] === g) continue;
        groups.push(g);
      }
      if (n === 2 && (groups[0] ?? 0) + (groups[1] ?? 0) < 4) groups[0] = groups[1] === 3 ? 2 : 3;
      const long = level === "hard" ? randInt(r, n - 1) : null;
      return { kind, level, seed, view: { kind, groups: n, longPause: long !== null }, secret: { kind, groups, long }, sight: { kind, groups, long } };
    }
  }
}
