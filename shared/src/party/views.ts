import type { Card, Solution } from "./deal";
import { handOf, type CueName, type GameState, type SecretEvent } from "./game";
import type { Seat } from "./room";

/**
 * The only two ways out of the Room (party-mode 4.2). The Public View goes to the Host, the Display and every phone;
 * a Private View goes to one phone. Nothing else crosses the boundary.
 */

/** Public events are new objects built from the secret ones, never the secret ones with fields deleted. */
export type PublicEvent =
  | Readonly<{ id: number; kind: "suggest"; seat: Seat; zone: string; suspect: string; relic: string; refuter: Seat | null }>
  | Readonly<{ id: number; kind: "inspect"; seat: Seat; zone: string }>
  /** A House Cue and a Frame make the very same public event: nobody can tell them apart until the ending. */
  | Readonly<{ id: number; kind: "phone-cue"; target: Seat; cue: CueName }>
  | Readonly<{ id: number; kind: "rattle"; target: Seat }>
  | Readonly<{ id: number; kind: "stitch" }>
  | Readonly<{ id: number; kind: "accuse"; seat: Seat; right: boolean | null }>;

export type PublicPlayer = Readonly<{ seat: Seat; nickname: string; bot: boolean; poltergeist: boolean; handSize: number }>;
/** What the ending adds: the answer, where the Residue was, and who sent every Frame, Rattle and Stitch clip. */
export type Ending = Readonly<{
  solution: Solution;
  residueAt: Readonly<Record<string, string>>;
  sources: readonly Readonly<{ eventId: number; kind: "house-cue" | "frame" | "rattle" | "stitch"; from: Seat | null }>[];
}>;
export type PublicView = Readonly<{
  phase: GameState["phase"];
  suspects: readonly Readonly<{ id: string; profileId: string }>[];
  zones: readonly Readonly<{ id: string; name: string }>[];
  relics: readonly Readonly<{ id: string; name: string }>[];
  players: readonly PublicPlayer[];
  events: readonly PublicEvent[];
  ending: Ending | null;
}>;
export type PrivateView = Readonly<{
  seat: Seat;
  hand: readonly Card[];
  shownToMe: readonly string[];
  found: readonly string[];
  resolve: number;
  soundConsent: boolean;
}>;

export function publicEvent(e: SecretEvent): PublicEvent {
  switch (e.kind) {
    case "suggest": return { id: e.id, kind: "suggest", seat: e.seat, zone: e.zone, suspect: e.suspect, relic: e.relic, refuter: e.refuter };
    case "inspect": return { id: e.id, kind: "inspect", seat: e.seat, zone: e.zone };
    case "house-cue": case "frame": return { id: e.id, kind: "phone-cue", target: e.target, cue: e.cue };
    case "rattle": return { id: e.id, kind: "rattle", target: e.target };
    case "stitch": return { id: e.id, kind: "stitch" };
    case "accuse": return { id: e.id, kind: "accuse", seat: e.seat, right: e.right };
  }
}

function ending(state: GameState): Ending {
  const sources = state.log.flatMap((e): Ending["sources"][number][] => {
    if (e.kind === "house-cue") return [{ eventId: e.id, kind: e.kind, from: null }];
    if (e.kind === "frame" || e.kind === "rattle" || e.kind === "stitch") return [{ eventId: e.id, kind: e.kind, from: e.from }];
    return [];
  });
  return { solution: { ...state.deal.solution }, residueAt: { ...state.residueAt }, sources };
}

export function publicView(state: GameState): PublicView {
  return {
    phase: state.phase,
    suspects: state.pool.suspects.map((s) => ({ id: s.id, profileId: s.profileId })),
    zones: state.pool.zones.map((z) => ({ id: z.id, name: z.name })),
    relics: state.pool.relics.map((r) => ({ id: r.id, name: r.name })),
    players: state.players.map((p) => ({ seat: p.seat, nickname: p.nickname, bot: p.bot, poltergeist: p.poltergeist, handSize: handOf(state, p.seat).length })),
    events: state.log.map(publicEvent),
    ending: state.phase === "ended" ? ending(state) : null,
  };
}

/** One Player's own secrets: their Hand, what was shown to them, the Residue they found, their Resolve and sound choice. */
export function privateView(state: GameState, seat: Seat): PrivateView | null {
  const p = state.players.find((x) => x.seat === seat);
  if (!p) return null;
  return { seat, hand: handOf(state, seat).map((c) => ({ ...c })), shownToMe: [...p.shownToMe], found: [...p.found], resolve: p.resolve, soundConsent: p.soundConsent };
}
