/**
 * Which part of a scripted line is spoken (ghost-voice Requirements 1.1 and 1.10).
 * Pure. The Library and, later, `toVoiceLine` both use it, so the two can never disagree.
 */

/** Player-supplied text. A sentence that holds one is never spoken (it stays in the Subtitle). */
export const PLAYER_PLACEHOLDERS: readonly string[] = ["{nick}", "{zone}", "{memory}"];

/** Placeholders with a small finite set of values. The Library expands them into concrete texts. */
export const FINITE_PLACEHOLDER_NAMES: readonly string[] = ["weather", "time", "moon", "bearing", "band"];

/** The longest spoken part, in characters (ghost-voice Requirement 1.1). */
export const MAX_SPOKEN_CHARS = 240;

/**
 * Split text into sentences. A sentence ends at `.`, `!` or `?` followed by a space or the end of the text.
 * An ellipsis (three or more dots and nothing else) is a pause, not an end: "Well... I mean... it was me." is one sentence.
 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (ch === "." || ch === "!" || ch === "?") {
      let j = i;
      while (j < text.length && ".!?".includes(text.charAt(j))) j++;
      const run = text.slice(i, j);
      const ellipsisOnly = /^\.{3,}$/.test(run);
      const atBoundary = j >= text.length || /\s/.test(text.charAt(j));
      if (!ellipsisOnly && atBoundary) {
        const sentence = text.slice(start, j).trim();
        if (sentence) out.push(sentence);
        start = j;
      }
      i = j;
    } else {
      i++;
    }
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/**
 * The spoken part of a line: the leading whole sentences that fit in `max` characters, stopping before the first
 * sentence that holds player text. Returns "" when no sentence qualifies (the line is subtitle only).
 */
export function spokenPart(text: string, max: number = MAX_SPOKEN_CHARS): string {
  const out: string[] = [];
  let length = 0;
  for (const sentence of splitSentences(text)) {
    if (PLAYER_PLACEHOLDERS.some((p) => sentence.includes(p))) break;
    const next = length + (out.length > 0 ? 1 : 0) + sentence.length;
    if (next > max) break;
    out.push(sentence);
    length = next;
  }
  return out.join(" ");
}
