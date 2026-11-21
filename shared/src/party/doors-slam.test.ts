import { describe, expect, it } from "vitest";
import { knockPlayTimes } from "../puzzles/knock";
import { setupDoors, slamTargetsAt, startTvKnock, knockBackAtTv, openDoor, type DoorSetup, type DoorsState } from "./doors";
import { createEngine, publicSnapshot, step, type ClientMsg, type EngineSeat, type EngineSettings, type EngineState, type Outbound, type StepResult } from "./engine";
import { CHOICE_MS, HAUNT_OPTIONS, SLAM_LEVEL, applyEvent, chooseOption, eventOptions, fireEvent, slamOptions, type Haunt } from "./haunt";
import { parseClientMessage } from "./protocol";

// ------------------------------------------------------------------ the Haunt options (Requirement 5.1, 5.5)
/** A Haunt at `level` where every lower threshold has already fired, as it is in play (the lowest unfired threshold fires first). */
const fresh = (level: number, max = 12): Haunt => ({ level, max, fired: ([3, 6, 9] as const).filter((t) => t < level), pending: null, coldSpot: null, blackoutNext: false });

describe("the Slam as a Haunt option (Requirement 5.1)", () => {
  it("is not in the ordinary list, which the Voice Library builds its lines from", () => {
    expect([...HAUNT_OPTIONS]).toEqual(["cold-spot", "blackout", "restless", "lull"]);
  });

  it("changes nothing when no door can be shut, at any threshold or seed", () => {
    for (let seed = 0; seed < 60; seed++) for (const level of [3, 6, 9]) {
      const h = fireEvent(fresh(level), seed, null, 0);
      expect(h.pending?.options).toEqual(eventOptions(seed, h.pending?.level as 3 | 6 | 9));
      expect(fireEvent(fresh(level), seed, null, 0, false).pending?.options).toEqual(h.pending?.options);
    }
  });

  it("offers the Slam only at level 6, with one ordinary option, and sometimes as the default", () => {
    const firsts = new Set<string>();
    for (let seed = 0; seed < 80; seed++) {
      const six = fireEvent(fresh(6), seed, null, 0, true).pending;
      expect(six?.level).toBe(SLAM_LEVEL);
      expect(six?.options).toEqual(slamOptions(seed, 6));
      expect([...(six?.options ?? [])].sort()).toEqual([eventOptions(seed, 6)[0], "slam"].sort());
      firsts.add(six?.options[0] as string);
      expect(fireEvent(fresh(3), seed, null, 0, true).pending?.options).toEqual(eventOptions(seed, 3));
      expect(fireEvent(fresh(9), seed, null, 0, true).pending?.options).toEqual(eventOptions(seed, 9));
    }
    expect(firsts.has("slam")).toBe(true);
    expect([...firsts].some((o) => o !== "slam")).toBe(true);
  });

  it("lets the chooser pick the Slam, and applies it as a clean event that changes only the pending state", () => {
    const seed = Array.from({ length: 80 }, (_, i) => i).find((s) => slamOptions(s, 6)[1] === "slam") as number;
    const h = fireEvent(fresh(6), seed, 2, 1000, true);
    expect(chooseOption(h, 2, "slam", 1000 + CHOICE_MS)).toBe("slam");
    expect(chooseOption(h, 3, "slam", 1000)).toBeNull();
    const after = applyEvent(h, "slam", ["z1"], 3, seed);
    expect(after).toEqual({ ...h, pending: null });
  });
});

