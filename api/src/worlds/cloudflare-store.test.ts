import { describe, expect, it } from "vitest";
import { CloudflareWorldStore, type PlaySessionPurger } from "./cloudflare-store";
import { FakeJobs, FakeR2 } from "./fake-cloudflare";
import { sampleManifest } from "./test-kit";

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;
const at = (ageMs: number) => new Date(NOW - ageMs);

const setup = (playSessions?: PlaySessionPurger) => {
  const bucket = new FakeR2();
  const jobs = new FakeJobs();
  const store = new CloudflareWorldStore({ bucket, jobs, ...(playSessions ? { playSessions } : {}) });
  const putRecord = async (id: string, over: Record<string, unknown> = {}) =>
    jobs.get(id).fetch("https://world-job/record", { method: "PUT", body: JSON.stringify({ id, kind: "user", ownerSid: "sid-a", status: "ready", manifest: sampleManifest(id), ...over }) });
  const putGallery = (id: string, manifestId = id) => {
    bucket.put(`gallery/${id}/world.json`, JSON.stringify(sampleManifest(manifestId)));
    bucket.put(`gallery/${id}/thumb.jpg`, Uint8Array.from([1, 2, 3]));
  };
  return { bucket, jobs, store, putRecord, putGallery };
};

describe("find", () => {
  it("reads a user world from its WorldJob", async () => {
    const { store, putRecord } = setup();
    await putRecord("w-1");
    expect(await store.find("w-1")).toMatchObject({ id: "w-1", kind: "user", ownerSid: "sid-a", status: "ready" });
  });

  it("reads a Gallery world from its manifest, and never wakes a WorldJob for it", async () => {
    const { store, putGallery, jobs } = setup();
    putGallery("greenhouse");
    const w = await store.find("greenhouse");
    expect(w).toMatchObject({ id: "greenhouse", kind: "gallery", status: "ready", title: "The kitchen" });
    expect(w?.ownerSid).toBeUndefined();
    expect(jobs.asked).toEqual([]);
  });

  it("does not trust a Gallery manifest that names another world, or one that does not fit", async () => {
    const { store, putGallery, bucket } = setup();
    putGallery("greenhouse", "someone-else");
    expect(await store.find("greenhouse")).toBeNull();
    bucket.put("gallery/broken/world.json", JSON.stringify({ ...sampleManifest("broken"), assets: { splat: [] } }));
    expect(await store.find("broken")).toBeNull();
    bucket.put("gallery/notjson/world.json", "{nope");
    expect(await store.find("notjson")).toBeNull();
  });

  it("finds nothing for an id nobody has", async () => {
    expect(await setup().store.find("w-none")).toBeNull();
  });

  it("finds nothing when the WorldJob holds a record that does not fit, or one for another id", async () => {
    const { store, jobs } = setup();
    // The Durable Object would refuse to store these; this is what a damaged or older record would look like.
    for (const bad of [{ id: "w-bad", kind: "user", ownerSid: "s", status: "bogus" }, { id: "w-bad", kind: "user", status: "ready" }, {}, "text", 7]) {
      jobs.get = () => ({ fetch: async () => new Response(JSON.stringify(bad), { status: 200 }) });
      expect(await store.find("w-bad"), JSON.stringify(bad)).toBeNull();
    }
    const { store: s2, jobs: j2 } = setup();
    await j2.get("w-1").fetch("https://world-job/record", { method: "PUT", body: JSON.stringify({ id: "w-2", kind: "user", ownerSid: "s", status: "ready" }) });
    expect(await s2.find("w-1")).toBeNull();
  });

  it("finds nothing, and does not throw, when the WorldJob answers with an error", async () => {
    const { store, jobs } = setup();
    jobs.get = () => ({ fetch: async () => new Response("boom", { status: 500 }) });
    expect(await store.find("w-1")).toBeNull();
  });

  it("is not fooled by a user record sitting under a Gallery id", async () => {
    const { store, putGallery, putRecord } = setup();
    putGallery("greenhouse");
    await putRecord("greenhouse", { ownerSid: "sid-thief" });
    expect((await store.find("greenhouse"))?.kind).toBe("gallery");
  });
});

