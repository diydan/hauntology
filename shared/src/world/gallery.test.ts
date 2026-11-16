import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GALLERY_ID, GALLERY_MIN_WORLDS, SPAWN_EYE_MAX, SPAWN_EYE_MIN, buildGalleryWorld, contentTypeOf, isSafeRelativePath, magicFits, parseGalleryPlan, planCreatedAt, type FileFacts, type GalleryWorldPlan } from "./gallery";
import { MAX_ASSET_BYTES, buildManifest } from "./ingest";
import { ASSET_NAME, WorldManifestSchema, assetNames } from "./manifest";

const HEADS: Record<string, number[]> = {
  spz: [0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3, 1, 2, 3, 4, 5, 6],
  ply: [0x70, 0x6c, 0x79, 0x0a, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0, 0, 0, 0, 0],
  splat: [9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9],
  glb: [0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  jpg: [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52],
  webp: [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20],
};
const headFor = (file: string): Uint8Array => Uint8Array.from(HEADS[file.slice(file.lastIndexOf(".") + 1).toLowerCase().replace("jpeg", "jpg")] ?? [0, 0, 0, 0]);

const GOOD: GalleryWorldPlan = {
  id: "blue-kitchen",
  title: "The blue kitchen",
  brief: "A narrow kitchen with a blue door and a kettle on the stove.",
  ghostPreset: "wistful-cook",
  attribution: { credit: "Photo by A. Person", licence: "CC BY 4.0", url: "https://example.com/photos/blue-kitchen" },
  files: {
    splat: [{ file: "kitchen/splat-500k.spz", lod: "500k" }, { file: "kitchen/splat-100k.spz", lod: "100k" }],
    collider: "kitchen/collider.glb",
    pano: "kitchen/pano.jpg",
    thumb: "kitchen/thumb.png",
  },
  pose: { service: { metricScaleFactor: 1.5, groundPlaneOffset: -0.8 }, spawn: { position: [1, 2.4, -2], yaw: 1.2 }, bounds: { min: [-8, 0.8, -8], max: [8, 5, 8] } },
  anchors: [{ id: "a1", pos: [2, 1.5, 3], radius: 1 }, { id: "a2", pos: [-3, 1.2, 0], radius: 1.5 }, { id: "a3", pos: [0, 2, -5], radius: 1 }],
};
const filesOf = (p: GalleryWorldPlan): string[] => [...p.files.splat.map((s) => s.file), ...(p.files.collider ? [p.files.collider] : []), ...(p.files.pano ? [p.files.pano] : []), p.files.thumb];
const factsOf = (p: GalleryWorldPlan, bytes = 1000): Map<string, FileFacts> => new Map(filesOf(p).map((f) => [f, { bytes, head: headFor(f) }]));
const NOW = Date.parse("2026-11-15T00:00:00Z");
const build = (p: GalleryWorldPlan = GOOD, facts: Map<string, FileFacts> = factsOf(p)) => buildGalleryWorld(p, facts, NOW);

describe("buildGalleryWorld", () => {
  it("builds the manifest with the same builder as a real ingest: source gallery, the preset, the credit, the anchors and the tuned pose", () => {
    const r = build();
    if (!r.ok) throw new Error(r.detail);
    expect(r.id).toBe("blue-kitchen");
    const m = r.manifest;
    expect(m).toMatchObject({ id: "blue-kitchen", title: "The blue kitchen", createdAt: NOW, source: "gallery", ghostPreset: "wistful-cook", brief: GOOD.brief });
    expect(m.attribution).toEqual(GOOD.attribution);
    expect(m.anchors).toEqual(GOOD.anchors);
    // The pose is the service's (scale, half turn, floor at +0.8) with the hand-tuned spawn and bounds over it.
    expect(m.orientation).toEqual({ upFix: [1, 0, 0, 0], scale: 1.5 });
    expect(m.floorY).toBe(0.8);
    expect(m.spawn).toEqual({ position: [1, 2.4, -2], yaw: 1.2 });
    expect(m.bounds).toEqual({ min: [-8, 0.8, -8], max: [8, 5, 8] });
    expect(WorldManifestSchema.safeParse(m).success).toBe(true);
    // Same as buildManifest given the same facts: one builder.
    const direct = buildManifest(
      [{ role: "splat", format: "spz", lod: "500k", bytes: 1000 }, { role: "splat", format: "spz", lod: "100k", bytes: 1000 }, { role: "collider", format: "glb", bytes: 1000 }, { role: "pano", format: "jpg", bytes: 1000 }, { role: "thumb", format: "png", bytes: 1000 }],
      { worldId: "blue-kitchen", title: GOOD.title, brief: GOOD.brief, source: "gallery", createdAt: NOW, ghostPreset: "wistful-cook", attribution: GOOD.attribution, anchors: GOOD.anchors, pose: { orientation: m.orientation, spawn: m.spawn, floorY: m.floorY, bounds: m.bounds } },
    );
    expect(direct).toEqual({ ok: true, manifest: m });
  });

  it("lists the objects to write: each file under the name the real ingest gives it, then world.json", () => {
    const r = build();
    if (!r.ok) throw new Error(r.detail);
    expect(r.objects.map((o) => [o.name, o.role, o.from, o.contentType])).toEqual([
      ["splat-500k.spz", "splat", "kitchen/splat-500k.spz", "application/octet-stream"],
      ["splat-100k.spz", "splat", "kitchen/splat-100k.spz", "application/octet-stream"],
      ["collider.glb", "collider", "kitchen/collider.glb", "model/gltf-binary"],
      ["pano.jpg", "pano", "kitchen/pano.jpg", "image/jpeg"],
      ["thumb.png", "thumb", "kitchen/thumb.png", "image/png"],
      ["world.json", "manifest", undefined, "application/json"],
    ]);
    const manifestObject = r.objects.at(-1)!;
    expect(manifestObject.bytes).toBe(new TextEncoder().encode(r.manifestJson).byteLength);
    expect(JSON.parse(r.manifestJson)).toEqual(r.manifest);
    expect(r.manifestJson.endsWith("}\n")).toBe(true);
    expect(r.objects.filter((o) => o.role !== "manifest").every((o) => o.bytes === 1000)).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("gives the same bytes every time it is run on the same plan", () => {
    const a = build();
    const b = build();
    expect(a.ok && b.ok && a.manifestJson === b.manifestJson).toBe(true);
  });

  it("needs only a splat and a thumbnail, and says what is missing", () => {
    const bare: GalleryWorldPlan = { ...GOOD, files: { splat: [{ file: "s.spz" }], thumb: "t.jpg" } };
    delete (bare as { pose?: unknown }).pose;
    delete (bare as { anchors?: unknown }).anchors;
    const r = build(bare);
    if (!r.ok) throw new Error(r.detail);
    expect(r.manifest.assets).toEqual({ splat: [{ path: "splat.spz", bytes: 1000 }], thumb: { path: "thumb.jpg", bytes: 1000 } });
    expect(r.manifest.anchors).toBeUndefined();
    expect(r.manifest.spawn).toEqual({ position: [0, 1.6, 0], yaw: 0 });
    expect(r.warnings).toEqual(["pose not tuned: it uses the placeholder (upright, a metre to a unit, spawn at the origin)", "no collider file", "no panorama", "no anchors: the ghost engine places them"]);
  });

  it("warns that the bounds are the placeholder box when a pose has none", () => {
    const noBounds: GalleryWorldPlan = { ...GOOD, pose: { service: { metricScaleFactor: 2, groundPlaneOffset: 0 } } };
    const r = build(noBounds);
    if (!r.ok) throw new Error(r.detail);
    expect(r.warnings).toContain("bounds are the placeholder box (20 by 4 by 20 metres)");
    expect(r.warnings).not.toContain("pose not tuned: it uses the placeholder (upright, a metre to a unit, spawn at the origin)");
    expect(r.manifest.orientation.scale).toBe(2);
    // An explicit pose with no service numbers works the same way.
    const explicit: GalleryWorldPlan = { ...GOOD, pose: { floorY: 0, spawn: { position: [0, 1.7, 0], yaw: 0 } } };
    const e = build(explicit);
    expect(e.ok && e.warnings.includes("bounds are the placeholder box (20 by 4 by 20 metres)")).toBe(true);
  });

  it("lets explicit fields override the service's numbers", () => {
    const r = build({ ...GOOD, pose: { service: { metricScaleFactor: 3, groundPlaneOffset: -1 }, orientation: { upFix: [0, 0, 0, 1], scale: 2 }, floorY: 0.5, spawn: { position: [0, 2, 0], yaw: 0 }, bounds: { min: [-5, 0, -5], max: [5, 4, 5] } } });
    if (!r.ok) throw new Error(r.detail);
    expect(r.manifest.orientation).toEqual({ upFix: [0, 0, 0, 1], scale: 2 });
    expect(r.manifest.floorY).toBe(0.5);
  });

  it("accepts .jpeg and capital letters in an extension", () => {
    const p: GalleryWorldPlan = { ...GOOD, files: { splat: [{ file: "S.SPZ", lod: "full" }], thumb: "T.JPEG", pano: "p.Jpg" } };
    const r = build(p);
    if (!r.ok) throw new Error(r.detail);
    expect(r.objects.map((o) => o.name)).toEqual(["splat-full.spz", "pano.jpg", "thumb.jpg", "world.json"]);
  });

  describe("refuses, with a code and the file", () => {
    const code = (r: ReturnType<typeof build>) => (r.ok ? "ok" : r.code);
    it("a file that is not there", () => {
      const facts = factsOf(GOOD);
      facts.delete("kitchen/collider.glb");
      const r = build(GOOD, facts);
      expect(r).toEqual({ ok: false, id: "blue-kitchen", code: "file_missing", detail: "kitchen/collider.glb: not found" });
    });

    it("a format its role does not take", () => {
      for (const files of [
        { ...GOOD.files, collider: "c.obj" }, { ...GOOD.files, collider: "c.gltf" }, { ...GOOD.files, thumb: "t.gif" }, { ...GOOD.files, thumb: "t" }, { ...GOOD.files, thumb: ".png" },
        { ...GOOD.files, splat: [{ file: "s.glb" }] }, { ...GOOD.files, splat: [{ file: "s.zip" }] }, { ...GOOD.files, pano: "p.tiff" },
      ]) {
        const p = { ...GOOD, files };
        const facts = factsOf(p);
        for (const f of filesOf(p)) if (!facts.has(f)) facts.set(f, { bytes: 10, head: headFor(f) });
        expect(code(build(p, facts)), JSON.stringify(files).slice(0, 80)).toBe("file_bad_format");
      }
    });

    it("first bytes that do not fit the format: a web page saved as a splat, a PNG named jpg, a collider that is not a glb", () => {
      const html = Uint8Array.from([0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45, 0x20, 0x68, 0x74, 0x6d, 0x6c, 0x3e, 0x0a]);
      const swap = (file: string, head: Uint8Array) => {
        const facts = factsOf(GOOD);
        facts.set(file, { bytes: 1000, head });
        return build(GOOD, facts);
      };
      expect(code(swap("kitchen/splat-500k.spz", html))).toBe("file_bad_magic");
      expect(code(swap("kitchen/collider.glb", html))).toBe("file_bad_magic");
      expect(code(swap("kitchen/pano.jpg", Uint8Array.from(HEADS.png!)))).toBe("file_bad_magic");
      expect(code(swap("kitchen/thumb.png", Uint8Array.from(HEADS.jpg!)))).toBe("file_bad_magic");
      expect(code(swap("kitchen/thumb.png", new Uint8Array(0)))).toBe("file_bad_magic");
      const r = swap("kitchen/splat-500k.spz", html);
      expect(r.ok ? "" : r.detail).toBe("kitchen/splat-500k.spz: its first bytes are not those of a spz splat");
    });

    it("a size of none, or over the ingest cap", () => {
      const sized = (bytes: number) => {
        const facts = factsOf(GOOD);
        facts.set("kitchen/pano.jpg", { bytes, head: headFor("x.jpg") });
        return build(GOOD, facts);
      };
      expect(code(sized(0))).toBe("file_size");
      expect(code(sized(-1))).toBe("file_size");
      expect(code(sized(1.5))).toBe("file_size");
      expect(code(sized(MAX_ASSET_BYTES + 1))).toBe("file_size");
      expect(code(sized(MAX_ASSET_BYTES))).toBe("ok");
      expect(code(sized(1))).toBe("ok");
    });

    it("two files that would take one name", () => {
      const clash = (splat: GalleryWorldPlan["files"]["splat"]) => build({ ...GOOD, files: { ...GOOD.files, splat } }, factsOf({ ...GOOD, files: { ...GOOD.files, splat } }));
      expect(code(clash([{ file: "a.spz" }, { file: "b.spz" }]))).toBe("lod_clash");
      expect(code(clash([{ file: "a.spz", lod: "full" }, { file: "b.spz", lod: "full" }]))).toBe("lod_clash");
      expect(code(clash([{ file: "a.spz", lod: "full" }, { file: "b.spz", lod: "500k" }]))).toBe("ok");
      expect(code(clash([{ file: "a.spz", lod: "full" }, { file: "b.ply", lod: "full" }]))).toBe("ok");
      const same = clash([{ file: "a.spz" }, { file: "b.spz" }]);
      expect(same.ok ? "" : same.detail).toBe("b.spz: would be stored as splat.spz, which another file already takes (give each splat its own lod)");
    });
  });

  describe("refuses a pose that puts the visitor out of the world", () => {
    const pose = (p: NonNullable<GalleryWorldPlan["pose"]>, anchors: NonNullable<GalleryWorldPlan["anchors"]> = []) => build({ ...GOOD, pose: p, anchors });
    const tuned: { floorY: number; bounds: { min: [number, number, number]; max: [number, number, number] } } = { floorY: 0, bounds: { min: [-5, 0, -5], max: [5, 4, 5] } };
    const detail = (r: ReturnType<typeof build>) => (r.ok ? "ok" : `${r.code}: ${r.detail}`);

    it("bounds that are not a box", () => {
      for (const b of [{ min: [0, 0, 0], max: [0, 4, 5] }, { min: [-5, 4, -5], max: [5, 4, 5] }, { min: [-5, 0, 5], max: [5, 4, -5] }, { min: [1, 1, 1], max: [0, 0, 0] }] as { min: [number, number, number]; max: [number, number, number] }[]) {
        const r = pose({ floorY: 0, spawn: { position: [0, 1.6, 0], yaw: 0 }, bounds: b });
        expect(detail(r), JSON.stringify(b)).toBe("pose_invalid: bounds: every min must be less than its max");
      }
    });

    it("a spawn outside the bounds, on any side", () => {
      for (const position of [[6, 1.6, 0], [-5.01, 1.6, 0], [0, 1.6, 5.01], [0, 1.6, -5.01], [0, 4.01, 0], [0, -0.1, 0]] as [number, number, number][]) {
        expect(detail(pose({ ...tuned, spawn: { position, yaw: 0 } })), JSON.stringify(position)).toBe("pose_invalid: spawn: the position is outside the bounds");
      }
      expect(pose({ ...tuned, spawn: { position: [5, 1.6, -5], yaw: 0 } }).ok).toBe(true);
      expect(detail(pose({ ...tuned, spawn: { position: [-5, 4, 5], yaw: 0 } }))).toBe("pose_invalid: spawn: the eye is 4.00 m above the floor (it must be 0.5 to 3)");
    });

    it("a floor outside the bounds", () => {
      expect(detail(pose({ floorY: 5, spawn: { position: [0, 3.9, 0], yaw: 0 }, bounds: tuned.bounds }))).toBe("pose_invalid: floorY: the floor is outside the bounds");
      expect(detail(pose({ floorY: -0.1, spawn: { position: [0, 1.5, 0], yaw: 0 }, bounds: tuned.bounds }))).toBe("pose_invalid: floorY: the floor is outside the bounds");
      expect(detail(pose({ floorY: 4.5, spawn: { position: [0, 4, 0], yaw: 0 }, bounds: tuned.bounds }))).toBe("pose_invalid: floorY: the floor is outside the bounds");
      expect(detail(pose({ floorY: 4, spawn: { position: [0, 4, 0], yaw: 0 }, bounds: tuned.bounds }))).toContain("the eye is 0.00 m above the floor");
    });

    it("an eye too near the floor or too high above it, with the limits themselves allowed", () => {
      const at = (eye: number) => pose({ floorY: 0, spawn: { position: [0, eye, 0], yaw: 0 }, bounds: { min: [-5, -1, -5], max: [5, 6, 5] } });
      expect(SPAWN_EYE_MIN).toBe(0.5);
      expect(SPAWN_EYE_MAX).toBe(3);
      expect(at(0.5).ok).toBe(true);
      expect(at(3).ok).toBe(true);
      const low = at(0.49);
      expect(low).toMatchObject({ ok: false, code: "pose_invalid", detail: "spawn: the eye is 0.49 m above the floor (it must be 0.5 to 3)" });
      expect(at(3.01).ok).toBe(false);
      expect(at(-0.2).ok).toBe(false);
    });

    it("an anchor outside the bounds", () => {
      const inside = pose({ ...tuned, spawn: { position: [0, 1.6, 0], yaw: 0 } }, [{ id: "a1", pos: [5, 4, -5], radius: 1 }, { id: "a2", pos: [-5, 0, 5], radius: 1 }]);
      expect(inside.ok).toBe(true);
      for (const pos of [[5.1, 1, 0], [0, 4.1, 0], [0, 1, -5.1], [0, -0.01, 0]] as [number, number, number][]) {
        const r = pose({ ...tuned, spawn: { position: [0, 1.6, 0], yaw: 0 } }, [{ id: "a2", pos, radius: 1 }]);
        expect(r).toMatchObject({ ok: false, code: "pose_invalid", detail: "anchor a2: the position is outside the bounds" });
      }
    });

    it("the placeholder pose is valid, and so is the service's own pose", () => {
      expect(build({ ...GOOD, pose: undefined } as unknown as GalleryWorldPlan).ok).toBe(true);
      for (const groundPlaneOffset of [-50, -1.2, 0, 3, 99]) {
        const r = build({ ...GOOD, anchors: undefined, pose: { service: { metricScaleFactor: 1, groundPlaneOffset } } } as unknown as GalleryWorldPlan);
        expect(r.ok, String(groundPlaneOffset)).toBe(true);
      }
    });
  });

  it("says the pose is not tuned for an empty pose block, and says no anchors for an empty list", () => {
    const empty = build({ ...GOOD, pose: {}, anchors: [] });
    if (!empty.ok) throw new Error(empty.detail);
    expect(empty.warnings).toContain("pose not tuned: it uses the placeholder (upright, a metre to a unit, spawn at the origin)");
    expect(empty.warnings).not.toContain("bounds are the placeholder box (20 by 4 by 20 metres)");
    expect(empty.warnings).toContain("no anchors: the ghost engine places them");
    expect(empty.manifest.anchors).toEqual([]);
  });

  it("refuses a manifest that would hide a file: a plan built past the schema with nine splats", () => {
    const nine = (["spz", "ply", "splat"] as const).flatMap((format) => (["100k", "500k", "full"] as const).map((lod) => ({ file: `w/s-${lod}.${format}`, lod })));
    const plan = { ...GOOD, files: { ...GOOD.files, splat: nine } };
    const r = build(plan);
    expect(r).toMatchObject({ ok: false, code: "manifest_failed", detail: "the manifest does not match the files it was built from" });
  });

  it("lists the same names in the manifest and the objects, and every one is a plain file name", () => {
    const r = build();
    if (!r.ok) throw new Error(r.detail);
    expect(new Set(assetNames(r.manifest))).toEqual(new Set(r.objects.filter((o) => o.role !== "manifest").map((o) => o.name)));
    expect(r.objects.every((o) => ASSET_NAME.test(o.name))).toBe(true);
  });
});

// Property: whatever a plan asks for, a world that is built is whole.
const lodArb = fc.constantFrom("100k" as const, "500k" as const, "full" as const);
const planArb: fc.Arbitrary<GalleryWorldPlan> = fc
  .record({
    n: fc.integer({ min: 1, max: 3 }),
    format: fc.constantFrom("spz", "ply", "splat"),
    lods: fc.shuffledSubarray(["100k", "500k", "full"] as const, { minLength: 3, maxLength: 3 }),
    collider: fc.boolean(),
    pano: fc.boolean(),
    thumbFormat: fc.constantFrom("jpg", "png", "webp"),
    scale: fc.double({ min: 0.01, max: 100, noNaN: true }),
    ground: fc.double({ min: -100, max: 100, noNaN: true }),
    anchors: fc.integer({ min: 0, max: 3 }),
  })
  .map((r): GalleryWorldPlan => ({
    ...GOOD,
    files: {
      splat: Array.from({ length: r.n }, (_, i) => ({ file: `w/s${i}.${r.format}`, lod: r.lods[i] as "100k" })),
      ...(r.collider ? { collider: "w/c.glb" } : {}),
      ...(r.pano ? { pano: "w/p.jpg" } : {}),
      thumb: `w/t.${r.thumbFormat}`,
    },
    pose: { service: { metricScaleFactor: r.scale, groundPlaneOffset: r.ground } },
    anchors: (["a1", "a2", "a3"] as const).slice(0, r.anchors).map((id, i) => ({ id, pos: [i, r.ground === 0 ? 1 : 0 - r.ground + 1, 0], radius: 1 })),
  }));

describe("Property: a Gallery world that is built is whole", () => {
  it("the manifest parses, names this id, and names exactly the objects returned; every object is stored under a safe name", () => {
    fc.assert(
      fc.property(planArb, (plan) => {
        const r = buildGalleryWorld(plan, factsOf(plan, 12345), NOW);
        if (!r.ok) return true; // a pose the property did not mean to make valid is refused, never half-built
        expect(WorldManifestSchema.safeParse(r.manifest).success).toBe(true);
        expect(r.manifest.id).toBe(plan.id);
        expect(r.manifest.source).toBe("gallery");
        const names = r.objects.filter((o) => o.role !== "manifest").map((o) => o.name);
        expect(new Set(assetNames(r.manifest))).toEqual(new Set(names));
        expect(names.length).toBe(new Set(names).size);
        expect(r.objects.every((o) => ASSET_NAME.test(o.name))).toBe(true);
        expect(r.objects.filter((o) => o.role === "manifest")).toHaveLength(1);
        for (const a of r.manifest.assets.splat) expect(a.bytes).toBe(12345);
        return true;
      }),
      { numRuns: 300, seed: 9101 },
    );
  });

  it("a world is never built with a file the facts did not report", () => {
    fc.assert(
      fc.property(planArb, fc.nat(), (plan, pick) => {
        const files = filesOf(plan);
        const facts = factsOf(plan);
        const gone = files[pick % files.length] as string;
        facts.delete(gone);
        const r = buildGalleryWorld(plan, facts, NOW);
        expect(r.ok).toBe(false);
        expect(!r.ok && r.code).toBe("file_missing");
      }),
      { numRuns: 100, seed: 9102 },
    );
  });
});

describe("parseGalleryPlan", () => {
  const plan = () => ({ date: "2026-11-15", worlds: [JSON.parse(JSON.stringify(GOOD))] as Record<string, any>[] });
  const errors = (p: unknown) => {
    const r = parseGalleryPlan(p);
    return r.ok ? [] : r.errors;
  };

  it("reads a good plan", () => {
    const r = parseGalleryPlan(plan());
    expect(r.ok).toBe(true);
    if (r.ok) expect(planCreatedAt(r.plan)).toBe(NOW);
  });

  it("refuses a typo or an extra field anywhere, by name", () => {
    const a = plan();
    a.worlds[0]!.anchor = [];
    expect(errors(a).join("\n")).toMatch(/worlds\.0: Unrecognized key/);
    const b = plan();
    b.worlds[0]!.files.thumbnail = "x.jpg";
    expect(errors(b).length).toBeGreaterThan(0);
    const c = plan();
    c.worlds[0]!.pose.floor = 1;
    expect(errors(c).length).toBeGreaterThan(0);
    const d = { ...plan(), extra: 1 };
    expect(errors(d).length).toBeGreaterThan(0);
    expect(errors(null)).not.toEqual([]);
    expect(errors({})).not.toEqual([]);
  });

  it("needs a real date", () => {
    for (const date of ["2026-02-30", "2026-13-01", "2026-1-1", "20261115", "", "2026-11-15T00:00:00Z", "yesterday"]) expect(errors({ ...plan(), date }), date).not.toEqual([]);
    expect(errors({ ...plan(), date: "2028-02-29" })).toEqual([]);
    expect(errors({ ...plan(), date: "2027-02-29" })).not.toEqual([]);
    expect(errors({ worlds: plan().worlds })).not.toEqual([]);
  });

  it("holds ids to a short slug and refuses two worlds with one id", () => {
    for (const id of ["ab", "Blue-kitchen", "blue_kitchen", "-blue", "blue-", "blue kitchen", "a".repeat(49), "blue/kitchen", "..", "é-kitchen"]) {
      const p = plan();
      p.worlds[0]!.id = id;
      expect(errors(p), id).not.toEqual([]);
    }
    for (const id of ["abc", "a-b", "a".repeat(48), "kitchen-2", "7-up"]) {
      const p = plan();
      p.worlds[0]!.id = id;
      expect(errors(p), id).toEqual([]);
    }
    const dup = plan();
    dup.worlds.push(JSON.parse(JSON.stringify(dup.worlds[0])));
    expect(errors(dup).join()).toContain("two worlds have the same id");
    expect(GALLERY_ID.test("ab")).toBe(false);
    expect(GALLERY_MIN_WORLDS).toBe(6);
  });

  it("refuses a file path that leaves the plan's folder", () => {
    for (const file of ["../secret.spz", "/etc/passwd.spz", "a/../../b.spz", "a\\b.spz", "a//b.spz", "./a.spz", "a/./b.spz", "", "a/", "a\u0000.spz", "a\u001f.spz", "a\u007f.spz", "a\nb.spz", "x".repeat(201)]) {
      const p = plan();
      p.worlds[0]!.files.splat = [{ file }];
      expect(errors(p), JSON.stringify(file)).not.toEqual([]);
    }
    for (const file of ["a.spz", "dir/a.spz", "d1/d2/a b.spz", "..a/b.spz", "a..b.spz", "x".repeat(196) + ".spz"]) {
      const p = plan();
      p.worlds[0]!.files.splat = [{ file }];
      expect(errors(p), file).toEqual([]);
    }
  });

  it("needs a thumbnail and a splat, allows eight splats and no more, and three anchors with different ids", () => {
    const noThumb = plan();
    delete noThumb.worlds[0]!.files.thumb;
    expect(errors(noThumb)).not.toEqual([]);
    const noSplat = plan();
    noSplat.worlds[0]!.files.splat = [];
    expect(errors(noSplat)).not.toEqual([]);
    const eight = plan();
    eight.worlds[0]!.files.splat = Array.from({ length: 8 }, (_, i) => ({ file: `s${i}.spz`, lod: "full" }));
    expect(errors(eight)).toEqual([]);
    eight.worlds[0]!.files.splat.push({ file: "s9.spz" });
    expect(errors(eight)).not.toEqual([]);
    const dupAnchors = plan();
    dupAnchors.worlds[0]!.anchors = [{ id: "a1", pos: [0, 1, 0], radius: 1 }, { id: "a1", pos: [1, 1, 0], radius: 1 }];
    expect(errors(dupAnchors).join()).toContain("anchor ids must be different");
    const four = plan();
    four.worlds[0]!.anchors = [...GOOD.anchors!, { id: "a1", pos: [0, 1, 0], radius: 1 }];
    expect(errors(four)).not.toEqual([]);
  });

  it("holds the credit, the licence and the source address to the manifest's rules", () => {
    for (const attribution of [{ credit: "", licence: "CC0" }, { credit: "A", licence: "CC0", url: "http://example.com/x" }, { credit: "A", licence: "CC0", url: "https://api.worldlabs.ai/x" }, { credit: "A" }]) {
      const p = plan();
      p.worlds[0]!.attribution = attribution;
      expect(errors(p), JSON.stringify(attribution)).not.toEqual([]);
    }
    const none = plan();
    delete none.worlds[0]!.attribution;
    expect(errors(none)).not.toEqual([]);
  });

  it("refuses non-finite numbers in the pose and an empty list of worlds", () => {
    const p = plan();
    p.worlds[0]!.pose.spawn.yaw = Number.POSITIVE_INFINITY;
    expect(errors(p)).not.toEqual([]);
    expect(errors({ date: "2026-11-15", worlds: [] })).not.toEqual([]);
    expect(errors({ date: "2026-11-15", worlds: Array.from({ length: 25 }, (_, i) => ({ ...JSON.parse(JSON.stringify(GOOD)), id: `w-${i}-aaa` })) })).not.toEqual([]);
  });

  it("reports at most twenty problems, each with where it is", () => {
    const r = parseGalleryPlan({ date: 5, worlds: Array.from({ length: 24 }, () => ({})) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.length).toBeLessThanOrEqual(20);
      expect(r.errors[0]).toMatch(/^date: /);
    }
  });
});

describe("isSafeRelativePath", () => {
  it("Property: a path with a `..` part, a leading slash or a backslash is never safe", () => {
    fc.assert(
      fc.property(fc.array(fc.string({ maxLength: 6 }), { maxLength: 4 }), fc.nat(), fc.constantFrom("..", "/", "\\"), (parts, at, bad) => {
        const list = [...parts];
        list.splice(at % (list.length + 1), 0, bad);
        const path = bad === "/" ? `/${list.join("/")}` : bad === "\\" ? list.join("\\") : list.join("/");
        expect(isSafeRelativePath(path)).toBe(false);
      }),
      { numRuns: 300, seed: 9103 },
    );
  });
});

describe("magicFits", () => {
  const head = (...b: number[]) => Uint8Array.from(b);
  it("checks each format by its own first bytes", () => {
    expect(magicFits("splat", "spz", head(0x1f, 0x8b, 8))).toBe(true);
    expect(magicFits("splat", "spz", head(0x4e, 0x47, 0x53, 0x50))).toBe(true);
    expect(magicFits("splat", "spz", head(0x1f, 0x8c))).toBe(false);
    expect(magicFits("splat", "spz", head(0x4e, 0x47, 0x53))).toBe(false);
    expect(magicFits("splat", "ply", head(0x70, 0x6c, 0x79, 10))).toBe(true);
    expect(magicFits("splat", "ply", head(0x70, 0x6c))).toBe(false);
    expect(magicFits("splat", "splat", head())).toBe(true);
    expect(magicFits("collider", "glb", head(0x67, 0x6c, 0x54, 0x46))).toBe(true);
    expect(magicFits("collider", "glb", head(0x67, 0x6c, 0x54))).toBe(false);
    expect(magicFits("pano", "jpg", head(0xff, 0xd8, 0xff))).toBe(true);
    expect(magicFits("pano", "jpg", head(0xff, 0xd8))).toBe(false);
    expect(magicFits("thumb", "png", Uint8Array.from(HEADS.png!))).toBe(true);
    expect(magicFits("thumb", "png", head(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b))).toBe(false);
    expect(magicFits("thumb", "webp", Uint8Array.from(HEADS.webp!))).toBe(true);
    expect(magicFits("thumb", "webp", head(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x51))).toBe(false);
    expect(magicFits("thumb", "gif", head(0x47, 0x49, 0x46))).toBe(false);
  });

  it("gives each format a type", () => {
    expect([contentTypeOf("spz"), contentTypeOf("ply"), contentTypeOf("glb"), contentTypeOf("jpg"), contentTypeOf("png"), contentTypeOf("webp"), contentTypeOf("json")]).toEqual(["application/octet-stream", "application/octet-stream", "model/gltf-binary", "image/jpeg", "image/png", "image/webp", "application/json"]);
  });
});
