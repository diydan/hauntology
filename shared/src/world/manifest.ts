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

/** True for text with no control, invisible or direction-changing character: what a person reads as one plain line. */
function isPlainLine(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) as number;
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) || c === 0x2028 || c === 0x2029 || (c >= 0x202a && c <= 0x202e) || (c >= 0x2060 && c <= 0x2069) || c === 0xfeff) return false;
  }
  return true;
}

/**
 * The page a Gallery picture came from: an `https` address of a public web page, with no login in it, no query and no fragment
 * (a signed address is a key), on a host with a dot that is not a bare address and not the world service's own. Never an upstream
 * asset address (steering: never return upstream asset URLs to the browser).
 */
export function isSourcePageUrl(text: string): boolean {
  if (text.length > 300 || /\s/.test(text) || text.includes("?") || text.includes("#")) return false;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const bare = /^[0-9.]+$/.test(host) || host.startsWith("[");
  return url.protocol === "https:" && url.username === "" && url.password === "" && host.includes(".") && !bare && !/(^|\.)worldlabs\.ai$/.test(host);
}

/** Who made a Gallery world's picture and on what terms (Requirement 9.1 and 9.2). Shown as text, never as markup. */
export const AttributionSchema = z.object({
  credit: z.string().trim().min(1).max(200).refine(isPlainLine),
  licence: z.string().trim().min(1).max(100).refine(isPlainLine),
  url: z.string().refine(isSourcePageUrl).optional(),
});
export type Attribution = z.infer<typeof AttributionSchema>;

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
  /** A Gallery world only: the credit and licence of its picture. */
  attribution: AttributionSchema.optional(),
});
export type WorldManifest = z.infer<typeof WorldManifestSchema>;

/** Every file name the manifest points at, `world.json` itself not included. */
export function assetNames(m: WorldManifest): string[] {
  const a = m.assets;
  return [...a.splat, ...(a.collider ? [a.collider] : []), ...(a.pano ? [a.pano] : []), ...(a.thumb ? [a.thumb] : [])].map((r) => r.path);
}

/** The file the manifest itself is stored under. */
export const MANIFEST_NAME = "world.json";
