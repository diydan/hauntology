import { describe, expect, it } from "vitest";
import { knockPlayTimes } from "../puzzles/knock";
import { makeLock } from "../puzzles/make";
import { ACT_WINDOW_MS, doorKnock, parseDoorsState, type DoorSetup } from "./doors";
import { createEngine, publicSnapshot, repairDoors, step, type ClientMsg, type EngineSeat, type EngineSettings, type EngineState, type Outbound, type StepResult } from "./engine";
import { parseClientMessage } from "./protocol";

const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);
const SETTINGS: EngineSettings = { baseSeconds: 90, hauntMax: 12, puzzles: "medium", preset: "classic" };
const mkSeats = (humans: number): EngineSeat[] => [1, 2, 3].map((seat) => ({ seat, nickname: `P${seat}`, bot: seat > humans, botLevel: "standard" as const }));
const toSeat = (out: readonly Outbound[], seat: number, t: string) => out.filter((o): o is Extract<Outbound, { to: "seat" }> => o.to === "seat" && o.seat === seat && o.msg.t === t).map((o) => o.msg);
const doorMsgs = (out: readonly Outbound[]) => out.flatMap((o) => (o.to === "public" && o.msg.t === "door" ? [o.msg] : []));
const doorSights = (out: readonly Outbound[], seat: number) => toSeat(out, seat, "sight").filter((m) => m.t === "sight" && m.sightId.startsWith("door-"));

const zoneIdsFor = (seed: number): string[] => createEngine({ seed, seats: mkSeats(2), settings: SETTINGS, presetIds: PRESETS }).pool.zones.map((z) => z.id);

/** Zones z0..z5: a knock door joins z0 and z1, a heavy door (2 Players) joins z1 and z2, open ground joins z2 to z5. Home is z0. */
function setupFor(seed: number): DoorSetup {
  const z = zoneIdsFor(seed) as [string, string, string, string, string, string];
  return {
    home: z[0], passages: [[z[2], z[3]], [z[3], z[4]], [z[4], z[5]]],
    doors: [
      { id: "cellar-door", at: { x: 1, z: 1 }, width: 1.2, a: z[0], b: z[1], lock: "knock" },
      { id: "iron-door", at: { x: 3, z: 1 }, width: 1.4, a: z[1], b: z[2], lock: "heavy", need: 2 },
    ],
  };
}

type G = { s: EngineState; now: number; r: StepResult };
function game(seed: number, humans = 2, settings: Partial<EngineSettings> = {}, doors: DoorSetup | null = setupFor(seed)): G {
  const s0 = createEngine({ seed, seats: mkSeats(humans), settings: { ...SETTINGS, ...settings }, presetIds: PRESETS, doors });
  const r = step(s0, { kind: "client", seat: 1, msg: { t: "start" } }, 0);
  return { s: r.state, now: 0, r };
}
const send = (g: G, seat: number, msg: ClientMsg, at = g.now): G => { const r = step(g.s, { kind: "client", seat, msg }, at); return { s: r.state, now: at, r }; };
/** Alarm forward until `stop` holds, keeping every message sent on the way. */
function advance(g: G, stop: (s: EngineState) => boolean, max = 3000): G & { out: Outbound[] } {
  let { s, now, r } = g;
  const out: Outbound[] = [];
  for (let k = 0; k < max && !stop(s) && s.phase === "playing"; k++) { now = r.wakeAtMs ?? now + 1000; r = step(s, { kind: "alarm" }, now); s = r.state; out.push(...r.out); }
  return { s, now, r, out };
}
const onHuman = (g: G, humans = 2): G => advance(g, (s) => s.turn !== null && s.turn.seat <= humans);
const secretOf = (seed: number, id: string) => { const k = doorKnock(seed, id); const l = makeLock("knock", k.level, k.seed); if (l.kind !== "knock") throw new Error("knock"); return l.secret; };
const SEED = 7;

