import { describe, expect, it } from "vitest";
import { KIND_INFO, minSolveMs } from "./kinds";
import { WIRE_STYLES, makeLock } from "./make";
import { BUILT_KINDS, MEMORY_KINDS, isMemoryKind, type Level } from "./types";

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
    for (const kind of BUILT_KINDS) {
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
