import type { EngineEvent, PublicSnapshot } from "@hauntology/shared/party/engine";
import type { ReactionEvent, ReactionKind } from "@hauntology/shared/party/display";

/**
 * What the Display reacts to (party-mode 10.2): the new public events of the game and the clock, turned into reaction events for the shared
 * photosensitivity limits (`effectLimits`). It reads only the Public View, so it shows no secret; a Suggestion is a flash, a wrong Accusation two,
 * a right one three and the culprit's reveal, a Haunt Event two (and a Blackout dims), and the 10 second warning one.
 */
export type DisplayMemory = Readonly<{ seen: number; warnedFor: string | null }>;
export const FRESH_DISPLAY: DisplayMemory = { seen: -1, warnedFor: null };

export function reactionsFor(pub: PublicSnapshot, mem: DisplayMemory, nowMs: number, leftMs: number | null): { events: ReactionEvent[]; memory: DisplayMemory } {
  const events: ReactionEvent[] = [];
  let seen = mem.seen;
  for (const e of pub.events as readonly EngineEvent[]) {
    if (e.id <= mem.seen) continue;
    seen = Math.max(seen, e.id);
    const kind: ReactionKind | null =
      e.kind === "suggest" ? "suggest" : e.kind === "accuse" ? (e.right ? "accuse-right" : "accuse-wrong")
      : e.kind === "haunt-event" ? (e.option === "blackout" ? "blackout" : "haunt-event") : null;
    if (kind !== null) events.push({ id: e.id, atMs: nowMs, kind });
  }
  const key = `${pub.round}:${pub.active}`;
  let warnedFor = mem.warnedFor;
  if (leftMs !== null && leftMs > 0 && leftMs <= 10_000 && !pub.paused && warnedFor !== key) {
    warnedFor = key;
    events.push({ id: 1_000_000 + pub.round * 100 + (pub.active ?? 0), atMs: nowMs, kind: "time-warning" });
  }
  return { events, memory: { seen, warnedFor } };
}

/** The culprit's name for the reveal, when a correct Accusation is in the log and the ending is out. Never before the ending. */
export function culpritOf(pub: PublicSnapshot): string | null {
  const end = pub.ending;
  return end === null ? null : (pub.suspects.find((s) => s.id === end.solution.suspect)?.name ?? null);
}
