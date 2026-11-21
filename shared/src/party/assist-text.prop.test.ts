import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createEngine, privateSnapshot, publicSnapshot, step, type EngineSeat, type EngineState, type Outbound } from "./engine";
import { parseClientMessage } from "./protocol";

/** Puzzles 8.3 (Assist half, requirement 10.3): WHERE Assist is on THEN the Spirit board word is also sent as text, to that seat only. */
const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);
const SEATS: EngineSeat[] = [1, 2, 3].map((seat) => ({ seat, nickname: `P${seat}`, bot: seat !== 1, botLevel: "standard" }));
const toSeat = (out: readonly Outbound[], seat: number, t: string) => out.filter((o): o is Extract<Outbound, { to: "seat" }> => o.to === "seat" && o.seat === seat && o.msg.t === t).map((o) => o.msg);

/** A human turn in the Zone whose Lock is a Spirit board, or null for a seed that has none. */
function boardTurn(seed: number): { s: EngineState; now: number; zone: string } | null {
  let s = createEngine({ seed, seats: SEATS, settings: { baseSeconds: 90, hauntMax: 12, puzzles: "medium", preset: "classic" }, presetIds: PRESETS });
  let r = step(s, { kind: "client", seat: 1, msg: { t: "start" } }, 0);
  s = r.state;
  let now = 0;
  for (let k = 0; k < 300 && s.turn?.seat !== 1 && s.phase === "playing"; k++) { now = r.wakeAtMs ?? now + 1000; r = step(s, { kind: "alarm" }, now); s = r.state; }
  if (s.turn?.seat !== 1) return null;
  const zone = s.locks.placed.find((l) => l.kind === "board")?.zone;
  if (zone === undefined) return null;
  s = step(s, { kind: "client", seat: 1, msg: { t: "walk", zone } }, now).state;
  return { s, now, zone };
}

describe("Spirit board text under Assist (puzzles 8.3)", () => {
  it("the assist message parses, and is a seat setting that survives a reconnect", () => {
    expect(parseClientMessage(JSON.stringify({ t: "assist", on: true })).kind).toBe("game");
    expect(parseClientMessage(JSON.stringify({ t: "assist", on: "yes" })).kind).toBe("bad");
  });

  it("with Assist on the board Lock carries its word as text, for that seat only; with it off, never", () => {
    let seen = 0;
    fc.assert(fc.property(fc.integer({ min: 0, max: 300 }), (seed) => {
      const g = boardTurn(seed);
      if (!g) return;
      seen++;
      const word = (g.s.locks.placed.find((l) => l.zone === g.zone) as { kind: string; seed: number }).seed;
      void word;
      const plain = step(g.s, { kind: "client", seat: 1, msg: { t: "inspect" } }, g.now);
      const lock0 = toSeat(plain.out, 1, "lock")[0];
      expect(lock0 && "assistText" in lock0).toBe(false);
      const on = step(g.s, { kind: "client", seat: 1, msg: { t: "assist", on: true } }, g.now).state;
      const opened = step(on, { kind: "client", seat: 1, msg: { t: "inspect" } }, g.now);
      const lock = toSeat(opened.out, 1, "lock")[0];
      if (lock?.t !== "lock") throw new Error("no lock");
      expect(typeof lock.assistText).toBe("string");
      expect(lock.assistText).toMatch(/^[A-Z]{3,5}$/);
      expect(lock.view.kind === "board" && lock.view.length).toBe(lock.assistText!.length);
      expect(lock.view.kind === "board" && JSON.stringify(lock.view)).not.toContain(lock.assistText!); // the view itself never holds it
      for (const o of opened.out) if (o.to === "public") expect(JSON.stringify(o.msg)).not.toContain(lock.assistText!);
      expect(JSON.stringify(publicSnapshot(opened.state, g.now))).not.toContain(`"${lock.assistText}"`);
      expect(JSON.stringify(privateSnapshot(opened.state, 2) ?? {})).not.toContain(lock.assistText!);
      // a reconnect brings the same text back; turning Assist off takes it away
      const back = step(step(opened.state, { kind: "disconnect", seat: 1 }, g.now + 5).state, { kind: "connect", seat: 1 }, g.now + 10);
      expect(toSeat(back.out, 1, "lock")[0]).toMatchObject({ assistText: lock.assistText });
      const off = step(opened.state, { kind: "client", seat: 1, msg: { t: "assist", on: false } }, g.now + 20).state;
      const back2 = step(step(off, { kind: "disconnect", seat: 1 }, g.now + 25).state, { kind: "connect", seat: 1 }, g.now + 30);
      const l2 = toSeat(back2.out, 1, "lock")[0];
      expect(l2 && "assistText" in l2).toBe(false);
    }), { numRuns: 60 });
    expect(seen).toBeGreaterThan(5);
  });

  it("other Kinds never carry text, whatever Assist says", () => {
    for (let seed = 0; seed < 60; seed++) {
      const g = boardTurn(seed);
      if (!g) continue;
      const other = g.s.locks.placed.find((l) => l.kind !== "board" && l.kind !== "knock");
      if (!other) continue;
      let s = step(g.s, { kind: "client", seat: 1, msg: { t: "assist", on: true } }, g.now).state;
      s = step(s, { kind: "client", seat: 1, msg: { t: "walk", zone: other.zone } }, g.now + 1).state;
      const r = step(s, { kind: "client", seat: 1, msg: { t: "inspect" } }, g.now + 2);
      const l = toSeat(r.out, 1, "lock")[0];
      if (l?.t === "lock") expect("assistText" in l).toBe(false);
    }
  });
});
