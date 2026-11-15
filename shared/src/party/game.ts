import type { Card, Deal } from "./deal";
import type { Pool } from "./pool";
import type { Seat } from "./room";

/**
 * The game state the Room keeps (party-mode 4, first cut). It holds every secret: Hands, the Residue and where it is
 * hidden, the Solution, which card each Suggestion showed, and who sent each Frame, Rattle and Stitch clip. Only
 * `publicView` and `privateView` (views.ts) may read it on the way out. Later slices add turns, the clock and the Haunt.
 */
export type Phase = "playing" | "ended";
export type CueName = "creak" | "whisper" | "bell" | "laugh";

/** Everything that happened, with its secrets. Never sent as is. */
export type SecretEvent =
  | Readonly<{ id: number; kind: "suggest"; seat: Seat; zone: string; suspect: string; relic: string; refuter: Seat | null; shown: string | null }>
  | Readonly<{ id: number; kind: "inspect"; seat: Seat; zone: string; found: string | null }>
  /** The Room played a Cue on one seeded phone at a Haunt Event. */
  | Readonly<{ id: number; kind: "house-cue"; target: Seat; cue: CueName }>
  /** One Player played a Cue on another Player's phone. Looks exactly like a House Cue until the ending. */
  | Readonly<{ id: number; kind: "frame"; from: Seat; target: Seat; cue: CueName }>
  | Readonly<{ id: number; kind: "rattle"; from: Seat; target: Seat }>
  | Readonly<{ id: number; kind: "stitch"; from: Seat; clip: string }>
  | Readonly<{ id: number; kind: "accuse"; seat: Seat; right: boolean | null }>;

export type PlayerState = Readonly<{
  seat: Seat;
  nickname: string;
  bot: boolean;
  poltergeist: boolean;
  resolve: number;
  soundConsent: boolean;
  /** Cards other Players showed to this Player. */
  shownToMe: readonly string[];
  /** Residue cards this Player found by Inspect. */
  found: readonly string[];
}>;

export type GameState = Readonly<{
  phase: Phase;
  pool: Pool;
  deal: Deal;
  /** Zone id to the Residue card hidden there. */
  residueAt: Readonly<Record<string, string>>;
  players: readonly PlayerState[];
  log: readonly SecretEvent[];
}>;

export const handOf = (state: GameState, seat: Seat): readonly Card[] => state.deal.hands[seat] ?? [];
