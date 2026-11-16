/** Nicknames (party-mode 1.2): at most 16 characters, no control characters, no markup, no URLs. */
export const NICKNAME_MAX = 16;
export const NICKNAME_FALLBACK = "Player";

const URLISH = /(https?:\/\/\S*|www\.\S*|\b[\p{L}\p{N}-]+\.(?:com|net|org|io|app|co|uk|de|fr|lu|ly|gg|me|tv|xyz|info|biz)\b\S*)/giu;

function once(raw: string): string {
  let s = raw.normalize("NFKC");
  s = s.replace(/<[^>]*>?/g, " "); // tags, closed or not
  s = s.replace(/[<>]/g, " ");
  s = s.replace(/\p{C}/gu, " "); // control, format, private-use, unassigned
  s = s.replace(URLISH, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = [...s].slice(0, NICKNAME_MAX).join("").trim();
  return s;
}

/** A safe nickname. Idempotent: cleaning a clean name changes nothing. An empty result becomes "Player". */
export function sanitizeNickname(raw: string): string {
  let s = once(String(raw));
  for (let i = 0; i < 4; i++) { const next = once(s); if (next === s) break; s = next; }
  return s.length > 0 ? s : NICKNAME_FALLBACK;
}
