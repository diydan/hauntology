import type { PublicSnapshot } from "../party/engine";
import type { SongKind, SongsSetting } from "./lyrics";

/**
 * Per-game Song planner (game-songs 2.5, Requirements 1.1, 1.2, 1.3, 1.4, 4.3).
 *
 * Kept outside `EngineState` so songs never alter any Engine rule state:
 * - Only asks when `setting === "on"`.
 * - At most 1 Moment Song per Round and at most 3 Moment Songs per game.
 * - Asks for the ending Ballad when `haunt.level >= 8`, at `lastRound`, or when the game ends.
 */
export const MAX_MOMENTS_PER_ROUND = 1;
export const MAX_MOMENTS_PER_GAME = 3;
export const BALLAD_HAUNT_TRIGGER = 8;

export type SongRequest = Readonly<{
  key: string;
  kind: SongKind;
  round: number;
}>;

export type SongPlanState = Readonly<{
  setting: SongsSetting;
  requestedKeys: readonly string[];
  momentCountGame: number;
  momentRounds: readonly number[];
  openingRequested: boolean;
  balladRequested: boolean;
  knownPoltergeists: readonly number[];
  knownAccuseEvents: readonly number[];
}>;

export function initialSongPlan(setting: SongsSetting = "off"): SongPlanState {
  return {
    setting,
    requestedKeys: [],
    momentCountGame: 0,
    momentRounds: [],
    openingRequested: false,
    balladRequested: false,
    knownPoltergeists: [],
    knownAccuseEvents: [],
  };
}

export function songRequests(
  view: PublicSnapshot,
  plan: SongPlanState,
  options: { lastRound?: number; joinedEvents?: readonly number[] } = {},
): { requests: readonly SongRequest[]; state: SongPlanState } {
  if (plan.setting !== "on") return { requests: [], state: plan };

  const requests: SongRequest[] = [];
  const requestedKeys = new Set(plan.requestedKeys);
  let openingRequested = plan.openingRequested;
  let balladRequested = plan.balladRequested;
  let momentCountGame = plan.momentCountGame;
  const momentRounds = new Set(plan.momentRounds);
  const knownPoltergeists = new Set(plan.knownPoltergeists);
  const knownAccuseEvents = new Set(plan.knownAccuseEvents);

  const tryMoment = (key: string, kind: Extract<SongKind, "joined" | "wrong_accuse" | "becoming" | "detectives_win" | "house_wins">): void => {
    if (requestedKeys.has(key)) return;
    if (momentCountGame >= MAX_MOMENTS_PER_GAME) return;
    if (momentRounds.has(view.round)) return;
    requestedKeys.add(key);
    momentRounds.add(view.round);
    momentCountGame += 1;
    requests.push({ key, kind, round: view.round });
  };

  if (!openingRequested && (view.phase === "lobby" || view.phase === "playing")) {
    const key = "opening";
    if (!requestedKeys.has(key)) {
      requestedKeys.add(key);
      openingRequested = true;
      requests.push({ key, kind: "opening", round: view.round });
    }
  }

  for (const s of view.seats) {
    if (s.poltergeist && !knownPoltergeists.has(s.seat)) {
      knownPoltergeists.add(s.seat);
      tryMoment(`becoming-${s.seat}`, "becoming");
    }
  }

  for (const e of view.events) {
    if (e.kind === "accuse" && !e.right && !knownAccuseEvents.has(e.id)) {
      knownAccuseEvents.add(e.id);
      tryMoment(`wrong_accuse-${e.id}`, "wrong_accuse");
    }
  }

  for (const seat of options.joinedEvents ?? []) {
    tryMoment(`joined-${seat}`, "joined");
  }

  if (view.phase === "ended" && view.ending !== null) {
    tryMoment(
      view.ending.houseWins ? "house_wins" : "detectives_win",
      view.ending.houseWins ? "house_wins" : "detectives_win",
    );
  }

  const balladDue =
    view.haunt.level >= BALLAD_HAUNT_TRIGGER ||
    view.phase === "ended" ||
    (options.lastRound !== undefined && view.round >= options.lastRound);

  if (!balladRequested && balladDue) {
    balladRequested = true;
    requestedKeys.add("ballad");
    requests.push({ key: "ballad", kind: "ballad", round: view.round });
  }

  return {
    requests,
    state: {
      setting: plan.setting,
      requestedKeys: [...requestedKeys],
      momentCountGame,
      momentRounds: [...momentRounds],
      openingRequested,
      balladRequested,
      knownPoltergeists: [...knownPoltergeists],
      knownAccuseEvents: [...knownAccuseEvents],
    },
  };
}
