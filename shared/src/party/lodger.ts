import type { Rng } from "../puzzles/rng";
import type { PublicView } from "./views";
import { lodgerVoiceFor } from "../voice/voices";
import { CONFESSION_KINDS, PARTY_LINES, partyScripted, type PartyDirective } from "./narrate";

/**
 * The Lodger gives no tell (party-mode 7.9). A Lodger line is chosen from `(kind, rng)` alone: no Solution, no Hand and no
 * guilt flag is a parameter, and the six Suspects share one bank, so a guilty and an innocent Suspect read and sound the
 * same. Only the confession names guilt, and it is built only once the Solution is public, for the Suspect in it.
 */
export function lodgerLine(kind: PartyDirective, rng: Rng): string | null {
  if ((CONFESSION_KINDS as readonly string[]).includes(kind)) return null;
  return PARTY_LINES[kind]?.lodger === undefined ? null : partyScripted(kind, "lodger", rng);
}

export function confessionLine(view: Pick<PublicView, "ending">, suspectId: string, kind: "accuse-right" | "ended-solved", rng: Rng): string | null {
  if (view.ending === null || view.ending.solution.suspect !== suspectId) return null;
  return partyScripted(kind, "lodger", rng);
}

/** A Suspect's spoken voice is part of its profile, as public and as fixed as its portrait. */
export const lodgerVoiceOf = lodgerVoiceFor;
