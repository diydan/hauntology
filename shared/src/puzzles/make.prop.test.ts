import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { minSolveMs } from "./kinds";
import { makeLock } from "./make";
import { kindArb, levelArb, lockArb, seedArb } from "./puzzles.arb";
import { fadedFor, sightFor } from "./sight";
import { MEMORY_KINDS } from "./types";
import { referenceSolve, verify } from "./verify";

describe("Property 1: Generation is deterministic and never reads the Solution", () => {
  // Feature: puzzles, Property 1: Generation is deterministic and never reads the Solution
  // Validates: Requirements 1.5, 6.2, 13.2
  it("gives equal Locks, Sights and answers on a repeat, and takes only a Kind, a level and a seed", () => {
    expect(makeLock.length).toBe(3); // no parameter could carry a Solution, a Hand or a Residue position
    fc.assert(
      fc.property(kindArb, levelArb, seedArb, (kind, level, seed) => {
        const a = makeLock(kind, level, seed);
        const b = makeLock(kind, level, seed); // what a reconnecting seat gets
        if (JSON.stringify(a) !== JSON.stringify(b)) return false;
        if (JSON.stringify(sightFor(a)) !== JSON.stringify(sightFor(b))) return false;
        if (JSON.stringify(fadedFor(a)) !== JSON.stringify(fadedFor(b))) return false;
        const text = JSON.stringify(a);
        return !/solution|hand|residue/i.test(text);
      }),
      propParams(),
    );
  });
});

describe("Property 2: Every generated Lock is solvable by the touch path", () => {
  // Feature: puzzles, Property 2: Every generated Lock is solvable by the touch path
  // Validates: Requirements 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 12.1
    it("has a reference Transcript made of touch events only that verify accepts", () => {
    fc.assert(
      fc.property(lockArb, (lock) => {
        const t = referenceSolve(lock);
        const touchOnly = new Set(["kind", "sets", "pairs", "h", "m", "code", "notes", "order", "changed", "placed", "letters", "reachedAtMs", "hits", "times", "elapsedMs"]); // `times`: the Tap control, a touch
        if (!Object.keys(t).every((k) => touchOnly.has(k))) return false; // no tilt, sound, buzz or breath field
        if (t.elapsedMs < minSolveMs(lock)) return false;
        return verify(lock, t).ok === true;
      }),
      propParams(),
    );
  });
});

describe("Property 4: A Sight and its Faded twin show the same clue", () => {
  // Feature: puzzles, Property 4: A Sight and its Faded twin show the same clue
  // Validates: Requirements 6.2, 6.3
  it("has the same clue in both, a shorter Faded time, and a Sight only for a Memory Kind", () => {
    fc.assert(
      fc.property(lockArb, fc.boolean(), (lock, assist) => {
        const s = sightFor(lock, assist);
        const f = fadedFor(lock, assist);
        if (!MEMORY_KINDS.includes(lock.kind)) return s === null && f === null;
        if (s === null || f === null) return false;
        if (JSON.stringify(s.payload) !== JSON.stringify(f.payload)) return false;
        if (assist ? f.showMs !== 8000 || s.showMs !== 8000 : f.showMs >= s.showMs) return false;
        // the clue holds exactly the data the answer needs
        if (lock.kind === "wires") return lock.view.leftOrder.every((w) => lock.secret.terminalOf[w] === lock.sight.order.indexOf(w));
        if (lock.kind === "clock") return lock.sight.h === lock.secret.h && lock.sight.m === lock.secret.m;
        return true;
      }),
      propParams(),
    );
  });
});
