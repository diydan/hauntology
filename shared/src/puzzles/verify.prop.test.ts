import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { minSolveMs } from "./kinds";
import { junkArb, lockArb } from "./puzzles.arb";
import type { Transcript } from "./types";
import { referenceSolve, verify } from "./verify";

/** One small change to a correct Transcript that makes it wrong. */
function spoil(t: Transcript): Transcript {
  switch (t.kind) {
    case "clock": return { ...t, m: (t.m + 5) % 60 };
    case "wires": {
      const [a, b, ...rest] = t.pairs;
      return a && b ? { ...t, pairs: [[a[0], b[1]], [b[0], a[1]], ...rest] } : t;
    }
    case "lockpick": return { ...t, sets: t.sets.map((e, i) => (i === 0 ? { ...e, atDeg: e.atDeg + 30 } : e)) };
  }
}

describe("Property 3: Checking accepts only the answer and never throws", () => {
  // Feature: puzzles, Property 3: Checking accepts only the answer and never throws
  // Validates: Requirements 7.2, 7.5
  it("never throws and never accepts junk", () => {
    fc.assert(
      fc.property(lockArb, junkArb, (lock, junk) => {
        const v = verify(lock, junk);
        return v.ok === false;
      }),
      propParams(),
    );
  });

  it("accepts the answer, and rejects any single change, a too-fast run, an oversize one and another Kind's", () => {
    fc.assert(
      fc.property(lockArb, (lock) => {
        const good = referenceSolve(lock);
        if (verify(lock, good).ok !== true) return false;
        if (verify(lock, spoil(good)).ok !== false) return false;
        const fast = verify(lock, { ...good, elapsedMs: minSolveMs(lock) - 1 });
        if (fast.ok || fast.code !== "too_fast") return false;
        const big = verify(lock, { ...good, pad: "x".repeat(5000) });
        if (big.ok || big.code !== "too_big") return false;
        const other = lock.kind === "clock" ? { kind: "wires", pairs: [], elapsedMs: 99_999 } : { kind: "clock", h: 1, m: 5, elapsedMs: 99_999 };
        return verify(lock, other).ok === false;
      }),
      propParams(),
    );
  });

  it("calls a Transcript with more than 64 events too big, and survives a cycle and a BigInt", () => {
    fc.assert(
      fc.property(lockArb, fc.integer({ min: 65, max: 200 }), (lock, n) => {
        const many = verify(lock, { kind: lock.kind, pairs: Array.from({ length: n }, () => [1, 2]), sets: [], elapsedMs: 99_999 });
        if (many.ok || many.code !== "too_big") return false;
        const loop: Record<string, unknown> = { kind: lock.kind, elapsedMs: 9999 };
        loop["self"] = loop;
        const cyc = verify(lock, loop);
        return !cyc.ok && cyc.code === "malformed" && verify(lock, { kind: lock.kind, elapsedMs: 10n }).ok === false;
      }),
      propParams(),
    );
  });
});
