import { MANIFEST_NAME, WorldManifestSchema } from "@hauntology/shared/world/manifest";
import { MAX_ASSET_BYTES } from "@hauntology/shared/world/ingest";
import { describe, expect, it } from "vitest";
import { FakeR2 } from "./fake-cloudflare";
import { WorldIngestor, type IngestBucket } from "./ingest";
import type { SourceAsset, SourceWorld, UpstreamFailure, WorldSource } from "./ports";

const WORLD = "w-aaaaaaaaaaaaaaaaaaaaaa";
const JOB = { worldId: WORLD, operationId: "op-1", ownerSid: "sid-a", title: "The kitchen", brief: "A narrow kitchen.", source: "sketch" as const, createdAt: 1_800_000_000_000 };
const HOST = "https://upstream.invalid";

const asset = (role: SourceAsset["role"], format: string, lod?: SourceAsset["lod"]): SourceAsset => ({ role, format, ...(lod ? { lod } : {}), url: `${HOST}/${role}-${lod ?? "x"}.${format}` });
const FULL: SourceWorld = {
  splats: [asset("splat", "spz", "500k"), asset("splat", "spz", "full")],
  collider: asset("collider", "glb"),
  pano: asset("pano", "jpg"),
  thumb: asset("thumb", "png"),
};

type Served = { bytes?: Uint8Array; stream?: boolean; size?: number; failure?: UpstreamFailure; throws?: boolean };

class FakeSource implements WorldSource {
  readonly fetched: string[] = [];
  readonly cancelled: string[] = [];
  world: SourceWorld | UpstreamFailure = FULL;
  /** What each address serves. An address with no entry serves 10 bytes. */
  serve = new Map<string, Served>();
  async fetchWorld() {
    return "ok" in this.world ? this.world : { ok: true as const, world: this.world };
  }
  async fetchAsset(a: SourceAsset) {
    this.fetched.push(a.url);
    const s = this.serve.get(a.url) ?? { bytes: Uint8Array.from({ length: 10 }, (_, i) => i + 1) };
    if (s.throws) throw new Error("network");
    if (s.failure) return s.failure;
    const bytes = s.bytes ?? new Uint8Array(0);
    const body: ReadableStream<Uint8Array> | Uint8Array = s.stream
      ? new ReadableStream<Uint8Array>({ start: (c) => { c.enqueue(bytes); c.close(); }, cancel: () => void this.cancelled.push(a.url) })
      : bytes;
    return { ok: true as const, body, size: s.size ?? bytes.byteLength };
  }
}

function setup() {
  const r2 = new FakeR2();
  const order: string[] = [];
  const hooks = { putFails: null as string | null, putThrows: false, headNull: false as boolean | string, headSize: new Map<string, number>() };
  const bucket: IngestBucket = {
    put: async (key, value) => {
      if (hooks.putThrows || hooks.putFails === key) throw new Error("R2 down");
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(await new Response(value).arrayBuffer());
      r2.put(key, bytes);
      order.push(key);
    },
    head: async (key) => {
      if (hooks.headNull === true || hooks.headNull === key) return null;
      const h = await r2.head(key);
      return h !== null && hooks.headSize.has(key) ? { size: hooks.headSize.get(key) as number } : h;
    },
    list: (o) => r2.list(o),
    delete: (k) => r2.delete(k),
  };
  const source = new FakeSource();
  const ingestor = new WorldIngestor(source, bucket);
  const keys = () => [...r2.objects.keys()].sort();
  return { r2, order, hooks, source, ingestor, keys };
}