describe("stat and read", () => {
  it("find a user's file under worlds/ and a Gallery file under gallery/", async () => {
    const { store, bucket, putRecord, putGallery } = setup();
    await putRecord("w-1");
    bucket.put("worlds/w-1/thumb.jpg", Uint8Array.from([9, 9]));
    putGallery("greenhouse");
    const user = (await store.find("w-1"))!;
    const gallery = (await store.find("greenhouse"))!;
    expect(await store.stat(user, "thumb.jpg")).toEqual({ size: 2 });
    expect(await store.stat(gallery, "thumb.jpg")).toEqual({ size: 3 });
    expect(await store.stat(user, "nope.jpg")).toBeNull();
    // A user world cannot reach a Gallery file with the same name, or the other way round.
    expect(await store.stat(gallery, "world.json")).not.toBeNull();
    expect(await store.stat(user, "world.json")).toBeNull();
  });

  it("read the whole file or a range of it as a stream", async () => {
    const { store, bucket, putRecord } = setup();
    await putRecord("w-1");
    bucket.put("worlds/w-1/splat.spz", Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]));
    const w = (await store.find("w-1"))!;
    const all = await store.read(w, "splat.spz");
    expect(new Uint8Array(await new Response(all as ReadableStream).arrayBuffer())).toEqual(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]));
    const part = await store.read(w, "splat.spz", { start: 2, end: 4 });
    expect(new Uint8Array(await new Response(part as ReadableStream).arrayBuffer())).toEqual(Uint8Array.from([2, 3, 4]));
    expect(await store.read(w, "gone.spz")).toBeNull();
  });
});

describe("purge", () => {
  const seedWorld = async (ctx: ReturnType<typeof setup>, id: string) => {
    await ctx.putRecord(id, { imageId: `img-${id}`, candidateIds: [`c1-${id}`, `c2-${id}`] });
    ctx.bucket.put(`uploads/img-${id}`, "u").put(`candidates/c1-${id}`, "c").put(`candidates/c2-${id}`, "c");
    ctx.bucket.put(`worlds/${id}/world.json`, "{}").put(`worlds/${id}/splat.spz`, "s").put(`sprites/${id}`, "p");
  };

  it("removes the upload, candidates, bundle, sprite and record of that world, and no one else's", async () => {
    const ctx = setup();
    await seedWorld(ctx, "w-1");
    await seedWorld(ctx, "w-2");
    ctx.putGallery("greenhouse");
    await ctx.store.purge("w-1");
    expect([...ctx.bucket.objects.keys()].sort()).toEqual([
      "candidates/c1-w-2", "candidates/c2-w-2", "gallery/greenhouse/thumb.jpg", "gallery/greenhouse/world.json",
      "sprites/w-2", "uploads/img-w-2", "worlds/w-2/splat.spz", "worlds/w-2/world.json",
    ]);
    expect(await ctx.store.find("w-1")).toBeNull();
    expect(await ctx.store.find("w-2")).not.toBeNull();
  });

  it("deletes the record last, so a purge that failed half way can be run again", async () => {
    const ctx = setup();
    await seedWorld(ctx, "w-1");
    ctx.bucket.delete = async () => { throw new Error("R2 is down"); };
    await expect(ctx.store.purge("w-1")).rejects.toThrow("R2 is down");
    expect(await ctx.store.find("w-1")).not.toBeNull();
    expect(ctx.jobs.calls.filter((c) => c.startsWith("DELETE"))).toEqual([]);
  });

  it("asks the play sessions to go, once, for that world", async () => {
    const asked: string[] = [];
    const ctx = setup({ deleteForWorld: async (id) => void asked.push(id) });
    await seedWorld(ctx, "w-1");
    await ctx.store.purge("w-1");
    expect(asked).toEqual(["w-1"]);
  });

  it("clears the leftovers of a world that has no record, and can be run twice", async () => {
    const ctx = setup();
    ctx.bucket.put("worlds/w-9/world.json", "{}").put("sprites/w-9", "p");
    await ctx.store.purge("w-9");
    await ctx.store.purge("w-9");
    expect(ctx.bucket.objects.size).toBe(0);
  });

  it("never deletes a Gallery world, even when asked for its id", async () => {
    const ctx = setup();
    ctx.putGallery("greenhouse");
    await ctx.store.purge("greenhouse");
    expect(ctx.bucket.objects.has("gallery/greenhouse/world.json")).toBe(true);
    expect(await ctx.store.find("greenhouse")).not.toBeNull();
  });

  it("does not touch a picture a Gallery-looking record would name", async () => {
    const ctx = setup();
    ctx.putGallery("greenhouse");
    await ctx.putRecord("w-1", { imageId: "greenhouse" });
    ctx.bucket.put("uploads/greenhouse", "x");
    await ctx.store.purge("w-1");
    expect(ctx.bucket.objects.has("gallery/greenhouse/world.json")).toBe(true);
  });

  it("deletes in batches of 1000", async () => {
    const ctx = setup();
    await ctx.putRecord("w-1");
    for (let i = 0; i < 2300; i++) ctx.bucket.put(`worlds/w-1/f${String(i).padStart(5, "0")}`, "x");
    await ctx.store.purge("w-1");
    expect(ctx.bucket.deletes.map((d) => d.length)).toEqual([1000, 1000, 301]);
    expect(ctx.bucket.objects.size).toBe(0);
  });
});

