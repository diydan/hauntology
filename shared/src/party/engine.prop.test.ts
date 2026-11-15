import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mulberry32, randInt, type Rng } from "../puzzles/rng";
import { createEngine, privateSnapshot, publicSnapshot, step, type Action, type ClientMsg, type EngineSeat, type EngineState, type StepResult } from "./engine";
import { soloSetup } from "./solo";

const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);
const botSeats = (n: number, humanFirst: boolean): EngineSeat[] =>
  Array.from({ length: n }, (_, i) => ({ seat: i + 1, nickname: `P${i + 1}`, bot: !(humanFirst && i === 0), botLevel: i % 2 === 0 ? "standard" : "gentle" }));

/** Run a game to the end: the human (if any) acts at random, then time jumps to the next wake. */
function play(seed: number, n: number, max: 8 | 10 | 12, human: boolean, r: Rng, onStep?: (res: StepResult, before: EngineState, a: Action) => void): { state: EngineState; steps: number } {
  let s = createEngine({ seed, seats: botSeats(n, human), settings: { baseSeconds: 60, hauntMax: max }, presetIds: PRESETS });
  let now = 1_000;
  const go = (a: Action): void => { const before = s; const res = step(s, a, now); onStep?.(res, before, a); s = res.state; };
  go({ kind: "client", seat: 1, msg: { t: "start" } });
  let steps = 0;
  for (; steps < 6000 && s.phase === "playing"; steps++) {
    if (human && s.turn?.seat === 1 && r() < 0.7) {
      const zones = s.pool.zones.map((z) => z.id);
      const pick = <T,>(xs: readonly T[]): T => xs[randInt(r, xs.length)] as T;
      const msgs: ClientMsg[] = [
        { t: "walk", zone: pick(zones) }, { t: "inspect" }, { t: "pass" }, { t: "endTurn" },
        { t: "suggest", suspect: pick(s.pool.suspects).id, relic: pick(s.pool.relics).id },
        { t: "seal", suspect: pick(s.pool.suspects).id, zone: pick(zones), relic: pick(s.pool.relics).id },
        { t: "show", card: "s1" }, { t: "choose", option: "lull" }, { t: "start" },
      ];
      go({ kind: "client", seat: 1, msg: pick(msgs) });
      now += 500;
      continue;
    }
    if (s.turn?.answering && s.turn.answering.refuter === 1 && human) { go({ kind: "client", seat: 1, msg: { t: "show", card: s.turn.answering.held[0] as string } }); continue; }
    const wake = step(s, { kind: "alarm" }, now).wakeAtMs;
    now = Math.max(now + 1, wake ?? now + 1000);
    go({ kind: "alarm" });
  }
  return { state: s, steps };
}

describe("Engine checkpoint: whole games", () => {
  it("every all-Bot game ends, within hauntMax + 3 Rounds, with an ending payload", () => {
    fc.assert(fc.property(fc.integer(), fc.integer({ min: 2, max: 6 }), fc.constantFrom(8 as const, 10 as const, 12 as const), (seed, n, max) => {
      const { state } = play(seed, n, max, false, mulberry32(seed));
      expect(state.phase).toBe("ended");
      expect(state.round).toBeLessThanOrEqual(max + 3);
      expect(state.ending).not.toBeNull();
      expect(state.ending?.solution).toEqual(state.deal?.solution);
      if (state.houseWins) expect(state.ending?.winners).toEqual([]);
      // a Standard Bot never wins wrongly and a winner always sealed the Solution
      for (const w of state.winners) expect(state.players.find((p) => p.seat === w)?.hasSealed).toBe(true);
    }), { numRuns: 60 });
  });

  it("a solo case ends with a human who plays at random among Bots (Property 4)", () => {
    fc.assert(fc.property(fc.integer(), fc.integer({ min: 2, max: 5 }), (seed, bots) => {
      const setup = soloSetup({ world: { id: "w", walkRadius: 9, authoredZones: false }, preset: "classic", bots });
      expect(setup.ok).toBe(true);
      const { state } = play(seed, bots + 1, 10, true, mulberry32(seed ^ 0x55));
      expect(state.phase).toBe("ended");
      expect(state.round).toBeLessThanOrEqual(13);
    }), { numRuns: 40 });
  });
});

describe("Property 1: The Engine is deterministic and refuses without change", () => {
  it("gives the same result for the same state, Action and time, and a refusal leaves the state as it was", () => {
    let refusals = 0;
    fc.assert(fc.property(fc.integer(), fc.integer({ min: 2, max: 5 }), (seed, n) => {
      play(seed, n, 8, true, mulberry32(seed), (res, before, a) => {
        if (res.refused !== undefined) {
          refusals++;
          expect(res.state).toBe(before);
          expect(res.out.every((o) => o.to === "seat" && o.msg.t === "refused")).toBe(true);
        }
      });
      const a = play(seed, n, 8, true, mulberry32(seed));
      const b = play(seed, n, 8, true, mulberry32(seed));
      expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    }), { numRuns: 20 });
    expect(refusals).toBeGreaterThan(0); // the random human did try illegal things
  });
});

