import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { SYNODIC_MONTH_DAYS, moonAge, moonPhase } from "./moon";
import { MOON_PHASES } from "./types";

const DAY = 86_400_000;

/**
 * Property 8: Moon phase is one of eight and cycles in order.
 * Validates: Requirements 2.6.
 */
describe("Property 8: moon phase is one of eight and cycles in order", () => {
  it("any instant gives exactly one of the eight names, and the same instant the same name", () => {
    fc.assert(
      fc.property(fc.integer({ min: -9e11, max: 4.1e12 }), (t) => {
        expect(MOON_PHASES).toHaveLength(8);
        expect(MOON_PHASES).toContain(moonPhase(t));
        expect(moonPhase(t)).toBe(moonPhase(t));
        const age = moonAge(t);
        return age >= 0 && age < SYNODIC_MONTH_DAYS;
      }),
      propParams(),
    );
  });

  it("stepping through one mean month visits all eight phases, in order, and repeats", () => {
    fc.assert(
      fc.property(fc.integer({ min: -9e11, max: 4e12 }), (start) => {
        // every two hours is plenty: each phase lasts about 3.7 days
        const order: string[] = [];
        for (let h = 0; h < SYNODIC_MONTH_DAYS * 12; h++) {
          const p = moonPhase(start + h * 2 * 3_600_000);
          if (order[order.length - 1] !== p) order.push(p);
        }
        // one month from `start`: every phase appears, each next phase follows the one before (wrapping at the end), at most one wrap
        const first = MOON_PHASES.indexOf(order[0] as (typeof MOON_PHASES)[number]);
        const expected = Array.from({ length: order.length }, (_, i) => MOON_PHASES[(first + i) % 8]);
        expect(order).toEqual(expected);
        expect(new Set(order).size).toBe(8);
        expect(order.length === 8 || order.length === 9).toBe(true); // a ninth entry is the starting phase again at the end of the month
        return true;
      }),
      propParams(20261114, 100),
    );
  });

  it("one mean month later is the same age, within the rounding of a float", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4e12 }), (t) => {
        const a = moonAge(t);
        const b = moonAge(t + SYNODIC_MONTH_DAYS * DAY);
        return Math.abs(a - b) < 1e-3 || Math.abs(Math.abs(a - b) - SYNODIC_MONTH_DAYS) < 1e-3;
      }),
      propParams(),
    );
  });
});
