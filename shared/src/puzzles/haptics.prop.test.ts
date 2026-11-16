import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { HAPTIC_CAPS, HapticLimiter, hotColdInterval, planHaptics, pulsesOf, PATTERNS } from "./haptics";
import { hapticEventsArb } from "./puzzles.arb";

describe("Property 14: Vibration plans respect the limits", () => {
  // Feature: puzzles, Property 14: Vibration plans respect the limits
  // Validates: Requirements 9.2, 9.3
  it("makes pulses of at most 400 ms, at most four in any second, six seconds in all and one rumble", () => {
    fc.assert(
      fc.property(hapticEventsArb, (events) => {
        const plan = planHaptics(events);
        const starts: number[] = [];
        let total = 0;
        for (const p of plan) for (const [off, len] of pulsesOf(p.pattern)) {
          if (len > HAPTIC_CAPS.maxPulseMs) return false;
          starts.push(p.t + off);
          total += len;
        }
        if (total > HAPTIC_CAPS.maxTotalMs || plan.filter((p) => p.name === "rumble").length > HAPTIC_CAPS.maxRumbles) return false;
        starts.sort((a, b) => a - b);
        return starts.every((s) => starts.filter((x) => x >= s && x < s + 1000).length <= HAPTIC_CAPS.maxPerSecond);
      }),
      propParams(),
    );
  });

  it("makes nothing when vibration is off, and a plan is a subset of the events in time order", () => {
    fc.assert(
      fc.property(hapticEventsArb, (events) => {
        if (planHaptics(events, false).length !== 0) return false;
        const plan = planHaptics(events);
        return plan.every((p, i) => i === 0 || (plan[i - 1] as { t: number }).t <= p.t) && plan.length <= events.length;
      }),
      propParams(),
    );
  });

  it("keeps the hot and cold interval between 250 and 800 ms and never longer as the pick gets nearer", () => {
    fc.assert(
      fc.property(fc.constantFrom(10, 14), fc.double({ min: 0, max: 90, noNaN: true }), fc.double({ min: 0, max: 90, noNaN: true }), (win, a, b) => {
        const [near, far] = a <= b ? [a, b] : [b, a];
        const i = hotColdInterval(near, win), j = hotColdInterval(far, win);
        return i >= 250 && j <= 800 && i <= j;
      }),
      propParams(),
    );
    expect(hotColdInterval(0, 14)).toBe(250);
    expect(hotColdInterval(60, 14)).toBe(800);
  });

  it("counts a snap as two pulses, allows one rumble per Attempt and starts afresh after a reset", () => {
    const lim = new HapticLimiter();
    expect(lim.offer("snap", 0)).not.toBeNull();
    expect(lim.offer("snap", 100)).not.toBeNull();
    expect(lim.offer("tick", 200)).toBeNull(); // a fifth pulse in the second
    expect(lim.offer("tick", 1500)).not.toBeNull();
    lim.reset();
    expect(lim.offer("rumble", 0)).not.toBeNull();
    expect(lim.offer("rumble", 5000)).toBeNull();
    expect(PATTERNS.rumble.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1200);
  });
});
