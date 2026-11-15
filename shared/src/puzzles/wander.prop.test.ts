import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { ErrorCode } from "../errors";
import { makeLock } from "./make";
import { seedArb } from "./puzzles.arb";
import { isMemoryKind } from "./types";
import { SKIP_AFTER_MS, gateReveal, initWander, sightAfterReveal, skipAvailable, skipWanderLock, submitWanderAttempt, type WanderLocks } from "./wander";
import { referenceSolve } from "./verify";

type WOp = { t: "wrong" } | { t: "wait"; ms: number } | { t: "skip" } | { t: "solve" };
const opArb: fc.Arbitrary<WOp> = fc.oneof(
  fc.constant<WOp>({ t: "wrong" }),
  fc.record({ t: fc.constant("wait" as const), ms: fc.integer({ min: 0, max: 15_000 }) }),
  fc.constant<WOp>({ t: "skip" }),
  fc.constant<WOp>({ t: "solve" }),
);

describe("Property 8 (Wander half): with Locks off, nothing changes", () => {
  // Feature: puzzles, Property 8: With the setting off, nothing changes
  // Validates: Requirements 1.1, 2.1
  it("lets every reveal through and returns the very same state", () => {
    fc.assert(
      fc.property(seedArb, fc.string({ minLength: 1, maxLength: 6 }), fc.integer({ min: 0, max: 1e6 }), (seed, anchor, now) => {
        const state = initWander(false);
        const g = gateReveal(state, { anchorId: anchor, sessionSeed: seed }, now);
        return g.gate === "pass" && g.state === state && sightAfterReveal(state, seed).delivery === null && sightAfterReveal(state, seed).state === state;
      }),
      propParams(),
    );
  });
});

describe("Property 9: A memory is always reachable", () => {
  // Feature: puzzles, Property 9: A memory is always reachable
  // Validates: Requirements 2.2, 2.3
  it("is let through by a solve, or by a skip after 20 s or two wrong Attempts, whatever came before", () => {
    fc.assert(
      fc.property(seedArb, fc.array(opArb, { maxLength: 25 }), fc.constantFrom("easy" as const, "normal" as const), (seed, ops, level) => {
        let state: WanderLocks = initWander(true);
        let now = 1000;
        const g = gateReveal(state, { anchorId: "a1", sessionSeed: seed, level }, now);
        if (g.gate !== "open") return false;
        state = g.state;
        for (const op of ops) {
          if (!state.open) break;
          if (op.t === "wait") now += op.ms;
          else if (op.t === "wrong") { const r = submitWanderAttempt(state, { kind: "nope" }, now); if (!r.ok || r.value.outcome !== "wrong") return false; state = r.value.state; }
          else if (op.t === "skip") {
            const before = skipAvailable(state.open, now);
            const r = skipWanderLock(state, now);
            if (r.ok !== before) return false; // it works exactly when it is offered
            if (r.ok) state = r.value.state;
          } else {
            const lock = makeLock(state.open.kind, state.open.level, state.open.seed);
            const r = submitWanderAttempt(state, referenceSolve(lock), now);
            if (!r.ok || r.value.outcome !== "solved") return false;
            if (r.value.state.open !== null || r.value.state.revealed.join() !== "a1" || r.value.anchorId !== "a1") return false; // a solve lets it through at once
            state = r.value.state;
          }
        }
        if (state.open) { // still shut: 20 seconds later, Skip must work
          now += SKIP_AFTER_MS;
          const r = skipWanderLock(state, now);
          if (!r.ok) return false;
          state = r.value.state;
        }
        const again = gateReveal(state, { anchorId: "a1", sessionSeed: seed, level }, now); // the same Anchor now passes untouched
        return state.revealed.join() === "a1" && state.open === null && again.gate === "pass";
      }),
      propParams(),
    );
  });

  it("offers Skip after two wrong Attempts, before 20 seconds, and refuses it earlier", () => {
    let state = initWander(true);
    const g = gateReveal(state, { anchorId: "a1", sessionSeed: 5 }, 0);
    if (g.gate !== "open") throw new Error("gate");
    state = g.state;
    const early = skipWanderLock(state, 1000);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.code).toBe(ErrorCode.puzzle_rate_limited);
    for (let i = 0; i < 2; i++) {
      const r = submitWanderAttempt(state, { kind: "nope" }, 2000);
      if (!r.ok || r.value.outcome !== "wrong") throw new Error("wrong");
      expect(r.value.skipAvailable).toBe(i === 1);
      state = r.value.state;
    }
    expect(skipWanderLock(state, 2500).ok).toBe(true);
  });

  it("makes the first Lock a Kind with no Sight, shows the next Sight once, and gives a Faded clue only if it was never shown", () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const first = gateReveal(initWander(true), { anchorId: "a1", sessionSeed: seed }, 0);
        if (first.gate !== "open" || isMemoryKind(first.kind) || first.faded !== null) return false;
        const skipped = skipWanderLock(first.state, SKIP_AFTER_MS);
        if (!skipped.ok) return false;
        const state = skipped.value.state;
        const shown = sightAfterReveal(state, seed);
        const again = sightAfterReveal(shown.state, seed); // at most once
        const second = gateReveal(shown.state, { anchorId: "a2", sessionSeed: seed }, 50_000);
        const missed = gateReveal(state, { anchorId: "a2", sessionSeed: seed }, 50_000); // the Sight never shown
        if (second.gate !== "open" || missed.gate !== "open") return false;
        const memory = isMemoryKind(second.kind);
        return again.delivery === null && (shown.delivery !== null) === memory && second.faded === null && (missed.faded !== null) === memory;
      }),
      propParams(),
    );
  });
});
