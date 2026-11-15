import { describe, expect, it } from "vitest";
import { KIND_INFO, minSolveMs } from "./kinds";
import { WIRE_STYLES, makeLock } from "./make";
import { MAZES, mazeSolvable } from "./mazes";
import { KINDS, MEMORY_KINDS, isMemoryKind, type Level } from "./types";
import { BOARD_WORDS_3, BOARD_WORDS_4, BOARD_WORDS_5, READ_WORDS_4, READ_WORDS_5, READ_WORDS_6 } from "./words";

const seeds = Array.from({ length: 120 }, (_, i) => i * 7919 + 13);
const levels: Level[] = ["easy", "medium", "hard"];
/** The easy, medium and hard value for a level. */
const L = <T>(level: Level, easy: T, medium: T, hard: T): T => ({ easy, medium, hard })[level];

describe("makeLock: Lock pick", () => {
  it("has 3, 4 or 5 pins with windows of 14, 10 or 8 degrees inside the range, in order, at least 20 degrees apart", () => {
    for (const level of levels) for (const seed of seeds) {
      const l = makeLock("lockpick", level, seed);
      if (l.kind !== "lockpick") throw new Error("kind");
      expect(l.view.pins).toBe(L(level, 3, 4, 5));
      expect(l.view.windowDeg).toBe(L(level, 14, 10, 8));
      expect(l.view.dwellMs).toBe(400);
      expect(l.view.centers).toHaveLength(l.view.pins);
      l.view.centers.forEach((c, i) => {
        expect(c - l.view.windowDeg / 2).toBeGreaterThanOrEqual(-40);
        expect(c + l.view.windowDeg / 2).toBeLessThanOrEqual(40);
        if (i > 0) expect(Math.abs(c - (l.view.centers[i - 1] as number))).toBeGreaterThanOrEqual(20 - 1e-9);
      });
      expect(l.sight).toBeNull();
    }
  });
});

describe("makeLock: Cut wires", () => {
  it("has 4, 5 or 6 distinct wire looks, and the Sight order is the answer", () => {
    for (const level of levels) for (const seed of seeds) {
      const l = makeLock("wires", level, seed);
      if (l.kind !== "wires") throw new Error("kind");
      expect(l.view.n).toBe(L(level, 4, 5, 6));
      expect(new Set(l.view.leftOrder).size).toBe(l.view.n);
      for (const w of l.view.leftOrder) { expect(w).toBeGreaterThanOrEqual(0); expect(w).toBeLessThan(WIRE_STYLES); }
      expect([...l.sight.order].sort()).toEqual([...l.view.leftOrder].sort());
      for (const w of l.view.leftOrder) expect(l.secret.terminalOf[w]).toBe(l.sight.order.indexOf(w));
    }
  });
});

describe("makeLock: Clock time", () => {
  it("is on its level's grid (15, 5 or 1 minutes), never the resting 12:00, and the Sight shows the answer", () => {
    for (const level of levels) for (const seed of seeds) {
      const l = makeLock("clock", level, seed);
      if (l.kind !== "clock") throw new Error("kind");
      expect(l.view.stepMin).toBe(L(level, 15, 5, 1));
      expect(l.secret.m % l.view.stepMin).toBe(0);
      expect(l.secret.m).toBeGreaterThanOrEqual(0);
      expect(l.secret.m).toBeLessThan(60);
      expect(l.secret.h).toBeGreaterThanOrEqual(1);
      expect(l.secret.h).toBeLessThanOrEqual(12);
      expect(l.secret.h === 12 && l.secret.m === 0).toBe(false);
      expect(l.sight).toEqual({ kind: "clock", h: l.secret.h, m: l.secret.m });
    }
  });
});

