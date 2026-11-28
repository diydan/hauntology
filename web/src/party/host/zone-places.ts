import { walkRadiusOf } from "@hauntology/shared/ghost/anchors";
import { hashText } from "@hauntology/shared/ghost/rng";
import { placeZones } from "@hauntology/shared/party/zones";
import type { ZonePlaces } from "@hauntology/shared/party/door-view";
import type { AnchorGround } from "../../app/viewer/types";

/**
 * Where the six Zones stand in the world, for the Host's drawing only (party-mode 8.4, knock-door 8.1). The Room keeps Zone ids and names and never a
 * place, so the Host places them itself, from what only the Viewer knows: the floor, the spawn and the bounds. The seed is the world's id, so the same
 * world gives the same places on every visit. Nothing here reaches a rule or the Public View, and nothing says where a Solution is. A world with no
 * floor gets the ring the rule falls back to. Gives `{}` when the places cannot be made (too small, or fewer ids than Zones): nothing is drawn then.
 */
export function zonePlacesFromGround(ground: AnchorGround, zoneIds: readonly string[], worldId: string): ZonePlaces {
  const spawn = { x: ground.spawn[0], z: ground.spawn[2] };
  const { min, max } = ground.bounds;
  const r = placeZones(
    { sampler: { walkable: (p) => ground.sampler(p.x, p.z) !== null }, spawn, bounds: { minX: min[0], maxX: max[0], minZ: min[2], maxZ: max[2] }, walkRadius: walkRadiusOf(ground.bounds) },
    hashText(`zones:${worldId}`),
  );
  if (!r.ok || r.zones.length < zoneIds.length) return {};
  return Object.fromEntries(zoneIds.map((id, i) => [id, r.zones[i]!]));
}