describe("doors in the Engine: the start (Requirement 2.2, 1.4, 8.1)", () => {
  it("starts every door shut with puzzles on, listing them to every screen with no pattern, and closes the Zones behind them", () => {
    const g = game(SEED);
    const view = publicSnapshot(g.s, 0);
    expect(view.doors.map((d) => [d.id, d.open, d.lock])).toEqual([["cellar-door", false, "knock"], ["iron-door", false, "heavy"]]);
    const z = zoneIdsFor(SEED);
    expect(view.closedZones).toEqual(z.slice(1));
    expect(JSON.stringify(view)).not.toMatch(/"groups"|"long"|secret/);
    expect(view.doorProblems).toEqual([]);
  });

  it("starts every door open with puzzles off, and when no human is seated to open them", () => {
    expect(publicSnapshot(game(SEED, 2, { puzzles: "off" }).s, 0).doors.every((d) => d.open)).toBe(true);
    expect(publicSnapshot(game(SEED, 2, { puzzles: "off" }).s, 0).closedZones).toEqual([]);
    expect(publicSnapshot(game(SEED, 0).s, 0).closedZones).toEqual([]);
  });

  it("plays exactly as before when the world has no doors", () => {
    const g = game(SEED, 2, {}, null);
    const view = publicSnapshot(g.s, 0);
    expect([view.doors, view.closedZones, view.doorProblems]).toEqual([[], [], []]);
    expect(g.s.doors).toBeNull();
  });

  it("plays without doors and says why when the world's doors fail the check", () => {
    const z = zoneIdsFor(SEED);
    const bad: DoorSetup = { home: z[0] as string, passages: [], doors: [{ id: "x", at: { x: 0, z: 0 }, width: 1, a: z[0] as string, b: "moon", lock: "knock" }] };
    const g = game(SEED, 2, {}, bad);
    expect(g.s.phase).toBe("playing");
    expect(publicSnapshot(g.s, 0)).toMatchObject({ doors: [], closedZones: [] });
    expect(publicSnapshot(g.s, 0).doorProblems).toContain("0:zone");
    const cut: DoorSetup = { home: z[0] as string, passages: [], doors: [{ id: "x", at: { x: 0, z: 0 }, width: 1, a: z[0] as string, b: z[1] as string, lock: "knock" }] };
    expect(publicSnapshot(game(SEED, 2, {}, cut).s, 0).doorProblems).toContain(`cut_off:${z[2]}`);
  });

  it("keeps the doors through a save, and falls back to the start from the setup when a saved value does not parse", () => {
    const g = game(SEED);
    const saved = JSON.parse(JSON.stringify(g.s)) as EngineState;
    expect(parseDoorsState(saved.doors)).not.toBeNull();
    expect(repairDoors(saved)).toBe(saved);
    const broken = { ...saved, doors: { ...(saved.doors as object), states: [] } } as unknown as EngineState;
    const fixed = repairDoors(broken);
    expect(fixed.doors).toEqual(g.s.doors);
    expect(fixed.doors?.states.every((d) => !d.open)).toBe(true);
    // a Room saved before doors existed has none of the three fields, and is left as it is
    const { doors: _doors, doorSetup: _setup, doorProblems: _problems, ...rest } = saved;
    const old = rest as EngineState;
    expect(repairDoors(old)).toBe(old);
  });
});

describe("doors in the Engine: walking (Requirement 2.3)", () => {
  it("refuses a walk into a Zone behind a shut door, allows the Home Zone, and allows every Zone once the doors are open", () => {
    const z = zoneIdsFor(SEED);
    const g = onHuman(game(SEED));
    const me = g.s.turn!.seat;
    expect(send(g, me, { t: "walk", zone: z[1] as string }).r.refused).toBe("zone_closed");
    expect(send(g, me, { t: "walk", zone: z[5] as string }).r.refused).toBe("zone_closed");
    expect(send(g, me, { t: "walk", zone: z[0] as string }).r.refused).toBeUndefined();
    const open = onHuman(game(SEED, 2, { puzzles: "off" }));
    for (const zone of z) expect(send(open, open.s.turn!.seat, { t: "walk", zone }).r.refused).toBeUndefined();
  });

  it("never lets a Bot walk behind a shut door", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      let g = game(seed, 1);
      const seen = new Set<number>();
      for (let k = 0; k < 400 && g.s.phase === "playing"; k++) {
        const closed = publicSnapshot(g.s, g.now).closedZones;
        const before = g.s.log.length;
        const now = g.r.wakeAtMs ?? g.now + 1000;
        const r = step(g.s, { kind: "alarm" }, now);
        for (const e of r.state.log.slice(before)) if (e.kind === "visit") { expect(closed).not.toContain(e.zone); seen.add(e.seat); }
        g = { s: r.state, now, r };
      }
      expect(seen.size).toBeGreaterThan(0);
    }
  });
});

