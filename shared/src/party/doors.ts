import { z } from "zod";
import { judgeKnock } from "../puzzles/knock";
import { makeLock } from "../puzzles/make";
import { hash } from "../puzzles/rng";
import { fadedFor, sightFor } from "../puzzles/sight";
import { LEVELS, type Level, type Sight } from "../puzzles/types";
import type { Point } from "./zones";

/**
 * Doors between Zones (knock-door spec). A world may list up to three doors. A shut door blocks the way and keeps the
 * Zone behind it closed; a `knock` door opens to the ghost's secret knock, a `heavy` door when two or three Players act
 * together. Doors never touch a card, the Solution, the Turn order or the winners: they only decide which Zones can be
 * reached. Pure: no clock (the caller passes `nowMs` and the Round), no randomness beyond a seed.
 */
export const MAX_DOORS = 3;
export const DOOR_WIDTH_MIN = 0.9;
export const DOOR_WIDTH_MAX = 1.6;
export const DOOR_LOCKS = ["knock", "heavy"] as const;
export type DoorLock = (typeof DOOR_LOCKS)[number];
/** How many Players a heavy door may ask for. */
export const HEAVY_NEEDS = [2, 3] as const;
export const MAX_HEAVY_NEED = 3;
/** Players act "together" when their acts fall inside this window (the 2 seconds of puzzles Requirement 25.1). */
export const ACT_WINDOW_MS = 2000;
/** A knock door gives three tries a Turn, like every Lock (puzzles Requirement 2). */
export const KNOCK_TRIES = 3;
export const DOOR_ID_PATTERN = /^[a-z][a-z0-9-]{0,15}$/;
/** The most recent acts kept for one door (a Player counts once, so a handful is plenty). */
const MAX_STORED_ACTS = 12;

/** A door as a world lists it. `need` is for heavy doors only. */
export type Door = Readonly<{ id: string; at: Point; width: number; a: string; b: string; lock: DoorLock; need?: number }>;
/** A way between two Zones that has no door (open ground). */
export type Passage = readonly [string, string];

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Zone ids joined by open ground and by doors taken as open, starting from `home`. */
function connected(zoneIds: readonly string[], edges: readonly Passage[], home: string): Set<string> {
  const seen = new Set<string>();
  if (!zoneIds.includes(home)) return seen;
  seen.add(home);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [x, y] of edges) {
      if (!zoneIds.includes(x) || !zoneIds.includes(y)) continue;
      if (seen.has(x) !== seen.has(y)) { seen.add(x); seen.add(y); grew = true; }
    }
  }
  return seen;
}

/**
 * The reasons a list of doors fails, empty when it passes. A world with no doors always passes. `passages` are the open
 * ways between Zones; every Zone must be reachable from `home` through passages and doors (taken as open), so a door can
 * never cut a Zone off for good.
 */
export function doorProblems(doors: readonly Door[], zoneIds: readonly string[], passages: readonly Passage[], home: string): string[] {
  if (doors.length === 0) return [];
  const out: string[] = [];
  if (doors.length > MAX_DOORS) out.push("count");
  const ids = new Set<string>();
  doors.forEach((d, i) => {
    if (!DOOR_ID_PATTERN.test(d.id)) out.push(`${i}:id`);
    if (ids.has(d.id)) out.push(`${i}:id_dup`);
    ids.add(d.id);
    if (!finite(d.at?.x) || !finite(d.at?.z)) out.push(`${i}:at`);
    if (!finite(d.width) || d.width < DOOR_WIDTH_MIN - 1e-9 || d.width > DOOR_WIDTH_MAX + 1e-9) out.push(`${i}:width`);
    if (!zoneIds.includes(d.a) || !zoneIds.includes(d.b)) out.push(`${i}:zone`);
    else if (d.a === d.b) out.push(`${i}:same_zone`);
    if (!(DOOR_LOCKS as readonly string[]).includes(d.lock)) out.push(`${i}:lock`);
    else if (d.lock === "heavy" ? !(HEAVY_NEEDS as readonly number[]).includes(d.need as number) : d.need !== undefined) out.push(`${i}:need`);
  });
  if (!zoneIds.includes(home)) { out.push("home"); return out; }
  const reached = connected(zoneIds, [...passages, ...doors.map((d): Passage => [d.a, d.b])], home);
  for (const z of zoneIds) if (!reached.has(z)) out.push(`cut_off:${z}`);
  return out;
}
export const validateDoors = (doors: readonly Door[], zoneIds: readonly string[], passages: readonly Passage[], home: string): boolean =>
  doorProblems(doors, zoneIds, passages, home).length === 0;

