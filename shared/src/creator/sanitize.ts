/**
 * Making the visitor's free-text detail safe (ghost-creator Requirements 1.2, 2.1, 2.3; task 1.4).
 * The same cleaning family as the sketch caption: control and invisible characters become spaces,
 * markup and prompt-shaped characters are removed, URLs go, whitespace collapses, and what is left
 * is at most 140 characters. Idempotent: cleaning a cleaned detail changes nothing. The result is
 * data for a delimited block in a prompt, never instructions.
 */
export const DETAIL_MAX = 140;

// Control (incl. DEL and C1), zero-width, bidi, line/paragraph separators, BOM.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2028\u2029\u2060-\u2069\ufeff]/g;
// Markup and the characters a prompt's own framing is made of.
const RESERVED = /[<>{}[\]\\/"'`#*]/g;
const URLISH = /\b(?:https?:\/\/|ftp:\/\/|www\.)\S+|\b\S+\.(?:com|net|org|io|ai|dev|app|xyz|info|gg|me|co|uk|de|fr|jp|ru|cn)\S*/gi;

export function sanitizeDetail(raw: string): string {
  if (typeof raw !== "string") return "";
  const cleaned = raw.replace(INVISIBLE, " ").replace(URLISH, " ").replace(RESERVED, "").replace(/\s+/g, " ").trim();
  return Array.from(cleaned).slice(0, DETAIL_MAX).join("").trim();
}
