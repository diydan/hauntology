import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { makeLock } from "../puzzles/make";
import { referenceSolve } from "../puzzles/verify";
import { createEngine, publicSnapshot, step, type EngineSeat, type EngineSettings, type EngineState, type Outbound } from "./engine";
import { presetRow, SOLO_PRESETS } from "./solo";

const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);
const seats: EngineSeat[] = [1, 2, 3].map((seat) => ({ seat, nickname: `P${seat}`, bot: seat !== 1, botLevel: "standard" }));
const toSeat = (out: readonly Outbound[], seat: number, t: string) => out.filter((o): o is Extract<Outbound, { to: "seat" }> => o.to === "seat" && o.seat === seat && o.msg.t === t).map((o) => o.msg);

/** A game where the human is the active Player, standing in a Zone, at the start of their Turn. */
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

describe("Property 33: Presets and switches do what they say", () => {
  it("only the Master changes them; a preset sets its row; timing changes only before the start", () => {
    fc.assert(fc.property(fc.constantFrom(...SOLO_PRESETS), (preset) => {
      const s0 = createEngine({ seed: 1, seats, settings: { baseSeconds: 60, hauntMax: 10 }, presetIds: PRESETS });
      expect(step(s0, { kind: "client", seat: 2, msg: { t: "settings", preset } }, 0).refused).toBe("not_master");
      const s1 = step(s0, { kind: "client", seat: 1, msg: { t: "settings", preset } }, 0).state;
      const row = presetRow(preset);
      expect([s1.settings.baseSeconds, s1.settings.hauntMax, s1.settings.nudges, s1.settings.frames, s1.settings.puzzles]).toEqual([row.baseSeconds, row.hauntMax, row.nudges, row.frames, row.puzzles]);
      expect(s1.haunt.max).toBe(row.hauntMax);
      for (const b of s1.seats.filter((x) => x.bot)) expect(b.botLevel).toBe(row.botLevel);
      const playing = step(s1, { kind: "client", seat: 1, msg: { t: "start" } }, 0).state;
      const later = step(playing, { kind: "client", seat: 1, msg: { t: "settings", baseSeconds: 30, hauntMax: 8, sounds: false } }, 10).state;
      expect([later.settings.baseSeconds, later.settings.hauntMax, later.settings.sounds]).toEqual([row.baseSeconds, row.hauntMax, false]);
    }));
  });

  it("with Nudges help-only every Spook is refused and costs nothing; with Nudges off every Nudge is refused", () => {
    for (const nudges of ["help-only", "off"] as const) {
      let s = createEngine({ seed: 4, seats: [1, 2, 3].map((seat) => ({ seat, nickname: `P${seat}`, bot: seat === 3, botLevel: "standard" as const })), settings: { baseSeconds: 90, hauntMax: 12, nudges }, presetIds: PRESETS });
      s = step(s, { kind: "client", seat: 1, msg: { t: "start" } }, 0).state;
      const off = s.turn!.seat === 1 ? 2 : 1;
      s = { ...s, players: s.players.map((p) => ({ ...p, resolve: 3 })) };
      const spook = step(s, { kind: "client", seat: off, msg: { t: "nudge", kind: "spook" } }, 1000);
      expect(spook.refused).toBe(nudges === "off" ? "nudges_off" : "spook_off");
      expect(spook.state).toBe(s);
      if (nudges === "off") expect(step(s, { kind: "client", seat: off, msg: { t: "nudge", kind: "help" } }, 1000).refused).toBe("nudges_off");
    }
  });
});

