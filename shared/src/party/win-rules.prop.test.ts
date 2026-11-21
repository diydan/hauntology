import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { mulberry32, shuffle } from "../puzzles/rng";
import { roundEnd, sealAccusation, type AccusePlayer, type AccuseState } from "./accuse";
import type { Solution } from "./deal";
import { scarePoints, type RecapEvent, type Source } from "./ending";
import { firstPlayer, nextClockwise, roundOrder, type Order } from "./turns";

const ids = (k: string): string[] => [1, 2, 3, 4, 5, 6].map((i) => `${k}${i}`);
const solArb: fc.Arbitrary<Solution> = fc.record({ suspect: fc.constantFrom(...ids("s")), zone: fc.constantFrom(...ids("z")), relic: fc.constantFrom(...ids("r")) });
const startState = (n: number, max: number, level = 0): AccuseState => ({
  round: 1, phase: "playing", haunt: { level, max }, winners: [], houseWins: false,
  players: Array.from({ length: n }, (_, i): AccusePlayer => ({ seat: i + 1, poltergeist: false, sealed: null, hasSealed: false, joinedRound: null })),
});
const same = (a: Solution | null, b: Solution): boolean => a !== null && a.suspect === b.suspect && a.zone === b.zone && a.relic === b.relic;

describe("Property 54: A wrong guess never wins", () => {
  // Feature: party-mode, Property 54: A wrong guess never wins
  // Validates: Requirements 6.5, 11.3
  it("makes only an Accusation equal to the Solution a winner, whatever else happens in the Round, the Haunt level included", () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 6 }), solArb, fc.array(fc.tuple(fc.integer({ min: 1, max: 6 }), solArb), { maxLength: 8 }), fc.integer({ min: 0, max: 12 }), fc.constantFrom(8, 10, 12), (n, sol, seals, level, max) => {
      let s = startState(n, max, Math.min(level, max));
      for (const [seat, guess] of seals) { const r = sealAccusation(s, seat, guess); if (r.ok) s = r.state; }
      const before = s.players;
      const { state, reveals } = roundEnd(s, sol);
      for (const w of state.winners) if (!same(before.find((p) => p.seat === w)?.sealed ?? null, sol)) return false;
      const rightSeats = before.filter((p) => same(p.sealed, sol)).map((p) => p.seat);
      if (JSON.stringify([...state.winners]) !== JSON.stringify(rightSeats)) return false;
      // a wrong Accusation joins the haunting, wins nothing, even when it also tips the Haunt to its maximum
      for (const r of reveals) if (!r.right && (state.winners.includes(r.seat) || state.players.find((p) => p.seat === r.seat)?.poltergeist !== true)) return false;
      return !(state.houseWins && state.winners.length > 0);
    }), propParams());
  });
  it("gives no winner when every Accusation is wrong, even for a table that is all haunting", () => {
    let s = startState(2, 10);
    for (const seat of [1, 2]) { const r = sealAccusation(s, seat, { suspect: "s1", zone: "z1", relic: "r1" }); if (r.ok) s = r.state; }
    const { state } = roundEnd(s, { suspect: "s2", zone: "z2", relic: "r2" });
    expect(state.winners).toEqual([]);
    expect(state.houseWins).toBe(true);
  });
});

describe("Property 55: Reveals do not depend on order", () => {
  // Feature: party-mode, Property 55: Reveals do not depend on order
  // Validates: Requirements 6.3, 6.5
  it("gives the same winners, haunting seats, Haunt level and reveal set however the seals were made or the players are listed", () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 6 }), solArb, fc.array(fc.tuple(fc.integer({ min: 1, max: 6 }), fc.boolean(), solArb), { maxLength: 6 }), fc.integer(), (n, sol, seals, seed) => {
      const seal = (order: typeof seals): AccuseState => { let s = startState(n, 10); for (const [seat, right, guess] of order) { const r = sealAccusation(s, seat, right ? sol : guess); if (r.ok) s = r.state; } return s; };
      const a = seal(seals);
      const shuffled = shuffle(mulberry32(seed), seals);
      // sealing is once per Player, so the first seal per seat must survive the shuffle: keep per-seat order, mix across seats
      const firstPerSeat = new Map<number, (typeof seals)[number]>(); for (const x of seals) if (!firstPerSeat.has(x[0])) firstPerSeat.set(x[0], x);
      const b = seal(shuffle(mulberry32(seed), [...firstPerSeat.values()]));
      const ra = roundEnd(a, sol), rb = roundEnd(b, sol);
      const key = (r: ReturnType<typeof roundEnd>) => JSON.stringify({ w: [...r.state.winners], h: r.state.haunt, ph: r.state.players.filter((p) => p.poltergeist).map((p) => p.seat).sort(), rv: [...r.reveals].sort((x, y) => x.seat - y.seat) });
      void shuffled;
      return key(ra) === key(rb);
    }), propParams());
  });
});

