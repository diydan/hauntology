import { describe, expect, it } from "vitest";
import { createEngine, publicSnapshot, step, type EngineSeat, type EngineSettings, type EngineState, type Outbound } from "./engine";

/** Party-mode 4.21 (19.1 to 19.7): Rattle, the Becoming and the prompts, in the Engine. */
const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);
const SEATS: EngineSeat[] = [1, 2, 3, 4].map((seat) => ({ seat, nickname: `P${seat}`, bot: false, botLevel: "standard" }));
const seatMsgs = (out: readonly Outbound[], seat: number, t: string) => out.filter((o): o is Extract<Outbound, { to: "seat" }> => o.to === "seat" && o.seat === seat && o.msg.t === t).map((o) => o.msg as Record<string, unknown>);
const hostMsgs = (out: readonly Outbound[], t: string) => out.filter((o): o is Extract<Outbound, { to: "host" }> => o.to === "host" && o.msg.t === t).map((o) => o.msg as Record<string, unknown>);

function playing(seed = 11, settings: Partial<EngineSettings> = {}): EngineState {
  const s0 = createEngine({ seed, seats: SEATS, settings: { baseSeconds: 90, hauntMax: 12, puzzles: "off", preset: "classic", ...settings }, presetIds: PRESETS });
  return step(s0, { kind: "client", seat: 1, msg: { t: "start" } }, 0).state;
}

/** `sealSeat` seals a wrong Accusation and the Round passes, so that seat joins the haunting. Returns every message sent on the way. */
function joinHaunting(s0: EngineState, sealSeat: number, now0: number): { state: EngineState; now: number; out: Outbound[] } {
  let s = s0;
  let now = now0;
  const out: Outbound[] = [];
  const sol = s.deal!.solution;
  const wrongSuspect = s.pool.suspects.find((x) => x.id !== sol.suspect)!.id;
  const zone = s.pool.zones[0]!.id;
  const relic = s.pool.relics[0]!.id;
  for (let i = 0; i < 16 && s.phase === "playing" && !s.players.find((p) => p.seat === sealSeat)?.poltergeist; i++) {
    const active = s.turn!.seat;
    now += 100;
    const r = step(s, { kind: "client", seat: active, msg: active === sealSeat ? { t: "seal", suspect: wrongSuspect, zone, relic } : { t: "pass" } }, now);
    s = r.state; out.push(...r.out);
    if (s.haunt.pending?.chooser != null) { now += 100; const c = step(s, { kind: "client", seat: s.haunt.pending.chooser, msg: { t: "choose", option: s.haunt.pending.options[0]! } }, now); s = c.state; out.push(...c.out); }
  }
  return { state: s, now, out };
}
const send = (s: EngineState, seat: number, msg: object, now: number) => step(s, { kind: "client", seat, msg: msg as never }, now);

describe("the Becoming (party-mode 19.6)", () => {
  it("plays once, on the Host and the joining Player's phone only, when a Player joins the haunting", () => {
    const j = joinHaunting(playing(), 2, 100);
    expect(j.state.players.find((p) => p.seat === 2)!.poltergeist).toBe(true);
    const hostB = hostMsgs(j.out, "becoming");
    expect(hostB).toHaveLength(1);
    expect(hostB[0]).toMatchObject({ seat: 2, durationMs: 4000 });
    expect(hostB[0]!.fadeOrder).toEqual([2, 1, 3, 4]);
    expect(seatMsgs(j.out, 2, "becoming")).toEqual([{ t: "becoming", atMs: expect.any(Number), durationMs: 4000, offerRattle: true }]);
    for (const other of [1, 3, 4]) expect(seatMsgs(j.out, other, "becoming")).toHaveLength(0);
    expect(j.out.some((o) => o.to === "public" && JSON.stringify(o.msg).includes("becoming"))).toBe(false);
    // another step later does not play it again
    const again = send(j.state, j.state.turn!.seat, { t: "pass" }, j.now + 100);
    expect(hostMsgs(again.out, "becoming")).toHaveLength(0);
  });
  it("is counted as no sound", () => {
    const j = joinHaunting(playing(), 2, 100);
    expect(j.state.players.every((p) => p.soundsThisRound === 0)).toBe(true);
  });
});