describe("inventory", () => {
  it("lists uploads, candidates, bundles and sprites with their age and world, and no Gallery object", async () => {
    const { store, bucket, putGallery } = setup();
    bucket.put("uploads/i1", "x", at(2 * HOUR)).put("candidates/c1", "x", at(3 * HOUR));
    bucket.put("worlds/w-1/world.json", "x", at(HOUR)).put("sprites/w-1", "x", at(4 * HOUR));
    putGallery("greenhouse");
    const inv = (await store.inventory()).sort((a, b) => a.key.localeCompare(b.key));
    expect(inv).toEqual([
      { key: "candidates/c1", kind: "candidate", createdAt: NOW - 3 * HOUR },
      { key: "sprites/w-1", kind: "sprite", createdAt: NOW - 4 * HOUR, worldId: "w-1" },
      { key: "uploads/i1", kind: "upload", createdAt: NOW - 2 * HOUR },
      { key: "worlds/w-1/world.json", kind: "world", createdAt: NOW - HOUR, worldId: "w-1" },
    ]);
  });

  it("reads every page of a long listing", async () => {
    const { store, bucket } = setup();
    for (let i = 0; i < 2500; i++) bucket.put(`uploads/i${String(i).padStart(5, "0")}`, "x");
    expect(await store.inventory()).toHaveLength(2500);
  });

  it("stops after 100 pages of a prefix, so a run cannot go on for ever", async () => {
    const { store, bucket } = setup();
    bucket.pageSize = 2;
    for (let i = 0; i < 300; i++) bucket.put(`uploads/i${String(i).padStart(5, "0")}`, "x");
    expect(await store.inventory()).toHaveLength(200);
  });

  it("ignores a key under a user prefix that is none of the kinds", async () => {
    const { store, bucket } = setup();
    bucket.put("worlds/loose-file", "x");
    expect(await store.inventory()).toEqual([]);
  });
});

describe("removeObjects", () => {
  it("deletes user objects and refuses any other key, Gallery above all", async () => {
    const { store, bucket, putGallery } = setup();
    putGallery("greenhouse");
    bucket.put("uploads/i1", "x").put("worlds/w-1/a", "x").put("other/x", "x");
    await store.removeObjects(["uploads/i1", "worlds/w-1/a", "gallery/greenhouse/world.json", "other/x", "sprites/never-there"]);
    expect([...bucket.objects.keys()].sort()).toEqual(["gallery/greenhouse/thumb.jpg", "gallery/greenhouse/world.json", "other/x"]);
  });

  it("deletes each key once, in batches of 1000, and does nothing for no keys", async () => {
    const { store, bucket } = setup();
    const keys = Array.from({ length: 1500 }, (_, i) => `uploads/i${i}`);
    for (const k of keys) bucket.put(k, "x");
    await store.removeObjects([...keys, ...keys.slice(0, 10)]);
    expect(bucket.deletes.map((d) => d.length)).toEqual([1000, 500]);
    await store.removeObjects([]);
    expect(bucket.deletes).toHaveLength(2);
  });
});

