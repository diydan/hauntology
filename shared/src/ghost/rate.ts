/** At most one turn in this long per Session (Requirement 2.2). */
export const TURN_GAP_MS = 1500;

/**
 * Whether a turn arriving at `now` is taken, given when the last one was (`null` for none yet). A turn 1.5 seconds or more after
 * the last one taken is taken; one sooner, or one that arrives before the last (a clock that went back), is not. Pure: the clock is the caller's.
 */
export function acceptTurn(lastAcceptedAt: number | null, now: number): boolean {
  if (!Number.isFinite(now)) return false;
  if (lastAcceptedAt === null) return true;
  return now - lastAcceptedAt >= TURN_GAP_MS;
}

/** How long to wait, in milliseconds, before a turn would be taken. */
export const retryAfterMs = (lastAcceptedAt: number | null, now: number): number =>
  lastAcceptedAt === null || !Number.isFinite(now) ? 0 : Math.max(0, Math.ceil(lastAcceptedAt + TURN_GAP_MS - now));