/**
 * What the Room remembers about one door. `opensAtRound` is the Round at whose start a shut door opens by itself (after a
 * failed knock, or a Slam), so a door never stays shut for good; `autoOpenedRound` is the Round it last did.
 */
export type DoorState = Readonly<{ id: string; open: boolean; opensAtRound: number | null; autoOpenedRound: number | null }>;

/** Every door starts shut when puzzles are on, and open (for good) when they are off. */
export const initialDoors = (doors: readonly Door[], puzzlesOn: boolean): DoorState[] =>
  doors.map((d) => ({ id: d.id, open: !puzzlesOn, opensAtRound: null, autoOpenedRound: null }));

const mapState = (states: readonly DoorState[], id: string, f: (s: DoorState) => DoorState): DoorState[] => states.map((s) => (s.id === id ? f(s) : s));

/** A Player opened it (the right knock, or enough Players together). */
export const openDoor = (states: readonly DoorState[], id: string): DoorState[] =>
  mapState(states, id, (s) => (s.open ? s : { ...s, open: true, opensAtRound: null }));

/** Three wrong tries in a Turn: the door opens by itself at the start of the next Round. A door already open stays so. */
export const failKnock = (states: readonly DoorState[], id: string, round: number): DoorState[] =>
  mapState(states, id, (s) => (s.open ? s : { ...s, opensAtRound: Math.min(s.opensAtRound ?? Infinity, round + 1) }));

/** A Haunt Slam: shut an open door, which then opens by itself at the start of the next Round. With puzzles off a door never shuts. */
export const shutDoor = (states: readonly DoorState[], id: string, round: number, puzzlesOn: boolean): DoorState[] =>
  mapState(states, id, (s) => (!puzzlesOn || !s.open ? s : { ...s, open: false, opensAtRound: round + 1 }));

/** The start of a Round: every shut door whose time has come opens by itself. */
export const tickRound = (states: readonly DoorState[], round: number): DoorState[] =>
  states.map((s) => (!s.open && s.opensAtRound !== null && s.opensAtRound <= round ? { ...s, open: true, opensAtRound: null, autoOpenedRound: round } : s));

/** The Zones a Player can reach from `home` with the doors as they stand now. A shut door cuts off only what lies behind it. */
export function reachableZones(zoneIds: readonly string[], doors: readonly Door[], states: readonly DoorState[], passages: readonly Passage[], home: string): string[] {
  const open = new Set(states.filter((s) => s.open).map((s) => s.id));
  const edges = [...passages, ...doors.filter((d) => open.has(d.id)).map((d): Passage => [d.a, d.b])];
  const reached = connected(zoneIds, edges, home);
  return zoneIds.filter((z) => reached.has(z));
}

/**
 * The Zones that lie behind a door: those a Player at `home` reaches with this door open but not with it shut, the other
 * doors as they stand. A Zone with another way in is not behind it. A Slam counts the Players in these Zones.
 */
export function zonesBehind(doorId: string, zoneIds: readonly string[], doors: readonly Door[], states: readonly DoorState[], passages: readonly Passage[], home: string): string[] {
  const withDoor = (open: boolean) => states.map((s) => (s.id === doorId ? { ...s, open } : s));
  const shut = new Set(reachableZones(zoneIds, doors, withDoor(false), passages, home));
  return reachableZones(zoneIds, doors, withDoor(true), passages, home).filter((z) => !shut.has(z));
}

/**
 * The lock of a knock door: its level and seed come from the Room seed and the door id and nothing else, so the server,
 * the clue and the Lock all agree, whatever order doors are listed in and however many there are.
 */
export function doorKnock(roomSeed: number, doorId: string): Readonly<{ level: Level; seed: number }> {
  return { level: LEVELS[hash("door-knock-level", roomSeed, doorId) % LEVELS.length] as Level, seed: hash("door-knock", roomSeed, doorId) };
}

