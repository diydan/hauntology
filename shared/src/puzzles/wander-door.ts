/**
 * The Wander door (knock-door spec, Requirement 6): a walk may have ONE door on the way to a memory. It is a Knock door
 * (the ghost's secret knock) or a Heavy door that asks for one Player, so a single visitor can always open it. Skip is
 * always there: no clock, no count of wrong tries, and it opens the door at once. Pure: the caller passes the session
 * seed, the memory's index, and the visitor's acts. Separate from the Wander Lock in `wander.ts`, which keeps its own rules.
 */
import { hash } from "./rng";
import { judgeKnock, readKnocks, type KnockPattern } from "./knock";
import { makeLock } from "./make";
import type { Level } from "./types";

/** How many memories a walk has at most before the door is placed: the door sits on one of the first `WINDOW` memories. */
export const WANDER_DOOR_WINDOW = 3;
export const WANDER_DOOR_LOCKS = ["knock", "heavy"] as const;
export type WanderDoorLock = (typeof WANDER_DOOR_LOCKS)[number];

/** The door in front of one memory. A heavy door always asks for one Player (Requirement 6.1). */
export type WanderDoor = Readonly<{ lock: WanderDoorLock; level: Level; seed: number; need: 1 }>;

/** Shown once the door is open: what opened it. `skip` is always possible. */
export type WanderDoorOpenedBy = "knock" | "push" | "skip";
export type WanderDoorState = Readonly<{ open: boolean; wrong: number; openedBy: WanderDoorOpenedBy | null }>;

export const startWanderDoor = (): WanderDoorState => ({ open: false, wrong: 0, openedBy: null });

/**
 * The door for the walk's memory `index`, or null. At most one door per walk: it sits on the memory at index
 * `hash(seed) % WANDER_DOOR_WINDOW`. `on` is the visitor's choice (off means no doors at all, and nothing changes).
 */
export function wanderDoorFor(sessionSeed: number, index: number, on: boolean, level: Level = "easy"): WanderDoor | null {
  if (!on || index !== hash("wander-door-at", sessionSeed) % WANDER_DOOR_WINDOW) return null;
  const lock: WanderDoorLock = hash("wander-door-lock", sessionSeed) % 2 === 0 ? "knock" : "heavy";
  return { lock, level, seed: hash("wander-door", sessionSeed, index), need: 1 };
}

/** The knock the door wants (a knock door only). */
function knockFor(door: WanderDoor): KnockPattern {
  const lock = makeLock("knock", door.level, door.seed);
  if (lock.kind !== "knock") throw new Error("knock lock expected");
  return lock.secret;
}

export type WanderDoorOutcome =
  | Readonly<{ ok: true; state: WanderDoorState; opened: boolean; line: string }>
  | Readonly<{ ok: false; code: "already_open" | "not_heavy" | "not_knock" }>;

const OPENED_LINE = "The door opens.";

/** Skip: always works, at once, and says the door opened (Requirement 6.2). Never refused, not even after wrong knocks. */
export function skipWanderDoor(state: WanderDoorState): WanderDoorOutcome {
  if (state.open) return { ok: false, code: "already_open" };
  return { ok: true, state: { ...state, open: true, openedBy: "skip" }, opened: true, line: OPENED_LINE };
}

/** One act on a heavy door. One Player is enough, so the first act opens it. */
export function pushWanderDoor(door: WanderDoor, state: WanderDoorState): WanderDoorOutcome {
  if (state.open) return { ok: false, code: "already_open" };
  if (door.lock !== "heavy") return { ok: false, code: "not_heavy" };
  return { ok: true, state: { ...state, open: true, openedBy: "push" }, opened: true, line: OPENED_LINE };
}

/** A knock on a knock door. The right knock opens it; a wrong one says what was heard and is never a trap, because Skip stays. */
export function knockWanderDoor(door: WanderDoor, state: WanderDoorState, times: readonly number[]): WanderDoorOutcome & { heard?: string } {
  if (state.open) return { ok: false, code: "already_open" };
  if (door.lock !== "knock") return { ok: false, code: "not_knock" };
  const judged = judgeKnock(knockFor(door), times);
  const heard = `You knocked ${readKnocks(times).groups.join(", ")}.`;
  if (judged.ok) return { ok: true, state: { ...state, open: true, openedBy: "knock" }, opened: true, line: OPENED_LINE, heard };
  return { ok: true, state: { ...state, wrong: state.wrong + 1 }, opened: false, line: `${heard} Not that one.`, heard };
}

/** The door in words, for the walk's live region: never the knock itself. */
export function wanderDoorLine(door: WanderDoor): string {
  return door.lock === "knock"
    ? "A door stands in the way. It opens to a secret knock. You can skip it."
    : "A door stands in the way. Push it, or skip it.";
}
