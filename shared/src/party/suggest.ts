import { hash, mulberry32, randInt } from "../puzzles/rng";
import type { Card } from "./deal";

/**
 * Suggestions (party-mode 6.1, 6.2, 6.7). The active Detective names a Suspect and a Relic for the Zone they stand in.
 * The other Players are checked clockwise; each who holds none of the three cards passes, and the first who holds one
 * shows one card, privately, to the suggester only. A Suggestion may name cards from the suggester's own Hand (a Bluff):
 * it is resolved by the other Hands only, and nothing public says it was a Bluff until the ending.
 */
export type Named = Readonly<{ zone: string; suspect: string; relic: string }>;

export type SuggestCheck = Readonly<{
  seat: number;
  activeSeat: number | null;
  poltergeist: boolean;
  /** The Zone the Player stands in, or null when in none. */
  inZone: string | null;
  /** The Zone under a Cold Spot, or null. */
  coldSpot: string | null;
  suggestedThisTurn: boolean;
}>;

/** Only the active Detective, inside a Zone with no Cold Spot, once per Turn (6.1). */
export const canSuggest = (c: SuggestCheck): boolean =>
  c.activeSeat === c.seat && !c.poltergeist && c.inZone !== null && c.inZone !== c.coldSpot && !c.suggestedThisTurn;

export type Resolution = Readonly<{ passed: readonly number[]; refuter: number | null; held: readonly string[] }>;

const namedIds = (n: Named): string[] => [n.suspect, n.zone, n.relic];

/** The other seats in order, clockwise from the one after the suggester, wrapping round. */
export function clockwiseFrom(seats: readonly number[], suggester: number): number[] {
  const ring = [...seats].sort((a, b) => a - b).filter((s) => s !== suggester);
  const after = ring.filter((s) => s > suggester);
  return [...after, ...ring.filter((s) => s < suggester)];
}

/**
 * Walk clockwise from the suggester. Everyone holding none of the three passes; the first holding at least one is the
 * refuter and the walk stops there. Poltergeists and Bots answer too (5.7). The suggester's own Hand is never looked at.
 */
export function resolveSuggestion(hands: Readonly<Record<number, readonly Card[]>>, seats: readonly number[], suggester: number, named: Named): Resolution {
  const ids = namedIds(named);
  const passed: number[] = [];
  for (const s of clockwiseFrom(seats, suggester)) {
    const held = (hands[s] ?? []).map((c) => c.id).filter((id) => ids.includes(id));
    if (held.length > 0) return { passed, refuter: s, held: [...new Set(held)] };
    passed.push(s);
  }
  return { passed, refuter: null, held: [] };
}

/** True when the refuter must choose: a human Detective holding more than one named card (6.2). */
export const needsChoice = (r: Resolution, refuterIsHumanDetective: boolean): boolean => r.refuter !== null && r.held.length > 1 && refuterIsHumanDetective;

/**
 * The card shown when there is no choice, or no choice in time: the only card held, else one already shown to this
 * suggester by this refuter, else one from the seed (6.2).
 */
export function defaultShown(held: readonly string[], alreadyShownToSuggester: readonly string[], seed: number, eventId: number): string | null {
  if (held.length === 0) return null;
  if (held.length === 1) return held[0] as string;
  const again = held.find((c) => alreadyShownToSuggester.includes(c));
  if (again !== undefined) return again;
  const sorted = [...held].sort();
  return sorted[randInt(mulberry32(hash("show", seed, eventId)), sorted.length)] as string;
}

/** The refuter's own choice: refused unless it is one of the named cards they hold. */
export const validShow = (held: readonly string[], card: string): boolean => held.includes(card);

/** A Bluff names a Suspect or a Relic from the suggester's own Hand (6.7). Known only to the Room until the ending. */
export const isBluff = (hand: readonly Card[], named: Pick<Named, "suspect" | "relic">): boolean =>
  hand.some((c) => c.id === named.suspect || c.id === named.relic);

/** The public event of a Suggestion: who suggested what, who passed and who showed. Never the card, never a Bluff mark. */
export const publicSuggestion = (id: number, seat: number, named: Named, r: Resolution) =>
  ({ id, kind: "suggest" as const, seat, zone: named.zone, suspect: named.suspect, relic: named.relic, passed: [...r.passed], refuter: r.refuter });
