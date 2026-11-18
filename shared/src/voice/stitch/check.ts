import { CLIP_MAX_RETRIES, STITCH_PLAYER_CHECKS, STITCH_ROOM_CHECKS } from "../limits";
import { consentEffective, type StitchConsent } from "./consent";

/**
 * Stitch Word Check rules (ghost-voice 5.5, Requirement 5.2).
 *
 * `heardWord` lowercases the transcript and removes everything except letters and apostrophes
 * inside words; only an exact match of that single asked word passes. Caps: 3 attempts (initial +
 * 2 retries) per (seat, word), 30 per seat, 120 per room, and denied tickets spend no check.
 */
export type ChecksState = {
  room: number;
  perSeat: Record<number, number>;
  attempts: Record<string, number>;
  accepted: string[];
};

export function emptyChecksState(): ChecksState {
  return { room: 0, perSeat: {}, attempts: {}, accepted: [] };
}

function normaliseWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\s']/gu, " ")
    .replace(/(^|\s)'+|'+(\s|$)/gu, "$1$2")
    .trim();
}

export function heardWord(transcript: string, asked: string): boolean {
  const cleanAsked = normaliseWord(asked);
  if (cleanAsked === "" || /\s/.test(cleanAsked)) return false;
  return normaliseWord(transcript) === cleanAsked;
}

const pairKey = (seat: number, word: string): string => `${seat}:${word}`;

export function canCheck(
  state: { enabled: boolean; consents: readonly StitchConsent[]; checks: ChecksState },
  seat: number,
  word: string,
): boolean {
  if (!state.enabled) return false;
  const consent = state.consents.find((c) => c.seat === seat);
  if (!consentEffective(consent)) return false;
  if (state.checks.room >= STITCH_ROOM_CHECKS) return false;
  if ((state.checks.perSeat[seat] ?? 0) >= STITCH_PLAYER_CHECKS) return false;
  const key = pairKey(seat, word);
  if (state.checks.accepted.includes(key)) return false;
  if ((state.checks.attempts[key] ?? 0) >= CLIP_MAX_RETRIES + 1) return false;
  return true;
}

export function recordCheck(
  checks: ChecksState,
  seat: number,
  word: string,
  accepted: boolean,
  ticketGranted: boolean,
): ChecksState {
  if (!ticketGranted) return checks;
  const key = pairKey(seat, word);
  return {
    room: checks.room + 1,
    perSeat: { ...checks.perSeat, [seat]: (checks.perSeat[seat] ?? 0) + 1 },
    attempts: { ...checks.attempts, [key]: (checks.attempts[key] ?? 0) + 1 },
    accepted: accepted && !checks.accepted.includes(key) ? [...checks.accepted, key] : checks.accepted,
  };
}