describe("makeLock: the other Kinds, at every level", () => {
  const each = <K extends string>(kind: K, fn: (l: ReturnType<typeof makeLock>, level: Level) => void): void => {
    for (const level of levels) for (const seed of seeds) fn(makeLock(kind as never, level, seed), level);
  };

  it("Safe code has 3, 4 or 5 digits that are not all alike, and the plaque shows the code", () => {
    each("safe", (l, level) => {
      if (l.kind !== "safe") throw new Error("kind");
      expect(l.view.digits).toBe(L(level, 3, 4, 5));
      expect(l.secret.code).toHaveLength(l.view.digits);
      expect(new Set(l.secret.code).size).toBeGreaterThan(1);
      expect(l.secret.code.every((d) => Number.isInteger(d) && d >= 0 && d <= 9)).toBe(true);
      expect(l.sight.code).toEqual(l.secret.code);
    });
  });

  it("Music box has 3, 4 or 5 notes from five, not all alike, three plays (two on hard)", () => {
    each("musicbox", (l, level) => {
      if (l.kind !== "musicbox") throw new Error("kind");
      expect(l.view.n).toBe(L(level, 3, 4, 5));
      expect(l.view.tune).toHaveLength(l.view.n);
      expect(new Set(l.view.tune).size).toBeGreaterThan(1);
      expect(l.view.tune.every((d) => d >= 0 && d <= 4)).toBe(true);
      expect(l.view.plays).toBe(L(level, 3, 3, 2));
      expect(l.sight).toBeNull();
    });
  });

  it("Candle order has 4, 5 or 6 candles in an order that is a permutation, shown twice (once on hard)", () => {
    each("candles", (l, level) => {
      if (l.kind !== "candles") throw new Error("kind");
      expect(l.view.n).toBe(L(level, 4, 5, 6));
      expect([...l.view.order].sort()).toEqual(Array.from({ length: l.view.n }, (_, i) => i));
      expect(l.view.shows).toBe(L(level, 2, 2, 1));
    });
  });

  it("What moved changes 2, 3 or 4 things on a shelf of 6, 8 or 9, with at most one missing (two on hard), and the Sight is the shelf before", () => {
    each("moved", (l, level) => {
      if (l.kind !== "moved") throw new Error("kind");
      expect(l.view.slots).toBe(L(level, 6, 8, 9));
      expect(l.sight.shelf).toHaveLength(l.view.slots);
      expect(new Set(l.sight.shelf).size).toBe(l.view.slots);
      const diff = l.sight.shelf.map((v, i) => (v !== l.view.after[i] ? i : -1)).filter((i) => i >= 0);
      expect(diff).toEqual(l.secret.changed);
      expect(diff).toHaveLength(L(level, 2, 3, 4));
      expect(l.view.after.filter((v) => v === -1).length).toBeLessThanOrEqual(L(level, 1, 1, 2));
      expect(l.view.darkMs).toBe(L(level, 2000, 2000, 1500));
      const shown = l.view.after.filter((v) => v !== -1);
      expect(new Set(shown).size).toBe(shown.length); // nothing shows twice
      for (const v of shown) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(12); }
    });
  });

  it("Torn photo has 4, 6 or 9 pieces, none turned on easy and at least one turned above it, and the Sight is the same picture", () => {
    each("photo", (l, level) => {
      if (l.kind !== "photo") throw new Error("kind");
      expect([l.view.cols, l.view.rows]).toEqual(L(level, [2, 2], [3, 2], [3, 3]));
      expect(l.view.turns0).toHaveLength(l.view.cols * l.view.rows);
      expect(l.view.turning).toBe(level !== "easy");
      expect(l.view.turns0.some((t) => t !== 0)).toBe(level !== "easy");
      expect(l.view.turns0.every((t) => t >= 0 && t <= 3)).toBe(true);
      expect(l.sight.picture).toEqual(l.view.picture);
      expect(l.view.picture.shapes.length).toBeGreaterThan(5);
    });
  });

  it("Torn photo on medium always starts with a turned piece, over thousands of seeds", () => {
    for (let seed = 0; seed < 5000; seed++) {
      const l = makeLock("photo", "medium", seed);
      if (l.kind !== "photo") throw new Error("kind");
      expect(l.view.turns0.some((t) => t !== 0)).toBe(true);
    }
  });

  it("Hidden words has a word of 4, 5 or 6 letters whose reading order is left to right", () => {
    each("words", (l, level) => {
      if (l.kind !== "words") throw new Error("kind");
      expect(l.view.n).toBe(L(level, 4, 5, 6));
      expect(L<readonly string[]>(level, READ_WORDS_4, READ_WORDS_5, READ_WORDS_6)).toContain(l.secret.word);
      expect(l.secret.order.map((i) => (l.view.letters[i] as { ch: string }).ch).join("")).toBe(l.secret.word);
      const xs = l.secret.order.map((i) => (l.view.letters[i] as { x: number }).x);
      expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    });
  });

  it("Spirit board has a word of 3, 4 or 5 letters, never in its clue, a 350 ms rest time, and two hearings (one on hard)", () => {
    each("board", (l, level) => {
      if (l.kind !== "board") throw new Error("kind");
      expect(l.view.length).toBe(L(level, 3, 4, 5));
      expect(L<readonly string[]>(level, BOARD_WORDS_3, BOARD_WORDS_4, BOARD_WORDS_5)).toContain(l.secret.word);
      expect(l.view.clue.toUpperCase()).not.toContain(l.secret.word);
      expect(l.view.dwellMs).toBe(350);
      expect(l.view.plays).toBe(L(level, 2, 2, 1));
      expect(JSON.stringify(l.view)).not.toContain(l.secret.word);
    });
  });

  it("the Marble maze comes from the authored list for its level", () => {
    each("maze", (l, level) => {
      if (l.kind !== "maze") throw new Error("kind");
      expect(MAZES[level]).toContainEqual(l.view.grid);
      expect(mazeSolvable(l.view.grid)).toBe(true);
    });
  });
});

