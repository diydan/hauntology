import { describe, expect, it } from "vitest";
import { ASSET_FORMATS, DEFAULT_POSE, MAX_ASSET_BYTES, MAX_SPLATS, assetName, buildManifest, storable, type ManifestContext, type StoredAsset } from "./ingest";
import { ASSET_NAME, WorldManifestSchema } from "./manifest";

const CTX: ManifestContext = { worldId: "w-aaaaaaaaaaaaaaaaaaaaaa", title: "The kitchen", brief: "A narrow kitchen.", source: "upload", createdAt: 1_800_000_000_000 };
const goodSplat = (): StoredAsset => ({ role: "splat", format: "spz", lod: "500k", bytes: 1000 });
const FULL: StoredAsset[] = [
  { role: "splat", format: "spz", lod: "500k", bytes: 5000 },
  { role: "splat", format: "spz", lod: "full", bytes: 20000 },
  { role: "collider", format: "glb", bytes: 400 },
  { role: "pano", format: "jpg", bytes: 900 },
  { role: "thumb", format: "png", bytes: 60 },
];

describe("assetName", () => {
  it("names a file from its role, level and format", () => {
    expect(assetName("splat", "spz", "500k")).toBe("splat-500k.spz");
    expect(assetName("splat", "ply")).toBe("splat.ply");
    expect(assetName("collider", "glb")).toBe("collider.glb");
    expect(assetName("pano", "jpg")).toBe("pano.jpg");
    expect(assetName("thumb", "webp", "full")).toBe("thumb.webp"); // a level means nothing but for a splat
  });

  it("always makes a name the bundle accepts", () => {
    for (const role of Object.keys(ASSET_FORMATS) as (keyof typeof ASSET_FORMATS)[]) for (const format of ASSET_FORMATS[role]) for (const lod of [undefined, "100k", "500k", "full"] as const) {
      expect(ASSET_NAME.test(assetName(role, format, lod)), assetName(role, format, lod)).toBe(true);
    }
  });
});

describe("storable", () => {
  it("accepts a known role and format with a size that is not empty and not too big", () => {
    expect(storable({ role: "splat", format: "spz", bytes: 1 })).toBe(true);
    expect(storable({ role: "splat", format: "spz", bytes: MAX_ASSET_BYTES })).toBe(true);
  });

  it("refuses an empty file, a file past the cap, a size that is not a whole number, and a format the role does not have", () => {
    for (const bytes of [0, -1, 1.5, Number.NaN, MAX_ASSET_BYTES + 1]) expect(storable({ role: "splat", format: "spz", bytes }), String(bytes)).toBe(false);
    expect(storable({ role: "collider", format: "spz", bytes: 5 })).toBe(false);
    expect(storable({ role: "pano", format: "glb", bytes: 5 })).toBe(false);
    expect(storable({ role: "splat", format: "exe", bytes: 5 })).toBe(false);
    expect(storable({ role: "nope" as never, format: "spz", bytes: 5 })).toBe(false);
    expect(storable({ role: "toString" as never, format: "spz", bytes: 5 })).toBe(false);
  });
});

