import { WORD_BANK_MAX_WORDS } from "../limits";

/**
 * Stitch Word Bank (ghost-voice 5.1, Requirement 5.1).
 *
 * Fixed 12 harmless words; `validateWordBank` refuses banks with more than 12 words,
 * duplicates, empty banks, or any non-lowercase-ASCII word.
 */
export const WORD_BANK = [
  "listen",
  "behind",
  "you",
  "here",
  "wait",
  "closer",
  "cold",
  "tonight",
  "again",
  "candle",
  "stairs",
  "sleep",
] as const;

export type WordBank = readonly string[];

export function validateWordBank(bank: readonly string[]): { ok: true; words: readonly string[] } | { ok: false; reason: string } {
  if (bank.length === 0) return { ok: false, reason: "empty" };
  if (bank.length > WORD_BANK_MAX_WORDS) return { ok: false, reason: "too_many_words" };
  const seen = new Set<string>();
  for (const w of bank) {
    if (typeof w !== "string" || !/^[a-z]+$/.test(w)) return { ok: false, reason: "bad_word" };
    if (seen.has(w)) return { ok: false, reason: "duplicate" };
    seen.add(w);
  }
  return { ok: true, words: bank };
}
