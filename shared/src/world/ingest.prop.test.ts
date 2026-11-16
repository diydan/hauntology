import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { ASSET_FORMATS, EYE_HEIGHT, MARBLE_FRAME, MAX_ASSET_BYTES, buildManifest, poseFromService, storable, type AssetRole, type ManifestContext, type StoredAsset } from "./ingest";
import { WorldManifestSchema } from "./manifest";

const CTX: ManifestContext = { worldId: "w-aaaaaaaaaaaaaaaaaaaaaa", title: "The kitchen", brief: "A narrow kitchen.", source: "sketch", createdAt: 1_800_000_000_000 };

const role = fc.constantFrom<AssetRole>("splat", "collider", "pano", "thumb");
const lod = fc.constantFrom("100k" as const, "500k" as const, "full" as const, undefined);
/** An asset of any role, a format that may or may not belong to it, and a size that may be empty or too big. */
const asset: fc.Arbitrary<StoredAsset> = fc.record({
  role,
  format: fc.constantFrom("spz", "ply", "splat", "glb", "jpg", "png", "webp", "exe", ""),
  lod,
  bytes: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 5_000_000 }), fc.constant(MAX_ASSET_BYTES + 1)),
}).map((a): StoredAsset => ({ role: a.role, format: a.format, bytes: a.bytes, ...(a.lod !== undefined ? { lod: a.lod } : {}) }));

/** A good splat, so a list can be made to hold one. */
const goodSplat: StoredAsset = { role: "splat", format: "spz", lod: "500k", bytes: 1000 };

/** Property 11: manifest building is total and fail-closed on the splat. */
describe("Property 11: manifest building is total and fail-closed on splat", () => {
  it("returns a manifest that fits the schema for any list that has a usable splat, whatever else is missing, empty or odd", () => {
    fc.assert(
      fc.property(fc.array(asset, { maxLength: 16 }), (extra) => {
        const r = buildManifest([goodSplat, ...extra], CTX);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(WorldManifestSchema.safeParse(r.manifest).success).toBe(true);
        // What is in the manifest is exactly what was usable, and nothing was invented.
        const usable = [goodSplat, ...extra].filter(storable);
        for (const role of ["collider", "pano", "thumb"] as const) {
          expect(Boolean(r.manifest.assets[role])).toBe(usable.some((a) => a.role === role));
        }
        expect(r.manifest.assets.splat.length).toBeGreaterThanOrEqual(1);
        for (const s of r.manifest.assets.splat) expect(s.bytes).toBeGreaterThan(0);
      }),
      propParams(),
    );
  });

  it("returns ingest_failed for any list with no usable splat", () => {
    fc.assert(
      fc.property(fc.array(asset, { maxLength: 16 }), (list) => {
        const noSplat = list.filter((a) => !(a.role === "splat" && storable(a)));
        expect(buildManifest(noSplat, CTX)).toEqual({ ok: false, code: "ingest_failed" });
      }),
      propParams(),
    );
  });

  it("names only formats the role has", () => {
    fc.assert(
      fc.property(fc.array(asset, { maxLength: 16 }), (extra) => {
        const r = buildManifest([goodSplat, ...extra], CTX);
        if (!r.ok) return;
        for (const s of r.manifest.assets.splat) expect(ASSET_FORMATS.splat).toContain(s.path.split(".").pop());
        if (r.manifest.assets.collider) expect(r.manifest.assets.collider.path).toMatch(/^collider\.glb$/);
      }),
      propParams(),
    );
  });
});

/** Property 12: what goes to the browser holds no upstream address and no key. */
describe("Property 12: browser-facing payloads leak no secrets or upstream URLs", () => {
  const url = fc.constantFrom("https://cdn.worldlabs.ai/w/1/splat.spz", "https://api.worldlabs.ai/marble/v1/worlds/abc", "http://203.0.113.7/x.glb", "//cdn.example/a.jpg");
  it("puts neither the key nor an address into a manifest, even when the context and the stored list carry them", () => {
    fc.assert(
      fc.property(fc.array(asset, { maxLength: 10 }), url, (extra, u) => {
        // The only text a caller can put into a manifest is the title and the brief; none of them is an address or a key.
        const stored = [goodSplat, ...extra.map((a) => ({ ...a, url: u, key: "WLT-SENTINEL-KEY" }))];
        const r = buildManifest(stored, CTX);
        if (!r.ok) return;
        const text = JSON.stringify(r.manifest);
        expect(text).not.toMatch(/WLT-SENTINEL-KEY|worldlabs|https?:\/\/|\/\/cdn|203\.0\.113/);
      }),
      propParams(),
    );
  });
});

/** Whatever the service reports, the pose is one a manifest accepts, with the spawn at eye height on the floor and the box on the floor. */
describe("poseFromService is total", () => {
  const anything = fc.oneof(fc.double({ noNaN: false }), fc.constant(undefined), fc.constant(null as unknown as number), fc.constant("1" as unknown as number), fc.integer({ min: -1000, max: 1000 }));
  const hundredths = fc.integer({ min: 1, max: 10_000 }).map((n) => n / 100);

  it("never throws, and gives a pose the manifest schema accepts, for any scale and any ground", () => {
    fc.assert(
      fc.property(anything, anything, (metricScaleFactor, groundPlaneOffset) => {
        const pose = poseFromService({ frame: MARBLE_FRAME, metricScaleFactor, groundPlaneOffset });
        const r = buildManifest([goodSplat], { ...CTX, pose });
        expect(r.ok).toBe(true);
        expect(pose.orientation.scale).toBeGreaterThan(0);
        expect(Number.isFinite(pose.floorY)).toBe(true);
        expect(pose.spawn.position[1] - pose.floorY).toBeCloseTo(EYE_HEIGHT, 9);
        expect(pose.bounds.min[1]).toBe(pose.floorY);
        expect(pose.bounds.max[1] - pose.bounds.min[1]).toBeCloseTo(4, 9);
      }),
      propParams(),
    );
  });

  it("uses a valid scale and a valid ground exactly, with the floor at minus the ground", () => {
    fc.assert(
      fc.property(hundredths, fc.integer({ min: -10_000, max: 10_000 }).map((n) => n / 100), (scale, ground) => {
        const pose = poseFromService({ frame: MARBLE_FRAME, metricScaleFactor: scale, groundPlaneOffset: ground });
        expect(pose.orientation.scale).toBe(scale);
        expect(pose.floorY).toBe(0 - ground);
      }),
      propParams(),
    );
  });
});
