import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { TURN_GAP_MS, acceptTurn, retryAfterMs } from "./rate";

describe("acceptTurn", () => {
  it("takes the first turn, and one 1.5 seconds or more after the last taken, and no sooner", () => {
    expect(acceptTurn(null, 0)).toBe(true);
    expect(acceptTurn(1000, 1000 + TURN_GAP_MS - 1)).toBe(false);
    expect(acceptTurn(1000, 1000 + TURN_GAP_MS)).toBe(true);
    expect(acceptTurn(1000, 999)).toBe(false);
    expect(acceptTurn(1000, Number.NaN)).toBe(false);
    expect(acceptTurn(1000, Number.POSITIVE_INFINITY)).toBe(false);
    expect(TURN_GAP_MS).toBe(1500);
  });

  it("says how long to wait", () => {
    expect(retryAfterMs(null, 5)).toBe(0);
    expect(retryAfterMs(1000, 1200)).toBe(1300);
    expect(retryAfterMs(1000, 5000)).toBe(0);
    expect(retryAfterMs(1000, Number.NaN)).toBe(0);
  });

  // Property 3
  it("Property: over any non-decreasing times the turns taken are at least 1.5 seconds apart, and a turn that late is always taken", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 4000 }), { maxLength: 60 }), (gaps) => {
        let t = 1_000;
        let last: number | null = null;
        const taken: number[] = [];
        for (const g of gaps) {
          t += g;
          const late = last !== null && t - last >= TURN_GAP_MS;
          const ok = acceptTurn(last, t);
          if (last === null || late) expect(ok).toBe(true);
          else expect(ok).toBe(false);
          if (ok) {
            taken.push(t);
            last = t;
          }
        }
        for (let i = 1; i < taken.length; i++) expect((taken[i] as number) - (taken[i - 1] as number)).toBeGreaterThanOrEqual(TURN_GAP_MS);
      }),
      { numRuns: 300, seed: 8201 },
    );
  });
});
