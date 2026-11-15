import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { FALL_MS, MAX_STEP_MS, READ_ANGLE, READ_MS, UNREAD, clueAngle, stepClue, stepRead } from "./read";
import { weirdNumberArb } from "./puzzles.arb";

/** An angle the middle of the view can be from a clue: near, far, and not a number. */
const angleArb = fc.oneof(
  { weight: 5, arbitrary: fc.double({ min: 0, max: READ_ANGLE, noNaN: true }) },
  { weight: 5, arbitrary: fc.double({ min: READ_ANGLE * 1.0001, max: Math.PI, noNaN: true }) },
  { weight: 1, arbitrary: fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, -1e300, 1e300) },
);
const stepArb = fc.record({ angle: angleArb, dt: fc.oneof(fc.double({ min: 0, max: 250, noNaN: true }), fc.constantFrom(-5, Number.NaN, Number.POSITIVE_INFINITY, 1e9)) });
const near = (a: number): boolean => Number.isFinite(a) && Math.abs(a) <= READ_ANGLE;

describe("Property 19: Reading needs a steady look", () => {
  // Feature: puzzles, Property 19: Reading needs a steady look
  // Validates: Requirements 15.5
  it("stays between 0 and 1 for any input, rises only while the view is within 12 degrees and falls otherwise", () => {
    fc.assert(
      fc.property(fc.oneof(fc.double({ min: 0, max: 1, noNaN: true }), weirdNumberArb), angleArb, fc.oneof(fc.double({ min: 0, max: 250, noNaN: true }), weirdNumberArb), (p, a, dt) => {
        const next = stepRead(p, a, dt);
        if (!(next >= 0 && next <= 1)) return false;
        const start = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
        if (!(dt > 0) || !Number.isFinite(dt)) return next === start;
        return near(a) ? next >= start : next <= start;
      }),
      propParams(),
    );
  });

  it("reads a clue only after at least 0.7 seconds of steady looking in total, however large the time steps", () => {
    fc.assert(
      fc.property(fc.array(stepArb, { minLength: 1, maxLength: 80 }), (steps) => {
        let s = UNREAD, looked = 0;
        for (const { angle, dt } of steps) {
          if (near(angle) && Number.isFinite(dt) && dt > 0) looked += Math.min(dt, MAX_STEP_MS);
          s = stepClue(s, angle, dt);
          if (s.read && looked < READ_MS - 1e-6) return false;
        }
        return true;
      }),
      propParams(),
    );
  });

  it("reads after exactly 0.7 seconds of steady looking in small steps, and a stalled frame never reads a clue", () => {
    let s = UNREAD;
    for (let i = 0; i < 6; i++) s = stepClue(s, 0, 100);
    expect(s.read).toBe(false);
    s = stepClue(s, 0, 100);
    expect(s.read).toBe(true);
    expect(stepClue(UNREAD, 0, 60_000).read).toBe(false); // one frame of a minute counts as MAX_STEP_MS
  });

  it("gives the same progress however a short step is split into smaller ones", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), angleArb, fc.double({ min: 0.001, max: MAX_STEP_MS, noNaN: true }), fc.double({ min: 0.05, max: 0.95, noNaN: true }), (p, a, dt, split) => {
        const once = stepRead(p, a, dt);
        const twice = stepRead(stepRead(p, a, dt * split), a, dt * (1 - split));
        return Math.abs(once - twice) < 1e-9;
      }),
      propParams(),
    );
  });

  it("falls back to empty after 1.4 seconds of looking away", () => {
    let p = 1;
    for (let i = 0; i < FALL_MS / 100; i++) p = stepRead(p, Math.PI, 100);
    expect(p).toBeCloseTo(0, 9);
  });

  it("keeps a clue read once it is read, whatever happens next", () => {
    fc.assert(
      fc.property(fc.array(stepArb, { minLength: 1, maxLength: 60 }), (steps) => {
        let s = stepClue(UNREAD, 0, 100);
        for (let i = 0; i < 7; i++) s = stepClue(s, 0, 100);
        if (!s.read) return false;
        return steps.every(({ angle, dt }) => (s = stepClue(s, angle, dt)).read && s.progress === 1);
      }),
      propParams(),
    );
  });
});

describe("clueAngle", () => {
  it("is 0 for the same direction, pi for the opposite one, the same either way round and never a number outside 0 to pi", () => {
    const dir = fc.record({ turn: fc.double({ min: -7, max: 7, noNaN: true }), height: fc.double({ min: -1.5, max: 1.5, noNaN: true }) });
    fc.assert(
      fc.property(dir, dir, (a, b) => {
        const d = clueAngle(a, b);
        return d >= 0 && d <= Math.PI && Math.abs(d - clueAngle(b, a)) < 1e-9 && clueAngle(a, a) < 1e-6 && Math.abs(clueAngle(a, { turn: a.turn + Math.PI, height: -a.height }) - Math.PI) < 1e-6;
      }),
      propParams(),
    );
    expect(clueAngle({ turn: Number.NaN, height: 0 }, { turn: 0, height: 0 })).toBe(Math.PI);
  });
});
