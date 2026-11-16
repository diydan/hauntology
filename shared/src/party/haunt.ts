import { hash, mulberry32, randInt, shuffle } from "../puzzles/rng";

/**
 * The Haunt (party-mode 11.1, 11.2). Levels 3, 6 and 9 each fire one Haunt Event, once, below the maximum, with two
 * different options. The Poltergeists choose, in the order they joined; with none, or no choice in 15 seconds, the
 * first option applies. A rise never ends the game; only `roundEnd` does (accuse.ts).
 */
export const HAUNT_OPTIONS = ["cold-spot", "blackout", "restless", "lull"] as const;
export type HauntOption = (typeof HAUNT_OPTIONS)[number];
export const THRESHOLDS = [3, 6, 9] as const;
export type Threshold = (typeof THRESHOLDS)[number];
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

/** Who chooses the k-th Haunt Event: human Poltergeists in the order they joined (then by seat), in turn; null if none. */
export function chooserFor(polts: readonly HauntPoltergeist[], eventsChosenSoFar: number): number | null {
  const order = polts.filter((p) => !p.bot).sort((a, b) => a.joinedRound - b.joinedRound || a.seat - b.seat);
  return order.length === 0 ? null : (order[eventsChosenSoFar % order.length] as HauntPoltergeist).seat;
}

/** After a rise: fire the lowest threshold now reached that has not fired and is below the maximum. */
export function fireEvent(h: Haunt, seed: number, chooser: number | null, nowMs: number): Haunt {
  if (h.pending !== null) return h;
  const t = THRESHOLDS.find((x) => h.level >= x && x < h.max && !h.fired.includes(x));
  if (t === undefined) return h;
  return { ...h, fired: [...h.fired, t], pending: { level: t, options: eventOptions(seed, t), chooser, deadlineMs: nowMs + CHOICE_MS } };
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
  }
}

/** The Zone under a Cold Spot in this Round, or null. */
export const coldSpotIn = (h: Haunt, round: number): string | null => (h.coldSpot !== null && round <= h.coldSpot.untilRound ? h.coldSpot.zone : null);
/** Use up a Blackout: true for the next Turn only. */
export const takeBlackout = (h: Haunt): { haunt: Haunt; blackout: boolean } => ({ haunt: { ...h, blackoutNext: false }, blackout: h.blackoutNext });
