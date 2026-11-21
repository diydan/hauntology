import { validateGhostReply } from "../../ghost/narration";
import { CLIP_MAX_MS } from "../limits";
import type { StitchClip } from "./compose";
import { validateWordBank, type WordBank } from "./wordbank";

/**
 * Stitch Templates (ghost-voice 5.1, Requirement 5.1).
 *
 * The starter templates were reviewed and kept as written on 2026-11-14. Every word in a
 * template must exist in the Word Bank, every Word Bank word must appear in at least one
 * template, and every subtitle must pass `validateGhostReply`.
 */
export type StitchTemplate = {
  id: string;
  words: readonly string[];
  subtitle: string;
};

export const STARTER_TEMPLATES: readonly StitchTemplate[] = [
  { id: "tpl-1", words: ["listen", "behind", "you"], subtitle: "listen behind you" },
  { id: "tpl-2", words: ["wait", "here"], subtitle: "wait here" },
  { id: "tpl-3", words: ["here", "again", "tonight"], subtitle: "here again tonight" },
  { id: "tpl-4", words: ["cold", "tonight"], subtitle: "cold tonight" },
  { id: "tpl-5", words: ["sleep", "here"], subtitle: "sleep here" },
  { id: "tpl-6", words: ["wait", "closer"], subtitle: "wait closer" },
  { id: "tpl-7", words: ["stairs", "behind", "you"], subtitle: "stairs behind you" },
  { id: "tpl-8", words: ["listen", "again"], subtitle: "listen again" },
  { id: "tpl-9", words: ["candle", "cold"], subtitle: "candle cold" },
  { id: "tpl-10", words: ["you", "closer"], subtitle: "you closer" },
] as const;

export function validateTemplates(
  templates: readonly StitchTemplate[],
  bank: WordBank,
): { ok: true } | { ok: false; reason: string } {
  const bankCheck = validateWordBank(bank);
  if (!bankCheck.ok) return bankCheck;
  if (templates.length === 0) return { ok: false, reason: "no_templates" };

  const allowed = new Set(bank);
  const covered = new Set<string>();

  for (const tpl of templates) {
    if (tpl.words.length < 2 || tpl.words.length > 4) return { ok: false, reason: "bad_length" };
    if (tpl.subtitle !== tpl.words.join(" ")) return { ok: false, reason: "bad_subtitle" };
    for (const w of tpl.words) {
      if (!allowed.has(w)) return { ok: false, reason: "outside_bank" };
      covered.add(w);
    }
    if (!validateGhostReply(tpl.subtitle).ok) return { ok: false, reason: "unsafe_subtitle" };
  }

  for (const w of bank) {
    if (!covered.has(w)) return { ok: false, reason: "uncovered_word" };
  }
  return { ok: true };
}

export function eligibleTemplates(
  seat: number,
  templates: readonly StitchTemplate[],
  clips: readonly StitchClip[],
): StitchTemplate[] {
  const seatWords = new Set(
    clips.filter((c) => c.seat === seat && Number.isFinite(c.durationMs) && c.durationMs > 0 && c.durationMs <= CLIP_MAX_MS).map((c) => c.word),
  );
  return templates.filter((tpl) => tpl.words.every((w) => seatWords.has(w)));
}
