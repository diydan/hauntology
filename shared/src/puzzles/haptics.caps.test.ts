import { describe, expect, it } from "vitest";
import { HAPTIC_CAPS, PATTERNS, planHaptics, type HapticEvent } from "./haptics";

/** Group 9.6 mutation pass: the two caps no earlier test pinned, the total buzz time of an Attempt and the longest single pulse. */
describe("planHaptics caps (puzzles 9.6)", () => {
  it("an Attempt never buzzes for more than the total cap: later events are dropped once it would be passed", () => {
    // one 100 ms bump every 1.5 s, so no other cap applies, until 6000 ms of buzz is spent
    const events: HapticEvent[] = Array.from({ length: 80 }, (_, i) => ({ t: i * 1500, name: "bump" as const }));
    const plan = planHaptics(events);
    const total = plan.reduce((a, p) => a + (p.pattern[0] ?? 0), 0);
    expect(total).toBeLessThanOrEqual(HAPTIC_CAPS.maxTotalMs);
    expect(plan.length).toBe(Math.floor(HAPTIC_CAPS.maxTotalMs / PATTERNS.bump[0]!));
    expect(plan.at(-1)?.t).toBe((plan.length - 1) * 1500);
  });

  it("a pattern with a pulse longer than the cap is never played", () => {
    const caps = { ...HAPTIC_CAPS, maxPulseMs: 50 };
    const plan = planHaptics([{ t: 0, name: "bump" }, { t: 2000, name: "tick" }, { t: 4000, name: "thunk" }], true, caps);
    expect(plan.map((p) => p.name)).toEqual(["tick", "thunk"]); // bump is 100 ms, thunk is 45 ms
    expect(planHaptics([{ t: 0, name: "rumble" }], true, { ...HAPTIC_CAPS, maxPulseMs: 199 })).toEqual([]);
    expect(planHaptics([{ t: 0, name: "rumble" }], true, { ...HAPTIC_CAPS, maxPulseMs: 200 })).toHaveLength(1);
  });
});
