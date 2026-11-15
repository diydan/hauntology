/**
 * Retention (world-pipeline Requirement 10.1, task 3.17): which stored objects are past their time.
 * Uploads and the candidates drawn from a sketch live 24 hours. A user's world bundle and its ghost
 * sprite live 7 days. A Gallery object is never listed, whatever its age. Pure: the caller passes
 * the clock and the objects.
 */

export const OBJECT_KINDS = ["upload", "candidate", "world", "sprite", "gallery"] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

/** One stored object, as the inventory of the store reports it. `createdAt` is epoch milliseconds. */
export type StoredObject = {
  key: string;
  kind: ObjectKind;
  createdAt: number;
  /** The world it belongs to, when it belongs to one. Retention uses it to forget the world itself. */
  worldId?: string;
};

export type RetentionPolicy = { uploadMs: number; worldMs: number };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** `UPLOAD_TTL_HOURS=24` and `WORLD_TTL_DAYS=7` are the defaults of the spec. */
export const DEFAULT_RETENTION: RetentionPolicy = { uploadMs: 24 * HOUR, worldMs: 7 * DAY };

/** The time an object may live, or `null` when it lives for ever (a Gallery object). */
export function ttlOf(kind: ObjectKind, policy: RetentionPolicy = DEFAULT_RETENTION): number | null {
  switch (kind) {
    case "upload":
    case "candidate":
      return policy.uploadMs;
    case "world":
    case "sprite":
      return policy.worldMs;
    case "gallery":
      return null;
  }
}

/**
 * The objects older than their time. An object is expired when it is *more than* its time old, so one
 * that is exactly 24 hours old is still kept. An object whose age is not a number is never expired
 * (a bad clock must not empty the store).
 */
export function expiredObjects(
  objects: readonly StoredObject[],
  now: number,
  policy: RetentionPolicy = DEFAULT_RETENTION,
): StoredObject[] {
  if (!Number.isFinite(now)) return [];
  return objects.filter((o) => {
    const ttl = ttlOf(o.kind, policy);
    return ttl !== null && Number.isFinite(o.createdAt) && now - o.createdAt > ttl;
  });
}

/** Just the keys of `expiredObjects`. */
export const expiredKeys = (objects: readonly StoredObject[], now: number, policy: RetentionPolicy = DEFAULT_RETENTION): string[] =>
  expiredObjects(objects, now, policy).map((o) => o.key);

const positive = (raw: string | undefined, fallback: number): number => {
  const n = raw === undefined ? NaN : Number(raw.trim());
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Reads `UPLOAD_TTL_HOURS` and `WORLD_TTL_DAYS`. Anything that is not a positive number falls back to the default. */
export function retentionFromEnv(env: { UPLOAD_TTL_HOURS?: string; WORLD_TTL_DAYS?: string } | undefined): RetentionPolicy {
  return {
    uploadMs: positive(env?.UPLOAD_TTL_HOURS, DEFAULT_RETENTION.uploadMs / HOUR) * HOUR,
    worldMs: positive(env?.WORLD_TTL_DAYS, DEFAULT_RETENTION.worldMs / DAY) * DAY,
  };
}