// ------------------------------------------------------------------ the pure Slam rules
describe("which doors a Slam may shut, and the knock at the TV (Requirement 5.2, 5.3)", () => {
  const zones = ["hall", "cellar", "attic", "garden"];
  const setup: DoorSetup = {
    home: "hall", passages: [["attic", "garden"]],
    doors: [
      { id: "one", at: { x: 0, z: 0 }, width: 1.2, a: "hall", b: "cellar", lock: "knock" },
      { id: "two", at: { x: 1, z: 0 }, width: 1.2, a: "cellar", b: "attic", lock: "heavy", need: 2 },
    ],
  };
  const open = (): DoorsState => {
    const d = setupDoors(setup, zones, true).state as DoorsState;
    return { ...d, states: openDoor(openDoor(d.states, "one"), "two") };
  };

  it("counts a Player in a Zone behind a door as behind it, and nobody when no Player is placed", () => {
    expect(slamTargetsAt(open(), zones, null, 4)).toEqual(["one", "two"]);
    expect(slamTargetsAt(open(), zones, "hall", 4)).toEqual(["one", "two"]);
    expect(slamTargetsAt(open(), zones, "cellar", 4)).toEqual(["two"]); // behind "one", not behind "two"
    expect(slamTargetsAt(open(), zones, "attic", 4)).toEqual([]); // behind both
    expect(slamTargetsAt(open(), zones, "garden", 4)).toEqual([]);
  });

  it("never lists a shut door or one that opened by itself this Round", () => {
    const d = open();
    const shut: DoorsState = { ...d, states: d.states.map((s) => (s.id === "one" ? { ...s, open: false } : s)) };
    expect(slamTargetsAt(shut, zones, null, 4)).toEqual(["two"]);
    const auto: DoorsState = { ...d, states: d.states.map((s) => (s.id === "two" ? { ...s, autoOpenedRound: 4 } : s)) };
    expect(slamTargetsAt(auto, zones, null, 4)).toEqual(["one"]);
    expect(slamTargetsAt(auto, zones, null, 5)).toEqual(["one", "two"]);
  });

  it("makes the same easy knock for the same seed and Round, and a knock-back is judged like any knock", () => {
    const a = startTvKnock(9, 3);
    expect(startTvKnock(9, 3)).toEqual(a);
    expect(a).toMatchObject({ round: 3, answeredBy: null });
    expect(a.groups.length).toBe(2); // easy: two groups
    expect(new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(startTvKnock(i, 3).groups))).size).toBeGreaterThan(3);
    expect(knockBackAtTv(null, 3, 1, [0, 300])).toEqual({ ok: false, code: "no_tv_knock" });
    expect(knockBackAtTv(a, 4, 1, [0, 300])).toEqual({ ok: false, code: "no_tv_knock" }); // a later Round
    expect(knockBackAtTv(a, 3, 1, [])).toEqual({ ok: false, code: "no_knocks" });
    expect(knockBackAtTv({ ...a, answeredBy: 2 }, 3, 1, [0])).toEqual({ ok: false, code: "tv_knock_answered" });
    const wrong = knockBackAtTv(a, 3, 1, [0, 10_000]);
    expect(wrong).toMatchObject({ ok: true, outcome: "wrong", heard: "You knocked 1, 1." });
    if (wrong.ok) expect(wrong.state).toBe(a);
    const right = knockBackAtTv(a, 3, 2, knockPlayTimes(a));
    expect(right).toMatchObject({ ok: true, outcome: "help" });
    if (right.ok) expect(right.state.answeredBy).toBe(2);
  });
});

