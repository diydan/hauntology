import type { Rng } from "../puzzles/rng";

/**
 * Room Codes (party-mode 1.1): four characters from an alphabet with no look-alikes. No 0 or O, no 1, I or L, so a
 * code read off a TV across a room is typed right the first time.
 */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 4;

/** A new code from a random stream. The Room passes a crypto-backed stream; tests pass a seeded one. */
export function generateRoomCode(r: Rng): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(r() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
  return code;
}

/** The canonical code for what a Player typed (any case, any spaces or dashes), or null if it cannot be a code. */
export function normalizeCode(input: string): string | null {
  const s = input.replace(/[\s-]+/g, "").toUpperCase();
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}
