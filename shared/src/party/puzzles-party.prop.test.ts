import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { makeLock } from "../puzzles/make";
import { referenceSolve } from "../puzzles/verify";
import { createEngine, privateSnapshot, publicSnapshot, step, type EngineSeat, type EngineSettings, type EngineState, type Outbound } from "./engine";

/** Puzzles spec group 3 (Party integration): reconnects, the Puzzle setting, Plain Inspect, telemetry, a model-based run. */
const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);
const seats: EngineSeat[] = [1, 2, 3].map((seat) => ({ seat, nickname: `P${seat}`, bot: seat !== 1, botLevel: "standard" }));
const toSeat = (out: readonly Outbound[], seat: number, t: string) => out.filter((o): o is Extract<Outbound, { to: "seat" }> => o.to === "seat" && o.seat === seat && o.msg.t === t).map((o) => o.msg);

function humanTurn(seed: number, settings: Partial<EngineSettings> = {}): { s: EngineState; now: number; zone: string } | null {
  let s = createEngine({ seed, seats, settings: { baseSeconds: 90, hauntMax: 12, puzzles: "medium", preset: "classic", ...settings }, presetIds: PRESETS });
  let r = step(s, { kind: "client", seat: 1, msg: { t: "start" } }, 0);
  s = r.state;
  let now = 0;
  for (let k = 0; k < 300 && s.turn?.seat !== 1 && s.phase === "playing"; k++) { now = r.wakeAtMs ?? now + 1000; r = step(s, { kind: "alarm" }, now); s = r.state; }
  if (s.turn?.seat !== 1) return null;
  const zone = s.pool.zones[seed % 6]!.id;
  s = step(s, { kind: "client", seat: 1, msg: { t: "walk", zone } }, now).state;
  return { s, now, zone };
}

describe("Property 10: an open Lock and an unacknowledged Sight come back after a reconnect (puzzles 3.1, 3.2)", () => {
  it("an open Lock is rebuilt from the seed on reconnect: the same Lock, the same Attempts used, nothing public", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 300 }), (seed) => {
      const g = humanTurn(seed);
      if (!g) return;
      const open = step(g.s, { kind: "client", seat: 1, msg: { t: "inspect" } }, g.now);
      const lock = toSeat(open.out, 1, "lock")[0];
      if (lock?.t !== "lock") return;
      const wrong = step(open.state, { kind: "client", seat: 1, msg: { t: "attempt", lockId: lock.lockId, transcript: { kind: "nonsense" } } }, g.now + 2000);
      const down = step(wrong.state, { kind: "disconnect", seat: 1 }, g.now + 3000);
      const up = step(down.state, { kind: "connect", seat: 1 }, g.now + 4000);
      const again = toSeat(up.out, 1, "lock");
      expect(again).toHaveLength(1);
      const l2 = again[0];
      if (l2?.t !== "lock") return;
      expect(l2.lockId).toBe(lock.lockId);
      expect(l2.view).toEqual(lock.view);
      expect(l2.attempts).toBe(lock.attempts - 1);
      for (const o of up.out) if (o.to === "public") expect(JSON.stringify(o.msg)).not.toContain(lock.lockId);
      // a Player who was never in a Lock gets none
      const idle = step(g.s, { kind: "connect", seat: 1 }, g.now + 10);
      expect(toSeat(idle.out, 1, "lock")).toEqual([]);
      // the same Lock still solves after the reconnect
      const placed = up.state.locks.placed.find((l) => l.zone === g.zone)!;
      const done = step(up.state, { kind: "client", seat: 1, msg: { t: "attempt", lockId: lock.lockId, transcript: referenceSolve(makeLock(placed.kind, placed.level, placed.seed)) } }, g.now + 9000);
      expect(toSeat(done.out, 1, "lockResult")[0]).toMatchObject({ outcome: "solved" });
    }), { numRuns: 40 });
  });

  it("a Sight that was sent and not acknowledged is sent again after a reconnect, an acknowledged one never; neither reaches a public view", () => {
    let checked = 0;
    for (let seed = 0; seed < 120 && checked < 6; seed++) {
      const g = humanTurn(seed);
      if (!g) continue;
      const withSight = g.s.locks.placed.find((l) => l.sightZone !== null);
      if (!withSight) continue;
      const walked = step(g.s, { kind: "client", seat: 1, msg: { t: "walk", zone: withSight.sightZone! } }, g.now + 10);
      const sight = toSeat(walked.out, 1, "sight")[0];
      if (walked.refused || sight?.t !== "sight") continue;
      checked++;
      const down = step(walked.state, { kind: "disconnect", seat: 1 }, g.now + 20);
      const up = step(down.state, { kind: "connect", seat: 1 }, g.now + 30);
      const resent = toSeat(up.out, 1, "sight");
      // every Sight this seat was sent and has not acknowledged comes again, once each
      const pending = walked.state.locks.sent["1"] ?? [];
      expect(resent.map((m) => (m.t === "sight" ? m.sightId : ""))).toEqual(pending);
      expect(resent).toContainEqual(expect.objectContaining({ sightId: sight.sightId, sight: sight.sight }));
      expect(toSeat(up.out, 2, "sight")).toEqual([]);
      const acked = step(up.state, { kind: "client", seat: 1, msg: { t: "sightAck", sightId: sight.sightId } }, g.now + 40).state;
      const up2 = step(step(acked, { kind: "disconnect", seat: 1 }, g.now + 50).state, { kind: "connect", seat: 1 }, g.now + 60);
      expect(toSeat(up2.out, 1, "sight").map((m) => (m.t === "sight" ? m.sightId : ""))).not.toContain(sight.sightId);
      for (const o of [...up.out, ...up2.out]) if (o.to === "public") expect(JSON.stringify(o.msg)).not.toContain(sight.sightId);
      expect(JSON.stringify(publicSnapshot(up.state, g.now))).not.toContain(sight.sightId);
      expect(JSON.stringify(privateSnapshot(up.state, 2))).not.toContain(sight.sightId);
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("Puzzle setting and Plain Inspect (puzzles 3.5, 3.6)", () => {
  it("the Public View carries the Puzzle setting and nothing about any Lock; the Master's change applies from the next Inspect", () => {
    const g = humanTurn(7, { puzzles: "easy" });
    if (!g) throw new Error("no human turn");
    expect(publicSnapshot(g.s, g.now).puzzleSetting).toBe("easy");
    const off = step(g.s, { kind: "client", seat: 1, msg: { t: "settings", puzzles: "off" } }, g.now);
    // the Master is seat 1 in this Room, but timing and cluePlace are fixed once the game has started; the Puzzle setting is not
    expect(off.refused).toBeUndefined();
    expect(publicSnapshot(off.state, g.now).puzzleSetting).toBe("off");
    const r = step(off.state, { kind: "client", seat: 1, msg: { t: "inspect" } }, g.now);
    expect(toSeat(r.out, 1, "lock")).toEqual([]);
    const text = JSON.stringify(publicSnapshot(g.s, g.now));
    expect(text).not.toMatch(/lockId|"placed"|"payload"|transcript/);
  });

  it("Plain Inspect survives a reconnect and is visible to nobody else", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 200 }), (seed) => {
      const g = humanTurn(seed);
      if (!g) return;
      const on = step(g.s, { kind: "client", seat: 1, msg: { t: "plainInspect", on: true } }, g.now).state;
      const back = step(step(on, { kind: "disconnect", seat: 1 }, g.now + 5).state, { kind: "connect", seat: 1 }, g.now + 10).state;
      expect(back.locks.plain["1"]).toBe(true);
      expect(toSeat(step(back, { kind: "client", seat: 1, msg: { t: "inspect" } }, g.now + 20).out, 1, "lock")).toEqual([]);
      for (const seat of [2, 3]) expect(JSON.stringify(privateSnapshot(back, seat) ?? {})).not.toMatch(/plain/i);
      expect(JSON.stringify(publicSnapshot(back, g.now))).not.toMatch(/plain/i);
    }), { numRuns: 30 });
  });
});