// ------------------------------------------------------------------ the Slam in the Engine
const PRESETS = Array.from({ length: 8 }, (_, i) => `preset-${i + 1}`);
const SETTINGS: EngineSettings = { baseSeconds: 90, hauntMax: 12, puzzles: "medium", preset: "classic" };
const mkSeats = (humans: number): EngineSeat[] => [1, 2, 3].map((seat) => ({ seat, nickname: `P${seat}`, bot: seat > humans, botLevel: "standard" as const }));
const zoneIdsFor = (seed: number): string[] => createEngine({ seed, seats: mkSeats(2), settings: SETTINGS, presetIds: PRESETS }).pool.zones.map((z) => z.id);
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
function game(seed: number, settings: Partial<EngineSettings> = {}): G {
  const s0 = createEngine({ seed, seats: mkSeats(2), settings: { ...SETTINGS, ...settings }, presetIds: PRESETS, doors: setupFor(seed) });
  const r = step(s0, { kind: "client", seat: 1, msg: { t: "start" } }, 0);
  return { s: r.state, now: 0, r };
}
const send = (g: G, seat: number, msg: ClientMsg, at = g.now): G => { const r = step(g.s, { kind: "client", seat, msg }, at); return { s: r.state, now: at, r }; };
function advance(g: G, stop: (s: EngineState) => boolean, max = 4000): G & { out: Outbound[] } {
  let { s, now, r } = g;
  const out: Outbound[] = [];
  for (let k = 0; k < max && !stop(s) && s.phase === "playing"; k++) { now = r.wakeAtMs ?? now + 1000; r = step(s, { kind: "alarm" }, now); s = r.state; out.push(...r.out); }
  return { s, now, r, out };
}
/** Every door open and the Haunt at level 6 with level 3 already fired, so the next Haunt Event is the one that may offer a Slam. */
const readyForSlam = (g: G): G => ({ ...g, s: { ...g.s, haunt: { ...g.s.haunt, level: SLAM_LEVEL, fired: [3] }, doors: { ...(g.s.doors as DoorsState), states: (g.s.doors as DoorsState).states.map((x) => ({ ...x, open: true })) } } });
const eventOf = (s: EngineState) => s.log.find((e) => e.kind === "haunt-event") as { option: string } | undefined;
const hauntEvent = (s: EngineState) => s.log.some((e) => e.kind === "haunt-event");
const doorMsgs = (out: readonly Outbound[]) => out.flatMap((o) => (o.to === "public" && o.msg.t === "door" ? [o.msg] : []));
const tvMsgs = (out: readonly Outbound[]) => out.flatMap((o) => (o.to === "public" && o.msg.t === "tvKnock" ? [o.msg] : []));
/** A seed whose level-6 Event applies the Slam by default (no Poltergeist chooses). */
const slamFirstSeed = Array.from({ length: 200 }, (_, i) => i).find((s) => slamOptions(s, 6)[0] === "slam") as number;

describe("the Slam in the Engine (Requirement 5.1 to 5.5)", () => {
  it("shuts a door, tells every screen, and knocks at the TV when it is the Event that applies", () => {
    const g = advance(readyForSlam(game(slamFirstSeed)), hauntEvent);
    expect(eventOf(g.s)).toMatchObject({ option: "slam" });
    expect(doorMsgs(g.out)).toEqual([{ t: "door", id: "cellar-door", open: false, reason: "slam", need: 0, have: 0 }]);
    const tv = tvMsgs(g.out);
    expect(tv).toHaveLength(1);
    expect(tv[0]).toMatchObject({ answeredBy: null });
    expect(g.s.doors?.states[0]).toMatchObject({ id: "cellar-door", open: false, opensAtRound: g.s.round + 1 });
    expect(g.s.doors?.states[1]?.open).toBe(true);
    expect(publicSnapshot(g.s, g.now).tvKnock).toMatchObject({ groups: tv[0] && "groups" in tv[0] ? tv[0].groups : null, answeredBy: null });
    expect(publicSnapshot(g.s, g.now).doors[0]).toMatchObject({ id: "cellar-door", open: false });
  });

  it("opens the slammed door by itself at the start of the next Round", () => {
    const g = advance(readyForSlam(game(slamFirstSeed)), hauntEvent);
    const round = g.s.round;
    const later = advance(g, (s) => s.round > round);
    expect(doorMsgs(later.out)).toContainEqual({ t: "door", id: "cellar-door", open: true, reason: "timeout", need: 0, have: 0 });
    expect(later.s.doors?.states[0]).toMatchObject({ open: true, autoOpenedRound: later.s.round });
  });

  it("is not offered with puzzles off, with the Gentle preset, or when every door is shut", () => {
    const plain = advance(readyForSlam(game(slamFirstSeed)), hauntEvent);
    expect(eventOf(plain.s)).toMatchObject({ option: "slam" }); // the control: the same seed does Slam
    const off = advance(readyForSlam(game(slamFirstSeed, { puzzles: "off" })), hauntEvent);
    expect(eventOf(off.s)?.option).not.toBe("slam");
    const gentle = advance(readyForSlam(game(slamFirstSeed, { preset: "gentle" })), hauntEvent);
    expect(eventOf(gentle.s)?.option).not.toBe("slam");
    const g0 = game(slamFirstSeed);
    const shut = advance({ ...g0, s: { ...g0.s, haunt: { ...g0.s.haunt, level: SLAM_LEVEL, fired: [3] } } }, hauntEvent);
    expect(eventOf(shut.s)?.option).not.toBe("slam");
    for (const x of [off, gentle, shut]) expect(doorMsgs(x.out).filter((m) => m.reason === "slam")).toEqual([]);
  });

  it("never shuts a door that a Player stands behind", () => {
    const z = zoneIdsFor(slamFirstSeed);
    const g0 = readyForSlam(game(slamFirstSeed));
    const turn = advance(g0, (s) => s.turn !== null && s.turn.seat <= 2);
    const me = turn.s.turn!.seat;
    const walked = send(turn, me, { t: "walk", zone: z[1] as string }); // behind the cellar door, not behind the iron door
    expect(walked.r.refused).toBeUndefined();
    const g = advance(walked, hauntEvent);
    expect(eventOf(g.s)).toMatchObject({ option: "slam" });
    expect(doorMsgs(g.out)).toEqual([{ t: "door", id: "iron-door", open: false, reason: "slam", need: 0, have: 0 }]);
    expect(g.s.doors?.states[0]?.open).toBe(true);
    expect(g.s.doors?.states[1]).toMatchObject({ open: false });
  });
});

