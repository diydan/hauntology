import type { EngineEvent } from "../party/engine";
import { hash, mulberry32 } from "../puzzles/rng";

/**
 * Deterministic Clue Song hints (game-songs 2.3, Requirements 2.2, 2.3, 6.4).
 *
 * Picks only from facts already established safely:
 * - A Zone that was inspected in the public log and is confirmed empty (`emptyZones`), OR
 * - A Relic nobody has shown in any Suggestion (`refuter === null` on every mention and asked in the public log),
 * excluding any card id in `excludeIds` (such as Solution, Hands, or Residue placements).
 * Deterministic for the same public log and seed.
 */
export type ClueHintKind = "zone" | "relic";

export type ClueHint = Readonly<{
  kind: ClueHintKind;
  id: string;
  name: string;
  /** The line appended to the public log when a Clue Song plays (Requirement 4.1). */
  logLine: string;
  /** The line sung in the Clue Song itself. */
  lyricLine: string;
}>;

export type ClueHintInput = Readonly<{
  events: readonly EngineEvent[];
  zones: readonly Readonly<{ id: string; name: string }>[];
  relics: readonly Readonly<{ id: string; name: string }>[];
  /** Zone ids confirmed searched and empty (no Residue found). */
  emptyZones?: readonly string[];
  /** Card ids that must never be hinted (Residue placements, Hands, Solution). */
  excludeIds?: readonly string[];
}>;

function cleanName(raw: string): string {
  return raw.replace(/[\r\n]+/gu, " ").trim();
}

export function clueHint(input: ClueHintInput, seed: number): ClueHint | null {
  const excluded = new Set(input.excludeIds ?? []);
  const emptySet = new Set(input.emptyZones ?? []);

  const inspectedZones = new Set<string>();
  const shownRelics = new Set<string>();
  const unrefutedRelics = new Set<string>();

  for (const ev of input.events) {
    if (ev.kind === "inspect") inspectedZones.add(ev.zone);
    if (ev.kind === "suggest") {
      if (ev.refuter !== null) {
        shownRelics.add(ev.relic);
        unrefutedRelics.delete(ev.relic);
      } else if (!shownRelics.has(ev.relic)) {
        unrefutedRelics.add(ev.relic);
      }
    }
  }

  const candidates: Array<{ kind: ClueHintKind; id: string; name: string }> = [];

  for (const z of [...input.zones].sort((a, b) => a.id.localeCompare(b.id))) {
    if (inspectedZones.has(z.id) && emptySet.has(z.id) && !excluded.has(z.id)) {
      candidates.push({ kind: "zone", id: z.id, name: cleanName(z.name) });
    }
  }

  for (const r of [...input.relics].sort((a, b) => a.id.localeCompare(b.id))) {
    if (unrefutedRelics.has(r.id) && !shownRelics.has(r.id) && !excluded.has(r.id)) {
      candidates.push({ kind: "relic", id: r.id, name: cleanName(r.name) });
    }
  }

  if (candidates.length === 0) return null;

  const eventSig = input.events.map((e) => e.id).join(",");
  const rng = mulberry32(hash(seed, input.events.length, eventSig));
  const pick = candidates[Math.floor(rng() * candidates.length) % candidates.length]!;

  if (pick.kind === "zone") {
    return {
      kind: "zone",
      id: pick.id,
      name: pick.name,
      logLine: `A song drifted through the house: nothing lies in ${pick.name}.`,
      lyricLine: `Nothing stirs in ${pick.name}, the dust lies flat and bare`,
    };
  }
  return {
    kind: "relic",
    id: pick.id,
    name: pick.name,
    logLine: `A song drifted through the house: nobody has shown the ${pick.name}.`,
    lyricLine: `Nobody has shown the ${pick.name}, left cold beside the stair`,
  };
}
