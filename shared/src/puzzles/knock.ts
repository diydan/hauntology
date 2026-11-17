/**
 * The Secret knock (puzzles Requirement 24): a door that opens only to the ghost's knock. Pure: no clock, no sensors.
 * A pattern is a few groups of knocks with pauses between them: [3, 2] is "knock knock knock, pause, knock knock".
 * On hard one pause is long, and the Player must keep it long. The lab page `tools/playtest/secret-knock.html` is the first try of this logic.
 */

/** Timing of the ghost's own knock when it is played, in ms. */
export const KNOCK_PLAY = Object.freeze({ inGroup: 260, pause: 900, longPause: 1900 });

/** How a Player's knocks are read: knocks closer than `groupGapMs` are one group; a pause of `longMs` or more is long; `quietMs` of quiet ends a try. */
export const KNOCK_READ = Object.freeze({ groupGapMs: 700, longMs: 1400, quietMs: 2200 });

/** A secret knock: the knock counts of its groups (1 to 4 each), and the index of the long pause (after that group), or null. */
export type KnockPattern = Readonly<{ groups: readonly number[]; long: number | null }>;

/** The times (ms from the first knock) at which the ghost's knock is played. */
export function knockPlayTimes(p: KnockPattern): number[] {
  const out: number[] = [];
  let t = 0;
  p.groups.forEach((g, i) => {
    for (let k = 0; k < g; k++) { out.push(t); t += KNOCK_PLAY.inGroup; }
    t += (p.long === i ? KNOCK_PLAY.longPause : KNOCK_PLAY.pause) - KNOCK_PLAY.inGroup;
  });
  return out;
}

/** The pattern in words, for the clue and for a screen reader: "3, pause, 2" or "2, pause, 1, long pause, 3". */
export function knockWords(p: KnockPattern): string {
  return p.groups.map((g, i) => (i < p.groups.length - 1 ? `${g}, ${p.long === i ? "long pause" : "pause"}` : `${g}`)).join(", ");
}

/** Read knock times into groups and the pauses between them. Times need not be sorted; anything not finite is dropped. */
export function readKnocks(times: readonly number[]): { groups: number[]; pauses: number[] } {
  const ts = times.filter((t) => Number.isFinite(t)).slice().sort((a, b) => a - b);
  const groups: number[] = [];
  const pauses: number[] = [];
  ts.forEach((t, i) => {
    const prev = ts[i - 1];
    if (prev === undefined || t - prev > KNOCK_READ.groupGapMs) {
      if (prev !== undefined) pauses.push(t - prev);
      groups.push(1);
    } else groups[groups.length - 1] = (groups[groups.length - 1] ?? 0) + 1;
  });
  return { groups, pauses };
}

export type KnockJudgement = Readonly<{ ok: boolean; reason: "ok" | "none" | "groups" | "pause"; heard: { groups: number[]; pauses: number[] } }>;

/** Whether knocks open the door: the group counts must match exactly; when the pattern has a long pause, it must be long and every other pause short. */
export function judgeKnock(p: KnockPattern, times: readonly number[]): KnockJudgement {
  const heard = readKnocks(times);
  if (heard.groups.length === 0) return { ok: false, reason: "none", heard };
  const same = heard.groups.length === p.groups.length && heard.groups.every((g, i) => g === p.groups[i]);
  if (!same) return { ok: false, reason: "groups", heard };
  if (p.long !== null && !heard.pauses.every((ms, i) => (i === p.long ? ms >= KNOCK_READ.longMs : ms < KNOCK_READ.longMs))) return { ok: false, reason: "pause", heard };
  return { ok: true, reason: "ok", heard };
}
