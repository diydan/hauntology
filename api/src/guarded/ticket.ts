import type { Meter, SpendTicket } from "@hauntology/shared/world/spend";

/** Thrown by a guarded call that is made without a Ticket for its meter. */
export class NoTicketError extends Error {
  constructor(meter: Meter = "world") {
    super(`a paid call needs a SpendTicket for the ${meter} meter`);
  }
}

/** Every paid call under `api/src/guarded/` starts here: it needs a Ticket from `SpendGuard` for its own meter, or it does not run. */
export function assertTicket(ticket: SpendTicket, meter: Meter): void {
  if (ticket === null || typeof ticket !== "object" || ticket.meter !== meter || typeof ticket.id !== "string" || ticket.id === "") throw new NoTicketError(meter);
}
