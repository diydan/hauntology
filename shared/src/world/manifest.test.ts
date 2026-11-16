import { describe, expect, it } from "vitest";
import { ASSET_NAME, AttributionSchema, MANIFEST_NAME, WorldManifestSchema, assetNames, isSourcePageUrl, type WorldManifest } from "./manifest";

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

const parseOk = (a: unknown) => AttributionSchema.safeParse(a).success;
describe("attribution (a Gallery world's credit)", () => {
  it("is optional: a manifest without one still parses, and one with one keeps it", () => {
    expect(WorldManifestSchema.safeParse(manifest()).success).toBe(true);
    const r = WorldManifestSchema.safeParse({ ...manifest(), source: "gallery", attribution: { credit: " Photo by A. Person ", licence: "CC BY 4.0", url: "https://example.com/photos/kitchen" } });
    expect(r.success && r.data.attribution).toEqual({ credit: "Photo by A. Person", licence: "CC BY 4.0", url: "https://example.com/photos/kitchen" });
  });

  it("needs a credit and a licence, as one plain line each, and drops what it does not list", () => {
    const parse = (a: unknown) => AttributionSchema.safeParse(a).success;
    expect(parse({ credit: "A", licence: "CC0" })).toBe(true);
    expect(parse({ credit: "", licence: "CC0" })).toBe(false);
    expect(parse({ credit: "   ", licence: "CC0" })).toBe(false);
    expect(parse({ credit: "A", licence: "" })).toBe(false);
    expect(parse({ credit: "A", licence: "x".repeat(101) })).toBe(false);
    expect(parse({ credit: "x".repeat(201), licence: "CC0" })).toBe(false);
    expect(parse({ credit: "x".repeat(200), licence: "x".repeat(100) })).toBe(true);
    for (const bad of ["a\nb", "a\u0000b", "a\u001fb", "a\u200bb", "a\u200fb", "a\u202eb", "a\u2028b", "a\u2029b", "a\u2060b", "a\u2066b", "a\u2069b", "a\u007fb", "a\u009fb", "a\ufeffb"]) expect(parse({ credit: bad, licence: "CC0" }), JSON.stringify(bad)).toBe(false);
    expect(AttributionSchema.parse({ credit: "A", licence: "CC0", extra: 1 })).toEqual({ credit: "A", licence: "CC0" });
  });

  it("takes a source page address only if it is a public https page: no login, no query, no fragment, no address of the world service", () => {
    for (const ok of ["https://example.com", "https://commons.wikimedia.org/wiki/File:Kitchen.jpg", "https://a.b.example.org/x/y"]) expect(isSourcePageUrl(ok), ok).toBe(true);
    const bad = [
      "http://example.com/x", "ftp://example.com/x", "example.com/x", "//example.com/x", "javascript:alert(1)", "https://user@example.com/x", "https://user:pw@example.com/x", "https://:pw@example.com/x",
      "https://example.com/x?sig=abc", "https://example.com/x?", "https://example.com/x#top", "https://example.com/x#",
      "https://localhost/x", "https://intranet/x", "https://127.0.0.1/x", "https://10.0.0.1/", "https://[::1]/x",
      "https://api.worldlabs.ai/marble/v1/worlds", "https://cdn.marble.worldlabs.ai/a.spz", "https://worldlabs.ai", "https://WorldLabs.AI/x",
      "https://example.com/a b", "https://example.com/" + "x".repeat(300), "", " https://example.com", "https://example.com ",
    ];
    for (const b of bad) expect(isSourcePageUrl(b), b.slice(0, 60)).toBe(false);
    expect(isSourcePageUrl("https://notworldlabs.ai.example.com/x")).toBe(true);
    expect(isSourcePageUrl("https://myworldlabs.ai/x")).toBe(true);
    expect(isSourcePageUrl("https://example.com/" + "x".repeat(279))).toBe(true);
    // Exactly 300 characters is allowed, 301 is not.
    expect(isSourcePageUrl("https://example.com/" + "x".repeat(280))).toBe(true);
    expect(isSourcePageUrl("https://example.com/" + "x".repeat(281))).toBe(false);
    // A space is a plain line, not a control character: a credit may hold one.
    expect(parseOk({ credit: "A B", licence: "CC0" })).toBe(true);
  });
});
