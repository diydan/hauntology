import { walkRadiusOf } from "@hauntology/shared/ghost/anchors";
import type { Bounds } from "@hauntology/shared/ghost/types";
import type { WorldChoice } from "../controller/play/MasterMenu";

/**
 * The places the Master can choose (party-mode 9.10): the Gallery's worlds, each with the walk radius the Room needs to check it (a world under 7 m
 * with no Zones of its own is refused as `world_too_small`, and the Master is told). Reads the public Gallery list and each world's manifest; a world
 * that will not load is left out, and at most twelve are asked for. Authored Zones are not known here, so none are claimed.
 */
type Fetch = (url: string, init?: RequestInit) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
export const MAX_WORLD_CHOICES = 12;

export async function loadWorldChoices(fetchFn: Fetch): Promise<WorldChoice[]> {
  let items: unknown;
  try { const r = await fetchFn("/api/gallery"); items = r.ok ? await r.json() : []; } catch { return []; }
  if (!Array.isArray(items)) return [];
  const out: WorldChoice[] = [];
  for (const it of items.slice(0, MAX_WORLD_CHOICES) as { id?: unknown; title?: unknown }[]) {
    if (typeof it?.id !== "string" || it.id.length === 0 || it.id.length > 64) continue;
    try {
      const r = await fetchFn(`/api/worlds/${encodeURIComponent(it.id)}`);
      if (!r.ok) continue;
      const body = (await r.json()) as { manifest?: { bounds?: Bounds } };
      const bounds = body.manifest?.bounds;
      if (bounds === undefined) continue;
      const walkRadius = walkRadiusOf(bounds);
      if (!Number.isFinite(walkRadius)) continue;
      out.push({ id: it.id, name: typeof it.title === "string" && it.title !== "" ? it.title.slice(0, 60) : it.id, walkRadius, authoredZones: false });
    } catch { /* this world is left out */ }
  }
  return out;
}