describe("doors in the Engine: the heavy door (Requirement 4.1, 4.2, 4.4)", () => {
  it("opens when two different Players act inside the window, and tells every screen the count first", () => {
    let g = game(SEED);
    g = send(g, 1, { t: "doorAct", doorId: "iron-door" }, 1000);
    expect(doorMsgs(g.r.out)).toEqual([{ t: "door", id: "iron-door", open: false, reason: "act", need: 2, have: 1 }]);
    expect(publicSnapshot(g.s, 1000).doors[1]).toMatchObject({ open: false, need: 2, have: 1 });
    g = send(g, 1, { t: "doorAct", doorId: "iron-door" }, 1500); // the same Player again counts once
    expect(doorMsgs(g.r.out)[0]).toMatchObject({ open: false, have: 1 });
    g = send(g, 2, { t: "doorAct", doorId: "iron-door" }, 1900);
    expect(doorMsgs(g.r.out)).toEqual([{ t: "door", id: "iron-door", open: true, reason: "together", need: 2, have: 2 }]);
    expect(g.s.doors?.states[1]?.open).toBe(true);
    expect(g.s.doors?.acts).toEqual({}); // the count starts again
    expect(send(g, 1, { t: "doorAct", doorId: "iron-door" }, 2000).r.refused).toBe("door_open");
  });

  it("does not count acts further apart than the window", () => {
    let g = game(SEED);
    g = send(g, 1, { t: "doorAct", doorId: "iron-door" }, 1000);
    g = send(g, 2, { t: "doorAct", doorId: "iron-door" }, 1000 + ACT_WINDOW_MS);
    expect(g.s.doors?.states[1]?.open).toBe(false);
    expect(doorMsgs(g.r.out)[0]).toMatchObject({ have: 1 });
    g = send(g, 1, { t: "doorAct", doorId: "iron-door" }, 1000 + ACT_WINDOW_MS + 100);
    expect(g.s.doors?.states[1]?.open).toBe(true);
  });

  it("never asks for more Players than are seated: one Player opens it alone", () => {
    const g = send(game(SEED, 1), 1, { t: "doorAct", doorId: "iron-door" }, 1000);
    expect(doorMsgs(g.r.out)).toEqual([{ t: "door", id: "iron-door", open: true, reason: "together", need: 1, have: 1 }]);
  });

  it("refuses an act on a knock door, an unknown door, or a world with no doors", () => {
    const g = game(SEED);
    expect(send(g, 1, { t: "doorAct", doorId: "cellar-door" }).r.refused).toBe("not_heavy");
    expect(send(g, 1, { t: "doorAct", doorId: "nope" }).r.refused).toBe("door_unknown");
    expect(send(game(SEED, 2, {}, null), 1, { t: "doorAct", doorId: "iron-door" }).r.refused).toBe("door_unknown");
  });
});