/** How many Players a door asks for: 1 for a knock door; 2 or 3 for a heavy door, never more than are seated, never under 1. */
export function heavyNeed(door: Door, seated: number): number {
  if (door.lock !== "heavy") return 1;
  const want = finite(door.need) ? Math.trunc(door.need) : HEAVY_NEEDS[0];
  return Math.max(1, Math.min(want, MAX_HEAVY_NEED, Math.trunc(seated)));
}

export type DoorAct = Readonly<{ seat: number; atMs: number }>;

/** Acts still inside the window at `nowMs` (later than `nowMs - ACT_WINDOW_MS`, not in the future). */
export const liveActs = (acts: readonly DoorAct[], nowMs: number): DoorAct[] => acts.filter((a) => finite(a.atMs) && a.atMs <= nowMs && nowMs - a.atMs < ACT_WINDOW_MS);

/** How many different Players acted inside the window; one Player counts once however often they act. */
export const actCount = (acts: readonly DoorAct[], nowMs: number): number => new Set(liveActs(acts, nowMs).map((a) => a.seat)).size;

/** Whether enough different Players have acted together to open a heavy door. */
export const actsTogether = (acts: readonly DoorAct[], nowMs: number, need: number): boolean => actCount(acts, nowMs) >= Math.max(1, need);

/**
 * Whether a Haunt Slam may shut this door now: it is open, nobody stands behind it, and it did not just open by itself
 * this Round (so a door that stayed shut a whole Round is not shut again at once).
 */
export const canSlam = (state: DoorState, playersBehind: number, round: number): boolean =>
  state.open && playersBehind === 0 && state.autoOpenedRound !== round;

/** The doors a Slam may shut now. `behind` counts the Players on the far side of each door, by door id (missing counts as nobody). */
export const slamTargets = (states: readonly DoorState[], behind: Readonly<Record<string, number>>, round: number): string[] =>
  states.filter((s) => canSlam(s, behind[s.id] ?? 0, round)).map((s) => s.id);

// ---------------------------------------------------------------- the Room's door state (knock-door tasks 2.1 to 2.8)
/** The doors a world brings to a Room: the list, the open ground between Zones, and the Home Zone. */
export type DoorSetup = Readonly<{ doors: readonly Door[]; passages: readonly Passage[]; home: string }>;

/** What the Room keeps about its doors. `tries` are the wrong knocks this Turn; `heardBy` is who was given the ghost's knock, once per door. */
export type DoorsState = Readonly<{
  v: 1;
  doors: readonly Door[];
  passages: readonly Passage[];
  home: string;
  states: readonly DoorState[];
  acts: Readonly<Record<string, readonly DoorAct[]>>;
  tries: Readonly<Record<string, number>>;
  heardBy: Readonly<Record<string, number>>;
}>;

const PointSchema = z.object({ x: z.number().finite(), z: z.number().finite() }).strict();
const DoorSchema = z.object({
  id: z.string().regex(DOOR_ID_PATTERN), at: PointSchema, width: z.number().finite(), a: z.string().min(1).max(32), b: z.string().min(1).max(32),
  lock: z.enum(DOOR_LOCKS), need: z.number().int().optional(),
}).strict();
const ActsSchema = z.record(z.string().max(16), z.array(z.object({ seat: z.number().int().min(0).max(9), atMs: z.number().finite() }).strict()).max(MAX_STORED_ACTS));
export const DoorsStateSchema = z.object({
  v: z.literal(1),
  doors: z.array(DoorSchema).max(MAX_DOORS),
  passages: z.array(z.tuple([z.string().max(32), z.string().max(32)])).max(64),
  home: z.string().min(1).max(32),
  states: z.array(z.object({ id: z.string().regex(DOOR_ID_PATTERN), open: z.boolean(), opensAtRound: z.number().int().nullable(), autoOpenedRound: z.number().int().nullable() }).strict()).max(MAX_DOORS),
  acts: ActsSchema,
  tries: z.record(z.string().max(16), z.number().int().min(0).max(KNOCK_TRIES)),
  heardBy: z.record(z.string().max(16), z.number().int().min(0).max(9)),
}).strict();