describe("Telemetry counts only Kind, outcome and Attempts (puzzles 3.7, requirement 14.2)", () => {
  it("solved, failed and wrong outcomes are counted per Kind; no Seat, time, Zone or Transcript is in the counters", () => {
    const g = humanTurn(11);
    if (!g) throw new Error("no human turn");
    const placed = g.s.locks.placed.find((l) => l.zone === g.zone)!;
    const open = step(g.s, { kind: "client", seat: 1, msg: { t: "inspect" } }, g.now);
    const lock = toSeat(open.out, 1, "lock")[0];
    if (lock?.t !== "lock") throw new Error("no lock");
    const wrong = step(open.state, { kind: "client", seat: 1, msg: { t: "attempt", lockId: lock.lockId, transcript: { kind: "nonsense" } } }, g.now + 2000);
    const solved = step(wrong.state, { kind: "client", seat: 1, msg: { t: "attempt", lockId: lock.lockId, transcript: referenceSolve(makeLock(placed.kind, placed.level, placed.seed)) } }, g.now + 9000);
    const stats = solved.state.locks.stats ?? {};
    expect(stats[`${placed.kind}.solved`]).toBe(1);
    expect(stats[`${placed.kind}.attempts`]).toBe(2);
    const text = JSON.stringify(stats);
    expect(text).not.toContain(g.zone);
    expect(text).not.toMatch(/seat|nonsense|transcript/i);
    // a give-up is a "failed" outcome
    const g2 = humanTurn(12);
    if (!g2) return;
    const o2 = step(g2.s, { kind: "client", seat: 1, msg: { t: "inspect" } }, g2.now);
    const l2 = toSeat(o2.out, 1, "lock")[0];
    if (l2?.t !== "lock") return;
    const given = step(o2.state, { kind: "client", seat: 1, msg: { t: "giveUp", lockId: l2.lockId } }, g2.now + 100);
    const p2 = given.state.locks.placed.find((l) => l.zone === g2.zone)!;
    expect(given.state.locks.stats?.[`${p2.kind}.failed`]).toBe(1);
  });
});

