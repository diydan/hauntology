import type { SpendTicket } from "@hauntology/shared/world/spend";
import type { Ingestor, UpstreamFailure, WorldLabsPort } from "../worlds/ports";
import { assertTicket } from "./ticket";

/**
 * The only door to the world service (`.kiro/steering/security-and-cost.md`: paid calls live under `api/src/guarded/`).
 * Each function takes a Ticket for the `world` meter and refuses to call without one, so no code path can spend
 * without a reservation from `SpendGuard`. A Ticket from another meter, or one that is not a Ticket, is refused.
 */

export { NoTicketError } from "./ticket";

const assertWorldTicket = (ticket: SpendTicket): void => assertTicket(ticket, "world");

export function generateWorld(upstream: WorldLabsPort, ticket: SpendTicket, req: Parameters<WorldLabsPort["generate"]>[0]): ReturnType<WorldLabsPort["generate"]> {
  assertWorldTicket(ticket);
  return upstream.generate(req);
}

export function pollWorld(upstream: WorldLabsPort, ticket: SpendTicket, operationId: string): ReturnType<WorldLabsPort["poll"]> {
  assertWorldTicket(ticket);
  return upstream.poll(operationId);
}

export function ingestWorld(ingestor: Ingestor, ticket: SpendTicket, job: Parameters<Ingestor["ingest"]>[0]): ReturnType<Ingestor["ingest"]> {
  assertWorldTicket(ticket);
  return ingestor.ingest(job);
}

/** A failure the job reads as a transient fault: used when a port throws. */
export const THROWN: UpstreamFailure = { ok: false, kind: "transient" };
