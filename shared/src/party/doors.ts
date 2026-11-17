import { hash } from "../puzzles/rng";
import { LEVELS, type Level } from "../puzzles/types";
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