describe("create and update", () => {
  const record = (over: Record<string, unknown> = {}) => ({ id: "w-1", kind: "user" as const, ownerSid: "sid-a", status: "queued" as const, ...over });

  it("makes a record once and says no to a second with the same id", async () => {
    const { store, jobs } = setup();
    expect(await store.create(record())).toBe(true);
    expect(await store.create(record({ ownerSid: "sid-thief" }))).toBe(false);
    expect(await store.find("w-1")).toMatchObject({ ownerSid: "sid-a", status: "queued" });
    expect(jobs.asked).toContain("w-1");
  });

  it("throws, rather than pretend, when the WorldJob refuses a record", async () => {
    const { store } = setup();
    await expect(store.create(record({ ownerSid: "" }))).rejects.toThrow(/refused/);
    await expect(store.create({ ...record(), kind: "gallery" })).rejects.toThrow(/refused/);
  });

  it("changes a record, and never its owner, kind or id", async () => {
    const { store } = setup();
    await store.create(record());
    expect(await store.update("w-1", { status: "failed", failure: { code: "timeout", quotaReturned: true, retryAllowed: true } })).toMatchObject({ status: "failed", ownerSid: "sid-a" });
    const sneaky = { status: "ready", ownerSid: "sid-thief", id: "w-other", kind: "gallery" } as unknown as Parameters<typeof store.update>[1];
    expect(await store.update("w-1", sneaky)).toMatchObject({ id: "w-1", ownerSid: "sid-a", kind: "user", status: "ready" });
  });

  it("answers null for a record that is not there, or a change that does not fit", async () => {
    const { store } = setup();
    expect(await store.update("w-none", { status: "ready" })).toBeNull();
    await store.create(record());
    expect(await store.update("w-1", { status: "weird" } as unknown as Parameters<typeof store.update>[1])).toBeNull();
    expect((await store.find("w-1"))?.status).toBe("queued");
  });

  it("throws when the WorldJob fails for another reason", async () => {
    const { store, jobs } = setup();
    jobs.get = () => ({ fetch: async () => new Response("boom", { status: 500 }) });
    await expect(store.update("w-1", { status: "ready" })).rejects.toThrow(/refused/);
    await expect(store.create(record())).rejects.toThrow(/refused/);
  });
});

