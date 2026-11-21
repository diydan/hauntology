import { describe, expect, it } from "vitest";
import { makeLock } from "./make";
import { referenceSolve, verify } from "./verify";

/** Group 9.6 mutation pass: the checks of `verify` that no earlier test pinned. */
describe("verify edges (puzzles 9.6)", () => {
  it("a Transcript of another Kind is malformed, not merely wrong", () => {
    const clock = makeLock("clock", "medium", 5);
    const safe = referenceSolve(makeLock("safe", "medium", 5));
    expect(verify(clock, safe)).toEqual({ ok: false, code: "malformed" });
  });

  it("a lock pick with a pin missing is wrong, even when every pin that is there is set right", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const lock = makeLock("lockpick", "medium", seed);
      const ref = referenceSolve(lock);
      if (ref.kind !== "lockpick") throw new Error("kind");
      expect(verify(lock, ref).ok).toBe(true);
      expect(verify(lock, { ...ref, sets: ref.sets.slice(0, -1) })).toEqual({ ok: false, code: "wrong" });
    }
  });

  it("cut wires: one wire used twice, or two wires on one terminal, is wrong even when every pair it names is right", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const lock = makeLock("wires", "medium", seed);
      const ref = referenceSolve(lock);
      if (ref.kind !== "wires") throw new Error("kind");
      expect(verify(lock, ref).ok).toBe(true);
      const dup = { ...ref, pairs: [ref.pairs[0]!, ...ref.pairs.slice(0, -1)] }; // the first pair twice, the last dropped
      expect(verify(lock, dup)).toEqual({ ok: false, code: "wrong" });
    }
  });

  it("a lock pick whose last pin was set after the whole Attempt ended is wrong", () => {
    const lock = makeLock("lockpick", "medium", 3);
    const ref = referenceSolve(lock);
    if (ref.kind !== "lockpick") throw new Error("kind");
    const late = { ...ref, sets: ref.sets.map((e) => ({ ...e, atMs: e.atMs + 60_000 })) }; // the Attempt says it lasted `ref.elapsedMs`
    expect(verify(lock, late)).toEqual({ ok: false, code: "wrong" });
  });
});
