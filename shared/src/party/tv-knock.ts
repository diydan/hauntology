import { knockPlayTimes } from "../puzzles/knock";

/**
 * What the TV does for the ghost's knock after a Slam (knock-door 5.3, 8.2): plays the pattern with the `knock` sound, once for the Round,
 * and says in words that it is knocking and who knocked it back, never the pattern itself (Players listen, and knock back on their phones).
 * Pure; it reads only the Public View's `tvKnock`, which is public because every Player hears it.
 */
export type PublicTvKnock = Readonly<{ groups: readonly number[]; long: number | null; answeredBy: number | null }>;
export type KnockCue = Readonly<{ id: string; atMs: number }>;

/** The first knock is this long after the TV learns of it, so a phone that is a little late still hears the start. */
export const TV_KNOCK_LEAD_MS = 500;
/** No knock is scheduled further ahead than this (the sound player drops a cue later than 10 s). */
export const TV_KNOCK_MAX_MS = 9000;

export function tvKnockCues(round: number, tv: PublicTvKnock | null | undefined, nowMs: number): KnockCue[] {
  if (tv === null || tv === undefined || tv.answeredBy !== null) return [];
  return knockPlayTimes(tv)
    .map((t, i) => ({ id: `tv-knock-${round}-${i}`, atMs: nowMs + TV_KNOCK_LEAD_MS + t }))
    .filter((c) => c.atMs - nowMs <= TV_KNOCK_MAX_MS);
}

/** The words for the screen and the live region; "" when there is no knock. A knock is never described by its pattern. */
export function tvKnockWords(tv: PublicTvKnock | null | undefined, nicknameOf: (seat: number) => string | null): string {
  if (tv === null || tv === undefined) return "";
  if (tv.answeredBy === null) return "The ghost is knocking at the TV. Listen, then knock it back on your phone.";
  const who = nicknameOf(tv.answeredBy);
  return who === null ? "Someone knocked it back." : `${who} knocked it back.`;
}
