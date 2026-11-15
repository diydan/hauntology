import { z } from "zod";
import { AnchorSchema } from "../app/events";

/**
 * The world manifest (`world.json`), world-pipeline design "Data models" and task 3.1. Ingest (7.3)
 * writes it; `GET /api/worlds/:id` returns it once a world is ready, and the Viewer reads it.
 *
 * It names files, never URLs. An asset `path` is a file name inside the world's bundle, served from our
 * own origin at `/api/worlds/:id/assets/:path`. The objects are not strict: parsing drops any field that
 * is not listed, so an upstream host or key that slipped into a record cannot reach the browser.
 */

/** A file name inside one world's bundle: no slash, no leading dot, at most 80 characters. */
export const ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
export const AssetNameSchema = z.string().regex(ASSET_NAME);

const Num = z.number().finite();
const Vec3 = z.tuple([Num, Num, Num]);

export const AssetRefSchema = z.object({
  path: AssetNameSchema,
  bytes: z.number().int().positive(),
  lod: z.enum(["100k", "500k", "full"]).optional(),
});
export type AssetRef = z.infer<typeof AssetRefSchema>;

export const WorldManifestSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().max(200),
  createdAt: z.number().int().nonnegative(),
  source: z.enum(["upload", "sketch", "gallery"]),
  assets: z.object({
    /** At least one: a world with no splat is a failed ingest, never a manifest. */
    splat: z.array(AssetRefSchema).min(1).max(8),
    collider: AssetRefSchema.optional(),
    pano: AssetRefSchema.optional(),
    thumb: AssetRefSchema.optional(),
  }),
  orientation: z.object({ upFix: z.tuple([Num, Num, Num, Num]), scale: Num.positive() }),
  spawn: z.object({ position: Vec3, yaw: Num }),
  floorY: Num,
  bounds: z.object({ min: Vec3, max: Vec3 }),
  brief: z.string().max(2000),
  anchors: z.array(AnchorSchema).max(3).optional(),
  ghostPreset: z.string().min(1).max(60).optional(),
});
export type WorldManifest = z.infer<typeof WorldManifestSchema>;

/** Every file name the manifest points at, `world.json` itself not included. */
export function assetNames(m: WorldManifest): string[] {
  const a = m.assets;
  return [...a.splat, ...(a.collider ? [a.collider] : []), ...(a.pano ? [a.pano] : []), ...(a.thumb ? [a.thumb] : [])].map((r) => r.path);
}

/** The file the manifest itself is stored under. */
export const MANIFEST_NAME = "world.json";
