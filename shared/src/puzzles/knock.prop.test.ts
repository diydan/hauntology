import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { KNOCK_PLAY, KNOCK_READ, judgeKnock, knockPlayTimes, knockWords, readKnocks } from "./knock";
import { makeLock } from "./make";
import { verify } from "./verify";
import { LEVELS, type KnockLock } from "./types";

/** Knock times for groups, with a gap inside a group and a pause (or a long pause after group `long`) between groups. */
const times = (groups: readonly number[], { inGroup = 300, pause = 1000, long = null as number | null, longPause = 1800 } = {}): number[] => {
  const out: number[] = [];
  let t = 0;
  groups.forEach((g, i) => {
    for (let k = 0; k < g; k++) { out.push(t); t += inGroup; }
    t += (long === i ? longPause : pause) - inGroup;
  });
  return out;
};

describe("Property 34: A secret knock opens to itself and to nothing else (puzzles Requirement 24)", () => {
  const knockArb = fc.tuple(fc.constantFrom(...LEVELS), fc.integer()).map(([level, seed]) => makeLock("knock", level, seed) as KnockLock);

  it("every Lock has a valid pattern: 2 groups on easy, 3 above, 1 to 4 knocks each, no two equal side by side, a long pause on hard only", () => {
    fc.assert(fc.property(knockArb, (lock) => {
      const { groups, long } = lock.secret;
      expect(groups).toHaveLength(lock.level === "easy" ? 2 : 3);
      expect(groups.every((g) => Number.isInteger(g) && g >= 1 && g <= 4)).toBe(true);
      expect(groups.every((g, i) => i === 0 || g !== groups[i - 1])).toBe(true);
      if (lock.level === "easy") expect(groups.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(4);
      expect(long !== null).toBe(lock.level === "hard");
      if (long !== null) expect(long >= 0 && long < groups.length - 1).toBe(true);
      expect(lock.view).toEqual({ kind: "knock", groups: groups.length, longPause: long !== null }); // the door never shows the counts
      expect(lock.sight).toEqual({ kind: "knock", groups, long });
    }), propParams());
  });

  it("the ghost's own knock opens its own door, with a Player's looser timing too, and a knock with other counts does not", () => {
    fc.assert(fc.property(knockArb, (lock) => {
      const { groups, long } = lock.secret;
      expect(judgeKnock(lock.secret, knockPlayTimes(lock.secret)).ok).toBe(true);
      expect(judgeKnock(lock.secret, times(groups, { long })).ok).toBe(true);
      expect(verify(lock, { kind: "knock", times: times(groups, { long }), elapsedMs: 60_000 })).toEqual({ ok: true });
      const other = groups.map((g, i) => (i === 0 ? (g % 4) + 1 : g));
      expect(judgeKnock(lock.secret, times(other, { long })).reason).toBe("groups");
      expect(judgeKnock(lock.secret, times([...groups, 1], { long })).reason).toBe("groups");
    }), propParams());
  });

  it("on hard a missing or misplaced long pause keeps the door shut", () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const lock = makeLock("knock", "hard", seed) as KnockLock;
      const { groups, long } = lock.secret;
      expect(judgeKnock(lock.secret, times(groups)).reason).toBe("pause");
      expect(judgeKnock(lock.secret, times(groups, { long: long === 0 ? 1 : 0 })).reason).toBe("pause");
    }), propParams());
  });

  it("reads knocks into groups by their pauses, sorted, dropping anything not a number", () => {
    expect(readKnocks([])).toEqual({ groups: [], pauses: [] });
    expect(readKnocks(times([3, 2]))).toEqual({ groups: [3, 2], pauses: [1000] });
    expect(readKnocks([500, 0, 250, Number.NaN]).groups).toEqual([3]);
    expect(judgeKnock({ groups: [3, 2], long: null }, []).reason).toBe("none");
  });

  it("plays and says the knock the same way the Player is asked to knock it", () => {
    expect(KNOCK_PLAY.inGroup < KNOCK_READ.groupGapMs && KNOCK_PLAY.pause > KNOCK_READ.groupGapMs && KNOCK_PLAY.pause < KNOCK_READ.longMs && KNOCK_PLAY.longPause >= KNOCK_READ.longMs).toBe(true);
    expect(knockWords({ groups: [2, 1, 3], long: 1 })).toBe("2, pause, 1, long pause, 3");
    expect(knockWords({ groups: [3, 2], long: null })).toBe("3, pause, 2");
  });
});