/** The saved doors, or null for anything that is not valid, so the Room can fall back to the start (Requirement 8.1). Never throws. */
export function parseDoorsState(raw: unknown): DoorsState | null {
  const r = DoorsStateSchema.safeParse(raw);
  if (!r.success) return null;
  const d = r.data as DoorsState;
  const ids = d.doors.map((x) => x.id);
  return d.states.length === ids.length && d.states.every((s, i) => s.id === ids[i]) ? d : null;
}

/**
 * The doors a Room starts with: the world's doors checked with its Zones (Requirement 1.3, 1.4). A world with no doors gives
 * none and no problems; a world whose doors fail gives none and the reasons, so the game still plays without them.
 */
export function setupDoors(setup: DoorSetup | null | undefined, zoneIds: readonly string[], puzzlesOn: boolean): Readonly<{ state: DoorsState | null; problems: string[] }> {
  if (setup === null || setup === undefined || setup.doors.length === 0) return { state: null, problems: [] };
  const problems = doorProblems(setup.doors, zoneIds, setup.passages, setup.home);
  if (problems.length > 0) return { state: null, problems };
  return { state: { v: 1, doors: setup.doors, passages: setup.passages, home: setup.home, states: initialDoors(setup.doors, puzzlesOn), acts: {}, tries: {}, heardBy: {} }, problems: [] };
}

const withoutKey = <T>(rec: Readonly<Record<string, T>>, key: string): Record<string, T> => Object.fromEntries(Object.entries(rec).filter(([k]) => k !== key));

/** The Zones no Player can reach from the Home Zone now. */
export const closedZones = (d: DoorsState, zoneIds: readonly string[]): string[] => {
  const open = new Set(reachableZones(zoneIds, d.doors, d.states, d.passages, d.home));
  return zoneIds.filter((z) => !open.has(z));
};

/** The start of a Turn: wrong knocks count per Turn. */
export const newTurnDoors = (d: DoorsState): DoorsState => (Object.keys(d.tries).length === 0 ? d : { ...d, tries: {} });

/** The start of a Round: doors that are due open by themselves. `opened` lists their ids. */
export function newRoundDoors(d: DoorsState, round: number): Readonly<{ state: DoorsState; opened: string[] }> {
  const states = tickRound(d.states, round);
  const opened = states.filter((s, i) => s.open && !(d.states[i] as DoorState).open).map((s) => s.id);
  return { state: opened.length === 0 ? d : { ...d, states }, opened };
}

const doorById = (d: DoorsState, id: string): Door | undefined => d.doors.find((x) => x.id === id);
const stateById = (d: DoorsState, id: string): DoorState | undefined => d.states.find((x) => x.id === id);

export type ActOutcome = Readonly<{ ok: false; code: "door_unknown" | "not_heavy" | "door_open" } | { ok: true; state: DoorsState; opened: boolean; need: number; have: number }>;

/** A Player acts on a heavy door. `seated` is how many Players are seated, so the door never asks for more. */
export function actOnDoor(d: DoorsState, doorId: string, seat: number, nowMs: number, seated: number): ActOutcome {
  const door = doorById(d, doorId);
  const st = stateById(d, doorId);
  if (door === undefined || st === undefined) return { ok: false, code: "door_unknown" };
  if (door.lock !== "heavy") return { ok: false, code: "not_heavy" };
  if (st.open) return { ok: false, code: "door_open" };
  const need = heavyNeed(door, seated);
  const acts = liveActs([...(d.acts[doorId] ?? []), { seat, atMs: nowMs }], nowMs).slice(-MAX_STORED_ACTS);
  if (actsTogether(acts, nowMs, need)) return { ok: true, state: { ...d, states: openDoor(d.states, doorId), acts: withoutKey(d.acts, doorId) }, opened: true, need, have: actCount(acts, nowMs) };
  return { ok: true, state: { ...d, acts: { ...d.acts, [doorId]: acts } }, opened: false, need, have: actCount(acts, nowMs) };
}

export type KnockOutcome = Readonly<{ ok: false; code: "door_unknown" | "not_knock" | "door_open" | "no_tries_left" | "no_knocks" }
  | { ok: true; state: DoorsState; outcome: "opened" | "wrong" | "failed"; heard: string; triesLeft: number }>;

