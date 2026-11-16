import type { HistoryLine } from "./types";

/**
 * The ghost's own stock phrases (ghost-engine 4, the repetition the paid run of 2026-11-16 found: "dear one" opened 15 of 24 hints and "do not hurry on my account"
 * came back again and again). The prompt only carries the last two turns, so it cannot see a phrase said five turns ago. This looks at the ghost's last six lines and
 * names the word runs that came back in more than one of them, so the prompt can say "not these again". Pure and deterministic: no clock, no randomness, and it reads
 * only what the ghost itself said (never what the visitor typed).
 *
 * A run counts when it is two to six words long, holds at least one word that is not a plain function word, and came back in at least three of the six lines (two words)
 * or at least two of them (three words or more; so a history with fewer than two ghost lines names nothing). The most frequent and longest runs win; a run inside a chosen one, or one that overlaps a chosen one by two words or more, is dropped. A run is never named when a hint
 * needs it: the engine's own words for the way and the distance (`avoid`) are required in a hint, so telling the model not to repeat them would fight the check.
 */
export const PHRASE_WINDOW_LINES = 6;
export const PHRASE_MAX = 6;
export const PHRASE_MAX_CHARS = 200;
const GRAM_MIN = 2;
const GRAM_MAX = 6;
/** The most characters of one ghost line that are read, so a very long line cannot make this slow. */
const LINE_READ_MAX = 600;

const FUNCTION_WORDS = new Set(
  "a an and are as at be been but by do does for from had has have he her his i if in is it its me my no not of on or our she so than that the their them then there these they this to us was we were what when which who will with would you your".split(" "),
);

const wordsOf = (text: string): string[] =>
  text
    .slice(0, LINE_READ_MAX)
    .toLowerCase()
    .split(/[^\p{L}\p{N}'’]+/u)
    .map((w) => w.replace(/^['’]+|['’]+$/gu, ""))
    .filter((w) => w !== "");

const hasContent = (gram: readonly string[]): boolean => gram.some((w) => !FUNCTION_WORDS.has(w));

/** Whether `inner` is a run of whole words inside `outer`. */
const insideOf = (inner: string, outer: string): boolean => ` ${outer} `.includes(` ${inner} `);

/** Whether the end of one run is the start of the other for two words or more ("a few steps" and "few steps and what you"): the second says little the first did not. */
function overlaps(a: string, b: string): boolean {
  const x = a.split(" ");
  const y = b.split(" ");
  for (let k = Math.min(x.length, y.length) - 1; k >= 2; k -= 1) {
    if (x.slice(-k).join(" ") === y.slice(0, k).join(" ") || y.slice(-k).join(" ") === x.slice(0, k).join(" ")) return true;
  }
  return false;
}

export function recentPhrases(history: readonly HistoryLine[], avoid: readonly string[] = []): string[] {
  const lines = history.filter((h) => h.role === "ghost").slice(-PHRASE_WINDOW_LINES).map((h) => wordsOf(h.text));

  const counts = new Map<string, number>();
  for (const line of lines) {
    const seen = new Set<string>();
    for (let n = GRAM_MIN; n <= GRAM_MAX; n += 1) {
      for (let i = 0; i + n <= line.length; i += 1) {
        const gram = line.slice(i, i + n);
        if (hasContent(gram)) seen.add(gram.join(" "));
      }
    }
    for (const gram of seen) counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }

  const wanted = (gram: string, count: number): boolean => count >= (gram.split(" ").length === 2 ? 3 : 2);
  const forbidden = avoid.map((a) => a.toLowerCase().split(/[^\p{L}\p{N}'’]+/u).filter((w) => w !== "").join(" ")).filter((a) => a !== "");
  const needed = (gram: string): boolean => forbidden.some((a) => insideOf(a, gram) || insideOf(gram, a));

  const candidates = [...counts]
    .filter(([gram, count]) => wanted(gram, count) && !needed(gram))
    .sort((a, b) => b[1] - a[1] || b[0].split(" ").length - a[0].split(" ").length || (a[0] < b[0] ? -1 : 1));

  const chosen: string[] = [];
  let chars = 0;
  for (const [gram] of candidates) {
    if (chosen.length >= PHRASE_MAX) break;
    // a run that holds a phrase already chosen says nothing new, and one inside a chosen run is already covered
    if (chosen.some((c) => insideOf(c, gram) || insideOf(gram, c) || overlaps(c, gram))) continue;
    if (chars + gram.length > PHRASE_MAX_CHARS) continue;
    chosen.push(gram);
    chars += gram.length;
  }
  return chosen;
}