describe("makeLock: the resting clock", () => {
  it("is never 12:00, over thousands of seeds", () => {
    for (let seed = 0; seed < 5000; seed++) {
      const l = makeLock("clock", seed % 2 === 0 ? "easy" : "medium", seed);
      if (l.kind !== "clock") throw new Error("kind");
      expect(l.secret.h === 12 && l.secret.m === 0).toBe(false);
    }
  });
});

describe("makeLock in general", () => {
  it("differs between seeds, and between levels of one Kind", () => {
    expect(makeLock("clock", "easy", 1)).not.toEqual(makeLock("clock", "easy", 2));
    expect(makeLock("wires", "easy", 1).view).not.toEqual(makeLock("wires", "medium", 1).view);
  });

  it("agrees with the registry: memory flags, tilt, touch path and minimum solve times", () => {
    for (const kind of KINDS) {
      expect(KIND_INFO[kind].touchPath).toBe(true);
      expect(KIND_INFO[kind].memory).toBe(MEMORY_KINDS.includes(kind));
      expect(isMemoryKind(kind)).toBe(KIND_INFO[kind].memory);
      for (const level of levels) {
        const l = makeLock(kind, level, 5);
        expect(minSolveMs(l)).toBeGreaterThan(0);
        expect(l.sight === null).toBe(!KIND_INFO[kind].memory);
      }
    }
    expect(minSolveMs(makeLock("lockpick", "easy", 1))).toBe(2400);
    expect(minSolveMs(makeLock("lockpick", "medium", 1))).toBe(3200);
    expect(minSolveMs(makeLock("lockpick", "hard", 1))).toBe(4000);
    expect(minSolveMs(makeLock("photo", "hard", 1))).toBe(9000);
    expect(minSolveMs(makeLock("clock", "hard", 1))).toBe(2500);
    expect(minSolveMs(makeLock("clock", "medium", 1))).toBe(1500);
  });
});
