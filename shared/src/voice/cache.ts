/**
 * How long a cached clip may be served (ghost-voice design, "Speech cache"). Pure: the caller passes the clock.
 *
 * The cache keys themselves are in `key.ts`. An R2 lifecycle rule deletes objects under `speech/v1/` after 60 days (never under
 * `speech/lib/v1/`, the Library), and the read path also checks `cacheFresh`, so a late lifecycle run never serves old audio.
 */

/** 60 days. */
export const CACHE_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

/** `now - storedAt < 60 days`. A time that is not a finite number is never fresh, so a damaged record is a miss. */
export function cacheFresh(storedAt: number, now: number): boolean {
  return Number.isFinite(storedAt) && Number.isFinite(now) && now - storedAt < CACHE_MAX_AGE_MS;
}
