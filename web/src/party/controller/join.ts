import { errorCopy } from "@hauntology/shared/app/errors-copy";
import { NICKNAME_MAX, sanitizeNickname } from "@hauntology/shared/party/nickname";
import { CODE_ALPHABET, CODE_LENGTH, normalizeCode } from "@hauntology/shared/party/roomCode";
import type { JoinFailure } from "./controller-port";

export { NICKNAME_MAX, CODE_LENGTH };

/** What a Player has typed so far in the Room Code box: upper case, and nothing that cannot be in a code is kept out of sight (it is told on Join). */
export const typedCode = (raw: string): string => raw.toUpperCase();

/** The letters and numbers a Room Code is made of, for the hint under the box (no 0, O, 1, I or L, which look alike). */
export const CODE_HINT = `${CODE_LENGTH} letters or numbers, from the screen. No 0, O, 1, I or L: they look alike.`;

export type JoinAsk =
  | Readonly<{ ok: true; code: string; nickname: string }>
  | Readonly<{ ok: false; field: "code"; words: string }>;

/**
 * What to ask the Room for: the canonical code (any case, spaces and dashes allowed, as `normalizeCode` reads it) and the nickname after the
 * same cleaning the Room does (a name the Room would empty or cut is told here first, so the Player sees what the others will).
 * A code that cannot be a code is never sent: nothing about any Room is asked.
 */
export function readJoin(codeText: string, nicknameText: string): JoinAsk {
  const code = normalizeCode(codeText);
  if (code === null) return { ok: false, field: "code", words: `A Room Code is ${CODE_LENGTH} letters or numbers. Check the screen and type it again.` };
  return { ok: true, code, nickname: sanitizeNickname(nicknameText) };
}

/** The Room's refusals in plain words (Requirement 1.3). They say the same whatever is inside the Room. */
export function refusalWords(code: JoinFailure): { title: string; body: string } {
  const copy = errorCopy(code === "unreachable" ? "network_error" : code);
  return { title: copy.title, body: copy.body };
}

/** Whether a letter may be in a code, for a test and for the hint. */
export const inCode = (ch: string): boolean => CODE_ALPHABET.includes(ch);
