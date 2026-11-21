import type { PublicSnapshot } from "../party/engine";
import { clueHint, type ClueHint } from "./clues";
import { STOCK_SONGS, type StockSong } from "./stock";

/**
 * Stock Song play rules (game-songs 5.3, Requirements 6.4, 6.5). Pure.
 *
 * - Haunt loops follow the Haunt level (0-3: low, 4-6: mid, 7+: high).
 * - Round-end stings rotate through stings 1-3 at chapter end.
 * - Relic or Zone Clue Songs hint only when the public log already excludes that card; otherwise plain ambience.
 * - Preset ghost theme plays softly under that ghost's public appearances.
 */
const byId = (id: string): StockSong => STOCK_SONGS.find((s) => s.id === id) ?? STOCK_SONGS[0]!;

export function hauntLoopFor(hauntLevel: number): StockSong {
  if (hauntLevel >= 7) return byId("haunt-high");
  if (hauntLevel >= 4) return byId("haunt-mid");
  return byId("haunt-low");
}

export function roundStingFor(round: number): StockSong {
  const idx = ((Math.max(1, Math.floor(round)) - 1) % 3) + 1;
  return byId(`sting-${idx}`);
}

export function clueSongOrAmbience(
  view: Pick<PublicSnapshot, "events" | "zones" | "relics" | "haunt">,
  opts: { emptyZones?: readonly string[]; excludeIds?: readonly string[]; seed: number },
): { song: StockSong; hint: ClueHint | null } {
  const hint = clueHint(
    {
      events: view.events,
      zones: view.zones,
      relics: view.relics,
      ...(opts.emptyZones !== undefined ? { emptyZones: opts.emptyZones } : {}),
      ...(opts.excludeIds !== undefined ? { excludeIds: opts.excludeIds } : {}),
    },
    opts.seed,
  );
  if (hint === null) return { song: hauntLoopFor(view.haunt.level), hint: null };
  if (hint.kind === "relic") {
    const match = STOCK_SONGS.find((s) => s.kind === "relic" && s.id === `relic-${hint.id}`);
    return { song: match ?? hauntLoopFor(view.haunt.level), hint: match ? hint : null };
  }
  const slug = hint.name.toLowerCase().replace(/^the /, "").replace(/[^a-z]+/g, "-");
  const zoneMatch = STOCK_SONGS.find((s) => s.kind === "zone" && s.id === `zone-${slug}`);
  return { song: zoneMatch ?? hauntLoopFor(view.haunt.level), hint: zoneMatch ? hint : null };
}

export function ghostThemeFor(presetId: string): StockSong | null {
  return STOCK_SONGS.find((s) => s.kind === "ghost" && s.id === `ghost-${presetId}`) ?? null;
}