// ------------------------------------------------------------------ a model-based run (puzzles 3.8)
type Cmd = "open" | "wrong" | "solve" | "giveUp" | "reconnect" | "pause" | "resume" | "pass";

describe("Model-based: command sequences against a model that carries `seen` (puzzles 3.8)", () => {
  it("whatever the order of open, wrong, solve, give up, reconnect, pause and Turn end, the Lock state matches the model and no view leaks a Lock", () => {
    const cmd = fc.constantFrom<Cmd>("open", "wrong", "solve", "giveUp", "reconnect", "pause", "resume", "pass");
    fc.assert(fc.property(fc.integer({ min: 0, max: 200 }), fc.array(cmd, { minLength: 3, maxLength: 14 }), (seed, cmds) => {
      const g = humanTurn(seed);
      if (!g) return;
      let s = g.s;
      let now = g.now;
      // model
      let open: { lockId: string; used: number } | null = null;
      let inspected = false;
      let ended = false;
      let paused = false;
      for (const c of cmds) {
        if (ended) break;
        now += 1500;
        const me = (m: Parameters<typeof step>[1]) => step(s, m, now);
        // a Master pause freezes the game: every Inspect, Attempt, give-up and Turn end is refused until it resumes
        if (paused && (c === "open" || c === "wrong" || c === "solve" || c === "giveUp" || c === "pass")) {
          const probe = c === "open" ? { t: "inspect" as const } : c === "pass" ? { t: "pass" as const } : { t: "giveUp" as const, lockId: open?.lockId ?? "none" };
          expect(me({ kind: "client", seat: 1, msg: probe }).refused).toBe("paused");
          continue;
        }
        if (c === "open") {
          const r = me({ kind: "client", seat: 1, msg: { t: "inspect" } });
          const lock = toSeat(r.out, 1, "lock")[0];
          if (open === null && !inspected && s.locks.placed.some((l) => l.zone === g.zone)) {
            if (r.refused === undefined && lock?.t === "lock") { open = { lockId: lock.lockId, used: 0 }; s = r.state; } else if (r.refused === undefined) s = r.state;
          } else { expect(r.refused ?? (lock ? "opened" : "plain")).toBeTruthy(); if (r.refused === undefined && lock?.t === "lock") s = r.state; }
        } else if (c === "wrong" || c === "solve" || c === "giveUp") {
          if (open === null) { expect(me({ kind: "client", seat: 1, msg: { t: "giveUp", lockId: "none" } }).refused).toBe("puzzle_not_open"); continue; }
          const placed = s.locks.placed.find((l) => l.zone === g.zone)!;
          const transcript = c === "solve" ? referenceSolve(makeLock(placed.kind, placed.level, placed.seed)) : { kind: "nonsense" };
          const r = c === "giveUp" ? me({ kind: "client", seat: 1, msg: { t: "giveUp", lockId: open.lockId } }) : me({ kind: "client", seat: 1, msg: { t: "attempt", lockId: open.lockId, transcript } });
          if (r.refused !== undefined) continue; // too soon after a paused clock or the like: the model does not move
          s = r.state;
          if (c === "giveUp") open = null;
          else if (c === "solve") { open = null; inspected = true; } else { open.used++; if (open.used >= 3) open = null; }
        } else if (c === "reconnect") {
          const down = step(s, { kind: "disconnect", seat: 1 }, now);
          const up = step(down.state, { kind: "connect", seat: 1 }, now + 1);
          s = up.state;
          const again = toSeat(up.out, 1, "lock");
          expect(again.length).toBe(open === null ? 0 : 1);
          if (open !== null && again[0]?.t === "lock") expect(again[0].lockId).toBe(open.lockId);
        } else if (c === "pause") {
          const r = me({ kind: "client", seat: 1, msg: { t: "pause" } }); if (r.refused === undefined) { s = r.state; paused = true; }
        } else if (c === "resume") {
          const r = me({ kind: "client", seat: 1, msg: { t: "resume" } }); if (r.refused === undefined) { s = r.state; paused = false; }
        } else {
          const r = me({ kind: "client", seat: 1, msg: { t: "pass" } });
          if (r.refused === undefined) { s = r.state; if (open !== null) { expect(toSeat(r.out, 1, "lockResult").at(-1)).toMatchObject({ outcome: "failed" }); open = null; } ended = true; }
        }
        // invariants after every command
        expect(Boolean(s.locks.open["1"])).toBe(open !== null);
        if (open !== null) expect(s.locks.open["1"]?.attemptsUsed).toBe(open.used);
        expect(s.players.find((p) => p.seat === 1)?.inspected.includes(g.zone) ?? false).toBe(inspected);
        const pub = JSON.stringify(publicSnapshot(s, now));
        for (const id of [open?.lockId, ...Object.values(s.locks.seen).flat()]) if (id) expect(pub).not.toContain(id);
        for (const seat of [2, 3]) { const pv = JSON.stringify(privateSnapshot(s, seat) ?? {}); if (open) expect(pv).not.toContain(open.lockId); }
      }
    }), { numRuns: 60 });
  });
});