describe("room controls", () => {
  it("only the Master starts the game, once", () => {
    const s = createEngine({ seed: 3, seats: botSeats(3, true), settings: { baseSeconds: 60, hauntMax: 10 }, presetIds: PRESETS });
    expect(s.masterSeat).toBe(1);
    const no = step(s, { kind: "client", seat: 2, msg: { t: "start" } }, 0);
    expect(no.refused).toBe("not_master");
    expect(no.state).toBe(s);
    const yes = step(s, { kind: "client", seat: 1, msg: { t: "start" } }, 0);
    expect(yes.state.phase).toBe("playing");
    expect(step(yes.state, { kind: "client", seat: 1, msg: { t: "start" } }, 1).refused).toBe("game_started");
    expect(step(s, { kind: "client", seat: 9, msg: { t: "start" } }, 0).refused).toBe("bad_token");
  });
});

describe("Property 2: No outbound message leaks", () => {
  it("never puts a Hand, a shown card, the Residue or the Solution (before the end) in a public message", () => {
    fc.assert(fc.property(fc.integer(), fc.integer({ min: 2, max: 5 }), (seed, n) => {
      play(seed, n, 8, true, mulberry32(seed), (res) => {
        for (const o of res.out) {
          if (o.to !== "public") continue;
          const v = o.msg.view;
          const text = JSON.stringify(v);
          if (v.phase === "ended") continue; // the ending shows the Solution and the Residue places, by design
          expect(text).not.toMatch(/"(hand|shownToMe|found|residueAt|shown|held|botFacts|bluffs|shownLog)"|"sealed":\{/);
          expect(v.ending).toBeNull();
          expect(text).not.toContain("solution");
        }
        for (const o of res.out) if (o.to === "seat" && o.msg.t === "private") {
          expect(o.msg.view.hand).toEqual(res.state.deal?.hands[o.seat] ?? []);
        }
      });
    }), { numRuns: 25 });
  });

  it("gives the same public snapshot for two games that differ only in their secrets", () => {
    fc.assert(fc.property(fc.integer(), fc.integer({ min: 3, max: 6 }), fc.integer(), (seed, n, salt) => {
      let s = createEngine({ seed, seats: botSeats(n, true), settings: { baseSeconds: 60, hauntMax: 10 }, presetIds: PRESETS });
      s = step(s, { kind: "client", seat: 1, msg: { t: "start" } }, 1000).state;
      const deal = s.deal!;
      // swap two Hands of the same size, move the Solution's zone card with a Residue card, rewrite every shown card
      const seats = Object.keys(deal.hands).map(Number);
      const [a, b] = [seats[salt % seats.length] as number, seats[(salt + 1) % seats.length] as number];
      if ((deal.hands[a]?.length ?? 0) !== (deal.hands[b]?.length ?? 0)) return;
      const twin: EngineState = { ...s, deal: { ...deal, hands: { ...deal.hands, [a]: deal.hands[b] ?? [], [b]: deal.hands[a] ?? [] } }, residueAt: {}, shownLog: { 1: "x" }, bluffs: [99], botFacts: {} };
      expect(publicSnapshot(twin, 2000)).toEqual(publicSnapshot(s, 2000));
      expect(privateSnapshot(twin, a)?.hand).toEqual(deal.hands[b]);
    }), { numRuns: 200 });
  });
});

describe("Property 3: One alarm is enough", () => {
  it("waking at wakeAtMs always makes progress until the game ends", () => {
    fc.assert(fc.property(fc.integer(), fc.integer({ min: 2, max: 5 }), (seed, n) => {
      let s = createEngine({ seed, seats: botSeats(n, false), settings: { baseSeconds: 45, hauntMax: 8 }, presetIds: PRESETS });
      let res = step(s, { kind: "client", seat: 1, msg: { t: "start" } }, 0);
      s = res.state;
      let stuck = 0;
      for (let k = 0; k < 6000 && s.phase === "playing"; k++) {
        expect(res.wakeAtMs).not.toBeNull();
        const at = res.wakeAtMs as number;
        res = step(s, { kind: "alarm" }, at);
        stuck = res.state === s ? stuck + 1 : 0;
        expect(stuck).toBeLessThan(3); // the alarm never fires for nothing twice in a row
        s = res.state;
      }
      expect(s.phase).toBe("ended");
      expect(res.wakeAtMs).toBeNull();
    }), { numRuns: 40 });
  });
});
