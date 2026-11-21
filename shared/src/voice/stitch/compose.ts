import { CLIP_MAX_MS } from "../limits";
import type { StitchTemplate } from "./templates";

/**
 * Stitch clip composition (ghost-voice 5.1, Requirement 5.1).
 *
 * Picks the exact accepted clip from one seat for each template word in order; returns `null` if
 * any word clip is missing or exceeds 2,000 ms (`CLIP_MAX_MS`).
 */
export type StitchClip = {
  seat: number;
  word: string;
  bytes: Uint8Array;
  durationMs: number;
  recordedAt: number;
  contentType: string;
};

export function composeStitch(
  seat: number,
  tpl: StitchTemplate,
  clips: readonly StitchClip[],
): { clips: StitchClip[]; subtitle: string } | null {
  if (tpl.subtitle !== tpl.words.join(" ")) return null;
  const chosen: StitchClip[] = [];
  for (const word of tpl.words) {
    const match = clips.find(
      (c) =>
        c.seat === seat &&
        c.word === word &&
        Number.isFinite(c.durationMs) &&
        c.durationMs > 0 &&
        c.durationMs <= CLIP_MAX_MS,
    );
    if (match === undefined) return null;
    chosen.push(match);
  }
  return { clips: chosen, subtitle: tpl.subtitle };
}
