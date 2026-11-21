import { describe, expect, it } from "vitest";
import type { EngineState } from "./engine";
import { initialExtras } from "./room-extras";
import { RATTLE_LIGHT, HAUNT_LIGHT, lightMessages, lightTriggers, strikeLine, strikeMessages } from "./room-time";

const eng = (log: unknown[], nextId: number) => ({ log, nextId, players: [] }) as unknown as EngineState;

describe("room-time: what the logged events ask of the light bar", () => {
  it("a Haunt Event lights every phone with its own light, a phone cue only the phone it landed on, and old events nothing", () => {
    const prev = eng([{ id: 0, kind: "haunt-event", option: "lull" }], 1);
    const next = eng([{ id: 0, kind: "haunt-event", option: "lull" }, { id: 1, kind: "haunt-event", option: "restless" }, { id: 2, kind: "phone-cue", target: 3, cue: "bell" }, { id: 3, kind: "nudge", seat: 1 }], 4);
    expect(lightTriggers(prev, next)).toEqual([{ kind: HAUNT_LIGHT.restless, seats: null }, { kind: "glow", seats: [3] }]);
    expect(lightTriggers(next, next)).toEqual([]);
    expect(lightTriggers(null, null)).toEqual([]);
    expect(Object.values(HAUNT_LIGHT).every((k) => ["wave", "heartbeat", "failing-bulb", "creeping-dark", "glow"].includes(k))).toBe(true);
  });
  it("every message stays inside the limits: grey 0.9 at most, 6 s at most, a start at least 500 ms ahead, at most two changes a second", () => {
    const x = { ...initialExtras(), light: { 1: { consent: true, reducedMotion: false }, 2: { consent: true, reducedMotion: false } }, clock: { 1: [{ sentMs: 0, serverMs: 10, receivedMs: 20 }], 2: [{ sentMs: 0, serverMs: 10, receivedMs: 20 }] } };
    for (const kind of ["wave", "heartbeat", "failing-bulb", "creeping-dark", "glow"] as const) {
      const msgs = lightMessages({ kind, seats: null }, 10_000, [1, 2], x);
      expect(msgs).toHaveLength(2);
      for (const { msg } of msgs) {
        expect(msg.startAtMs).toBeGreaterThanOrEqual(10_500 - 20);
        expect(msg.durationMs).toBeLessThanOrEqual(6000);
        expect(Math.max(...msg.steps.map((s) => s.level))).toBeLessThanOrEqual(0.9);
        for (let i = 2; i < msg.steps.length; i++) expect(msg.steps[i]!.atMs - msg.steps[i - 2]!.atMs).toBeGreaterThanOrEqual(1000);
      }
    }
  });
  it("a phone that prefers reduced motion gets none, and Bots (not in the human list) get none", () => {
    const x = { ...initialExtras(), light: { 1: { consent: true, reducedMotion: true }, 2: { consent: true, reducedMotion: false }, 3: { consent: true, reducedMotion: false } }, clock: { 1: [{ sentMs: 0, serverMs: 10, receivedMs: 20 }], 2: [{ sentMs: 0, serverMs: 10, receivedMs: 20 }] } };
    expect(lightMessages({ kind: "glow", seats: null }, 0, [1, 2], x).map((m) => m.seat)).toEqual([2]);
  });
});

describe("room-time: Rattle and Becoming light", () => {
  it("a Rattle's light grows with its level, and a Player joining the haunting dims every phone once", () => {
    expect(RATTLE_LIGHT).toEqual({ 1: "glow", 2: "wave", 3: "creeping-dark" });
    const ev = (level: number) => eng([{ id: 5, kind: "rattle", target: 1, turn: 2, level }], 6);
    expect(lightTriggers(eng([], 5), ev(3))).toEqual([{ kind: "creeping-dark", seats: null }]);
    expect(lightTriggers(eng([], 5), ev(2))).toEqual([{ kind: "wave", seats: null }]);
    const prev = { ...eng([], 5), players: [{ seat: 2, becomingPlayed: false }] } as unknown as EngineState;
    const next = { ...eng([], 5), players: [{ seat: 2, becomingPlayed: true }] } as unknown as EngineState;
    expect(lightTriggers(prev, next)).toEqual([{ kind: "creeping-dark", seats: null }]);
    expect(lightTriggers(next, next)).toEqual([]);
  });
});

describe("room-time: strike messages", () => {
  const phones = [{ seat: 1, bot: false, consent: true, hasAudio: true, soundsThisRound: 0 }, { seat: 2, bot: false, consent: true, hasAudio: true, soundsThisRound: 3 }, { seat: 3, bot: true, consent: false, hasAudio: true, soundsThisRound: 0 }];
  it("the Host always strikes; a phone with no free slot or a Bot gets none; with sounds off the phones get none but the Host still strikes", () => {
    const strike = { atMs: 5_000, count: 3, hour: 3, midnight: false };
    const m = strikeMessages(strike, phones, true);
    expect(m.map((x) => [x.target, x.msg.plan])).toEqual([["host", "play"], [1, "play"], [2, "none"], [3, "none"]]);
    expect(new Set(m.map((x) => x.msg.atMs))).toEqual(new Set([5_000]));
    expect(strikeMessages(strike, phones, false).map((x) => x.msg.plan)).toEqual(["play", "none", "none", "none"]);
  });
  it("reads the hour in words, and the ghost's own line at midnight", () => {
    expect(strikeLine({ atMs: 0, count: 7, hour: 19, midnight: false }, "M")).toBe("The clock struck seven.");
    expect(strikeLine({ atMs: 0, count: 12, hour: 0, midnight: true }, "M")).toBe("M");
    expect(strikeLine({ atMs: 0, count: 12, hour: 12, midnight: false }, "M")).toBe("The clock struck twelve.");
  });
});