describe("WorldIngestor", () => {
  it("copies every file under the world's bundle, writes world.json last, and answers the manifest", async () => {
    const t = setup();
    const r = await t.ingestor.ingest(JOB);
    expect(r.ok).toBe(true);
    if (!r.ok || !("manifest" in r)) return;
    expect(t.keys()).toEqual([
      `worlds/${WORLD}/collider.glb`, `worlds/${WORLD}/pano.jpg`, `worlds/${WORLD}/splat-500k.spz`, `worlds/${WORLD}/splat-full.spz`, `worlds/${WORLD}/thumb.png`, `worlds/${WORLD}/world.json`,
    ]);
    expect(t.order[t.order.length - 1]).toBe(`worlds/${WORLD}/${MANIFEST_NAME}`);
    expect(t.order).toHaveLength(6);
    expect(r.manifest).toMatchObject({ id: WORLD, title: "The kitchen", brief: "A narrow kitchen.", source: "sketch", createdAt: JOB.createdAt });
    expect(r.manifest.assets.splat.map((s) => s.path)).toEqual(["splat-500k.spz", "splat-full.spz"]);
    expect(r.manifest.assets.splat.every((s) => s.bytes === 10)).toBe(true);
    expect(WorldManifestSchema.safeParse(r.manifest).success).toBe(true);
    // The stored world.json is the manifest.
    const stored = JSON.parse(new TextDecoder().decode(t.r2.objects.get(`worlds/${WORLD}/world.json`)!.bytes));
    expect(stored).toEqual(r.manifest);
    // The bytes are the ones served.
    expect([...t.r2.objects.get(`worlds/${WORLD}/splat-500k.spz`)!.bytes]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("keeps the placeholder pose for a world that comes with no pose, and uses the pose of one that does", async () => {
    const plain = setup();
    const a = await plain.ingestor.ingest(JOB);
    expect(a.ok && "manifest" in a && a.manifest).toMatchObject({ orientation: { upFix: [0, 0, 0, 1], scale: 1 }, floorY: 0 });

    const posed = setup();
    posed.source.world = { ...FULL, pose: { frame: "marble_raw_opencv", metricScaleFactor: 1.23, groundPlaneOffset: 0.42 } };
    const b = await posed.ingestor.ingest(JOB);
    expect(b.ok && "manifest" in b && b.manifest).toMatchObject({ orientation: { upFix: [1, 0, 0, 0], scale: 1.23 }, floorY: -0.42 });
    // The stored world.json carries it too.
    const stored = JSON.parse(new TextDecoder().decode(posed.r2.objects.get(`worlds/${WORLD}/world.json`)!.bytes));
    expect(stored.orientation).toEqual({ upFix: [1, 0, 0, 0], scale: 1.23 });
    expect(stored.floorY).toBeCloseTo(-0.42, 10);
    expect(stored.spawn.position[1]).toBeCloseTo(1.6 - 0.42, 10);
  });

  it("copies a file served as a stream as well as one served as bytes", async () => {
    const t = setup();
    for (const a of [FULL.splats[0]!, FULL.splats[1]!, FULL.collider!, FULL.pano!, FULL.thumb!]) t.source.serve.set(a.url, { bytes: Uint8Array.from([5, 6, 7]), stream: true });
    const r = await t.ingestor.ingest(JOB);
    expect(r.ok).toBe(true);
    expect([...t.r2.objects.get(`worlds/${WORLD}/collider.glb`)!.bytes]).toEqual([5, 6, 7]);
  });

  it("fetches the splats first, then the collider, panorama and thumbnail", async () => {
    const t = setup();
    await t.ingestor.ingest(JOB);
    expect(t.source.fetched).toEqual([FULL.splats[0]!.url, FULL.splats[1]!.url, FULL.collider!.url, FULL.pano!.url, FULL.thumb!.url]);
  });

  describe("an optional file that is missing, empty, refused or odd", () => {
    it("is left out of the bundle and the manifest, and the world is ready", async () => {
      const t = setup();
      t.source.world = { splats: FULL.splats, pano: FULL.pano!, thumb: FULL.thumb! }; // no collider
      t.source.serve.set(FULL.pano!.url, { bytes: new Uint8Array(0) }); // empty panorama
      t.source.serve.set(FULL.thumb!.url, { failure: { ok: false, kind: "rejected" } }); // refused thumbnail
      const r = await t.ingestor.ingest(JOB);
      expect(r.ok).toBe(true);
      if (!r.ok || !("manifest" in r)) return;
      expect(Object.keys(r.manifest.assets)).toEqual(["splat"]);
      expect(t.keys()).toEqual([`worlds/${WORLD}/splat-500k.spz`, `worlds/${WORLD}/splat-full.spz`, `worlds/${WORLD}/world.json`]);
    });

    it("is skipped without being fetched when its format is not one the role has", async () => {
      const t = setup();
      t.source.world = { splats: FULL.splats, collider: { role: "collider", format: "exe", url: `${HOST}/c.exe` } };
      const r = await t.ingestor.ingest(JOB);
      expect(r.ok).toBe(true);
      expect(t.source.fetched).not.toContain(`${HOST}/c.exe`);
    });

    it("is skipped, and its body cancelled, when it is bigger than the cap", async () => {
      const t = setup();
      t.source.serve.set(FULL.collider!.url, { bytes: Uint8Array.from([1]), size: MAX_ASSET_BYTES + 1, stream: true });
      const r = await t.ingestor.ingest(JOB);
      expect(r.ok && Object.keys((r as { manifest: { assets: object } }).manifest.assets)).not.toContain("collider");
      expect(t.source.cancelled).toEqual([FULL.collider!.url]);
      expect(t.keys()).not.toContain(`worlds/${WORLD}/collider.glb`);
    });

    it("is deleted and skipped when the stored object is not the size it was told", async () => {
      const t = setup();
      t.source.serve.set(FULL.pano!.url, { bytes: Uint8Array.from([1, 2, 3]), size: 99 });
      const r = await t.ingestor.ingest(JOB);
      expect(r.ok).toBe(true);
      expect(t.keys()).not.toContain(`worlds/${WORLD}/pano.jpg`);
    });
  });

  describe("a splat that is missing, empty, refused, too big or odd", () => {
    const failing: [string, (t: ReturnType<typeof setup>) => void][] = [
      ["missing", (t) => { t.source.world = { splats: [], collider: FULL.collider!, pano: FULL.pano!, thumb: FULL.thumb! }; }],
      ["empty", (t) => { for (const s of FULL.splats) t.source.serve.set(s.url, { bytes: new Uint8Array(0) }); }],
      ["refused", (t) => { for (const s of FULL.splats) t.source.serve.set(s.url, { failure: { ok: false, kind: "rejected" } }); }],
      ["too big", (t) => { for (const s of FULL.splats) t.source.serve.set(s.url, { bytes: Uint8Array.from([1]), size: MAX_ASSET_BYTES + 1 }); }],
      ["in a format the role does not have", (t) => { t.source.world = { ...FULL, splats: [{ role: "splat", format: "exe", url: `${HOST}/s.exe` }] }; }],
      ["stored at the wrong size", (t) => { for (const s of FULL.splats) t.source.serve.set(s.url, { bytes: Uint8Array.from([1, 2]), size: 50 }); }],
    ];
    for (const [name, setUp] of failing) {
      it(`fails the ingest and leaves nothing in the bundle: ${name}`, async () => {
        const t = setup();
        setUp(t);
        expect(await t.ingestor.ingest(JOB)).toEqual({ ok: false, code: "ingest_failed" });
        expect(t.keys()).toEqual([]);
      });
    }

    it("is still a world when one of two splats is unusable", async () => {
      const t = setup();
      t.source.serve.set(FULL.splats[0]!.url, { bytes: new Uint8Array(0) });
      const r = await t.ingestor.ingest(JOB);
      expect(r.ok && (r as { manifest: { assets: { splat: { path: string }[] } } }).manifest.assets.splat.map((s) => s.path)).toEqual(["splat-full.spz"]);
    });
  });

  describe("what the service or storage fails with", () => {
    it("hands a rate limit, a fault and an out-of-credits answer back to the job, to wait and try again", async () => {
      for (const failure of [{ ok: false, kind: "rate_limited", retryAfterMs: 5000 }, { ok: false, kind: "transient" }, { ok: false, kind: "no_credits" }] as UpstreamFailure[]) {
        const t = setup();
        t.source.serve.set(FULL.splats[1]!.url, { failure });
        expect(await t.ingestor.ingest(JOB)).toEqual(failure);
      }
    });

    it("hands the same back when an optional file is rate limited, because a retry may get it", async () => {
      const t = setup();
      t.source.serve.set(FULL.collider!.url, { failure: { ok: false, kind: "rate_limited" } });
      expect(await t.ingestor.ingest(JOB)).toEqual({ ok: false, kind: "rate_limited" });
    });

    it("reads a throw from the service, or from storage, as a fault", async () => {
      const a = setup();
      a.source.serve.set(FULL.splats[0]!.url, { throws: true });
      expect(await a.ingestor.ingest(JOB)).toEqual({ ok: false, kind: "transient" });
      const b = setup();
      b.hooks.putThrows = true;
      expect(await b.ingestor.ingest(JOB)).toEqual({ ok: false, kind: "transient" });
    });

    it("answers a fault from the service when it is asked for the world, and ingest_failed when it refuses", async () => {
      for (const failure of [{ ok: false, kind: "rate_limited", retryAfterMs: 1 }, { ok: false, kind: "transient" }, { ok: false, kind: "no_credits" }] as UpstreamFailure[]) {
        const t = setup();
        t.source.world = failure;
        expect(await t.ingestor.ingest(JOB)).toEqual(failure);
      }
      const t = setup();
      t.source.world = { ok: false, kind: "rejected" };
      expect(await t.ingestor.ingest(JOB)).toEqual({ ok: false, code: "ingest_failed" });
    });

    it("does not call the manifest done unless world.json is stored at the size it was written", async () => {
      const a = setup();
      a.hooks.putFails = `worlds/${WORLD}/world.json`;
      expect(await a.ingestor.ingest(JOB)).toEqual({ ok: false, kind: "transient" });
      const b = setup();
      b.hooks.headNull = `worlds/${WORLD}/world.json`;
      expect(await b.ingestor.ingest(JOB)).toEqual({ ok: false, kind: "transient" });
      const c = setup();
      c.hooks.headSize.set(`worlds/${WORLD}/world.json`, 1);
      expect(await c.ingestor.ingest(JOB)).toEqual({ ok: false, kind: "transient" });
    });

    it("skips a file whose stored object cannot be found, and fails when that was the only splat", async () => {
      const t = setup();
      t.source.world = { splats: [FULL.splats[0]!] };
      t.hooks.headNull = `worlds/${WORLD}/splat-500k.spz`;
      expect(await t.ingestor.ingest(JOB)).toEqual({ ok: false, code: "ingest_failed" });
    });
  });

  it("keeps one file for each name: a second file under the same name is not fetched, so the manifest and the bundle agree", async () => {
    const t = setup();
    const twin = { ...FULL.splats[0]!, url: `${HOST}/twin.spz` };
    t.source.world = { splats: [FULL.splats[0]!, twin] };
    t.source.serve.set(twin.url, { bytes: Uint8Array.from([9, 9, 9, 9, 9, 9]) });
    const r = await t.ingestor.ingest(JOB);
    expect(t.source.fetched).toEqual([FULL.splats[0]!.url]);
    expect(r.ok && (r as { manifest: { assets: { splat: { bytes: number }[] } } }).manifest.assets.splat[0]?.bytes).toBe(10);
    expect(t.r2.objects.get(`worlds/${WORLD}/splat-500k.spz`)!.bytes.byteLength).toBe(10);
  });

  it("copies at most 8 splats", async () => {
    const t = setup();
    const lods = ["100k", "500k", "full", undefined] as const;
    // Twelve different names: four levels of detail in three formats.
    t.source.world = { splats: Array.from({ length: 12 }, (_, i) => { const lod = lods[i % 4]; return { role: "splat" as const, format: ["spz", "ply", "splat"][Math.floor(i / 4)] as string, url: `${HOST}/s${i}`, ...(lod ? { lod } : {}) }; }) };
    const r = await t.ingestor.ingest(JOB);
    expect(t.source.fetched).toHaveLength(8);
    expect(r.ok && (r as { manifest: { assets: { splat: unknown[] } } }).manifest.assets.splat).toHaveLength(8);
  });

  it("leaves no address of the service in the answer, the bundle or the manifest", async () => {
    const t = setup();
    const r = await t.ingestor.ingest(JOB);
    expect(JSON.stringify(r)).not.toContain("upstream.invalid");
    for (const [key, o] of t.r2.objects) {
      expect(key).not.toContain("upstream");
      if (key.endsWith("world.json")) expect(new TextDecoder().decode(o.bytes)).not.toMatch(/upstream|https?:\/\//);
    }
    const failed = setup();
    failed.source.world = { splats: [] };
    expect(JSON.stringify(await failed.ingestor.ingest(JOB))).not.toContain("upstream.invalid");
  });

  it("cleans every page of a long bundle when it fails", async () => {
    const t = setup();
    t.r2.pageSize = 2;
    for (let i = 0; i < 7; i++) t.r2.put(`worlds/${WORLD}/old-${i}`, "x");
    t.r2.put("worlds/w-other/keep.spz", "x");
    t.source.world = { splats: [] };
    await t.ingestor.ingest(JOB);
    expect(t.keys()).toEqual(["worlds/w-other/keep.spz"]);
  });

  it("can run again after a retry: files are overwritten and the manifest is rewritten", async () => {
    const t = setup();
    await t.ingestor.ingest(JOB);
    const r = await t.ingestor.ingest({ ...JOB, createdAt: JOB.createdAt + 1 });
    expect(r.ok && (r as { manifest: { createdAt: number } }).manifest.createdAt).toBe(JOB.createdAt + 1);
    expect(t.keys()).toHaveLength(6);
  });
});
