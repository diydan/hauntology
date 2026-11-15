import { afterEach, describe, expect, it } from "vitest";
import examples from "../../shared/fixtures/worldlabs/docs-examples.json";
import worker, { SpendGuard, WorldJob, storeFor, type WorkerEnv } from "./worker";
import { FakeJobs, FakeNamespace, FakeR2 } from "./worlds/fake-cloudflare";
import { uploadKey } from "./worlds/keys";
import { COMMENT, EXIF, JFIF, makeJpeg } from "@hauntology/shared/world/upload-kit";
import { SECRET, sampleManifest, ORIGIN } from "./worlds/test-kit";

const NOW = 1_800_000_000_000;
const DAY = 24 * 3_600_000;

const KEY = "wlt_test_KEY_0123456789";
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** The Worker's bindings over fakes. `extra` is added to the environment: with `WLT_API_KEY` the Worker is set up to make worlds, and `WORLD_JOB` is then the real (live) `WorldJob`. */
const envWith = (extra: Record<string, string> = {}) => {
  const bucket = new FakeR2();
  const env = { HMAC_SECRET: SECRET, BUCKET: bucket, SPEND_GUARD: undefined, WORLD_JOB: undefined, ...extra } as unknown as WorkerEnv;
  const jobs = new FakeNamespace((state) => new WorldJob(state, env));
  const spend = new FakeNamespace((state) => new SpendGuard(state, {}));
  Object.assign(env, { WORLD_JOB: jobs, SPEND_GUARD: spend });
  return { bucket, jobs, spend, env };
};
const live = () => envWith({ WLT_API_KEY: KEY });
const ctx = () => {
  const pending: Promise<unknown>[] = [];
  return { ctx: { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext, done: () => Promise.all(pending), count: () => pending.length };
};

describe("worker", () => {
  it("exports the WorldJob and SpendGuard Durable Object classes", () => {
    expect(WorldJob).toBeTypeOf("function");
    expect(SpendGuard).toBeTypeOf("function");
  });

  it("serves a Gallery world through the real store, with no cookie", async () => {
    const { bucket, env } = envWith();
    bucket.put("gallery/greenhouse/world.json", JSON.stringify(sampleManifest("greenhouse")));
    const res = await worker.fetch(new Request(`${ORIGIN}/api/worlds/greenhouse`), env, ctx().ctx);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { id: string; status: string }).status).toBe("ready");
  });

  it("answers an id nobody has with the one 404", async () => {
    const { env } = envWith();
    const res = await worker.fetch(new Request(`${ORIGIN}/api/worlds/w-nobody`), env, ctx().ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, code: "world_not_found" });
  });

  it("shows the kill switch on the Home flags, and says world_gen_disabled for it", async () => {
    const { env, spend } = live();
    const before = await worker.fetch(new Request(`${ORIGIN}/api/session`), env, ctx().ctx);
    expect(((await before.json()) as { flags: { worldGenEnabled: boolean } }).flags.worldGenEnabled).toBe(true);
    await spend.get("global").fetch("https://spend-guard/kill", { method: "POST", body: JSON.stringify({ on: true }) });
    const after = await worker.fetch(new Request(`${ORIGIN}/api/session`), env, ctx().ctx);
    expect(((await after.json()) as { flags: { worldGenEnabled: boolean } }).flags.worldGenEnabled).toBe(false);
  });

  it("closes world creation on the Home flags when SpendGuard cannot be reached", async () => {
    const { env } = envWith();
    (env as unknown as { SPEND_GUARD: unknown }).SPEND_GUARD = { idFromName: (n: string) => n, get: () => ({ fetch: async () => { throw new Error("down"); } }) };
    const res = await worker.fetch(new Request(`${ORIGIN}/api/session`), env, ctx().ctx);
    expect(((await res.json()) as { flags: { worldGenEnabled: boolean; dayCapReached: boolean } }).flags).toMatchObject({ worldGenEnabled: false, dayCapReached: true });
  });

  it("runs the cleanup on the cron trigger with the scheduled time and the retention of the env", async () => {
    const { bucket, jobs, env } = envWith();
    bucket.put("uploads/old", "x", new Date(NOW - 25 * 3_600_000)).put("uploads/new", "x", new Date(NOW - 3_600_000));
    bucket.put("worlds/w-1/world.json", "x", new Date(NOW - 8 * DAY));
    await jobs.get("w-1").fetch("https://world-job/record", { method: "PUT", body: JSON.stringify({ id: "w-1", kind: "user", ownerSid: "s", status: "ready" }) });
    bucket.put("gallery/greenhouse/world.json", "x", new Date(NOW - 900 * DAY));
    const { ctx: c, done, count } = ctx();
    await worker.scheduled({ scheduledTime: NOW, cron: "17 * * * *", noRetry() {} } as ScheduledController, env, c);
    expect(count()).toBe(1); // the run is handed to waitUntil, so the isolate stays alive for it
    await done();
    expect([...bucket.objects.keys()].sort()).toEqual(["gallery/greenhouse/world.json", "uploads/new"]);
    expect(await storeFor(env).find("w-1")).toBeNull();
  });

  it("uses UPLOAD_TTL_HOURS and WORLD_TTL_DAYS on the cron trigger", async () => {
    const { bucket, env } = envWith();
    (env as { UPLOAD_TTL_HOURS?: string }).UPLOAD_TTL_HOURS = "1";
    bucket.put("uploads/a", "x", new Date(NOW - 2 * 3_600_000));
    const { ctx: c, done } = ctx();
    await worker.scheduled({ scheduledTime: NOW } as ScheduledController, env, c);
    await done();
    expect(bucket.objects.size).toBe(0);
  });

  it("gives a Quote for a picture the visitor owns, with the real places left, but will not make a world until a job starter exists", async () => {
    const { bucket, env } = envWith();
    const first = await worker.fetch(new Request(`${ORIGIN}/api/session`), env, ctx().ctx);
    const cookie = (first.headers.get("Set-Cookie") as string).split(";")[0] as string;
    const { verifySession } = await import("@hauntology/shared/session-cookie");
    const sid = ((await verifySession(cookie.slice(cookie.indexOf("=") + 1), SECRET, Math.floor(Date.now() / 1000))) as { sid: string }).sid;
    bucket.put("uploads/img-1", Uint8Array.from([1, 2, 3]), new Date(), { customMetadata: { ownerSid: sid, sha256: "ef".repeat(32), moderation: "safe" }, contentType: "image/png" });
    const headers = { Cookie: cookie, Origin: ORIGIN, "Content-Type": "application/json" };

    const quote = await worker.fetch(new Request(`${ORIGIN}/api/worlds/quote`, { method: "POST", headers, body: JSON.stringify({ imageId: "img-1" }) }), env, ctx().ctx);
    expect(quote.status).toBe(200);
    const q = (await quote.json()) as { imageUrl: string; quota: { world: number }; confirmToken: string };
    expect(q.imageUrl).toBe("/api/images/img-1");
    expect(q.quota.world).toBe(2);

    const create = await worker.fetch(new Request(`${ORIGIN}/api/worlds`, { method: "POST", headers, body: JSON.stringify({ imageId: "img-1", confirmToken: q.confirmToken }) }), env, ctx().ctx);
    expect(create.status).toBe(503);
    expect(await create.json()).toEqual({ ok: false, code: "world_gen_disabled" });

    const image = await worker.fetch(new Request(`${ORIGIN}/api/images/img-1`, { headers }), env, ctx().ctx);
    expect(image.status).toBe(200);
    expect(image.headers.get("Content-Type")).toBe("image/png");
  });
});

