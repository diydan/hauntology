import { describe, expect, it } from "vitest";
import { ASSET_NAME, MANIFEST_NAME, WorldManifestSchema, assetNames, type WorldManifest } from "./manifest";

const manifest = (): WorldManifest => ({
  id: "w-aaaaaaaaaaaaaaaaaaaaaaaa",
  title: "The kitchen",
  createdAt: 1_800_000_000_000,
  source: "upload",
  assets: {
    splat: [{ path: "splat-500k.spz", bytes: 5_000_000, lod: "500k" }, { path: "splat-full.spz", bytes: 20_000_000, lod: "full" }],
    collider: { path: "collider.glb", bytes: 100_000 },
    pano: { path: "pano.jpg", bytes: 200_000 },
    thumb: { path: "thumb.jpg", bytes: 20_000 },
  },
  orientation: { upFix: [0, 0, 0, 1], scale: 1 },
  spawn: { position: [0, 1.6, 0], yaw: 0 },
  floorY: 0,
  bounds: { min: [-5, 0, -5], max: [5, 3, 5] },
  brief: "A narrow kitchen with a window over the sink.",
});

describe("WorldManifestSchema", () => {
  it("accepts a full manifest and one with only a splat", () => {
    expect(WorldManifestSchema.safeParse(manifest()).success).toBe(true);
    const bare = { ...manifest(), assets: { splat: [{ path: "s.spz", bytes: 1 }] } };
    expect(WorldManifestSchema.safeParse(bare).success).toBe(true);
  });

  it("refuses a world with no splat", () => {
    expect(WorldManifestSchema.safeParse({ ...manifest(), assets: { splat: [] } }).success).toBe(false);
    expect(WorldManifestSchema.safeParse({ ...manifest(), assets: {} }).success).toBe(false);
  });

  it("refuses an asset that is empty, or whose path is a URL or climbs out of the bundle", () => {
    const withSplat = (path: string, bytes = 1) => ({ ...manifest(), assets: { splat: [{ path, bytes }] } });
    expect(WorldManifestSchema.safeParse(withSplat("a.spz", 0)).success).toBe(false);
    for (const bad of ["https://api.worldlabs.ai/x.spz", "//cdn.example/x.spz", "../x.spz", "a/b.spz", ".hidden", "", "a b.spz", "x".repeat(81)]) {
      expect(WorldManifestSchema.safeParse(withSplat(bad)).success, bad).toBe(false);
    }
  });

  it("drops a field it does not list, so an upstream host or key cannot ride along", () => {
    const dirty = { ...manifest(), apiKey: "WLT-SECRET", upstreamUrl: "https://cdn.worldlabs.ai/w/1.spz" };
    const parsed = WorldManifestSchema.parse(dirty);
    expect(JSON.stringify(parsed)).not.toMatch(/WLT-SECRET|worldlabs/);
  });

  it("refuses numbers that are not finite and a scale that is not positive", () => {
    expect(WorldManifestSchema.safeParse({ ...manifest(), floorY: Number.NaN }).success).toBe(false);
    expect(WorldManifestSchema.safeParse({ ...manifest(), orientation: { upFix: [0, 0, 0, 1], scale: 0 } }).success).toBe(false);
    expect(WorldManifestSchema.safeParse({ ...manifest(), spawn: { position: [0, Number.POSITIVE_INFINITY, 0], yaw: 0 } }).success).toBe(false);
  });
});

describe("assetNames", () => {
  it("lists every file the manifest points at, and not world.json", () => {
    expect(assetNames(manifest())).toEqual(["splat-500k.spz", "splat-full.spz", "collider.glb", "pano.jpg", "thumb.jpg"]);
    expect(MANIFEST_NAME).toBe("world.json");
  });

  it("lists only the splat when the optional files are missing", () => {
    expect(assetNames({ ...manifest(), assets: { splat: [{ path: "s.spz", bytes: 1 }] } })).toEqual(["s.spz"]);
  });
});

describe("ASSET_NAME", () => {
  it("allows plain file names and nothing else", () => {
    for (const ok of ["world.json", "splat-500k.spz", "a", "A_b-c.1"]) expect(ASSET_NAME.test(ok), ok).toBe(true);
    for (const bad of ["..", ".", "a/b", "a\\b", "-x", "_x", "a\nb", "é.jpg"]) expect(ASSET_NAME.test(bad), bad).toBe(false);
  });
});