/** The pattern a knock door wants, from the Room seed and the door id (never stored, never sent but as the Sight). */
function knockSecret(roomSeed: number, doorId: string): Readonly<{ groups: readonly number[]; long: number | null }> {
  const k = doorKnock(roomSeed, doorId);
  const lock = makeLock("knock", k.level, k.seed);
  if (lock.kind !== "knock") throw new Error("knock lock expected");
  return lock.secret;
}

/** A Detective's try at a knock door. Right opens it; three wrong tries in a Turn end the try for good and set the door to open next Round. */
export function knockOnDoor(d: DoorsState, doorId: string, times: readonly number[], round: number, roomSeed: number): KnockOutcome {
  const door = doorById(d, doorId);
  const st = stateById(d, doorId);
  if (door === undefined || st === undefined) return { ok: false, code: "door_unknown" };
  if (door.lock !== "knock") return { ok: false, code: "not_knock" };
  if (st.open) return { ok: false, code: "door_open" };
  const used = d.tries[doorId] ?? 0;
  if (used >= KNOCK_TRIES) return { ok: false, code: "no_tries_left" };
  if (times.filter((t) => Number.isFinite(t)).length === 0) return { ok: false, code: "no_knocks" };
  const j = judgeKnock(knockSecret(roomSeed, doorId), times);
  const heard = `You knocked ${j.heard.groups.join(", ")}.`;
  if (j.ok) return { ok: true, state: { ...d, states: openDoor(d.states, doorId), tries: withoutKey(d.tries, doorId) }, outcome: "opened", heard, triesLeft: KNOCK_TRIES - used };
  const tries = used + 1;
  const failed = tries >= KNOCK_TRIES;
  return { ok: true, state: { ...d, tries: { ...d.tries, [doorId]: tries }, states: failed ? failKnock(d.states, doorId, round) : d.states }, outcome: failed ? "failed" : "wrong", heard, triesLeft: KNOCK_TRIES - tries };
}

/** The Zone on the near side of a door: the one that is not behind it (the first, when both have another way in). */
export function nearZone(d: DoorsState, door: Door, zoneIds: readonly string[]): string {
  return zonesBehind(door.id, zoneIds, d.doors, d.states, d.passages, d.home).includes(door.a) ? door.b : door.a;
}

/** The ghost's knock for a door as a Sight, or null. Given once, to the first Player into the near Zone (Requirement 3.2). */
export function knockSightFor(roomSeed: number, doorId: string, faded = false): Sight | null {
  const k = doorKnock(roomSeed, doorId);
  const lock = makeLock("knock", k.level, k.seed);
  return faded ? fadedFor(lock) : sightFor(lock);
}

/** A Player walked into a Zone: the knock doors whose near Zone it is, still shut, not yet heard by anyone. */
export function knocksHeardOnEntry(d: DoorsState, zone: string, zoneIds: readonly string[]): string[] {
  return d.doors.filter((door) => door.lock === "knock" && d.heardBy[door.id] === undefined && stateById(d, door.id)?.open === false && nearZone(d, door, zoneIds) === zone).map((x) => x.id);
}
export const markHeard = (d: DoorsState, doorId: string, seat: number): DoorsState => ({ ...d, heardBy: { ...d.heardBy, [doorId]: seat } });

/** Why a door changed, told to every screen with the `door` message: a right knock, enough Players together, one more act toward it, its time, a Slam, or Skip in Wander. */
export type DoorReason = "knock" | "together" | "act" | "timeout" | "slam" | "skip";

/** One door as every screen sees it: never the pattern. `need` and `have` show a heavy door's count ("2 of 3"). */
export type PublicDoor = Readonly<{ id: string; at: Point; width: number; a: string; b: string; lock: DoorLock; open: boolean; need: number; have: number }>;
export function publicDoors(d: DoorsState, seated: number, nowMs: number): PublicDoor[] {
  return d.doors.map((door) => {
    const open = stateById(d, door.id)?.open ?? false;
    return { id: door.id, at: door.at, width: door.width, a: door.a, b: door.b, lock: door.lock, open, need: heavyNeed(door, seated), have: open || door.lock !== "heavy" ? 0 : actCount(d.acts[door.id] ?? [], nowMs) };
  });
}
