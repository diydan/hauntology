import { expiredObjects, type RetentionPolicy } from "@hauntology/shared/world/retention";
import type { WorldStore } from "./store";

export type CleanupResult = { objects: number; worlds: number };

/**
 * The scheduled cleanup (world-pipeline 8.1, Requirement 10.1). It deletes what `expiredObjects` lists:
 * uploads and candidates past 24 hours, a user's world bundle and sprite past 7 days, never a Gallery
 * object. When a world bundle expires the world is purged as a whole (its record, any leftovers and its
 * play sessions), so no record outlives its bundle. The wrangler cron trigger calls this with `Date.now()`.
 */
export async function cleanupExpired(store: WorldStore, now: number, policy?: RetentionPolicy): Promise<CleanupResult> {
  const expired = expiredObjects(await store.inventory(), now, policy);
  if (expired.length === 0) return { objects: 0, worlds: 0 };

  await store.removeObjects(expired.map((o) => o.key));

  const worlds = new Set<string>();
  for (const o of expired) if (o.kind === "world" && o.worldId !== undefined) worlds.add(o.worldId);
  for (const id of worlds) await store.purge(id);

  return { objects: expired.length, worlds: worlds.size };
}
