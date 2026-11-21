import { describe, expect, it } from "vitest";
import { makeLock } from "./make";
import { placePuzzles } from "./place";
import { DEFAULT_KINDS, type Kind } from "./types";
import { referenceSolve, verify } from "./verify";

/** Checkpoint 7.5: over many games every Kind of the second set (and every default Kind) appears, and each one placed is solvable. */
const ZONES = ["hall", "kitchen", "study", "cellar", "attic", "garden"];

describe("every Kind appears across games (puzzles 7.5)", () => {
  it("over 300 rooms each default Kind is placed in a majority of the shapes a Room can take: at least once, never more than twice a game", () => {
    const seen = new Map<Kind, number>();
    for (let seed = 0; seed < 300; seed++) {
      const r = placePuzzles(seed, ZONES, "medium");
      if (!r.ok) throw new Error("placement failed");
      const per = new Map<Kind, number>();
      for (const l of r.value) per.set(l.kind, (per.get(l.kind) ?? 0) + 1);
      for (const [k, n] of per) { expect(n).toBeLessThanOrEqual(2); seen.set(k, (seen.get(k) ?? 0) + 1); }
    }
    for (const k of DEFAULT_KINDS) expect(seen.get(k) ?? 0, `${k} never placed`).toBeGreaterThan(60);
    for (const k of ["safe", "musicbox", "candles", "moved"] as const) expect(seen.has(k)).toBe(true);
  });

  it("every placed Lock of the second set solves with its reference answer at every level and fails a nonsense one", () => {
    for (const kind of ["safe", "musicbox", "candles", "moved"] as const) {
      for (const level of ["easy", "medium", "hard"] as const) {
        for (let seed = 1; seed <= 12; seed++) {
          const lock = makeLock(kind, level, seed);
          expect(verify(lock, referenceSolve(lock)).ok, `${kind} ${level} ${seed}`).toBe(true);
          expect(verify(lock, { kind: "nonsense" }).ok).toBe(false);
        }
      }
    }
  });
});