describe("Rattle (party-mode 19.1 to 19.5)", () => {
  const haunted = () => { const j = joinHaunting(playing(), 2, 100); return { s: j.state, now: j.now + 10_000 }; };
  it("only a haunting Player can turn it on or Rattle, and it starts off", () => {
    const { s, now } = haunted();
    expect(send(s, 1, { t: "rattleOn", on: true }, now).refused).toBe("rattle_denied:not_poltergeist");
    expect(send(s, 2, { t: "rattle", via: "button" }, now).refused).toBe("rattle_denied:rattle_not_on");
    const on = send(s, 2, { t: "rattleOn", on: true }, now);
    expect(on.refused).toBeUndefined();
    expect(send(on.state, 2, { t: "rattle", via: "button" }, now).refused).toBeUndefined();
    expect(send(s, 1, { t: "rattle", via: "shake" }, now).refused).toBe("rattle_denied:not_poltergeist");
  });
  it("the Master's switch off refuses it", () => {
    const { s, now } = haunted();
    const on = send(s, 2, { t: "rattleOn", on: true }, now).state;
    const off = { ...on, settings: { ...on.settings, rattle: false } };
    expect(send(off, 2, { t: "rattle", via: "button" }, now).refused).toBe("rattle_denied:rattle_off");
  });
  it("lands as one anonymous log line, plays on the Host at level 1, and the sender shows in no view", () => {
    const { s, now } = haunted();
    const on = send(s, 2, { t: "rattleOn", on: true }, now).state;
    const r = send(on, 2, { t: "rattle", via: "shake" }, now);
    const ev = publicSnapshot(r.state, now).events.filter((e) => e.kind === "rattle");
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ kind: "rattle", target: s.turn!.seat, level: 1 });
    expect(JSON.stringify(ev)).not.toContain('"from"');
    expect(hostMsgs(r.out, "rattleSound")[0]).toMatchObject({ level: 1, sound: "creak", volume: 0.8, line: "the floorboards creaked" });
    expect(r.state.sources.filter((x) => x.kind === "rattle")).toEqual([{ eventId: ev[0]!.id, kind: "rattle", from: 2, turn: s.turn!.turnNo }]);
    // nothing but the Engine's own state names the sender: no outbound message does
    expect(JSON.stringify(r.out)).not.toMatch(/"(from|source)"/);
  });
  it("grows in three levels by count within a Turn, with the 4 s gap and six a Turn, and the level starts again on the next Turn", () => {
    const { s, now: t0 } = haunted();
    let st = send(s, 2, { t: "rattleOn", on: true }, t0).state;
    const levels: number[] = [];
    let now = t0;
    for (let i = 0; i < 6; i++) {
      const r = send(st, 2, { t: "rattle", via: "button" }, now);
      expect(r.refused, `rattle ${i + 1}`).toBeUndefined();
      levels.push(hostMsgs(r.out, "rattleSound")[0]!.level as number);
      st = r.state;
      expect(send(st, 2, { t: "rattle", via: "button" }, now + 1000).refused).toBe("rattle_denied:cue_gap");
      now += 4_100;
    }
    expect(levels).toEqual([1, 1, 2, 2, 3, 3]);
    expect(send(st, 2, { t: "rattle", via: "button" }, now).refused).toBe("rattle_denied:turn_cue_limit");
    const next = send(st, st.turn!.seat, { t: "pass" }, now);
    expect(next.state.turn!.rattles ?? 0).toBe(0);
    const fresh = send(next.state, 2, { t: "rattle", via: "button" }, now + 100);
    expect(hostMsgs(fresh.out, "rattleSound")[0]!.level).toBe(1);
  });
  it("plays on a phone with consent and a free slot (counted toward the three sounds), and flashes or nothing for the rest", () => {
    const { s, now } = haunted();
    let st = send(s, 1, { t: "sound", consent: true }, now).state;
    st = send(st, 3, { t: "sound", consent: true, audio: false }, now).state;
    st = send(st, 2, { t: "rattleOn", on: true }, now).state;
    const r = send(st, 2, { t: "rattle", via: "button" }, now);
    expect(seatMsgs(r.out, 1, "rattleSound")[0]).toMatchObject({ plan: "play", level: 1, sound: "creak", volume: 0.8 });
    expect(seatMsgs(r.out, 3, "rattleSound")[0]).toMatchObject({ plan: "flash" });
    expect(seatMsgs(r.out, 4, "rattleSound")).toHaveLength(0);
    expect(r.state.players.find((p) => p.seat === 1)!.soundsThisRound).toBe(1);
    expect(r.state.players.find((p) => p.seat === 4)!.soundsThisRound).toBe(0);
  });
  it("changes no rule: the deal, the Haunt level, the Turn, the winners and every Hand stay as they were", () => {
    const { s, now } = haunted();
    const on = send(s, 2, { t: "rattleOn", on: true }, now).state;
    const r = send(on, 2, { t: "rattle", via: "button" }, now).state;
    const rules = (x: EngineState) => JSON.stringify({ deal: x.deal, residueAt: x.residueAt, haunt: x.haunt, round: x.round, winners: x.winners, seat: x.turn!.seat, clock: x.turn!.clock });
    expect(rules(r)).toBe(rules(on));
  });
});

