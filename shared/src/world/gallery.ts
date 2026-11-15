import { z } from "zod";
import { AnchorSchema } from "../app/events";
import { ASSET_FORMATS, MARBLE_FRAME, MAX_ASSET_BYTES, MAX_SPLATS, assetName, buildManifest, poseFromService, storable, type AssetRole, type Pose, type StoredAsset } from "./ingest";
import { AttributionSchema, MANIFEST_NAME, assetNames, type WorldManifest } from "./manifest";

/**
 * The Gallery (world-pipeline 9.1, Requirements 9.1 and 9.2). A Gallery World is made by hand from a world someone already
 * has the files of, and ingested here: a plan names the files, the credit, the ghost preset and the hand-tuned pose, and
 * this builds `gallery/<id>/world.json` with the same `buildManifest` the real ingest uses. Pure: the tool that reads the
 * files and writes them (`tools/ingest-gallery/`) hands over what it found (sizes and first bytes) and gets back the
 * manifest and the list of objects to write. Nothing here reads a file, calls a service or spends.
 */

/** Requirement 9.1: the Gallery ships at least this many worlds. */
export const GALLERY_MIN_WORLDS = 6;
/** A Gallery id is a short readable slug, public (the world is at `/api/worlds/<id>`): 3 to 48 lower-case letters, digits and hyphens, none at either end. */
export const GALLERY_ID = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;
/** The spawn's eye must be this far above the floor, at least and at most, in metres, or the visitor starts inside it or in the air. */
export const SPAWN_EYE_MIN = 0.5;
export const SPAWN_EYE_MAX = 3;

const Num = z.number().finite();
const Vec3 = z.tuple([Num, Num, Num]);

/** A file path inside the folder of the plan: relative, no `..`, no backslash, no empty part, no control character. */
export function isSafeRelativePath(p: string): boolean {
  if (p === "" || p.length > 200 || p.startsWith("/") || p.includes("\\")) return false;
  for (const ch of p) if ((ch.codePointAt(0) as number) < 0x20 || ch === "\u007f") return false;
  return p.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}
const RelPath = z.string().refine(isSafeRelativePath, "must be a relative path inside the plan's folder");
const Lod = z.enum(["100k", "500k", "full"]);

export const GalleryFilesSchema = z
  .object({
    splat: z.array(z.object({ file: RelPath, lod: Lod.optional() }).strict()).min(1).max(MAX_SPLATS),
    collider: RelPath.optional(),
    pano: RelPath.optional(),
    /** Required: the Gallery list shows it (Requirement 9.2). */
    thumb: RelPath,
  })
  .strict();

/** The hand-tuned pose. `service` is what the world service reported (`semantics_metadata`); the rest override it. */
export const GalleryPoseSchema = z
  .object({
    service: z.object({ metricScaleFactor: Num.optional(), groundPlaneOffset: Num.optional() }).strict().optional(),
    orientation: z.object({ upFix: z.tuple([Num, Num, Num, Num]), scale: Num.positive() }).strict().optional(),
    spawn: z.object({ position: Vec3, yaw: Num }).strict().optional(),
    floorY: Num.optional(),
    bounds: z.object({ min: Vec3, max: Vec3 }).strict().optional(),
  })
  .strict();

export const GalleryWorldPlanSchema = z
  .object({
    id: z.string().regex(GALLERY_ID),
    title: z.string().trim().min(1).max(200),
    /** The Place Brief the ghost works from. */
    brief: z.string().trim().min(1).max(2000),
    ghostPreset: z.string().min(1).max(60),
    attribution: AttributionSchema,
    files: GalleryFilesSchema,
    pose: GalleryPoseSchema.optional(),
    anchors: z.array(AnchorSchema).max(3).optional(),
  })
  .strict()
  .refine((w) => new Set((w.anchors ?? []).map((a) => a.id)).size === (w.anchors ?? []).length, { message: "anchor ids must be different", path: ["anchors"] });
export type GalleryWorldPlan = z.infer<typeof GalleryWorldPlanSchema>;

export const GalleryPlanSchema = z
  .object({
    /** The day the plan was made, `YYYY-MM-DD`: every manifest's `createdAt`, so running the same plan again writes the same bytes. */
    date: z.string().refine(isRealDate, "must be a real date, YYYY-MM-DD"),
    worlds: z.array(GalleryWorldPlanSchema).min(1).max(24),
  })
  .strict()
  .refine((p) => new Set(p.worlds.map((w) => w.id)).size === p.worlds.length, { message: "two worlds have the same id", path: ["worlds"] });
export type GalleryPlan = z.infer<typeof GalleryPlanSchema>;

function isRealDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const ms = Date.parse(`${text}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === text;
}

/** The plan's day as milliseconds since 1970 (UTC midnight). */
export const planCreatedAt = (plan: Pick<GalleryPlan, "date">): number => Date.parse(`${plan.date}T00:00:00Z`);

export type PlanParse = { ok: true; plan: GalleryPlan } | { ok: false; errors: string[] };

/** Reads a plan from parsed JSON. Misspelled or extra fields are errors, so a typo in a hand-written plan is found, not ignored. */
export function parseGalleryPlan(input: unknown): PlanParse {
  const r = GalleryPlanSchema.safeParse(input);
  if (r.success) return { ok: true, plan: r.data };
  return { ok: false, errors: r.error.issues.slice(0, 20).map((i) => `${i.path.length === 0 ? "plan" : i.path.join(".")}: ${i.message}`) };
}

/** What the tool found about one file: its size and its first bytes (16 are enough). */
export type FileFacts = { bytes: number; head: Uint8Array };

export type GalleryCode = "file_missing" | "file_bad_format" | "file_bad_magic" | "file_size" | "lod_clash" | "pose_invalid" | "manifest_failed";

/** One object to write under `gallery/<id>/`: its name in the bundle, where it comes from (none for the manifest), its type and size. */
export type GalleryObject = { name: string; role: AssetRole | "manifest"; from?: string; contentType: string; bytes: number };

export type GalleryWorld =
  | { ok: true; id: string; manifest: WorldManifest; manifestJson: string; objects: GalleryObject[]; warnings: string[] }
  | { ok: false; id: string; code: GalleryCode; detail: string };

const CONTENT_TYPES: Record<string, string> = { json: "application/json", glb: "model/gltf-binary", jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
/** The type an object is stored with; the Worker serves each from its name, so this is for whoever looks at the bucket. */
export const contentTypeOf = (format: string): string => CONTENT_TYPES[format] ?? "application/octet-stream";

const extensionOf = (file: string): string => {
  const base = file.slice(file.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
  return ext === "jpeg" ? "jpg" : ext;
};

const startsWith = (b: Uint8Array, ...bytes: number[]): boolean => bytes.every((v, i) => b[i] === v);

/**
 * Whether the first bytes of a file fit its format. A splat in `spz` is gzip (`1f 8b`) or, uncompressed, begins `NGSP`; a `ply`
 * begins `ply`; a `glb` begins `glTF`; the pictures are checked as the upload route checks them. A `splat` file has no
 * marker, so any is accepted. This catches a wrong file or a page of HTML saved under a splat's name, not a damaged splat.
 */
export function magicFits(role: AssetRole, format: string, head: Uint8Array): boolean {
  if (role === "splat") {
    if (format === "spz") return startsWith(head, 0x1f, 0x8b) || startsWith(head, 0x4e, 0x47, 0x53, 0x50);
    if (format === "ply") return startsWith(head, 0x70, 0x6c, 0x79);
    return true;
  }
  if (role === "collider") return startsWith(head, 0x67, 0x6c, 0x54, 0x46);
  if (format === "jpg") return startsWith(head, 0xff, 0xd8, 0xff);
  if (format === "png") return startsWith(head, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (format === "webp") return startsWith(head, 0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50;
  return false;
}

const inside = (p: readonly [number, number, number], b: Pose["bounds"]): boolean => p.every((v, i) => v >= (b.min[i] as number) && v <= (b.max[i] as number));

/**
 * Builds one Gallery World from its plan and the facts about its files. In order it refuses: a file that is missing, in a
 * format its role does not take, whose first bytes do not fit it, or whose size is none or over the ingest cap; two splats
 * that would take one name; a pose that puts the visitor outside the world, in the floor or in the air. Then
 * `buildManifest` (the one the real ingest uses) makes the manifest with source `gallery`, the preset, the anchors and the
 * credit, and the result is checked once more: the manifest names the same id, and exactly the objects returned.
 *
 * `warnings` are things worth a look and not a fault: a pose that was not tuned, the placeholder bounds, no collider, no
 * panorama, no anchors.
 */
export function buildGalleryWorld(plan: GalleryWorldPlan, facts: ReadonlyMap<string, FileFacts>, createdAt: number): GalleryWorld {
  const id = plan.id;
  const fail = (code: GalleryCode, detail: string): GalleryWorld => ({ ok: false, id, code, detail });

  const entries: { role: AssetRole; file: string; lod?: "100k" | "500k" | "full" }[] = [
    ...plan.files.splat.map((s) => ({ role: "splat" as const, file: s.file, ...(s.lod !== undefined ? { lod: s.lod } : {}) })),
    ...(plan.files.collider !== undefined ? [{ role: "collider" as const, file: plan.files.collider }] : []),
    ...(plan.files.pano !== undefined ? [{ role: "pano" as const, file: plan.files.pano }] : []),
    { role: "thumb" as const, file: plan.files.thumb },
  ];

  const stored: StoredAsset[] = [];
  const objects: GalleryObject[] = [];
  const names = new Set<string>();
  for (const e of entries) {
    const format = extensionOf(e.file);
    if (!(ASSET_FORMATS[e.role] as readonly string[]).includes(format)) return fail("file_bad_format", `${e.file}: a ${e.role} may be ${ASSET_FORMATS[e.role].join(", ")}`);
    const f = facts.get(e.file);
    if (f === undefined) return fail("file_missing", `${e.file}: not found`);
    if (!storable({ role: e.role, format, bytes: f.bytes })) return fail("file_size", `${e.file}: ${f.bytes} bytes (it must be more than none and at most ${MAX_ASSET_BYTES})`);
    if (!magicFits(e.role, format, f.head)) return fail("file_bad_magic", `${e.file}: its first bytes are not those of a ${format} ${e.role}`);
    const name = assetName(e.role, format, e.lod);
    if (names.has(name)) return fail("lod_clash", `${e.file}: would be stored as ${name}, which another file already takes (give each splat its own lod)`);
    names.add(name);
    stored.push({ role: e.role, format, ...(e.lod !== undefined ? { lod: e.lod } : {}), bytes: f.bytes });
    objects.push({ name, role: e.role, from: e.file, contentType: contentTypeOf(format), bytes: f.bytes });
  }

  const warnings: string[] = [];
  const given = plan.pose;
  const fromService = given?.service === undefined ? {} : poseFromService({ frame: MARBLE_FRAME, metricScaleFactor: given.service.metricScaleFactor, groundPlaneOffset: given.service.groundPlaneOffset });
  const explicit: Partial<Pose> = {
    ...(given?.orientation !== undefined ? { orientation: given.orientation } : {}),
    ...(given?.spawn !== undefined ? { spawn: given.spawn } : {}),
    ...(given?.floorY !== undefined ? { floorY: given.floorY } : {}),
    ...(given?.bounds !== undefined ? { bounds: given.bounds } : {}),
  };
  const pose: Partial<Pose> = { ...fromService, ...explicit };
  if (given === undefined || Object.keys(pose).length === 0) warnings.push("pose not tuned: it uses the placeholder (upright, a metre to a unit, spawn at the origin)");
  else if (given.bounds === undefined) warnings.push("bounds are the placeholder box (20 by 4 by 20 metres)");

  const built = buildManifest(stored, { worldId: id, title: plan.title, brief: plan.brief, source: "gallery", createdAt, ghostPreset: plan.ghostPreset, attribution: plan.attribution, pose, ...(plan.anchors !== undefined ? { anchors: plan.anchors } : {}) });
  if (!built.ok) return fail("manifest_failed", "the manifest could not be built from these files");
  const m = built.manifest;

  const { min, max } = m.bounds;
  if (!min.every((v, i) => v < (max[i] as number))) return fail("pose_invalid", "bounds: every min must be less than its max");
  if (!inside(m.spawn.position, m.bounds)) return fail("pose_invalid", "spawn: the position is outside the bounds");
  if (m.floorY < min[1] || m.floorY > max[1]) return fail("pose_invalid", "floorY: the floor is outside the bounds");
  const eye = m.spawn.position[1] - m.floorY;
  if (eye < SPAWN_EYE_MIN || eye > SPAWN_EYE_MAX) return fail("pose_invalid", `spawn: the eye is ${eye.toFixed(2)} m above the floor (it must be ${SPAWN_EYE_MIN} to ${SPAWN_EYE_MAX})`);
  for (const a of m.anchors ?? []) if (!inside(a.pos, m.bounds)) return fail("pose_invalid", `anchor ${a.id}: the position is outside the bounds`);

  if (plan.files.collider === undefined) warnings.push("no collider file");
  if (plan.files.pano === undefined) warnings.push("no panorama");
  if (plan.anchors === undefined || plan.anchors.length === 0) warnings.push("no anchors: the ghost engine places them");

  const manifestJson = `${JSON.stringify(m, null, 2)}\n`;
  const wanted = new Set(assetNames(m));
  if (m.id !== id || m.source !== "gallery" || wanted.size !== names.size || [...wanted].some((n) => !names.has(n))) return fail("manifest_failed", "the manifest does not match the files it was built from");
  objects.push({ name: MANIFEST_NAME, role: "manifest", contentType: "application/json", bytes: new TextEncoder().encode(manifestJson).byteLength });
  return { ok: true, id, manifest: m, manifestJson, objects, warnings };
}
