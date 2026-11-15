import { hash, mulberry32, randInt, shuffle } from "../puzzles/rng";
import type { Pool } from "./pool";

/**
 * The deal (party-mode 4.1): one Suspect, one Zone and one Relic make the Solution; three of the other 15 cards are
 * the Residue, hidden in the world; the last 12 are dealt round robin from a seed-chosen seat, so Hand sizes differ
 * by at most one. `seed` is a derived substream of the Room's secret seed, never the raw seed.
 */
export type CardKind = "suspect" | "zone" | "relic";
export type Card = Readonly<{ kind: CardKind; id: string }>;
export type Solution = Readonly<{ suspect: string; zone: string; relic: string }>;
export type Deal = Readonly<{ solution: Solution; residue: readonly Card[]; hands: Readonly<Record<number, readonly Card[]>> }>;

export const cardsOf = (pool: Pool): Card[] => [
  ...pool.suspects.map((s) => ({ kind: "suspect" as const, id: s.id })),
  ...pool.zones.map((z) => ({ kind: "zone" as const, id: z.id })),
  ...pool.relics.map((r) => ({ kind: "relic" as const, id: r.id })),
];

export function dealCase(pool: Pool, seats: readonly number[], seed: number): Deal {
  if (seats.length < 2 || seats.length > 6) throw new Error("dealCase needs two to six seats");
  const r = mulberry32(hash("deal", seed));
  const all = cardsOf(pool);
  const pick = (kind: CardKind): Card => shuffle(r, all.filter((c) => c.kind === kind))[0] as Card;
  const solution = { suspect: pick("suspect").id, zone: pick("zone").id, relic: pick("relic").id };
  const rest = shuffle(r, all.filter((c) => c.id !== solution.suspect && c.id !== solution.zone && c.id !== solution.relic));
  const residue = rest.slice(0, 3);
  const order = [...seats].sort((a, b) => a - b);
  const start = randInt(r, order.length);
  const hands: Record<number, Card[]> = Object.fromEntries(order.map((s) => [s, [] as Card[]]));
  rest.slice(3).forEach((card, i) => { (hands[order[(start + i) % order.length] as number] as Card[]).push(card); });
  return { solution, residue, hands };
}