describe("the Rattle prompts (party-mode 19.7)", () => {
  it("a haunting Player with Rattle off gets rattle-first once a Turn, and rattle-join once after another Player's Rattle, naming no sender", () => {
    let j = joinHaunting(playing(), 2, 100);
    j = joinHaunting(j.state, 3, j.now);
    let st = j.state;
    let now = j.now + 5_000;
    expect(st.players.filter((p) => p.poltergeist).map((p) => p.seat)).toEqual([2, 3]);
    // a new Turn starts: both haunting Players are asked once
    const next = send(st, st.turn!.seat, { t: "pass" }, now);
    st = next.state;
    expect(seatMsgs(next.out, 2, "prompt")).toHaveLength(1);
    expect(seatMsgs(next.out, 2, "prompt")[0]).toMatchObject({ kind: "rattle-first", button: "turn-on-rattle" });
    expect(seatMsgs(next.out, 3, "prompt")).toHaveLength(1);
    expect(seatMsgs(next.out, 1, "prompt")).toHaveLength(0);
    // seat 2 turns it on and rattles: seat 3 is told once (join), seat 2 is not
    st = send(st, 2, { t: "rattleOn", on: true }, now + 1).state;
    const r = send(st, 2, { t: "rattle", via: "button" }, now + 2);
    expect(seatMsgs(r.out, 3, "prompt")).toEqual([{ t: "prompt", kind: "rattle-join", text: expect.not.stringContaining("P2"), button: "turn-on-rattle" }]);
    expect(seatMsgs(r.out, 2, "prompt")).toHaveLength(0);
    const r2 = send(r.state, 2, { t: "rattle", via: "button" }, now + 5_000);
    expect(seatMsgs(r2.out, 3, "prompt")).toHaveLength(0);
    // a human who is not haunting, a Bot, and a Player with Rattle already on get none; the Master's switch off gives none
    expect(seatMsgs(r.out, 1, "prompt")).toHaveLength(0);
    expect(seatMsgs(r.out, 4, "prompt")).toHaveLength(0);
  });
  it("the private view says whether Rattle is allowed and on, only for a haunting Player", () => {
    const j = joinHaunting(playing(), 2, 100);
    const on = send(j.state, 2, { t: "rattleOn", on: true }, j.now + 1);
    const priv = on.out.filter((o): o is Extract<Outbound, { to: "seat" }> => o.to === "seat" && o.msg.t === "private");
    const view = (seat: number) => (priv.find((o) => o.seat === seat)!.msg as { view: { rattle?: unknown } }).view.rattle;
    expect(view(2)).toEqual({ allowed: true, on: true });
    expect(view(1)).toBeUndefined();
  });
});

describe("the private Scare points (party-mode 9.12)", () => {
  it("a haunting Player's private view carries their own points, and nobody else's view carries any", () => {
    const j = joinHaunting(playing(), 2, 100);
    let st = send(j.state, 2, { t: "rattleOn", on: true }, j.now + 10_000).state;
    const r = send(st, 2, { t: "rattle", via: "button" }, j.now + 10_001);
    const priv = r.out.filter((o): o is Extract<Outbound, { to: "seat" }> => o.to === "seat" && o.msg.t === "private");
    const scare = (seat: number) => (priv.find((o) => o.seat === seat)!.msg as { view: { scare?: number } }).view.scare;
    expect(scare(2)).toBe(1);
    expect(scare(1)).toBeUndefined();
    expect(JSON.stringify(r.out.filter((o) => o.to === "public"))).not.toContain('"scare"');
    st = r.state;
    expect(st.players.length).toBe(4);
  });
});

describe("the public Inspect marker (party-mode 8.10)", () => {
  it("names only the Zone being searched while it runs, and nothing once it is done", () => {
    const s0 = playing(7);
    const seat = s0.turn!.seat;
    const zone = s0.pool.zones[0]!.id;
    const walked = send(s0, seat, { t: "walk", zone }, 10).state;
    expect(publicSnapshot(walked, 10).inspecting).toBeNull();
    const searching = send(walked, seat, { t: "inspect" }, 20);
    expect(publicSnapshot(searching.state, 20).inspecting).toBe(zone);
    expect(JSON.stringify(publicSnapshot(searching.state, 20))).not.toMatch(/found|residue card/i);
    const done = step(searching.state, { kind: "alarm" }, 20 + 10_000);
    expect(publicSnapshot(done.state, 20 + 10_000).inspecting).toBeNull();
  });
});