describe("knocking back at the TV (Requirement 5.3)", () => {
  const slammed = (): G => advance(readyForSlam(game(slamFirstSeed)), hauntEvent);

  it("gives the first right knock a Help, tells every screen who, and refuses a second", () => {
    const g = slammed();
    const right = knockPlayTimes(startTvKnock(slamFirstSeed, g.s.round));
    const a = send(g, 2, { t: "tvKnock", times: right });
    expect(a.r.refused).toBeUndefined();
    expect(tvMsgs(a.r.out)).toEqual([expect.objectContaining({ answeredBy: 2 })]);
    expect(a.s.helpOwed).toEqual([2]);
    expect(publicSnapshot(a.s, a.now).tvKnock?.answeredBy).toBe(2);
    expect(send(a, 1, { t: "tvKnock", times: right }).r.refused).toBe("tv_knock_answered");
  });

  it("says what was heard on a wrong knock, costs nothing, and refuses a knock when there was no Slam", () => {
    const g = slammed();
    const w = send(g, 1, { t: "tvKnock", times: [0, 10_000] });
    expect(w.r.out.find((o) => o.to === "seat" && o.msg.t === "tvKnockResult")).toMatchObject({ seat: 1, msg: { outcome: "wrong", heard: "You knocked 1, 1." } });
    expect(w.s.helpOwed ?? []).toEqual([]);
    expect(w.s.tvKnock?.answeredBy).toBeNull();
    expect(send(game(1), 1, { t: "tvKnock", times: [0, 300] }).r.refused).toBe("no_tv_knock");
    expect(send(g, 1, { t: "tvKnock", times: [] }).r.refused).toBe("no_knocks");
  });

  it("adds 10 seconds to the Help's Turn, once", () => {
    const g = slammed();
    const t0 = g.s.turnNo;
    const budgetOfNext = (knock: boolean): number => {
      const start = knock ? send(g, 2, { t: "tvKnock", times: knockPlayTimes(startTvKnock(slamFirstSeed, g.s.round)) }) : g;
      const next = advance(start, (s) => s.turn?.seat === 2 && s.turnNo > t0);
      expect(next.s.helpOwed ?? []).toEqual([]); // used up
      return next.s.turn!.clock.budgetMs as number;
    };
    expect(budgetOfNext(true) - budgetOfNext(false)).toBe(10_000);
  });
});

describe("the Slam messages on the socket (Requirement 5.3)", () => {
  const parse = (m: unknown) => parseClientMessage(JSON.stringify(m)).kind;
  it("takes `slam` as a choice and `tvKnock` as a message, and refuses bad ones", () => {
    expect(parse({ t: "choose", option: "slam" })).toBe("game");
    expect(parse({ t: "choose", option: "doom" })).toBe("bad");
    expect(parse({ t: "tvKnock", times: [0, 260] })).toBe("game");
    expect(parse({ t: "tvKnock", times: [-1] })).toBe("bad");
    expect(parse({ t: "tvKnock", times: Array.from({ length: 65 }, (_, i) => i) })).toBe("bad");
    expect(parse({ t: "tvKnock" })).toBe("bad");
    expect(parse({ t: "tvKnock", times: [1], extra: 1 })).toBe("bad");
  });
});
