import type { SpendTicket } from "@hauntology/shared/world/spend";
import type { PlaceBriefer } from "../../worlds/ports";
import { assertTicket } from "../ticket";

/**
 * The only door to the Place Brief check (`.kiro/steering/security-and-cost.md`: a Workers AI call is made only from
 * `api/src/guarded/`). It needs a Ticket for the `llm` meter and refuses to call without one, so no path can spend without a
 * reservation from `SpendGuard`. A Ticket from another meter, or one that is not a Ticket, is refused.
 */
export function briefPlace(briefer: PlaceBriefer, ticket: SpendTicket, req: Parameters<PlaceBriefer["brief"]>[0]): ReturnType<PlaceBriefer["brief"]> {
  assertTicket(ticket, "llm");
  return briefer.brief(req);
}
