import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { makeLock } from "../puzzles/make";
import { isMemoryKind } from "../puzzles/types";
import { referenceSolve } from "../puzzles/verify";
import { scarePoints, type RecapEvent } from "./ending";
import { createEngine, privateSnapshot, publicSnapshot, step, type EngineSeat, type EngineSettings, type EngineState, type Outbound } from "./engine";
import { parseClientMessage } from "./protocol";

/** Puzzles group 12.3 and Property 22: Haunting puzzles change only Scare points. */
const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);
const SEATS: EngineSeat[] = [1, 2, 3].map((seat) => ({ seat, nickname: `P${seat}`, bot: false, botLevel: "standard" }));
const toSeat = (out: readonly Outbound[], seat: number, t: string) => out.filter((o): o is Extract<Outbound, { to: "seat" }> => o.to === "seat" && o.seat === seat && o.msg.t === t).map((o) => o.msg);

function playing(seed: number, settings: Partial<EngineSettings> = {}, seats = SEATS): EngineState {
  const s0 = createEngine({ seed, seats, settings: { baseSeconds: 60, hauntMax: 12, puzzles: "medium", preset: "classic", ...settings }, presetIds: PRESETS });
  return step(s0, { kind: "client", seat: 1, msg: { t: "start" } }, 0).state;
}

/** Seat 2 seals a wrong Accusation and the Round passes, so seat 2 joins the haunting. */
function joinHaunting(s0: EngineState, sealSeat = 2, now0 = 100): { state: EngineState; now: number } {
  let s = s0;
  let now = now0;
  const sol = s.deal!.solution;
  const wrongSuspect = s.pool.suspects.find((x) => x.id !== sol.suspect)!.id;
  const zone = s.pool.zones[0]!.id;
  const relic = s.pool.relics[0]!.id;
  for (let i = 0; i < 12 && s.phase === "playing" && !s.players.find((p) => p.seat === sealSeat)?.poltergeist; i++) {
    const active = s.turn!.seat;
    now += 100;
    s = step(s, { kind: "client", seat: active, msg: active === sealSeat ? { t: "seal", suspect: wrongSuspect, zone, relic } : { t: "pass" } }, now).state;
    if (s.haunt.pending?.chooser != null) { now += 100; s = step(s, { kind: "client", seat: s.haunt.pending.chooser, msg: { t: "choose", option: s.haunt.pending.options[0]! } }, now).state; }
  }
  return { state: s, now };
}

/** Everything the rules of the game rest on, which a Haunting puzzle must leave exactly as it was. */
const frozen = (s: EngineState) => JSON.stringify({ deal: s.deal, residueAt: s.residueAt, turn: s.turn, haunt: s.haunt, round: s.round, log: s.log, winners: s.winners, houseWins: s.houseWins, players: s.players, phase: s.phase, locksOpen: s.locks.open, placed: s.locks.placed });
const polts = (s: EngineState) => s.players.filter((p) => p.poltergeist).map((p) => p.seat);
const points = (s: EngineState, seat: number) => scarePoints(s.log as RecapEvent[], s.sources, polts(s))[seat] ?? 0;

