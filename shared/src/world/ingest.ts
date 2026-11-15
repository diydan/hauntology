import { ASSET_NAME, WorldManifestSchema, type AssetRef, type WorldManifest } from "./manifest";

/**
 * Building the manifest of a world that has been copied into our storage (world-pipeline 7.3, task 3.14,
 * Requirements 8.1 to 8.3, 8.5). The ingest step stores each file and counts its bytes; `buildManifest` takes that
 * list and answers either a manifest that fits the schema or `ingest_failed`.
 *
 * - No splat, or only empty ones: `ingest_failed`. A world nobody can look at is not a world.
 * - A collider, panorama or thumbnail that is missing or empty is left out of the manifest and the world is still ready.
 * - Every file name is made here from the role, the format and the level of detail, never from anything the
 *   world service sent, so a name cannot hold an address or a path, and no upstream address reaches a manifest.
 * - Orientation, scale, spawn, floor and bounds are defaults. They are placeholders until Spike 1.1 records the real
 *   conventions of the service (`.kiro/steering/tech.md`, unverified assumption 3); a Gallery world gets them tuned by hand.
 */

export type AssetRole = "splat" | "collider" | "pano" | "thumb";
export type Lod = "100k" | "500k" | "full";

/** The formats a role may have. A file in any other format is treated as not there. */
export const ASSET_FORMATS: Record<AssetRole, readonly string[]> = {
  splat: ["spz", "ply", "splat"],
  collider: ["glb"],
  pano: ["jpg", "png", "webp"],
  thumb: ["jpg", "png", "webp"],
};
export const MAX_SPLATS = 8;
/** The largest file the ingest step will copy. A bigger one is refused, as a guard against a runaway download. */
export const MAX_ASSET_BYTES = 150 * 1024 * 1024;

/** A file that has been stored: what it is, how it is named in the bundle, and its size. */
export type StoredAsset = { role: AssetRole; format: string; lod?: Lod; bytes: number };

/** The name of a file in the bundle: `splat-500k.spz`, `collider.glb`, `pano.jpg`, `thumb.png`. */
export function assetName(role: AssetRole, format: string, lod?: Lod): string {
  return `${role}${role === "splat" && lod !== undefined ? `-${lod}` : ""}.${format}`;
}

/** Whether a file may be stored at all: a role and format we know, and a size that is not empty and not past the cap. */
export function storable(a: { role: AssetRole; format: string; bytes: number }): boolean {
  const formats = Object.hasOwn(ASSET_FORMATS, a.role) ? ASSET_FORMATS[a.role] : undefined;
  return formats?.includes(a.format) === true && Number.isInteger(a.bytes) && a.bytes > 0 && a.bytes <= MAX_ASSET_BYTES;
}

export type Pose = Pick<WorldManifest, "orientation" | "spawn" | "floorY" | "bounds">;
/** Placeholders (see above): upright, one metre to a unit, standing at the origin at eye height. */
export const DEFAULT_POSE: Pose = {
  orientation: { upFix: [0, 0, 0, 1], scale: 1 },
  spawn: { position: [0, 1.6, 0], yaw: 0 },
  floorY: 0,
  bounds: { min: [-10, 0, -10], max: [10, 4, 10] },
};

export type ManifestContext = {
  worldId: string;
  title: string;
  brief: string;
  source: "upload" | "sketch";
  createdAt: number;
  anchors?: WorldManifest["anchors"];
  ghostPreset?: string;
  /** For a Gallery world tuned by hand. */
  pose?: Partial<Pose>;
};

export type ManifestResult = { ok: true; manifest: WorldManifest } | { ok: false; code: "ingest_failed" };

const ref = (a: StoredAsset): AssetRef => ({ path: assetName(a.role, a.format, a.lod), bytes: a.bytes, ...(a.role === "splat" && a.lod !== undefined ? { lod: a.lod } : {}) });

export function buildManifest(stored: readonly StoredAsset[], ctx: ManifestContext): ManifestResult {
  const usable = stored.filter(storable);

  // One file per name: a second file that would take the same name is dropped.
  const seen = new Set<string>();
  const unique = usable.filter((a) => {
    const name = assetName(a.role, a.format, a.lod);
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });

  const splat = unique.filter((a) => a.role === "splat").slice(0, MAX_SPLATS).map(ref);
  if (splat.length === 0) return { ok: false, code: "ingest_failed" };
  const first = (role: Exclude<AssetRole, "splat">): AssetRef | undefined => {
    const a = unique.find((x) => x.role === role);
    return a === undefined ? undefined : ref(a);
  };
  const collider = first("collider");
  const pano = first("pano");
  const thumb = first("thumb");

  const candidate = {
    id: ctx.worldId,
    title: ctx.title,
    createdAt: ctx.createdAt,
    source: ctx.source,
    assets: { splat, ...(collider ? { collider } : {}), ...(pano ? { pano } : {}), ...(thumb ? { thumb } : {}) },
    orientation: ctx.pose?.orientation ?? DEFAULT_POSE.orientation,
    spawn: ctx.pose?.spawn ?? DEFAULT_POSE.spawn,
    floorY: ctx.pose?.floorY ?? DEFAULT_POSE.floorY,
    bounds: ctx.pose?.bounds ?? DEFAULT_POSE.bounds,
    brief: ctx.brief,
    ...(ctx.anchors !== undefined ? { anchors: ctx.anchors } : {}),
    ...(ctx.ghostPreset !== undefined ? { ghostPreset: ctx.ghostPreset } : {}),
  };
  const parsed = WorldManifestSchema.safeParse(candidate);
  // Every name made here fits the schema's rule; a context that does not (a title that is too long) fails closed.
  if (!parsed.success || !candidate.assets.splat.every((s) => ASSET_NAME.test(s.path))) return { ok: false, code: "ingest_failed" };
  return { ok: true, manifest: parsed.data };
}