describe("Locks on Inspect in the Engine", () => {
  it("a human's Inspect opens the Zone's Lock privately; the public log says only the Zone; solving gives the plain Inspect result", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 400 }), (seed) => {
      const g = humanTurn(seed);
      if (!g) return;
      const r = step(g.s, { kind: "client", seat: 1, msg: { t: "inspect" } }, g.now);
      expect(r.refused).toBeUndefined();
      const lock = toSeat(r.out, 1, "lock")[0];
      expect(lock?.t).toBe("lock");
      if (lock?.t !== "lock") return;
      expect(r.state.log.at(-1)).toMatchObject({ kind: "inspect", seat: 1, zone: g.zone });
      for (const o of r.out) if (o.to === "public") expect(JSON.stringify(o.msg)).not.toContain(lock.lockId);
      const placed = r.state.locks.placed.find((l) => l.zone === g.zone)!;
      const answer = referenceSolve(makeLock(placed.kind, placed.level, placed.seed));
      const solved = step(r.state, { kind: "client", seat: 1, msg: { t: "attempt", lockId: lock.lockId, transcript: answer } }, g.now + 9000);
      expect(solved.refused).toBeUndefined();
      const res = toSeat(solved.out, 1, "lockResult")[0];
      expect(res).toMatchObject({ outcome: "solved", zone: g.zone, card: g.s.residueAt[g.zone] ?? null });
      const me = solved.state.players.find((p) => p.seat === 1)!;
      expect(me.inspected).toContain(g.zone);
      expect(me.found).toEqual(g.s.residueAt[g.zone] ? [g.s.residueAt[g.zone]] : []);
      expect(step(solved.state, { kind: "client", seat: 1, msg: { t: "inspect" } }, g.now + 9500).refused).toBe("already_inspected");
    }), { numRuns: 60 });
  });

  it("three wrong Attempts, a give-up, the Cap or the end of the Turn close it with nothing learned and the Zone not inspected", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 400 }), fc.constantFrom("wrong", "giveUp", "cap", "turnEnd"), (seed, how) => {
      const g = humanTurn(seed);
      if (!g) return;
      const open = step(g.s, { kind: "client", seat: 1, msg: { t: "inspect" } }, g.now);
      const lock = toSeat(open.out, 1, "lock")[0];
      if (lock?.t !== "lock") return;
      let s = open.state;
      let now = g.now;
      let out: readonly Outbound[] = [];
      if (how === "wrong") for (let i = 0; i < 3; i++) { now += 1500; const r = step(s, { kind: "client", seat: 1, msg: { t: "attempt", lockId: lock.lockId, transcript: { kind: "nonsense" } } }, now); s = r.state; out = r.out; }
      if (how === "giveUp") { const r = step(s, { kind: "client", seat: 1, msg: { t: "giveUp", lockId: lock.lockId } }, now + 100); s = r.state; out = r.out; }
      if (how === "cap") { const r = step(s, { kind: "alarm" }, now + 25_000); s = r.state; out = r.out; }
      if (how === "turnEnd") { const r = step(s, { kind: "client", seat: 1, msg: { t: "pass" } }, now + 100); s = r.state; out = r.out; }
      expect(s.locks.open["1"] ?? null).toBeNull();
      expect(toSeat(out, 1, "lockResult").at(-1)).toMatchObject({ outcome: "failed" });
      expect(s.players.find((p) => p.seat === 1)?.inspected).not.toContain(g.zone);
      expect(s.players.find((p) => p.seat === 1)?.found).toEqual([]);
    }), { numRuns: 80 });
  });

  it("Bots, puzzles off and Plain Inspect all get a plain Inspect; the level rises with the Haunt", () => {
    const off = humanTurn(5, { puzzles: "off" });
    if (off) {
      const r = step(off.s, { kind: "client", seat: 1, msg: { t: "inspect" } }, off.now);
      expect(toSeat(r.out, 1, "lock")).toEqual([]);
      expect(r.state.turn?.inspecting).not.toBeNull();
    }
    const plain = humanTurn(5);
    if (plain) {
      const p1 = step(plain.s, { kind: "client", seat: 1, msg: { t: "plainInspect", on: true } }, plain.now).state;
      const r = step(p1, { kind: "client", seat: 1, msg: { t: "inspect" } }, plain.now);
      expect(toSeat(r.out, 1, "lock")).toEqual([]);
      expect(r.state.turn?.inspecting).not.toBeNull();
    }
    let rose = 0;
    for (let seed = 0; seed < 80; seed++) {
      const g = humanTurn(seed, { puzzles: "easy", preset: "classic" });
      if (!g) continue;
      const placed = g.s.locks.placed.find((l) => l.zone === g.zone)!;
      if (["wires", "clock", "safe", "moved", "photo"].includes(placed.kind)) continue;
      const r = step({ ...g.s, haunt: { ...g.s.haunt, level: 6 } }, { kind: "client", seat: 1, msg: { t: "inspect" } }, g.now);
      const lock = toSeat(r.out, 1, "lock")[0];
      if (lock?.t === "lock") { expect(lock.level).toBe("hard"); rose++; }
    }
    expect(rose).toBeGreaterThan(3);
  });

  it("entering the Zone that holds a memory Lock's clue sends the Sight privately, once it is acknowledged never again", () => {
    let sent = 0;
    for (let seed = 0; seed < 60 && sent < 5; seed++) {
      const g = humanTurn(seed);
      if (!g) continue;
      const withSight = g.s.locks.placed.find((l) => l.sightZone !== null);
      if (!withSight) continue;
      const r = step(g.s, { kind: "client", seat: 1, msg: { t: "walk", zone: withSight.sightZone! } }, g.now + 10);
      if (r.refused) continue;
      const sight = toSeat(r.out, 1, "sight")[0];
      if (sight?.t !== "sight") continue;
      sent++;
      for (const o of r.out) if (o.to === "public") expect(JSON.stringify(o.msg)).not.toContain(sight.sightId);
      const acked = step(r.state, { kind: "client", seat: 1, msg: { t: "sightAck", sightId: sight.sightId } }, g.now + 20).state;
      const again = step(acked, { kind: "client", seat: 1, msg: { t: "walk", zone: withSight.sightZone! } }, g.now + 30);
      expect(toSeat(again.out, 1, "sight")).toEqual([]);
      expect(JSON.stringify(publicSnapshot(again.state, g.now))).not.toMatch(/sightId|"sight"/);
    }
    expect(sent).toBeGreaterThan(0);
  });
});