describe("doors in the Engine: the knock door (Requirement 3.1 to 3.5, 8.3)", () => {
  /** A human on their Turn, standing in the Home Zone (the near side of the cellar door). */
  function atDoor(): { g: G; me: number; out: Outbound[] } {
    const z = zoneIdsFor(SEED);
    const g0 = onHuman(game(SEED));
    const me = g0.s.turn!.seat;
    const g = send(g0, me, { t: "walk", zone: z[0] as string });
    return { g, me, out: g.r.out as Outbound[] };
  }

  it("gives the ghost's knock once, to one phone only, as a Sight, and never in a public message", () => {
    const { g, me, out } = atDoor();
    // the Zone may also hold an ordinary puzzle Sight: only the door's own is checked here
    const sights = doorSights(out, me);
    expect(sights).toHaveLength(1);
    const sight = sights[0] as Extract<typeof sights[number], { t: "sight" }>;
    expect(sight.sightId).toBe("door-cellar-door");
    expect(sight.sight).toMatchObject({ kind: "knock", payload: { kind: "knock", groups: secretOf(SEED, "cellar-door").groups } });
    const other = me === 1 ? 2 : 1;
    expect(doorSights(out, other)).toEqual([]);
    for (const o of out) if (o.to === "public") expect(JSON.stringify(o.msg)).not.toMatch(/"groups"|knock":/);
    expect(g.s.doors?.heardBy).toEqual({ "cellar-door": me });
    // a second Player walking in later is not given it again
    const again = onHuman(advance(send(g, me, { t: "endTurn" }, g.now), (s) => s.turn !== null && s.turn.seat === other && s.turn.seat !== me), 2);
    const z = zoneIdsFor(SEED);
    expect(doorSights(send(again, other, { t: "walk", zone: z[0] as string }).r.out, other)).toEqual([]);
  });

  it("opens the door for every screen on the right knock", () => {
    const { g, me } = atDoor();
    const times = knockPlayTimes(secretOf(SEED, "cellar-door"));
    const r = send(g, me, { t: "doorKnock", doorId: "cellar-door", times });
    expect(r.r.refused).toBeUndefined();
    expect(toSeat(r.r.out, me, "doorResult")[0]).toMatchObject({ doorId: "cellar-door", outcome: "opened" });
    expect(doorMsgs(r.r.out)).toEqual([{ t: "door", id: "cellar-door", open: true, reason: "knock", need: 0, have: 0 }]);
    expect(publicSnapshot(r.s, r.now).closedZones).not.toContain(zoneIdsFor(SEED)[1]);
    expect(r.s.turn?.seat).toBe(me); // the Turn goes on
  });

  it("says what was heard on a wrong try and never the answer, then ends the Turn after three and opens the door next Round", () => {
    const { g, me } = atDoor();
    const wrong = [0, 10_000]; // two single knocks: never a real pattern
    const first = send(g, me, { t: "doorKnock", doorId: "cellar-door", times: wrong });
    expect(toSeat(first.r.out, me, "doorResult")[0]).toEqual({ t: "doorResult", doorId: "cellar-door", outcome: "wrong", heard: "You knocked 1, 1.", triesLeft: 2 });
    expect(JSON.stringify(first.r.out)).not.toContain(secretOf(SEED, "cellar-door").groups.join(","));
    const second = send(first, me, { t: "doorKnock", doorId: "cellar-door", times: wrong });
    expect(toSeat(second.r.out, me, "doorResult")[0]).toMatchObject({ outcome: "wrong", triesLeft: 1 });
    const third = send(second, me, { t: "doorKnock", doorId: "cellar-door", times: wrong });
    expect(toSeat(third.r.out, me, "doorResult")[0]).toMatchObject({ outcome: "failed", triesLeft: 0 });
    expect(third.s.turn?.seat).not.toBe(me); // the Turn ended
    expect(third.s.doors?.states[0]).toMatchObject({ open: false, opensAtRound: third.s.round + 1 });
    const round = third.s.round;
    const later = advance(third, (s) => s.round > round);
    expect(doorMsgs(later.out)).toContainEqual({ t: "door", id: "cellar-door", open: true, reason: "timeout", need: 0, have: 0 });
    expect(later.s.doors?.states[0]).toMatchObject({ open: true, autoOpenedRound: later.s.round });
    expect(publicSnapshot(later.s, later.now).closedZones).not.toContain(zoneIdsFor(SEED)[1]);
  });

  it("refuses a knock off the Turn, away from the door, with no knocks, or when the door is open", () => {
    const { g, me } = atDoor();
    const other = me === 1 ? 2 : 1;
    const times = [0, 300];
    expect(send(g, other, { t: "doorKnock", doorId: "cellar-door", times }).r.refused).toBe("not_your_turn");
    expect(send(g, me, { t: "doorKnock", doorId: "cellar-door", times: [] }).r.refused).toBe("no_knocks");
    expect(send(g, me, { t: "doorKnock", doorId: "iron-door", times }).r.refused).toBe("not_at_door"); // a door in another Zone
    expect(send(g, me, { t: "doorKnock", doorId: "nope", times }).r.refused).toBe("door_unknown");
    const g1 = onHuman(game(SEED));
    expect(send(g1, g1.s.turn!.seat, { t: "doorKnock", doorId: "cellar-door", times }).r.refused).toBe("not_at_door");
    const opened = send(g, me, { t: "doorKnock", doorId: "cellar-door", times: knockPlayTimes(secretOf(SEED, "cellar-door")) });
    expect(send(opened, me, { t: "doorKnock", doorId: "cellar-door", times }).r.refused).toBe("door_open");
  });

  it("gives the same knock on every run for the same Room seed and door, and a different one for another seed", () => {
    expect(secretOf(SEED, "cellar-door")).toEqual(secretOf(SEED, "cellar-door"));
    const patterns = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(secretOf(i * 101, "cellar-door"))));
    expect(patterns.size).toBeGreaterThan(5);
  });
});

describe("doors in the Engine: the socket protocol (Requirement 8.2)", () => {
  const parse = (m: unknown) => parseClientMessage(JSON.stringify(m)).kind;
  it("takes the two door messages, and refuses extra fields, too many knocks, bad times and a missing door", () => {
    expect(parse({ t: "doorAct", doorId: "iron-door" })).toBe("game");
    expect(parse({ t: "doorKnock", doorId: "cellar-door", times: [0, 260, 520] })).toBe("game");
    expect(parse({ t: "doorAct", doorId: "iron-door", extra: 1 })).toBe("bad");
    expect(parse({ t: "doorAct" })).toBe("bad");
    expect(parse({ t: "doorAct", doorId: "" })).toBe("bad");
    expect(parse({ t: "doorKnock", doorId: "cellar-door", times: Array.from({ length: 65 }, (_, i) => i) })).toBe("bad");
    expect(parse({ t: "doorKnock", doorId: "cellar-door", times: [-1] })).toBe("bad");
    expect(parse({ t: "doorKnock", doorId: "cellar-door", times: ["x"] })).toBe("bad");
    expect(parseClientMessage('{"t":"doorKnock","doorId":"a","times":[1e999]}').kind).toBe("bad");
  });
});
