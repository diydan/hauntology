import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { DEAD_ZONE, TILT_MAX, clampTilt, deadZone, dialFromGravity, smoothTilt, tiltForScreen, tiltToPosition, zeroTilt } from "./motion";
import { finiteTiltArb, rawOrientationArb, screenAngleArb, tiltArb, weirdNumberArb } from "./puzzles.arb";

const isFiniteTilt = (t: { x: number; y: number }): boolean => Number.isFinite(t.x) && Number.isFinite(t.y);
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

describe("Property 12: Tilt maths is total, bounded and rotation-correct", () => {
  // Feature: puzzles, Property 12: Tilt maths is total, bounded and rotation-correct
  // Validates: Requirements 8.2
  it("returns finite values for any input, including NaN and infinities", () => {
    fc.assert(
      fc.property(rawOrientationArb, screenAngleArb, tiltArb, tiltArb, weirdNumberArb, (raw, angle, a, b, v) => {
        const t = tiltForScreen(raw, angle);
        return isFiniteTilt(t) && isFiniteTilt(smoothTilt(a, b)) && isFiniteTilt(zeroTilt(a, b)) && isFiniteTilt(clampTilt(a))
          && Number.isFinite(deadZone(v)) && Number.isFinite(tiltToPosition(v)) && (dialFromGravity(v, v, v) === null || Number.isFinite(dialFromGravity(v, v, v)));
      }),
      propParams(),
    );
  });

  it("holds the dead zone and the clamp", () => {
    fc.assert(
      fc.property(tiltArb, weirdNumberArb, (t, v) => {
        const c = clampTilt(t);
        if (Math.abs(c.x) > TILT_MAX || Math.abs(c.y) > TILT_MAX) return false;
        const d = deadZone(v);
        return Math.abs(v) <= DEAD_ZONE || !Number.isFinite(v) ? d === 0 || !Number.isFinite(v) : Math.sign(d) === Math.sign(v);
      }),
      propParams(),
    );
  });

  it("turns the on-screen direction by a quarter for each quarter turn of the screen, keeping the size", () => {
    fc.assert(
      fc.property(fc.record({ beta: fc.double({ min: -360, max: 360, noNaN: true }), gamma: fc.double({ min: -180, max: 180, noNaN: true }) }), (raw) => {
        const t0 = tiltForScreen(raw, 0), t90 = tiltForScreen(raw, 90), t180 = tiltForScreen(raw, 180), t270 = tiltForScreen(raw, 270);
        const quarter = (t: { x: number; y: number }) => ({ x: t.y, y: -t.x });
        const q = [t90, quarter(t0)], r = [t180, quarter(t90)], s = [t270, quarter(t180)];
        return [q, r, s].every(([a, b]) => near((a as { x: number }).x, (b as { x: number }).x) && near((a as { y: number }).y, (b as { y: number }).y))
          && near(Math.hypot(t0.x, t0.y), Math.hypot(t90.x, t90.y));
      }),
      propParams(),
    );
  });

  it("maps a tilt to a position that never goes down as the tilt goes up", () => {
    fc.assert(
      fc.property(fc.double({ min: -200, max: 200, noNaN: true }), fc.double({ min: -200, max: 200, noNaN: true }), (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        return tiltToPosition(lo) <= tiltToPosition(hi) && tiltToPosition(lo) >= -40 && tiltToPosition(hi) <= 40;
      }),
      propParams(),
    );
    expect(tiltToPosition(-45)).toBe(-40);
    expect(tiltToPosition(45)).toBe(40);
    expect(tiltToPosition(0)).toBe(0);
  });

  it("keeps smoothing between the old and the new reading", () => {
    fc.assert(
      fc.property(finiteTiltArb, finiteTiltArb, fc.double({ min: 0, max: 1, noNaN: true }), (prev, raw, alpha) => {
        const s = smoothTilt(prev, raw, alpha);
        return s.x >= Math.min(prev.x, raw.x) - 1e-9 && s.x <= Math.max(prev.x, raw.x) + 1e-9 && s.y >= Math.min(prev.y, raw.y) - 1e-9 && s.y <= Math.max(prev.y, raw.y) + 1e-9;
      }),
      propParams(),
    );
  });
});

describe("the twist dial", () => {
  it("gives an angle for an upright phone and nothing for a flat one", () => {
    expect(dialFromGravity(0, 0, 9.8)).toBeNull();
    expect(dialFromGravity(0, 9.8, 0)).toBeCloseTo(0, 9);
    expect(dialFromGravity(9.8, 0, 0)).toBeCloseTo(90, 9);
    expect(dialFromGravity(0.5, 0.5, 0)).toBeNull(); // too little pull in the screen plane
  });
});
