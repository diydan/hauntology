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
 * - Orientation, scale, spawn, floor and bounds are defaults unless the caller gives a pose. A world from the service gets
 *   its pose from `poseFromService` (the scale and ground height the service reports, and the axis convention of its files,
 *   as documented and not yet confirmed by a run: `.kiro/steering/tech.md`, unverified assumption 3); a Gallery world gets
 *   its pose tuned by hand.
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

/** The frame the service's splat files are written in, as its documentation names it: OpenCV axes (x right, y down, z forward). */
export const MARBLE_FRAME = "marble_raw_opencv" as const;
/** A half turn about x, as `[x, y, z, w]`: it takes a `marble_raw_opencv` file to y up and z backward (the three.js frame). The service's own viewer applies the same turn. */
export const MARBLE_UP_FIX: [number, number, number, number] = [1, 0, 0, 0];
/** The eye height the spawn stands at above the floor, in metres. */
export const EYE_HEIGHT = 1.6;
const SCALE_RANGE = { min: 0.01, max: 100 } as const;
const GROUND_LIMIT = 100;

/** What the service reports about one world's files (`assets.splats.semantics_metadata`), when it reports it. */
export type ServicePose = { frame: typeof MARBLE_FRAME; metricScaleFactor?: number | undefined; groundPlaneOffset?: number | undefined };

/**
 * The pose of a world made by the service. Its documentation gives, for a raw coordinate `p`:
 * `metric = p * metric_scale_factor`, then `ground-aligned = metric - (0, ground_plane_offset, 0)`, in the frame it calls
 * `marble_raw_opencv`, and says its own viewer then turns the file half a turn about x.
 *
 * The manifest says the viewer rotates by `upFix` and scales by `scale` (the order does not matter for a uniform
 * scale), so: `upFix` is the half turn about x, `scale` is `metric_scale_factor`, and the ground, which the service puts
 * at `y = ground_plane_offset` before the turn, is at `y = -ground_plane_offset` after it. That is `floorY`. The spawn
 * stands on it at eye height, at the origin (where the picture was taken from), looking where the picture looks. The
 * bounds are still a placeholder box of 20 by 4 by 20 metres on the floor.
 *
 * A scale that is missing, not a number (NaN and the infinities fail the range test) or outside 0.01 to 100 is read as 1 (the service says 1.0 means "could not be
 * inferred"), and a ground height that is missing or outside plus or minus 100 metres as 0, so one bad number cannot
 * put the viewer in a void.
 */
export function poseFromService(p: ServicePose): Pose {
  const scale = typeof p.metricScaleFactor === "number" && p.metricScaleFactor >= SCALE_RANGE.min && p.metricScaleFactor <= SCALE_RANGE.max ? p.metricScaleFactor : 1;
  const ground = typeof p.groundPlaneOffset === "number" && Math.abs(p.groundPlaneOffset) <= GROUND_LIMIT ? p.groundPlaneOffset : 0;
  const floorY = 0 - ground; // `0 - x`, not `-x`: a ground of 0 must not give a floor of -0
  return {
    orientation: { upFix: [...MARBLE_UP_FIX], scale },
    spawn: { position: [0, floorY + EYE_HEIGHT, 0], yaw: 0 },
    floorY,
    bounds: { min: [DEFAULT_POSE.bounds.min[0], floorY, DEFAULT_POSE.bounds.min[2]], max: [DEFAULT_POSE.bounds.max[0], floorY + (DEFAULT_POSE.bounds.max[1] - DEFAULT_POSE.bounds.min[1]), DEFAULT_POSE.bounds.max[2]] },
  };
}

export type ManifestContext = {
  worldId: string;
  title: string;
  brief: string;
  source: WorldManifest["source"];
  createdAt: number;
  anchors?: WorldManifest["anchors"];
  ghostPreset?: string;
  /** A Gallery world's picture credit. */
  attribution?: WorldManifest["attribution"];
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
    ...(ctx.attribution !== undefined ? { attribution: ctx.attribution } : {}),
  };
  const parsed = WorldManifestSchema.safeParse(candidate);
  // Every name made here fits the schema's rule; a context that does not (a title that is too long) fails closed.
  if (!parsed.success || !candidate.assets.splat.every((s) => ASSET_NAME.test(s.path))) return { ok: false, code: "ingest_failed" };
  return { ok: true, manifest: parsed.data };
}
