import { hash, mulberry32, randInt, shuffle } from "../puzzles/rng";

/**
 * The Haunt (party-mode 11.1, 11.2). Levels 3, 6 and 9 each fire one Haunt Event, once, below the maximum, with two
 * different options. The Poltergeists choose, in the order they joined; with none, or no choice in 15 seconds, the
 * first option applies. A rise never ends the game; only `roundEnd` does (accuse.ts).
 */
export const HAUNT_OPTIONS = ["cold-spot", "blackout", "restless", "lull"] as const;
/** The Slam (knock-door Requirement 5) is not in `HAUNT_OPTIONS`: it is offered only at `SLAM_LEVEL`, and only when a door can be shut. */
export const SLAM_OPTION = "slam" as const;
export type HauntOption = (typeof HAUNT_OPTIONS)[number] | typeof SLAM_OPTION;
export const THRESHOLDS = [3, 6, 9] as const;
export type Threshold = (typeof THRESHOLDS)[number];
export const SLAM_LEVEL: Threshold = 6;
export const CHOICE_MS = 15_000;

export type Pending = Readonly<{ level: Threshold; options: readonly [HauntOption, HauntOption]; chooser: number | null; deadlineMs: number }>;
export type Haunt = Readonly<{
  level: number;
  max: number;
  fired: readonly Threshold[];
  pending: Pending | null;
  coldSpot: Readonly<{ zone: string; untilRound: number }> | null;
  blackoutNext: boolean;
}>;
export type HauntPoltergeist = Readonly<{ seat: number; bot: boolean; joinedRound: number }>;

/** Two different options for a threshold, from the seeded stream. */
export function eventOptions(seed: number, level: Threshold): readonly [HauntOption, HauntOption] {
  const [a, b] = shuffle(mulberry32(hash("haunt-event", seed, level)), HAUNT_OPTIONS);
  return [a as HauntOption, b as HauntOption];
}

/** The options when a Slam is offered: the first ordinary option and the Slam, in an order from their own seeded stream (so the Slam is sometimes the one that applies by default). */
export function slamOptions(seed: number, level: Threshold): readonly [HauntOption, HauntOption] {
  const [ordinary] = eventOptions(seed, level);
  const [a, b] = shuffle(mulberry32(hash("haunt-slam", seed, level)), [ordinary, SLAM_OPTION] as readonly HauntOption[]);
  return [a as HauntOption, b as HauntOption];
}

/** Who chooses the k-th Haunt Event: human Poltergeists in the order they joined (then by seat), in turn; null if none. */
export function chooserFor(polts: readonly HauntPoltergeist[], eventsChosenSoFar: number): number | null {
  const order = polts.filter((p) => !p.bot).sort((a, b) => a.joinedRound - b.joinedRound || a.seat - b.seat);
  return order.length === 0 ? null : (order[eventsChosenSoFar % order.length] as HauntPoltergeist).seat;
}

/**
 * After a rise: fire the lowest threshold now reached that has not fired and is below the maximum. `slam` says a door can
 * be shut now (the caller checks puzzles, the Gentle preset and the doors); at `SLAM_LEVEL` the Slam then takes the place of the second option.
 */
export function fireEvent(h: Haunt, seed: number, chooser: number | null, nowMs: number, slam = false): Haunt {
  if (h.pending !== null) return h;
  const t = THRESHOLDS.find((x) => h.level >= x && x < h.max && !h.fired.includes(x));
  if (t === undefined) return h;
  const options = slam && t === SLAM_LEVEL ? slamOptions(seed, t) : eventOptions(seed, t);
  return { ...h, fired: [...h.fired, t], pending: { level: t, options, chooser, deadlineMs: nowMs + CHOICE_MS } };
}

/** A choice is accepted only from the chooser, only for one of the two options, before the deadline. */
export function chooseOption(h: Haunt, seat: number, option: HauntOption, nowMs: number): HauntOption | null {
  const p = h.pending;
  if (p === null || p.chooser !== seat || nowMs > p.deadlineMs || !p.options.includes(option)) return null;
  return option;
}

/** The option that applies when the deadline passes or nobody can choose. */
export const defaultOption = (p: Pending): HauntOption => p.options[0];

/**
 * Apply the chosen option and clear the pending event. Cold Spot: a seeded Zone, until the end of the next Round.
 * Blackout: the next Turn is shorter (turnBudget). Restless: no rule. Lull: one level down, never below 0.
 */
export function applyEvent(h: Haunt, option: HauntOption, zoneIds: readonly string[], round: number, seed: number): Haunt {
  const base = { ...h, pending: null };
  switch (option) {
    case "cold-spot": return { ...base, coldSpot: { zone: zoneIds[randInt(mulberry32(hash("cold-spot", seed, round)), zoneIds.length)] as string, untilRound: round + 1 } };
    case "blackout": return { ...base, blackoutNext: true };
    case "restless": return base;
    case "lull": return { ...base, level: Math.max(0, h.level - 1) };
    case "slam": return base; // the Engine shuts the door and knocks at the TV (knock-door 5.2, 5.3)
  }
}

/** The Zone under a Cold Spot in this Round, or null. */
export const coldSpotIn = (h: Haunt, round: number): string | null => (h.coldSpot !== null && round <= h.coldSpot.untilRound ? h.coldSpot.zone : null);
/** Use up a Blackout: true for the next Turn only. */
export const takeBlackout = (h: Haunt): { haunt: Haunt; blackout: boolean } => ({ haunt: { ...h, blackoutNext: false }, blackout: h.blackoutNext });
