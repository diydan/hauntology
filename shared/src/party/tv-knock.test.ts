import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { knockPlayTimes } from "../puzzles/knock";
import { TV_KNOCK_LEAD_MS, TV_KNOCK_MAX_MS, tvKnockCues, tvKnockWords } from "./tv-knock";

const open = { groups: [2, 1], long: null, answeredBy: null } as const;

describe("the ghost's knock on the TV (knock-door 5.3, 8.2)", () => {
  it("plays the pattern's knocks at the pattern's own times after a short lead, with one id for each knock in the Round", () => {
    const cues = tvKnockCues(3, open, 10_000);
    expect(cues.map((c) => c.atMs - 10_000)).toEqual(knockPlayTimes(open).map((t) => t + TV_KNOCK_LEAD_MS));
    expect(cues.map((c) => c.id)).toEqual(["tv-knock-3-0", "tv-knock-3-1", "tv-knock-3-2"]);
    expect(tvKnockCues(4, open, 10_000)[0]!.id).toBe("tv-knock-4-0"); // a new Round is a new knock
  });
  it("plays nothing when there is no knock or it was answered", () => {
    expect(tvKnockCues(1, null, 0)).toEqual([]);
    expect(tvKnockCues(1, undefined, 0)).toEqual([]);
    expect(tvKnockCues(1, { ...open, answeredBy: 2 }, 0)).toEqual([]);
  });
  it("never schedules a knock further ahead than the sound player keeps", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 4 }), fc.option(fc.nat(3), { nil: null }), (groups, long) => {
        const cues = tvKnockCues(1, { groups, long: long !== null && long < groups.length ? long : null, answeredBy: null }, 0);
        expect(cues.every((c) => c.atMs <= TV_KNOCK_MAX_MS)).toBe(true);
        expect(cues.length).toBeGreaterThan(0);
      }),
    );
  });
  it("says it is knocking, then who knocked it back, and never the pattern", () => {
    const nick = (s: number): string | null => (s === 2 ? "Ben" : null);
    expect(tvKnockWords(null, nick)).toBe("");
    expect(tvKnockWords(open, nick)).toBe("The ghost is knocking at the TV. Listen, then knock it back on your phone.");
    expect(tvKnockWords({ ...open, answeredBy: 2 }, nick)).toBe("Ben knocked it back.");
    expect(tvKnockWords({ ...open, answeredBy: 9 }, nick)).toBe("Someone knocked it back.");
    fc.assert(fc.property(fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 4 }), (groups) => {
      expect(tvKnockWords({ groups, long: null, answeredBy: null }, nick)).not.toMatch(/\d/);
    }));
  });
});