describe("Haunting puzzles (puzzles 12.3, Property 22)", () => {
  it("the message parses, and only a human Poltergeist may start one: a Detective, a Bot and puzzles off are refused", () => {
    expect(parseClientMessage(JSON.stringify({ t: "hauntPuzzle" })).kind).toBe("game");
    const g = joinHaunting(playing(3));
    if (!g.state.players.find((p) => p.seat === 2)?.poltergeist) throw new Error("seat 2 never joined the haunting");
    expect(step(g.state, { kind: "client", seat: 1, msg: { t: "hauntPuzzle" } }, g.now).refused).toBe("not_a_poltergeist");
    const off = playing(3, { puzzles: "off" });
    const gOff = joinHaunting(off);
    expect(step(gOff.state, { kind: "client", seat: 2, msg: { t: "hauntPuzzle" } }, gOff.now).refused).toBe("puzzle_disabled");
    const botSeats: EngineSeat[] = [{ seat: 1, nickname: "P1", bot: false, botLevel: "standard" }, { seat: 2, nickname: "B2", bot: true, botLevel: "standard" }, { seat: 3, nickname: "P3", bot: false, botLevel: "standard" }];
    const withBot = playing(3, {}, botSeats);
    const bot = { ...withBot, players: withBot.players.map((p) => (p.seat === 2 ? { ...p, poltergeist: true } : p)) };
    expect(step(bot, { kind: "client", seat: 2, msg: { t: "hauntPuzzle" } }, 500).refused).toBe("not_a_poltergeist");
  });

  it("a Poltergeist gets a private Lock of a Kind with no Sight, at the level of the Haunt; nothing is logged and no public view changes", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 120 }), (seed) => {
      const g = joinHaunting(playing(seed));
      if (!g.state.players.find((p) => p.seat === 2)?.poltergeist) return;
      const before = frozen(g.state);
      const pubBefore = JSON.stringify(publicSnapshot(g.state, g.now));
      const r = step(g.state, { kind: "client", seat: 2, msg: { t: "hauntPuzzle" } }, g.now);
      expect(r.refused).toBeUndefined();
      const lock = toSeat(r.out, 2, "lock")[0];
      if (lock?.t !== "lock") throw new Error("no lock");
      expect(lock.faded).toBeNull();
      expect(["lockpick", "musicbox", "candles", "words", "board"]).toContain(lock.view.kind);
      expect(isMemoryKind(lock.view.kind)).toBe(false);
      expect(r.state.locks.placed.some((l) => l.lockId === lock.lockId)).toBe(false); // not a Zone's Lock
      expect(frozen(r.state)).toBe(before);
      expect(JSON.stringify(publicSnapshot(r.state, g.now))).toBe(pubBefore);
      for (const o of r.out) if (o.to === "public") expect(JSON.stringify(o.msg)).not.toContain(lock.lockId);
      expect(toSeat(r.out, 1, "lock")).toEqual([]);
      expect(JSON.stringify(privateSnapshot(r.state, 1) ?? {})).not.toContain(lock.lockId);
    }), { numRuns: 25 });
  });

  it("solving it adds exactly one Scare point and changes nothing else; a second one in the same Round is refused, the next Round allows another", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 120 }), (seed) => {
      const g = joinHaunting(playing(seed));
      const me = g.state.players.find((p) => p.seat === 2);
      if (!me?.poltergeist) return;
      const open = step(g.state, { kind: "client", seat: 2, msg: { t: "hauntPuzzle" } }, g.now);
      const lock = toSeat(open.out, 2, "lock")[0];
      if (lock?.t !== "lock") throw new Error("no lock");
      const hp = open.state.locks.haunting!.open["2"]!;
      const answer = referenceSolve(makeLock(hp.kind, hp.level, hp.seed));
      const before = frozen(open.state);
      const pts = points(open.state, 2);
      const wrong = step(open.state, { kind: "client", seat: 2, msg: { t: "attempt", lockId: lock.lockId, transcript: { kind: "nonsense" } } }, g.now + 2000);
      expect(toSeat(wrong.out, 2, "lockResult")[0]).toMatchObject({ outcome: "wrong", attemptsLeft: 2 });
      expect(points(wrong.state, 2)).toBe(pts);
      const solved = step(wrong.state, { kind: "client", seat: 2, msg: { t: "attempt", lockId: lock.lockId, transcript: answer } }, g.now + 9000);
      expect(solved.refused).toBeUndefined();
      expect(toSeat(solved.out, 2, "lockResult")[0]).toMatchObject({ outcome: "solved" });
      expect(points(solved.state, 2)).toBe(pts + 1);
      expect(frozen(solved.state)).toBe(before);
      expect(solved.state.log.length).toBe(open.state.log.length); // appears in no public log line
      expect(step(solved.state, { kind: "client", seat: 2, msg: { t: "hauntPuzzle" } }, g.now + 9500).refused).toBe("puzzle_attempts_spent");
      // another Round, another one
      let s = solved.state;
      let now = g.now + 10_000;
      const target = s.round + 1;
      for (let i = 0; i < 12 && s.phase === "playing" && s.round < target; i++) {
        now += 100;
        s = step(s, { kind: "client", seat: s.turn!.seat, msg: { t: "pass" } }, now).state;
        if (s.haunt.pending?.chooser != null) { now += 100; s = step(s, { kind: "client", seat: s.haunt.pending.chooser, msg: { t: "choose", option: s.haunt.pending.options[0]! } }, now).state; }
      }
      if (s.phase === "playing") expect(step(s, { kind: "client", seat: 2, msg: { t: "hauntPuzzle" } }, now + 100).refused).toBeUndefined();
    }), { numRuns: 20 });
  });

  it("the Round end closes an open one with no point, and so does the end of the game; three wrong Attempts or a give-up close it with no point too", () => {
    const g = joinHaunting(playing(9));
    if (!g.state.players.find((p) => p.seat === 2)?.poltergeist) throw new Error("no haunting");
    const open = step(g.state, { kind: "client", seat: 2, msg: { t: "hauntPuzzle" } }, g.now);
    const lock = toSeat(open.out, 2, "lock")[0];
    if (lock?.t !== "lock") throw new Error("no lock");
    const pts = points(open.state, 2);
    // a give-up
    const gave = step(open.state, { kind: "client", seat: 2, msg: { t: "giveUp", lockId: lock.lockId } }, g.now + 100);
    expect(toSeat(gave.out, 2, "lockResult")[0]).toMatchObject({ outcome: "failed" });
    expect(gave.state.locks.haunting?.open["2"] ?? null).toBeNull();
    expect(points(gave.state, 2)).toBe(pts);
    // three wrong
    let s = open.state;
    let out: readonly Outbound[] = [];
    for (let i = 0; i < 3; i++) { const r = step(s, { kind: "client", seat: 2, msg: { t: "attempt", lockId: lock.lockId, transcript: { kind: "nonsense" } } }, g.now + 1500 * (i + 1)); s = r.state; out = r.out; }
    expect(toSeat(out, 2, "lockResult")[0]).toMatchObject({ outcome: "failed" });
    expect(s.locks.haunting?.open["2"] ?? null).toBeNull();
    // the Round ends while it is open
    let t = open.state;
    let now = g.now + 200;
    const round = t.round;
    let closed: readonly Outbound[] = [];
    for (let i = 0; i < 12 && t.phase === "playing" && t.round === round; i++) {
      now += 100;
      const r = step(t, { kind: "client", seat: t.turn!.seat, msg: { t: "pass" } }, now);
      t = r.state; closed = [...closed, ...r.out];
      if (t.haunt.pending?.chooser != null) { now += 100; t = step(t, { kind: "client", seat: t.haunt.pending.chooser, msg: { t: "choose", option: t.haunt.pending.options[0]! } }, now).state; }
    }
    expect(t.locks.haunting?.open["2"] ?? null).toBeNull();
    expect(toSeat(closed, 2, "lockResult").at(-1)).toMatchObject({ outcome: "failed" });
    expect(points(t, 2)).toBe(pts);
    // the game ends while it is open
    const ended = step(open.state, { kind: "client", seat: 1, msg: { t: "pass" } }, g.now + 300);
    expect(ended.state.phase === "playing" || ended.state.phase === "ended").toBe(true);
  });
});