describe("Property 56: The first player rotates fairly", () => {
  // Feature: party-mode, Property 56: The first player rotates fairly
  // Validates: Requirements 5.1
  it("starts Round 1 from the seed, then moves one Detective clockwise each Round, so every Detective leads once in n Rounds", () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 6 }), fc.integer(), (n, seed) => {
      const seats = Array.from({ length: n }, (_, i) => i + 1);
      const o: Order = { seats, out: [] };
      const led: number[] = [];
      let first = firstPlayer(o, null, seed) as number;
      for (let r = 0; r < n; r++) { led.push(first); first = firstPlayer(o, first, seed) as number; }
      if (new Set(led).size !== n) return false;
      if (first !== led[0]) return false; // after n Rounds it is back to the start
      for (let i = 1; i < n; i++) if (led[i] !== nextClockwise(o, led[i - 1] as number)) return false;
      return roundOrder(o, led[0] as number).length === n && firstPlayer(o, null, seed) === firstPlayer(o, null, seed);
    }), propParams());
  });
  it("passes over a seat that is out, and over every seat when nobody can play", () => {
    expect(firstPlayer({ seats: [1, 2, 3, 4], out: [3] }, 2, 1)).toBe(4);
    expect(firstPlayer({ seats: [1, 2, 3], out: [1, 2, 3] }, null, 1)).toBeNull();
    fc.assert(fc.property(fc.uniqueArray(fc.integer({ min: 1, max: 6 }), { minLength: 1, maxLength: 5 }), fc.integer(), (out, seed) => {
      const o: Order = { seats: [1, 2, 3, 4, 5, 6], out };
      const f = firstPlayer(o, null, seed);
      return f === null ? out.length === 6 : !out.includes(f);
    }), propParams());
  });
});

const logArb: fc.Arbitrary<RecapEvent[]> = fc.array(fc.oneof(
  fc.record({ kind: fc.constant("timeout" as const), seat: fc.integer({ min: 1, max: 6 }), turn: fc.nat(6) }),
  fc.record({ kind: fc.constant("nudge" as const), seat: fc.integer({ min: 1, max: 6 }), nudge: fc.constantFrom("help" as const, "spook" as const), target: fc.integer({ min: 1, max: 6 }), turn: fc.nat(6) }),
  fc.record({ kind: fc.constant("inspect" as const), seat: fc.integer({ min: 1, max: 6 }), zone: fc.constant("z1") }),
), { maxLength: 24 }).map((xs) => xs.map((x, id) => ({ ...x, id }) as RecapEvent));
const sourcesArb: fc.Arbitrary<Source[]> = fc.array(fc.record({ eventId: fc.nat(40), kind: fc.constantFrom("house-cue" as const, "frame" as const, "rattle" as const), from: fc.option(fc.integer({ min: 1, max: 6 }), { nil: null }), turn: fc.nat(6) }), { maxLength: 12 });

describe("Property 58: Scare points change nothing", () => {
  // Feature: party-mode, Property 58: Scare points change nothing
  // Validates: Requirements 11.6
  it("is a pure count: it leaves its frozen inputs alone, gives the same answer in any order, and scores only the Poltergeists it is given", () => {
    fc.assert(fc.property(logArb, sourcesArb, fc.uniqueArray(fc.integer({ min: 1, max: 6 }), { maxLength: 4 }), fc.integer(), (log, sources, polts, seed) => {
      const frozenLog = log.map((e) => Object.freeze({ ...e })), frozenSrc = sources.map((s) => Object.freeze({ ...s }));
      const snapshot = JSON.stringify([frozenLog, frozenSrc, polts]);
      const a = scarePoints(frozenLog, frozenSrc, polts);
      if (JSON.stringify([frozenLog, frozenSrc, polts]) !== snapshot) return false;
      const b = scarePoints(shuffle(mulberry32(seed), frozenLog), shuffle(mulberry32(seed + 1), frozenSrc), shuffle(mulberry32(seed + 2), polts));
      if (JSON.stringify(Object.entries(a).sort()) !== JSON.stringify(Object.entries(b).sort())) return false;
      return Object.keys(a).map(Number).every((s) => polts.includes(s)) && Object.values(a).every((v) => Number.isInteger(v) && v >= 0);
    }), propParams());
  });
  it("cannot reach a rule: it takes a log, sources and seats, and returns only numbers", () => {
    expect(scarePoints.length).toBe(3);
    expect(scarePoints([], [], [4])).toEqual({ 4: 0 });
  });
});