describe("worker: making a world (world-pipeline 6.1, 7.1, 7.3)", () => {
  const J = { "Content-Type": "application/json" };
  const visit = async (env: WorkerEnv) => {
    const res = await worker.fetch(new Request(`${ORIGIN}/api/session`), env, ctx().ctx);
    const cookie = (res.headers.get("Set-Cookie") as string).split(";")[0] as string;
    const payload = cookie.slice(cookie.indexOf("=") + 1).split(".")[1] as string;
    const sid = (JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { sid: string }).sid;
    return { sid, headers: { Cookie: cookie, Origin: ORIGIN, ...J } };
  };
  const flags = async (env: WorkerEnv) => ((await (await worker.fetch(new Request(`${ORIGIN}/api/session`), env, ctx().ctx)).json()) as { flags: { worldGenEnabled: boolean } }).flags;
  const addImage = (bucket: FakeR2, sid: string) =>
    bucket.put(uploadKey("img-1"), Uint8Array.from([137, 80, 78, 71, 9]), new Date(), { contentType: "image/png", customMetadata: { ownerSid: sid, sha256: "ab".repeat(32), moderation: "safe" } });
  const worldsLeft = async (env: WorkerEnv, v: { headers: Record<string, string> }) => {
    const quote = await worker.fetch(new Request(`${ORIGIN}/api/worlds/quote`, { method: "POST", headers: v.headers, body: JSON.stringify({ imageId: "img-1" }) }), env, ctx().ctx);
    return ((await quote.json()) as { quota: { world: number } }).quota.world;
  };
  const enter = async (env: WorkerEnv, v: { headers: Record<string, string> }) => {
    const quote = await worker.fetch(new Request(`${ORIGIN}/api/worlds/quote`, { method: "POST", headers: v.headers, body: JSON.stringify({ imageId: "img-1" }) }), env, ctx().ctx);
    const { confirmToken } = (await quote.json()) as { confirmToken: string };
    const res = await worker.fetch(new Request(`${ORIGIN}/api/worlds`, { method: "POST", headers: v.headers, body: JSON.stringify({ imageId: "img-1", confirmToken }) }), env, ctx().ctx);
    return { status: res.status, json: (await res.json()) as { worldId?: string; code?: string; status?: string } };
  };

  it("makes no world, shows worlds closed on Home and reserves nothing when there is no key", async () => {
    const { env, bucket, jobs } = envWith();
    expect((await flags(env)).worldGenEnabled).toBe(false);
    const v = await visit(env);
    addImage(bucket, v.sid);
    const r = await enter(env, v);
    expect(r.json.code).toBe("world_gen_disabled");
    expect(jobs.calls.filter((c) => !c.startsWith("GET"))).toEqual([]); // looked, made nothing
    expect(await worldsLeft(env, v)).toBe(2); // nothing was reserved
  });

  it("makes no world when the key is there but a setting about the service is not acceptable", async () => {
    for (const extra of [{ WORLD_MODEL: "marble-9" }, { WORLD_API_BASE: "https://evil.example" }]) {
      const { env, bucket } = envWith({ WLT_API_KEY: KEY, ...extra });
      expect((await flags(env)).worldGenEnabled, JSON.stringify(extra)).toBe(false);
      const v = await visit(env);
      addImage(bucket, v.sid);
      expect((await enter(env, v)).json.code).toBe("world_gen_disabled");
    }
  });

  it("keeps the switch of WORLD_GEN_ENABLED over the key", async () => {
    const { env } = envWith({ WLT_API_KEY: KEY, WORLD_GEN_ENABLED: "false" });
    expect((await flags(env)).worldGenEnabled).toBe(false);
  });

  it("with a key: shows worlds open, reserves a unit, starts the job, and the job asks the real service for the picture on its first wake", async () => {
    const asked: { url: string; key: string | null }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      asked.push({ url: String(input), key: new Headers(init.headers).get("WLT-Api-Key") });
      return new Response(JSON.stringify(examples.generate), { status: 200 });
    }) as typeof fetch;

    const { env, bucket, jobs } = live();
    expect((await flags(env)).worldGenEnabled).toBe(true);
    const v = await visit(env);
    addImage(bucket, v.sid);
    const r = await enter(env, v);
    expect(r.status).toBe(201);
    const worldId = r.json.worldId as string;
    expect(worldId).toMatch(/^w-/);
    expect(await worldsLeft(env, v)).toBe(1); // a unit is reserved
    expect(jobs.calls).toContain(`POST ${worldId}`);
    // Nothing has been sent to the service yet: the first wake does it.
    expect(asked).toEqual([]);

    const job = jobs.objects.get(worldId) as WorldJob;
    jobs.alarms.get(worldId)!.at = null;
    await job.alarm();
    expect(asked).toEqual([{ url: "https://api.worldlabs.ai/marble/v1/worlds:generate", key: KEY }]);
    const record = (await (await jobs.get(worldId).fetch("https://world-job/record")).json()) as { status: string };
    expect(record.status).toBe("generating");
  });

  const uploadPhoto = async (env: WorkerEnv, headers: Record<string, string>) => {
    const form = new FormData();
    form.append("photo", new File([makeJpeg({ width: 1024, height: 768, head: [JFIF(), EXIF(), COMMENT("12 Elm St")] })], "house.jpg", { type: "image/jpeg" }));
    const { "Content-Type": _drop, ...rest } = headers;
    const res = await worker.fetch(new Request(`${ORIGIN}/api/uploads`, { method: "POST", headers: rest, body: form }), env, ctx().ctx);
    const body = await res.text();
    let json: { imageId?: string; imageUrl?: string; code?: string } = {};
    try { json = JSON.parse(body); } catch { /* the route is not there: a plain 404 */ }
    return { status: res.status, json };
  };

  it("takes an upload only where a world can be made: with a key it keeps the stripped photo in R2 for its owner, without one the route is not there", async () => {
    const { env, bucket } = live();
    const v = await visit(env);
    const r = await uploadPhoto(env, v.headers);
    expect(r.status).toBe(201);
    const stored = bucket.objects.get(`uploads/${r.json.imageId}`)!;
    expect(stored.contentType).toBe("image/jpeg");
    expect(stored.customMetadata).toMatchObject({ ownerSid: v.sid, source: "upload" });
    expect(new TextDecoder("latin1").decode(stored.bytes)).not.toMatch(/Elm St|Exif/);
    // It is the owner's to read, and it is not yet checked, so the Quote refuses it.
    expect((await worker.fetch(new Request(`${ORIGIN}${r.json.imageUrl}`, { headers: v.headers }), env, ctx().ctx)).status).toBe(200);
    const quote = await worker.fetch(new Request(`${ORIGIN}/api/worlds/quote`, { method: "POST", headers: v.headers, body: JSON.stringify({ imageId: r.json.imageId }) }), env, ctx().ctx);
    expect([quote.status, await quote.json()]).toEqual([503, { ok: false, code: "moderation_unavailable" }]);

    const off = envWith();
    const w = await visit(off.env);
    expect((await uploadPhoto(off.env, w.headers)).status).toBe(404);
    expect(off.bucket.objects.size).toBe(0);
  });

  it("checks an uploaded photo with the Workers AI binding and makes it usable: upload, brief, then the Quote gives a token", async () => {
    const calls: { model: string; input: Record<string, any> }[] = [];
    const AI = { run: async (model: string, input: Record<string, any>) => { calls.push({ model, input }); return { response: JSON.stringify({ brief: "A narrow kitchen with a blue door.", safe: true }) }; } };
    const { env, bucket } = envWith({ WLT_API_KEY: KEY });
    (env as unknown as { AI: unknown }).AI = AI;
    const v = await visit(env);
    const up = await uploadPhoto(env, v.headers);
    const imageId = up.json.imageId as string;
    const quote = () => worker.fetch(new Request(`${ORIGIN}/api/worlds/quote`, { method: "POST", headers: v.headers, body: JSON.stringify({ imageId }) }), env, ctx().ctx);
    expect((await quote()).status).toBe(503); // not yet checked

    const res = await worker.fetch(new Request(`${ORIGIN}/api/places/brief`, { method: "POST", headers: v.headers, body: JSON.stringify({ imageId }) }), env, ctx().ctx);
    expect([res.status, await res.json()]).toEqual([200, { brief: "A narrow kitchen with a blue door.", safe: true }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.model).toBe("@cf/meta/llama-4-scout-17b-16e-instruct");
    expect(calls[0]!.input.messages[1].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    // The stored picture now carries the verdict and the brief, with its bytes, owner and type unchanged.
    const stored = bucket.objects.get(`uploads/${imageId}`)!;
    expect(stored.customMetadata).toMatchObject({ moderation: "safe", ownerSid: v.sid, source: "upload" });
    expect(stored.contentType).toBe("image/jpeg");
    const after = await quote();
    expect(after.status).toBe(200);
    const body = (await after.json()) as { confirmToken: string; quota: { llm: number } };
    expect(body.confirmToken).toBeTruthy();
    expect(body.quota.llm).toBe(39); // one unit of the llm meter was used
  });

  it("cannot check a photo, and so lets none through, when the Worker has no Workers AI binding, a model id it does not accept, or no key", async () => {
    for (const extra of [{ WLT_API_KEY: KEY }, { WLT_API_KEY: KEY, GHOST_MODEL_ID: "not-a-model" }]) {
      const { env } = envWith(extra);
      (env as unknown as { AI?: unknown }).AI = extra.GHOST_MODEL_ID === undefined ? undefined : { run: async () => { throw new Error("must not be called"); } };
      const v = await visit(env);
      const up = await uploadPhoto(env, v.headers);
      const res = await worker.fetch(new Request(`${ORIGIN}/api/places/brief`, { method: "POST", headers: v.headers, body: JSON.stringify({ imageId: up.json.imageId }) }), env, ctx().ctx);
      expect([res.status, await res.json()], JSON.stringify(extra)).toEqual([503, { ok: false, code: "moderation_unavailable" }]);
    }
    const none = envWith();
    (none.env as unknown as { AI: unknown }).AI = { run: async () => { throw new Error("must not be called"); } };
    const v = await visit(none.env);
    none.bucket.put("uploads/x", Uint8Array.from([1]), new Date(), { customMetadata: { ownerSid: v.sid, sha256: "ab".repeat(32) } });
    const res = await worker.fetch(new Request(`${ORIGIN}/api/places/brief`, { method: "POST", headers: v.headers, body: JSON.stringify({ imageId: "x" }) }), none.env, ctx().ctx);
    expect([res.status, await res.json()]).toEqual([503, { ok: false, code: "world_gen_disabled" }]);
  });

  it("takes no upload while the world switch is off, though a key is set", async () => {
    const { env, bucket } = envWith({ WLT_API_KEY: KEY, WORLD_GEN_ENABLED: "false" });
    const v = await visit(env);
    const r = await uploadPhoto(env, v.headers);
    expect([r.status, r.json.code]).toEqual([503, "world_gen_disabled"]);
    expect(bucket.objects.size).toBe(0);
  });

  describe("the operator's kill switch (world-pipeline 4.4)", () => {
    const ADMIN = "op-" + "k".repeat(40);
    const admin = (env: WorkerEnv, path: string, init: { method?: string; token?: string | null; body?: unknown } = {}) =>
      worker.fetch(
        new Request(`${ORIGIN}${path}`, { method: init.method ?? "GET", headers: init.token === null ? {} : { Authorization: `Bearer ${init.token ?? ADMIN}` }, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) }),
        env,
        ctx().ctx,
      );
    const kill = (env: WorkerEnv, on: boolean) => admin(env, "/admin/kill", { method: "POST", body: { on } });

    it("has no operator routes unless ADMIN_TOKEN is set to a token of at least 32 characters", async () => {
      for (const extra of [{}, { ADMIN_TOKEN: "" }, { ADMIN_TOKEN: "short" }, { ADMIN_TOKEN: "x".repeat(31) }]) {
        const { env } = envWith({ WLT_API_KEY: KEY, ...extra });
        for (const token of [ADMIN, "short", "x".repeat(31)]) {
          expect((await admin(env, "/admin/status", { token })).status, JSON.stringify(extra)).toBe(404);
          expect((await kill(env, true)).status).toBe(404);
        }
      }
    });

    it("closes new worlds, uploads and the Home screen on a running Worker, leaves the Gallery alone, and opens them again", async () => {
      const { env, bucket } = envWith({ WLT_API_KEY: KEY, ADMIN_TOKEN: ADMIN });
      bucket.put("gallery/greenhouse/world.json", JSON.stringify(sampleManifest("greenhouse")));
      const v = await visit(env);
      const status = async () => ((await (await admin(env, "/admin/status")).json()) as { worldGen: string; reasons: string[] });
      expect(await status()).toMatchObject({ worldGen: "open", reasons: [] });
      expect((await uploadPhoto(env, v.headers)).status).toBe(201);

      const closed = await kill(env, true);
      expect([closed.status, await closed.json()]).toMatchObject([200, { worldGen: "closed", reasons: ["kill_switch"], killed: true }]);
      expect((await flags(env)).worldGenEnabled).toBe(false);
      expect((await uploadPhoto(env, v.headers)).json.code).toBe("world_gen_disabled");
      expect(await status()).toMatchObject({ worldGen: "closed", reasons: ["kill_switch"] });
      const gallery = await worker.fetch(new Request(`${ORIGIN}/api/worlds/greenhouse`), env, ctx().ctx);
      expect(gallery.status).toBe(200);

      const opened = await kill(env, false);
      expect([opened.status, await opened.json()]).toMatchObject([200, { worldGen: "open", reasons: [], killed: false }]);
      expect((await flags(env)).worldGenEnabled).toBe(true);
      expect((await uploadPhoto(env, v.headers)).status).toBe(201);
    });

    it("refuses a wrong token without changing anything, and says when worlds are closed for lack of a key", async () => {
      const { env } = envWith({ ADMIN_TOKEN: ADMIN });
      expect((await admin(env, "/admin/status", { token: "wrong" + ADMIN })).status).toBe(401);
      expect((await admin(env, "/admin/status", { token: null })).status).toBe(401);
      expect(await (await admin(env, "/admin/status")).json()).toMatchObject({ worldGen: "closed", reasons: ["no_world_service_key"] });
    });

    it("says it cannot tell when SpendGuard cannot be reached, and reports nothing as done", async () => {
      const { env } = envWith({ WLT_API_KEY: KEY, ADMIN_TOKEN: ADMIN });
      (env as unknown as { SPEND_GUARD: unknown }).SPEND_GUARD = { idFromName: (n: string) => n, get: () => ({ fetch: async () => { throw new Error("down"); } }) };
      const a = await admin(env, "/admin/status");
      const b = await kill(env, true);
      expect([a.status, b.status]).toEqual([502, 502]);
      expect(await b.json()).toEqual({ ok: false, code: "spend_guard_unavailable" });
    });
  });

  it("keeps the key out of every answer the Worker gives", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify(examples.generate), { status: 200 })) as typeof fetch;
    const { env, bucket, jobs } = live();
    const v = await visit(env);
    addImage(bucket, v.sid);
    const r = await enter(env, v);
    const worldId = r.json.worldId as string;
    await (jobs.objects.get(worldId) as WorldJob).alarm();
    const status = await worker.fetch(new Request(`${ORIGIN}/api/worlds/${worldId}`, { headers: { Cookie: v.headers.Cookie as string } }), env, ctx().ctx);
    const everything = JSON.stringify([r.json, await status.text(), Object.fromEntries(status.headers)]);
    expect(everything).not.toContain(KEY);
    expect(everything).not.toContain("worldlabs");
  });
});
