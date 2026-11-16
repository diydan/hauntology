import type { Lock, Sight } from "./types";

export const SIGHT_MS = 5000;
export const SIGHT_MS_ASSIST = 8000;
export const FADED_MS = 4000;
export const FADED_MS_ASSIST = 8000;

/** The clue a Memory Kind shows in an earlier place (once, then gone unless Assist keeps it). Null for other Kinds. */
export function sightFor(lock: Lock, assist = false): Sight | null {
  if (lock.sight === null) return null;
  return { kind: lock.kind, payload: lock.sight, showMs: assist ? SIGHT_MS_ASSIST : SIGHT_MS };
}

/** The same clue shown at the Lock when the Sight was missed: shorter, never different, so a missed Sight never blocks a Lock. */
export function fadedFor(lock: Lock, assist = false): Sight | null {
  if (lock.sight === null) return null;
  return { kind: lock.kind, payload: lock.sight, showMs: assist ? FADED_MS_ASSIST : FADED_MS };
}
