/**
 * What the world routes need from `SpendGuard` (world-pipeline design, task 4.1). The Durable Object that
 * implements this is not built yet; the routes use this interface and tests use a counter that follows it.
 */

export const METERS = ["world", "image", "llm", "tts", "stt", "live"] as const;
export type Meter = (typeof METERS)[number];

export type SpendTicket = { id: string; meter: Meter; sessionId: string; issuedAt: number };

/** Why a reservation was refused. `killed` is the kill switch or an upstream out-of-credits answer. */
export type DenyReason = "session" | "day" | "total" | "killed";
export type ReserveResult = { ok: true; ticket: SpendTicket } | { ok: false; reason: DenyReason };

/** Remaining units per meter for one Session, and nothing about anyone else (Requirement 5.7). */
export type Remaining = Record<Meter, number>;

export interface SpendGuard {
  /** Takes one unit from the meter, or says why not. Nothing is taken when it says no. */
  reserve(req: { meter: Meter; sessionId: string; ipHash: string; now: number }): Promise<ReserveResult>;
  /** The work succeeded: the unit stays used. Repeating it changes nothing. */
  commit(ticket: SpendTicket): Promise<void>;
  /** The work failed or was cancelled: the unit comes back. Repeating it changes nothing. */
  release(ticket: SpendTicket): Promise<void>;
  remaining(sessionId: string, ipHash: string): Promise<Remaining>;
}
