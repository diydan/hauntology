import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { defaultSnapshot } from "../conditions/snapshot";
import { MOON_PHASES, TIMES_OF_DAY, WEATHER_CLASSES, type ConditionsSnapshot } from "../conditions/types";
import { freezeConditions, roomConditions } from "./conditions";
import { HOUR_MS, hourStrike, strikeTargets, type Strike } from "./hour";
import type { PhoneSeat } from "./cues";

const dial = (h: number): number => (h % 12 === 0 ? 12 : h % 12);

describe("Property 37: The hour strike is exact, shared and rule-free", () => {
  // Feature: party-mode, Property 37: The hour strike is exact, shared and rule-free
  // Validates: Requirements 15.1, 15.2, 15.3
  it("strikes on the next hour boundary of the host's clock, within an hour, with the hour on a 12-hour dial", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 4_000_000_000_000 }), fc.integer({ min: -720, max: 840 }), (now, off) => {
      const s = hourStrike(now, off, null) as Strike;
      const local = s.atMs + off * 60_000;
      if (s.atMs <= now || s.atMs - now > HOUR_MS) return false;
      if (local % HOUR_MS !== 0) return false;
      const hour = (((local / HOUR_MS) % 24) + 24) % 24;
      return s.hour === hour && s.count === dial(hour) && s.midnight === (hour === 0) && s.count >= 1 && s.count <= 12;
    }), propParams());
  });
  it("strikes twelve at midnight and at noon, and the midnight flag only at midnight", () => {
    const midnightUtc = Date.UTC(2026, 10, 20, 23, 30);
    const s = hourStrike(midnightUtc, 0, null) as Strike;
    expect(s).toMatchObject({ hour: 0, count: 12, midnight: true });
    const noon = hourStrike(Date.UTC(2026, 10, 21, 11, 59), 0, null) as Strike;
    expect(noon).toMatchObject({ hour: 12, count: 12, midnight: false });
    expect(hourStrike(Date.UTC(2026, 10, 21, 13, 10), 0, null)).toMatchObject({ hour: 14, count: 2 });
  });
  it("follows a half-hour zone on its own hour", () => {
    const s = hourStrike(Date.UTC(2026, 10, 21, 12, 0), 330, null) as Strike; // UTC+5:30, 17:30 local
    expect(new Date(s.atMs).toISOString()).toBe("2026-11-21T12:30:00.000Z");
    expect(s).toMatchObject({ hour: 18, count: 6 });
  });
  it("never repeats a strike it has already made, and moves on one hour each time", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 4_000_000_000_000 }), fc.integer({ min: -720, max: 840 }), (now, off) => {
      let prev: Strike | null = null;
      for (let k = 0; k < 30; k++) {
        const s = hourStrike(now, off, prev) as Strike;
        if (prev !== null && s.atMs - prev.atMs !== HOUR_MS) return false;
        prev = s;
      }
      return true;
    }), propParams());
  });
  it("is off with the Master's switch, and for a time that is not a number", () => {
    expect(hourStrike(1000, 0, null, false)).toBeNull();
    expect(hourStrike(Number.NaN, 0, null)).toBeNull();
    expect(hourStrike(1000, Number.POSITIVE_INFINITY, null)).toBeNull();
  });
  it("gives the Host and every phone the same server time, the Bell only to phones with consent and a free slot", () => {
    const s = hourStrike(Date.UTC(2026, 10, 21, 2, 30), 0, null) as Strike;
    const phones: PhoneSeat[] = [
      { seat: 3, bot: false, consent: true, hasAudio: true, soundsThisRound: 0 },
      { seat: 1, bot: false, consent: true, hasAudio: false, soundsThisRound: 2 },
      { seat: 2, bot: false, consent: false, hasAudio: true, soundsThisRound: 0 },
      { seat: 4, bot: false, consent: true, hasAudio: true, soundsThisRound: 3 },
    ];
    const t = strikeTargets(s, phones, true);
    expect(new Set(t.map((x) => x.atMs)).size).toBe(1);
    expect(new Set(t.map((x) => x.count))).toEqual(new Set([3]));
    expect(t.map((x) => [x.target, x.plan])).toEqual([["host", "play"], [1, "flash"], [2, "none"], [3, "play"], [4, "none"]]);
    expect(strikeTargets(s, phones, false).slice(1).every((x) => x.plan === "none")).toBe(true);
  });
});

const snapArb: fc.Arbitrary<ConditionsSnapshot> = fc.record({
  place: fc.constant({ lat: 51.5, lon: -0.12, tz: "Europe/London", label: "Somewhere secret" }),
  timeOfDay: fc.constantFrom(...TIMES_OF_DAY), weather: fc.constantFrom(...WEATHER_CLASSES),
  tempBand: fc.constantFrom("freezing", "cold", "mild", "warm", "hot"), windBand: fc.constantFrom("calm", "breezy", "windy"),
  moon: fc.constantFrom(...MOON_PHASES), source: fc.constantFrom("live", "memory", "default"),
}) as fc.Arbitrary<ConditionsSnapshot>;

describe("Property 38: The real world never changes a rule", () => {
  // Feature: party-mode, Property 38: The real world never changes a rule
  // Validates: Requirements 15.4
  it("passes on only the weather, the time of day and the moon, never the position, label, temperature, wind or source", () => {
    fc.assert(fc.property(snapArb, (snap) => {
      const pub = roomConditions(snap);
      if (pub === undefined) return false;
      if (Object.keys(pub).sort().join() !== "moon,timeOfDay,weather") return false;
      const text = JSON.stringify(pub);
      return !text.includes("Somewhere") && !text.includes("51.5") && !text.includes("tempBand") && !text.includes("windBand") && !text.includes("source");
    }), propParams());
  });
  it("has nothing to show when conditions are off or failed", () => {
    expect(roomConditions(null)).toBeUndefined();
    expect(roomConditions(undefined)).toBeUndefined();
  });
  it("freezes a copy so nothing can change the snapshot, and leaves the input alone", () => {
    const snap = { ...defaultSnapshot(Date.UTC(2026, 10, 21), 12), place: { lat: 1, lon: 2, tz: null, label: "Here" } } as { -readonly [K in keyof ConditionsSnapshot]: ConditionsSnapshot[K] };
    const frozen = freezeConditions(snap) as ConditionsSnapshot;
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(frozen).toEqual(snap);
    expect(Object.isFrozen(snap)).toBe(false);
    expect(() => { (frozen as { weather: string }).weather = "storm"; }).toThrow();
    if (frozen.place !== undefined) expect(Object.isFrozen(frozen.place)).toBe(true);
  });
});