describe("galleryManifests (world-pipeline 9.2)", () => {
  const withClock = () => {
    const bucket = new FakeR2();
    const jobs = new FakeJobs();
    let t = NOW;
    const store = new CloudflareWorldStore({ bucket, jobs, now: () => t });
    const put = (id: string, manifest: unknown = sampleManifest(id)) => bucket.put(`gallery/${id}/world.json`, typeof manifest === "string" ? manifest : JSON.stringify(manifest));
    return { bucket, jobs, store, put, tick: (ms: number) => { t += ms; } };
  };

  it("reads each Gallery world's manifest, and nothing else: not its files, not a user's world", async () => {
    const { bucket, store, put } = withClock();
    put("greenhouse");
    put("attic-room");
    bucket.put("gallery/greenhouse/thumb.jpg", Uint8Array.from([1]));
    bucket.put("gallery/greenhouse/splat-500k.spz", Uint8Array.from([1]));
    bucket.put("worlds/w-1/world.json", JSON.stringify(sampleManifest("w-1")));
    bucket.put("uploads/abc", Uint8Array.from([1]));
    const list = await store.galleryManifests();
    expect(list.map((m) => m.id).sort()).toEqual(["attic-room", "greenhouse"]);
  });

  it("is empty when there is no Gallery", async () => {
    const { store } = withClock();
    expect(await store.galleryManifests()).toEqual([]);
  });

  it("does not trust a manifest that names another world, is not JSON, or does not fit, or a folder that is not a plain Gallery id", async () => {
    const { store, put, bucket } = withClock();
    put("good-world");
    put("liar", sampleManifest("someone-else"));
    put("broken", "{ not json");
    put("misfit", { ...sampleManifest("misfit"), assets: { splat: [] } });
    for (const bad of ["Bad_Id", "ab", "-lead", "trail-", "a/b", "UPPER"]) bucket.put(`gallery/${bad}/world.json`, JSON.stringify(sampleManifest(bad)));
    bucket.put("gallery/world.json", JSON.stringify(sampleManifest("world")));
    bucket.put("gallery//world.json", JSON.stringify(sampleManifest("x")));
    expect((await store.galleryManifests()).map((m) => m.id)).toEqual(["good-world"]);
  });

  it("lists at most 50 worlds", async () => {
    const { store, put } = withClock();
    for (let i = 0; i < 60; i++) put(`world-${String(i).padStart(3, "0")}`);
    expect(await store.galleryManifests()).toHaveLength(50);
  });

  it("keeps the answer for 30 seconds: a second call reads nothing, a call at 30 seconds reads again and sees a new world", async () => {
    const { bucket, store, put, tick } = withClock();
    put("greenhouse");
    expect((await store.galleryManifests()).length).toBe(1);
    const lists = bucket.lists.length;
    put("attic-room");
    tick(29_999);
    expect((await store.galleryManifests()).length).toBe(1);
    expect(bucket.lists.length).toBe(lists);
    tick(1);
    expect((await store.galleryManifests()).length).toBe(2);
    expect(bucket.lists.length).toBe(lists + 1);
  });

  it("does not keep a failed read, and does not hide it", async () => {
    const { bucket, store, put } = withClock();
    put("greenhouse");
    const get = bucket.get.bind(bucket);
    let fail = true;
    bucket.get = (async (key: string) => { if (fail) throw new Error("R2 is down"); return get(key); }) as typeof bucket.get;
    await expect(store.galleryManifests()).rejects.toThrow("R2 is down");
    fail = false;
    expect((await store.galleryManifests()).length).toBe(1);
  });

  it("reads again when the clock has gone backwards, rather than trust a time it cannot compare", async () => {
    const { bucket, store, put, tick } = withClock();
    put("greenhouse");
    await store.galleryManifests();
    const lists = bucket.lists.length;
    tick(-1000);
    await store.galleryManifests();
    expect(bucket.lists.length).toBe(lists + 1);
  });

  it("reads only manifests: a stray file under gallery/ is never taken for one", async () => {
    const { bucket, store, put } = withClock();
    put("greenhouse");
    bucket.put("gallery/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Uint8Array.from([1]));
    bucket.put("gallery/greenhouse/thumb.jpg", Uint8Array.from([1]));
    bucket.put("gallery/greenhouse/notworld.json", Uint8Array.from([1]));
    const keys: string[] = [];
    const get = bucket.get.bind(bucket);
    bucket.get = (async (key: string, o?: never) => { keys.push(key); return get(key, o); }) as typeof bucket.get;
    await store.galleryManifests();
    expect(keys).toEqual(["gallery/greenhouse/world.json"]);
  });

  it("reads each manifest by its own key, so a user world with a Gallery-like id is never read as one", async () => {
    const { bucket, store, put } = withClock();
    put("greenhouse");
    const keys: string[] = [];
    const get = bucket.get.bind(bucket);
    bucket.get = (async (key: string, o?: never) => { keys.push(key); return get(key, o); }) as typeof bucket.get;
    await store.galleryManifests();
    expect(keys).toEqual(["gallery/greenhouse/world.json"]);
  });
});

describe("the share flag", () => {
  it("is kept by the WorldJob when the owner sets it, and read back", async () => {
    const { store, putRecord } = setup();
    await putRecord("w-1");
    expect((await store.update("w-1", { shared: true }))?.shared).toBe(true);
    expect((await store.find("w-1"))?.shared).toBe(true);
    expect((await store.update("w-1", { shared: false }))?.shared).toBe(false);
  });
});
