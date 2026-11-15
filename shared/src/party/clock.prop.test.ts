import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS, BASE_SECONDS, CAP_SECONDS, DISCONNECT_GRACE_MS, WARNING_MS, bonusSeconds, clockStatus, deadlineOf, earned, expire,
  nextWake, onDisconnect, pause, resume, skippedAfter, turnBudget, type AchievementId, type ClockEvent, type Deadlines, type TurnClock,
} from "./clock";

const ids = Object.keys(ACHIEVEMENTS) as AchievementId[];
const seat = fc.integer({ min: 1, max: 6 });
const zone = fc.constantFrom("z1", "z2", "z3", "z4", "z5", "z6");
const eventArb: fc.Arbitrary<ClockEvent> = fc.oneof(
  fc.record({ kind: fc.constant("visit"), seat, zone, sinceTurnMs: fc.nat(60_000) }),
  fc.record({ kind: fc.constant("suggest"), seat }),
  fc.record({ kind: fc.constant("timeout"), seat }),
  fc.record({ kind: fc.constantFrom("inspect", "pass", "cue"), seat }),
);

describe("Property 12: Turn budgets and achievements are bounded and monotone", () => {
  it("is min(cap, base' + bonus), with the Blackout cut, null with no clock, and never over 120 s by default", () => {
    fc.assert(fc.property(fc.option(fc.constantFrom(...BASE_SECONDS), { nil: null }), fc.subarray(ids), fc.boolean(), (base, got, blackout) => {
      const bonus = bonusSeconds(got);
      const b = turnBudget({ baseSeconds: base, bonusSeconds: bonus, blackout });
      if (base === null) { expect(b).toBeNull(); return; }
      const baseP = blackout ? Math.max(15, base - 15) : base;
      expect(b).toBe(Math.min(CAP_SECONDS, baseP + bonus));
      expect(b).toBeLessThanOrEqual(120);
      for (const more of ids) expect(turnBudget({ baseSeconds: base, bonusSeconds: bonusSeconds([...got, more]), blackout }) as number).toBeGreaterThanOrEqual(b as number);
    }));
    expect(turnBudget({ baseSeconds: 30, bonusSeconds: 0, blackout: true })).toBe(15);
    expect(turnBudget({ baseSeconds: 90, bonusSeconds: 50, blackout: false })).toBe(120);
  });

  it("awards from the log alone, the same in any order, each at most once, counting only that seat's events", () => {
    fc.assert(fc.property(fc.array(eventArb, { maxLength: 40 }), seat, fc.integer(), (log, s, salt) => {
      const a = earned(log, s);
      const shuffled = [...log].sort((x, y) => ((JSON.stringify(x).length * 31 + salt) % 7) - ((JSON.stringify(y).length * 31 + salt) % 7));
      expect(new Set(earned(shuffled, s))).toEqual(new Set(a));
      expect(new Set(earned(log, s))).toEqual(new Set(a)); // asking again gives the same set
      for (let k = 0; k <= log.length; k++) for (const id of earned(log.slice(0, k), s)) expect(a.has(id)).toBe(true); // more log never takes one away
      const others = log.filter((e) => e.seat !== s);
      expect(earned([...others, ...log.filter((e) => e.seat === s)], s)).toEqual(a);
      expect(earned(others, s).size).toBe(0);
      expect(bonusSeconds([...a, ...a])).toBe(bonusSeconds(a));
    }));
  });

  it("matches the catalogue: three rooms, all six, quick feet, three Suggestions, two timeouts", () => {
    const v = (z: string, t = 30_000): ClockEvent => ({ kind: "visit", seat: 1, zone: z, sinceTurnMs: t });
    expect([...earned([v("z1"), v("z2")], 1)]).toEqual([]);
    expect([...earned([v("z1"), v("z2"), v("z3")], 1)]).toEqual(["wanderer"]);
    expect(earned(["z1", "z2", "z3", "z4", "z5", "z6"].map((z) => v(z)), 1).has("cartographer")).toBe(true);
    expect(earned([v("z1", 20_000)], 1).has("quickFeet")).toBe(true);
    expect(earned([v("z1", 20_001)], 1).has("quickFeet")).toBe(false);
    expect(earned(Array.from({ length: 3 }, () => ({ kind: "suggest", seat: 1 })), 1).has("persistent")).toBe(true);
    expect(earned([{ kind: "timeout", seat: 1 }, { kind: "timeout", seat: 1 }], 1).has("secondWind")).toBe(true);
    expect(bonusSeconds(ids)).toBe(10 + 15 + 5 + 10 + 10);
  });
});

