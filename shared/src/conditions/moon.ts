import { MOON_PHASES, type MoonPhase } from "./types";

/**
 * `moon.ts` (conditions 2.8, Requirement 2.6): the name of the moon's phase from the date alone, with no service. Julian date from the UTC instant; the age is
 * the days since a reference new moon (JD 2451550.1, the new moon of 6 January 2000) modulo the mean month; the phase is the age's eighth, rounded to the nearest.
 * Accurate to about a day, which is fine for naming a phase.
 */
export const SYNODIC_MONTH_DAYS = 29.530588853;
const REFERENCE_NEW_MOON_JD = 2451550.1;
const UNIX_EPOCH_JD = 2440587.5;
const DAY_MS = 86_400_000;

/** Days since the last mean new moon, from 0 up to (not including) the mean month. An instant that is not a real time is the age of the epoch's own, so the result is still a number. */
export function moonAge(instantMs: number): number {
  const ms = Number.isFinite(instantMs) ? instantMs : 0;
  const jd = ms / DAY_MS + UNIX_EPOCH_JD;
  const age = (jd - REFERENCE_NEW_MOON_JD) % SYNODIC_MONTH_DAYS;
  return age < 0 ? age + SYNODIC_MONTH_DAYS : age;
}

/** Exactly one of the eight phases, in order from the new moon. */
export function moonPhase(instantMs: number): MoonPhase {
  const index = Math.floor((moonAge(instantMs) / SYNODIC_MONTH_DAYS) * 8 + 0.5) % 8;
  return MOON_PHASES[index] as MoonPhase;
}
