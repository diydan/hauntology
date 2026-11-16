import { hash, mulberry32, randInt } from "../puzzles/rng";

/**
 * Resolve and Eavesdrop (party-mode 11.4, 11.5, 12.2). Resolve is 0 to 3, one more for every Player at the start of
 * every Round, Poltergeists included, and is shared with Nudges. Eavesdrop costs one: within 10 seconds of another
 * Player's resolved Suggestion, a Detective who is neither the suggester nor the one who showed learns one named card
 * that was not the card shown.
 */
export const RESOLVE_MAX = 3;
export const EAVESDROP_MS = 10_000;

export const gainResolve = (r: number): number => Math.min(RESOLVE_MAX, Math.max(0, r) + 1);
export const spendResolve = (r: number, cost: number): number | null => (r >= cost ? r - cost : null);

export type EavesdropWindow = Readonly<{ eventId: number; suggester: number; refuter: number; named: readonly string[]; shown: string; untilMs: number }>;
export type EavesdropRefusal = "eavesdrop_denied";

export function canEavesdrop(w: EavesdropWindow | null, seat: number, poltergeist: boolean, resolve: number, nowMs: number, alreadyHeard: boolean): boolean {
  return w !== null && !poltergeist && resolve >= 1 && nowMs <= w.untilMs && seat !== w.suggester && seat !== w.refuter && !alreadyHeard;
}

/** The card heard: one of the named cards that was not shown, chosen from the seed. Never the shown card. */
export function eavesdrop(w: EavesdropWindow, seat: number, seed: number): string {
  const others = w.named.filter((c) => c !== w.shown);
  return others[randInt(mulberry32(hash("eavesdrop", seed, w.eventId, seat)), others.length)] as string;
}