describe("buildManifest", () => {
  it("builds a manifest that fits the schema, with the placeholder pose", () => {
    const r = buildManifest(FULL, CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(WorldManifestSchema.safeParse(r.manifest).success).toBe(true);
    expect(r.manifest).toMatchObject({ id: CTX.worldId, title: "The kitchen", brief: "A narrow kitchen.", source: "upload", createdAt: CTX.createdAt, ...DEFAULT_POSE });
    expect(r.manifest.assets).toEqual({
      splat: [{ path: "splat-500k.spz", bytes: 5000, lod: "500k" }, { path: "splat-full.spz", bytes: 20000, lod: "full" }],
      collider: { path: "collider.glb", bytes: 400 },
      pano: { path: "pano.jpg", bytes: 900 },
      thumb: { path: "thumb.png", bytes: 60 },
    });
  });

  it("uses these placeholders for the pose until Spike 1.1 records the real conventions", () => {
    expect(DEFAULT_POSE).toEqual({
      orientation: { upFix: [0, 0, 0, 1], scale: 1 },
      spawn: { position: [0, 1.6, 0], yaw: 0 },
      floorY: 0,
      bounds: { min: [-10, 0, -10], max: [10, 4, 10] },
    });
  });

  it("fails closed when there is no splat, or every splat is empty or unusable", () => {
    const optional = FULL.filter((a) => a.role !== "splat");
    expect(buildManifest(optional, CTX)).toEqual({ ok: false, code: "ingest_failed" });
    expect(buildManifest([], CTX)).toEqual({ ok: false, code: "ingest_failed" });
    expect(buildManifest([{ role: "splat", format: "spz", bytes: 0 }, ...optional], CTX)).toEqual({ ok: false, code: "ingest_failed" });
    expect(buildManifest([{ role: "splat", format: "exe", bytes: 9 }, ...optional], CTX)).toEqual({ ok: false, code: "ingest_failed" });
  });

  it("leaves out a collider, panorama or thumbnail that is missing or empty, and is still a world", () => {
    for (const role of ["collider", "pano", "thumb"] as const) {
      const without = buildManifest(FULL.filter((a) => a.role !== role), CTX);
      const empty = buildManifest(FULL.map((a) => (a.role === role ? { ...a, bytes: 0 } : a)), CTX);
      for (const r of [without, empty]) {
        expect(r.ok, role).toBe(true);
        if (r.ok) expect(r.manifest.assets).not.toHaveProperty(role);
      }
    }
    const bare = buildManifest([FULL[0] as StoredAsset], CTX);
    expect(bare.ok && Object.keys(bare.manifest.assets)).toEqual(["splat"]);
  });

  it("keeps one file for a role that is not a splat, and one per name for splats", () => {
    const r = buildManifest([...FULL, { role: "collider", format: "glb", bytes: 77 }, { role: "pano", format: "png", bytes: 5 }, { role: "splat", format: "spz", lod: "500k", bytes: 123 }], CTX);
    expect(r.ok && r.manifest.assets.collider?.bytes).toBe(400);
    expect(r.ok && r.manifest.assets.pano?.path).toBe("pano.jpg");
    expect(r.ok && r.manifest.assets.splat.map((s) => s.path)).toEqual(["splat-500k.spz", "splat-full.spz"]);
    expect(r.ok && r.manifest.assets.splat[0]?.bytes).toBe(5000);
  });

  it("gives a level of detail to a splat only", () => {
    const r = buildManifest([goodSplat(), { role: "thumb", format: "png", lod: "full", bytes: 5 }, { role: "collider", format: "glb", lod: "500k", bytes: 6 }], CTX);
    expect(r.ok && r.manifest.assets.thumb).toEqual({ path: "thumb.png", bytes: 5 });
    expect(r.ok && r.manifest.assets.collider).toEqual({ path: "collider.glb", bytes: 6 });
  });

  it("keeps at most the splat limit", () => {
    const lods = ["100k", "500k", "full", undefined] as const;
    const many: StoredAsset[] = Array.from({ length: MAX_SPLATS + 4 }, (_, i) => {
      const lod = lods[i % 4];
      return { role: "splat" as const, format: ["spz", "ply", "splat"][i % 3] as string, bytes: i + 1, ...(lod !== undefined ? { lod } : {}) };
    });
    const r = buildManifest(many, CTX);
    expect(r.ok && r.manifest.assets.splat.length).toBeLessThanOrEqual(MAX_SPLATS);
  });

  it("uses a pose it is given, a part at a time", () => {
    const r = buildManifest(FULL, { ...CTX, pose: { floorY: -1.2, spawn: { position: [1, 2, 3], yaw: 0.5 } } });
    expect(r.ok && r.manifest).toMatchObject({ floorY: -1.2, spawn: { position: [1, 2, 3], yaw: 0.5 }, orientation: DEFAULT_POSE.orientation, bounds: DEFAULT_POSE.bounds });
  });

  it("carries the anchors and the ghost preset when given, and not otherwise", () => {
    const anchors = [{ id: "a1" as const, pos: [1, 1, 1] as [number, number, number], radius: 2 }];
    const r = buildManifest(FULL, { ...CTX, anchors, ghostPreset: "maren" });
    expect(r.ok && r.manifest).toMatchObject({ anchors, ghostPreset: "maren" });
    const plain = buildManifest(FULL, CTX);
    expect(plain.ok && plain.manifest).not.toHaveProperty("anchors");
    expect(plain.ok && plain.manifest).not.toHaveProperty("ghostPreset");
  });

  it("fails closed when the context does not fit the schema", () => {
    expect(buildManifest(FULL, { ...CTX, title: "t".repeat(201) })).toEqual({ ok: false, code: "ingest_failed" });
    expect(buildManifest(FULL, { ...CTX, brief: "b".repeat(2001) })).toEqual({ ok: false, code: "ingest_failed" });
    expect(buildManifest(FULL, { ...CTX, createdAt: -1 })).toEqual({ ok: false, code: "ingest_failed" });
    expect(buildManifest(FULL, { ...CTX, pose: { orientation: { upFix: [0, 0, 0, 1], scale: 0 } } })).toEqual({ ok: false, code: "ingest_failed" });
  });
});
