/**
 * What the Workers AI text models answer, read without trusting them (world-pipeline 5.2). Pure.
 *
 * Llama Guard 3 answers a conversation with `safe`, or `unsafe` and the codes of the hazards it found (`S1` to `S14`). Workers AI
 * documents the answer as either that text or an object `{ safe, categories }` parsed from it. Only an explicit, clean "safe" lets
 * text through: anything unclear is `unusable`, and the caller treats it as "could not check" (fail closed, retry allowed).
 * Scout's text answer is read from the shapes the platform may give (`{ response }`, or the OpenAI-style `choices`). **Neither shape
 * has been seen from a real call** (Spike 1.2); that is why both readers accept more than one form and refuse the rest.
 */

/** The most text a guard call takes. Longer text is not cut (a cut would let the tail through unchecked): it is not checked. */
export const GUARD_TEXT_MAX = 2000;
/** The most text read back from a chat model. A reply longer than this is not passed on. */
export const CHAT_TEXT_MAX = 4000;

/** The hazard codes of Llama Guard 3, `S1` to `S14`. */
export const GUARD_CATEGORY = /^S(?:[1-9]|1[0-4])$/;

export type GuardVerdict = { kind: "safe" } | { kind: "unsafe"; categories: string[] } | { kind: "unusable" };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The valid hazard codes in a list or in a text such as `S1, S10`, once each, in order. Anything else in it is dropped. */
function categoriesIn(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,;]+/) : [];
  const found = new Set<number>();
  for (const item of items) {
    if (typeof item !== "string") continue;
    const code = item.trim().toUpperCase();
    if (GUARD_CATEGORY.test(code)) found.add(Number(code.slice(1)));
  }
  return [...found].sort((a, b) => a - b).map((n) => `S${n}`);
}

/**
 * Reads the answer of a guard call. `safe` only for the word `safe` alone (the text form) or `safe: true` with no categories
 * (the object form), either of them as the answer itself or inside the Workers AI wrapper `{ response }`. `unsafe` for the
 * word `unsafe` first (the codes after it are kept), for `safe: false`, and for `safe: true` with categories listed, which
 * contradicts itself. Everything else, including `safe` followed by anything, is `unusable`.
 */
export function parseGuardAnswer(raw: unknown): GuardVerdict {
  let value: unknown = raw;
  if (isObject(value) && !("safe" in value) && "response" in value) value = value.response;
  if (typeof value === "string") {
    const text = value.trim();
    if (text.startsWith("{")) {
      try {
        value = JSON.parse(text);
      } catch {
        return { kind: "unusable" };
      }
    } else {
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
      const first = (lines[0] ?? "").toLowerCase();
      if (first === "safe") return lines.length === 1 ? { kind: "safe" } : { kind: "unusable" };
      if (first === "unsafe") return { kind: "unsafe", categories: categoriesIn(lines.slice(1).join(" ")) };
      return { kind: "unusable" };
    }
  }
  if (!isObject(value) || typeof value.safe !== "boolean") return { kind: "unusable" };
  if (value.safe === false) return { kind: "unsafe", categories: categoriesIn(value.categories) };
  const listed = Array.isArray(value.categories) ? value.categories.length : value.categories === undefined || value.categories === null ? 0 : 1;
  return listed === 0 ? { kind: "safe" } : { kind: "unsafe", categories: categoriesIn(value.categories) };
}

export type ChatText = { ok: true; text: string } | { ok: false };

/** The text of a chat answer, from the shapes Workers AI gives: the text itself, `{ response }`, or `{ choices: [{ message: { content } }] }` (a string, or parts of type `text`). */
export function readChatText(raw: unknown, max: number = CHAT_TEXT_MAX): ChatText {
  let text: unknown;
  if (typeof raw === "string") text = raw;
  else if (isObject(raw)) {
    if (typeof raw.response === "string") text = raw.response;
    else if (Array.isArray(raw.choices) && isObject(raw.choices[0]) && isObject(raw.choices[0].message)) {
      const content = raw.choices[0].message.content;
      if (typeof content === "string") text = content;
      else if (Array.isArray(content)) {
        const parts = content.filter((p): p is { type: "text"; text: string } => isObject(p) && p.type === "text" && typeof p.text === "string");
        text = parts.length > 0 ? parts.map((p) => p.text).join("") : undefined;
      }
    }
  }
  if (typeof text !== "string") return { ok: false };
  const trimmed = text.trim();
  return trimmed === "" || trimmed.length > max ? { ok: false } : { ok: true, text: trimmed };
}
