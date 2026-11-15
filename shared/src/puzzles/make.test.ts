import { describe, expect, it } from "vitest";
import { KIND_INFO, minSolveMs } from "./kinds";
import { WIRE_STYLES, makeLock } from "./make";
import { MAZES, mazeSolvable } from "./mazes";
import { KINDS, MEMORY_KINDS, isMemoryKind, type Level } from "./types";
import { BOARD_WORDS_3, BOARD_WORDS_4, READ_WORDS_4, READ_WORDS_5 } from "./words";

const seeds = Array.from({ length: 120 }, (_, i) => i * 7919 + 13);
const levels: Level[] = ["easy", "normal"];

describe("makeLock: Lock pick", () => {
  it("has 3 or 4 pins with windows of 14 or 10 degrees inside the range, in order, at least 20 degrees apart", () => {
    for (const level of levels) for (const seed of seeds) {
      const l = makeLock("lockpick", level, seed);
      if (l.kind !== "lockpick") throw new Error("kind");
      expect(l.view.pins).toBe(level === "easy" ? 3 : 4);
      expect(l.view.windowDeg).toBe(level === "easy" ? 14 : 10);
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
  it("has 4 or 5 distinct wire looks, and the Sight order is the answer", () => {
    for (const level of levels) for (const seed of seeds) {
      const l = makeLock("wires", level, seed);
      if (l.kind !== "wires") throw new Error("kind");
      expect(l.view.n).toBe(level === "easy" ? 4 : 5);
      expect(new Set(l.view.leftOrder).size).toBe(l.view.n);
      for (const w of l.view.leftOrder) { expect(w).toBeGreaterThanOrEqual(0); expect(w).toBeLessThan(WIRE_STYLES); }
      expect([...l.sight.order].sort()).toEqual([...l.view.leftOrder].sort());
      for (const w of l.view.leftOrder) expect(l.secret.terminalOf[w]).toBe(l.sight.order.indexOf(w));
    }
  });
});

describe("makeLock: Clock time", () => {
  it("is on the five-minute grid, never the resting 12:00, and the Sight shows the answer", () => {
    for (const level of levels) for (const seed of seeds) {
      const l = makeLock("clock", level, seed);
      if (l.kind !== "clock") throw new Error("kind");
      expect(l.secret.m % 5).toBe(0);
      expect(l.secret.m).toBeGreaterThanOrEqual(0);
      expect(l.secret.m).toBeLessThan(60);
      expect(l.secret.h).toBeGreaterThanOrEqual(1);
      expect(l.secret.h).toBeLessThanOrEqual(12);
      expect(l.secret.h === 12 && l.secret.m === 0).toBe(false);
      expect(l.sight).toEqual({ kind: "clock", h: l.secret.h, m: l.secret.m });
    }
  });
});

describe("makeLock: the other Kinds, at both levels", () => {
  const each = <K extends string>(kind: K, fn: (l: ReturnType<typeof makeLock>, level: Level) => void): void => {
    for (const level of levels) for (const seed of seeds) fn(makeLock(kind as never, level, seed), level);
  };

  it("Safe code has 3 or 4 digits that are not all alike, and the plaque shows the code", () => {
    each("safe", (l, level) => {
      if (l.kind !== "safe") throw new Error("kind");
      expect(l.view.digits).toBe(level === "easy" ? 3 : 4);
      expect(l.secret.code).toHaveLength(l.view.digits);
      expect(new Set(l.secret.code).size).toBeGreaterThan(1);
      expect(l.secret.code.every((d) => Number.isInteger(d) && d >= 0 && d <= 9)).toBe(true);
      expect(l.sight.code).toEqual(l.secret.code);
    });
  });

  it("Music box has 3 or 4 notes from five, not all alike, three plays", () => {
    each("musicbox", (l, level) => {
      if (l.kind !== "musicbox") throw new Error("kind");
      expect(l.view.n).toBe(level === "easy" ? 3 : 4);
      expect(l.view.tune).toHaveLength(l.view.n);
      expect(new Set(l.view.tune).size).toBeGreaterThan(1);
      expect(l.view.tune.every((d) => d >= 0 && d <= 4)).toBe(true);
      expect(l.view.plays).toBe(3);
      expect(l.sight).toBeNull();
    });
  });

  it("Candle order has 4 or 5 candles in an order that is a permutation, shown twice", () => {
    each("candles", (l, level) => {
      if (l.kind !== "candles") throw new Error("kind");
      expect(l.view.n).toBe(level === "easy" ? 4 : 5);
      expect([...l.view.order].sort()).toEqual(Array.from({ length: l.view.n }, (_, i) => i));
      expect(l.view.shows).toBe(2);
    });
  });

  it("What moved changes 2 or 3 things on a shelf of 6 or 8, with at most one missing, and the Sight is the shelf before", () => {
    each("moved", (l, level) => {
      if (l.kind !== "moved") throw new Error("kind");
      expect(l.view.slots).toBe(level === "easy" ? 6 : 8);
      expect(l.sight.shelf).toHaveLength(l.view.slots);
      expect(new Set(l.sight.shelf).size).toBe(l.view.slots);
      const diff = l.sight.shelf.map((v, i) => (v !== l.view.after[i] ? i : -1)).filter((i) => i >= 0);
      expect(diff).toEqual(l.secret.changed);
      expect(diff).toHaveLength(level === "easy" ? 2 : 3);
      expect(l.view.after.filter((v) => v === -1).length).toBeLessThanOrEqual(1);
      expect(l.view.darkMs).toBe(2000);
    });
  });

  it("Torn photo has 4 or 6 pieces, at least one turned, and the Sight is the same picture", () => {
    each("photo", (l, level) => {
      if (l.kind !== "photo") throw new Error("kind");
      expect(l.view.cols * l.view.rows).toBe(level === "easy" ? 4 : 6);
      expect(l.view.turns0).toHaveLength(l.view.cols * l.view.rows);
      expect(l.view.turns0.some((t) => t !== 0)).toBe(true);
      expect(l.view.turns0.every((t) => t >= 0 && t <= 3)).toBe(true);
      expect(l.sight.picture).toEqual(l.view.picture);
      expect(l.view.picture.shapes.length).toBeGreaterThan(5);
    });
  });

  it("Torn photo always starts with a turned piece, over thousands of seeds", () => {
    for (let seed = 0; seed < 5000; seed++) {
      const l = makeLock("photo", "easy", seed);
      if (l.kind !== "photo") throw new Error("kind");
      expect(l.view.turns0.some((t) => t !== 0)).toBe(true);
    }
  });

  it("Hidden words has a word of 4 or 5 letters whose reading order is left to right", () => {
    each("words", (l, level) => {
      if (l.kind !== "words") throw new Error("kind");
      expect(l.view.n).toBe(level === "easy" ? 4 : 5);
      expect((level === "easy" ? READ_WORDS_4 : READ_WORDS_5) as readonly string[]).toContain(l.secret.word);
      expect(l.secret.order.map((i) => (l.view.letters[i] as { ch: string }).ch).join("")).toBe(l.secret.word);
      const xs = l.secret.order.map((i) => (l.view.letters[i] as { x: number }).x);
      expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    });
  });

  it("Spirit board has a word of 3 or 4 letters, never in its clue, and a 350 ms rest time", () => {
    each("board", (l, level) => {
      if (l.kind !== "board") throw new Error("kind");
      expect(l.view.length).toBe(level === "easy" ? 3 : 4);
      expect((level === "easy" ? BOARD_WORDS_3 : BOARD_WORDS_4) as readonly string[]).toContain(l.secret.word);
      expect(l.view.clue.toUpperCase()).not.toContain(l.secret.word);
      expect(l.view.dwellMs).toBe(350);
      expect(l.view.plays).toBe(2);
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
      const l = makeLock("clock", seed % 2 === 0 ? "easy" : "normal", seed);
      if (l.kind !== "clock") throw new Error("kind");
      expect(l.secret.h === 12 && l.secret.m === 0).toBe(false);
    }
  });
});

describe("makeLock in general", () => {
  it("differs between seeds, and between levels of one Kind", () => {
    expect(makeLock("clock", "easy", 1)).not.toEqual(makeLock("clock", "easy", 2));
    expect(makeLock("wires", "easy", 1).view).not.toEqual(makeLock("wires", "normal", 1).view);
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
    expect(minSolveMs(makeLock("lockpick", "normal", 1))).toBe(3200);
  });
});