const clockArb: fc.Arbitrary<TurnClock> = fc.record({
  startedMs: fc.integer({ min: 0, max: 1_000_000 }),
  budgetMs: fc.option(fc.integer({ min: 15_000, max: 120_000 }), { nil: null }),
  pausedMs: fc.integer({ min: 0, max: 60_000 }),
  pausedSinceMs: fc.constant(null),
  ended: fc.constant(false),
});

describe("Property 13: The clock, nextWake, and disconnects end turns exactly once", () => {
  it("warns exactly in the last 10 seconds and expires exactly at the deadline", () => {
    fc.assert(fc.property(clockArb, fc.integer({ min: -200_000, max: 200_000 }), (t, off) => {
      const d = deadlineOf(t, 0);
      if (d === null) { expect(clockStatus(t, t.startedMs + off)).toBe("none"); return; }
      const now = d + off;
      expect(clockStatus(t, now)).toBe(now >= d ? "expired" : d - now <= WARNING_MS ? "warning" : "running");
      expect(clockStatus(t, d - WARNING_MS)).toBe("warning");
      expect(clockStatus(t, d - WARNING_MS - 1)).toBe("running");
      expect(clockStatus(t, d)).toBe("expired");
    }));
  });

  it("ends an expired Turn once, with one Haunt level, or none when a Spook was used", () => {
    fc.assert(fc.property(clockArb, fc.boolean(), fc.nat(10_000), (t, spook, late) => {
      const d = deadlineOf(t, 0);
      if (d === null) { expect(expire(t, 10 ** 9, spook).ended).toBe(false); return; }
      expect(expire(t, d - 1, spook).ended).toBe(false);
      const first = expire(t, d + late, spook);
      expect(first.ended).toBe(true);
      expect(first.hauntRise).toBe(spook ? 0 : 1);
      const again = expire(first.clock, d + late + 1, spook);
      expect(again.ended).toBe(false);
      expect(again.hauntRise).toBe(0);
    }));
  });

  it("does not run while paused: a pause pushes the deadline back by exactly its length", () => {
    fc.assert(fc.property(clockArb, fc.nat(30_000), fc.nat(30_000), (t, at, len) => {
      const d0 = deadlineOf(t, 0);
      if (d0 === null) return;
      const p = pause(t, t.startedMs + at);
      expect(deadlineOf(p, t.startedMs + at + len)).toBe(d0 + len);
      expect(deadlineOf(resume(p, t.startedMs + at + len), 0)).toBe(d0 + len);
    }));
  });

  it("gives a dropped phone 20 seconds, paused, and skips a seat after two missed Turns while away", () => {
    fc.assert(fc.property(clockArb, fc.nat(100_000), (t, now) => {
      const { clock, endsAtMs } = onDisconnect(t, now);
      expect(clock.pausedSinceMs).toBe(now);
      expect(endsAtMs - now).toBe(DISCONNECT_GRACE_MS);
      expect(nextWake({ turn: clock, disconnectEndsMs: endsAtMs }, now)).toBe(endsAtMs);
    }));
    expect(skippedAfter(1, false)).toBe(false);
    expect(skippedAfter(2, false)).toBe(true);
    expect(skippedAfter(5, true)).toBe(false);
  });

  it("wakes at the earliest pending deadline, counting the warning, and not at all with nothing pending", () => {
    const opt = fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null });
    fc.assert(fc.property(fc.option(clockArb, { nil: null }), opt, opt, opt, opt, opt, opt, opt, opt, opt, fc.nat(1_000_000), (turn, a, b, c, e, f, g, h, i, j, now) => {
      const d: Deadlines = { turn, disconnectEndsMs: a, inspectUntilMs: b, hauntChoiceMs: c, eavesdropUntilMs: e, answeringUntilMs: f, windowUntilMs: g, masterTimeoutMs: h, botThinkUntilMs: i, roomExpiresMs: j };
      const others = [a, b, c, e, f, g, h, i, j].filter((x): x is number => x !== null);
      const end = turn ? deadlineOf(turn, now) : null;
      const expected = [...others, ...(end === null ? [] : [end, ...(end - WARNING_MS > now ? [end - WARNING_MS] : [])])];
      expect(nextWake(d, now)).toBe(expected.length === 0 ? null : Math.min(...expected));
    }), { numRuns: 500 });
    expect(nextWake({}, 5)).toBeNull();
  });
});
