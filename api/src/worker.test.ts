import { afterEach, describe, expect, it, vi } from "vitest";
import examples from "../../shared/fixtures/worldlabs/docs-examples.json";
import worker, { PlayIndex, PlaySession, SpendGuard, WorldJob, storeFor, type WorkerEnv } from "./worker";
import { FakeJobs, FakeNamespace, FakeR2 } from "./worlds/fake-cloudflare";
import { uploadKey } from "./worlds/keys";
import { COMMENT, EXIF, JFIF, makeJpeg, makeSketchPng } from "@hauntology/shared/world/upload-kit";
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
  // The games (ghost-engine 3 and 5): a `PlaySession` for each and the `PlayIndex` of which belong to which world.
  const index = new FakeNamespace((state) => new PlayIndex(state));
  const plays = new FakeNamespace((state) => new PlaySession(state, { PLAY_INDEX: index }));
  Object.assign(env, { WORLD_JOB: jobs, SPEND_GUARD: spend, PLAY_SESSION: plays, PLAY_INDEX: index });
  return { bucket, jobs, spend, plays, index, env };
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

  it("serves the web app from its ASSETS binding, with the page's security headers, and keeps /api for the API (world-pipeline task 2)", async () => {
    const asked: string[] = [];
    const ASSETS = { fetch: async (r: Request) => (asked.push(new URL(r.url).pathname), new Response("<html>the app</html>", { headers: { "Content-Type": "text/html; charset=utf-8" } })) };
    const { bucket, env } = envWith({ TURNSTILE_SECRET: "s3cret" });
    Object.assign(env, { ASSETS });
    bucket.put("gallery/greenhouse/world.json", JSON.stringify(sampleManifest("greenhouse")));
    const page = await worker.fetch(new Request(`${ORIGIN}/shared/w-0123456789abcdef`), env, ctx().ctx);
    expect(page.status).toBe(200);
    expect(await page.text()).toBe("<html>the app</html>");
    // The policy names Turnstile here because the Worker has its secret: only the Worker knows that, which is why the page goes through it.
    expect(page.headers.get("Content-Security-Policy")).toContain("https://challenges.cloudflare.com");
    expect(page.headers.get("Set-Cookie")).toBeNull();
    const api = await worker.fetch(new Request(`${ORIGIN}/api/worlds/greenhouse`), env, ctx().ctx);
    expect(((await api.json()) as { status: string }).status).toBe("ready");
    expect((await worker.fetch(new Request(`${ORIGIN}/api/nothing-here`), env, ctx().ctx)).status).toBe(404);
    expect((await worker.fetch(new Request(`${ORIGIN}/admin/status`), env, ctx().ctx)).status).toBe(404);
    expect(asked).toEqual(["/shared/w-0123456789abcdef"]);
  });

  it("answers GET /api/quota from the real SpendGuard object, so the shell can open (world-pipeline 5.7)", async () => {
    const { env } = envWith();
    const r = await worker.fetch(new Request(`${ORIGIN}/api/quota`), env, ctx().ctx);
    expect(r.status).toBe(200);
    expect(r.headers.get("Set-Cookie")).toBeNull();
    const q = (await r.json()) as Record<string, number>;
    expect(Object.keys(q).sort()).toEqual(["image", "live", "llm", "stt", "tts", "world"]);
    expect(q.world).toBe(2);
    expect(q.image).toBe(8);
    for (const n of Object.values(q)) expect(Number.isInteger(n) && n >= 0).toBe(true);
  });

  it("without an ASSETS binding serves no page: only the API answers, and anything else is a 404", async () => {
    const { env } = envWith();
    expect((await worker.fetch(new Request(`${ORIGIN}/`), env, ctx().ctx)).status).toBe(404);
    expect((await worker.fetch(new Request(`${ORIGIN}/api/session`), env, ctx().ctx)).status).toBe(200);
  });

  it("serves a Gallery world through the real store, with no cookie", async () => {
    const { bucket, env } = envWith();
    bucket.put("gallery/greenhouse/world.json", JSON.stringify(sampleManifest("greenhouse")));
    const res = await worker.fetch(new Request(`${ORIGIN}/api/worlds/greenhouse`), env, ctx().ctx);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { id: string; status: string }).status).toBe("ready");
  });

  it("lists the Gallery through the real store with no key, no cookie and worlds closed, and never a user's world (world-pipeline 9.2)", async () => {
    const { bucket, env, jobs } = envWith({ WORLD_GEN_ENABLED: "false" });
    bucket.put("gallery/greenhouse/world.json", JSON.stringify({ ...sampleManifest("greenhouse"), source: "gallery", attribution: { credit: "Self-made", licence: "CC0" } }));
    bucket.put("gallery/greenhouse/thumb.jpg", Uint8Array.from([1, 2, 3]));
    bucket.put("worlds/w-user/world.json", JSON.stringify(sampleManifest("w-user")));
    await jobs.get("w-user").fetch("https://world-job/record", { method: "PUT", body: JSON.stringify({ id: "w-user", kind: "user", ownerSid: "sid-a", status: "ready", shared: true, manifest: sampleManifest("w-user") }) });
    const res = await worker.fetch(new Request(`${ORIGIN}/api/gallery`), env, ctx().ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toBeNull();
    expect(await res.json()).toEqual([{ id: "greenhouse", title: "The kitchen", description: "A narrow kitchen with a window over the sink.", thumbUrl: "/api/worlds/greenhouse/assets/thumb.jpg", attribution: "Self-made · CC0" }]);
  });

  it("turns a user world's share link on and off through the real Durable Object, for the owner only", async () => {
    const { env, jobs, bucket } = envWith();
    const c = ctx().ctx;
    const session = async () => {
      const r = await worker.fetch(new Request(`${ORIGIN}/api/session`), env, c);
      return { Cookie: (r.headers.get("Set-Cookie") as string).split(";")[0] as string, Origin: ORIGIN };
    };
    const owner = await session();
    const stranger = await session();
    // The owner's Session id is read back from the cookie, as the routes read it.
    const { verifySession } = await import("@hauntology/shared/session-cookie");
    const sid = (await verifySession(owner.Cookie.slice(owner.Cookie.indexOf("=") + 1), SECRET, Math.floor(Date.now() / 1000)))?.sid;
    expect(typeof sid).toBe("string");
    await jobs.get("w-mine").fetch("https://world-job/record", { method: "PUT", body: JSON.stringify({ id: "w-mine", kind: "user", ownerSid: sid, status: "ready", manifest: sampleManifest("w-mine") }) });
    bucket.put("worlds/w-mine/thumb.jpg", Uint8Array.from([1, 2, 3]));
    const call = (who: Record<string, string>, path: string, method = "GET") => worker.fetch(new Request(`${ORIGIN}${path}`, { method, headers: who }), env, c);
    expect((await call(stranger, "/api/worlds/w-mine")).status).toBe(404);
    expect((await call(stranger, "/api/worlds/w-mine/share", "POST")).status).toBe(404);
    const on = await call(owner, "/api/worlds/w-mine/share", "POST");
    expect(await on.json()).toEqual({ ok: true, shared: true });
    expect((await call(stranger, "/api/worlds/w-mine")).status).toBe(200);
    expect((await call(stranger, "/api/worlds/w-mine/assets/thumb.jpg")).status).toBe(200);
    expect((await call(stranger, "/api/worlds/w-mine", "DELETE")).status).toBe(404);
    expect(await (await call(owner, "/api/gallery")).json()).toEqual([]);
    const off = await call(owner, "/api/worlds/w-mine/share", "DELETE");
    expect(await off.json()).toEqual({ ok: true, shared: false });
    expect((await call(stranger, "/api/worlds/w-mine")).status).toBe(404);
  });

  describe("the ghost's words from the model (ghost-engine 4)", () => {
    const REPLY = "The window over the sink is fogged. The rain is soft on the glass tonight, and I remember the kettle.";
    const playOne = async (extra: Record<string, string>, withAi: boolean) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        const { env, jobs, spend } = envWith(extra);
        const seen: Array<{ model: string; input: Record<string, unknown>; options: unknown }> = [];
        if (withAi) Object.assign(env, { AI: { run: async (model: string, input: Record<string, unknown>, options?: unknown) => { seen.push({ model, input, options }); return { stop_reason: "end_turn", content: [{ type: "text", text: REPLY }], usage: { input_tokens: 500, output_tokens: 30 } }; } } });
        const c = ctx().ctx;
        const r0 = await worker.fetch(new Request(`${ORIGIN}/api/session`), env, c);
        const who = { Cookie: (r0.headers.get("Set-Cookie") as string).split(";")[0] as string, Origin: ORIGIN };
        // What the Chat is told: the model is on only when the game really has a narrator.
        const ghostModel = ((await r0.clone().json()) as { flags: { ghostModel: boolean } }).flags.ghostModel;
        const { verifySession } = await import("@hauntology/shared/session-cookie");
        const sid = (await verifySession(who.Cookie.slice(who.Cookie.indexOf("=") + 1), SECRET, Math.floor(Date.now() / 1000)))?.sid;
        await jobs.get("w-mine").fetch("https://world-job/record", { method: "PUT", body: JSON.stringify({ id: "w-mine", kind: "user", ownerSid: sid, status: "ready", manifest: sampleManifest("w-mine") }) });
        const call = (path: string, body?: unknown) => worker.fetch(new Request(`${ORIGIN}${path}`, { method: body === undefined ? "GET" : "POST", headers: { ...who, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), env, c);
        const started = (await (await call("/api/play/start", { worldId: "w-mine" })).json()) as { playId: string; view: { anchors: Array<{ pos: number[] }> } };
        vi.setSystemTime(Date.now() + 2000);
        const turn = (await (await call(`/api/play/${started.playId}/turn`, { input: { button: "look" }, pose: { pos: started.view.anchors[0]!.pos, yaw: 0 } })).json()) as { reply: { text: string; scripted: boolean }; view: { journal: Array<{ text: string }> } };
        const quota = (await (await call("/api/quota")).json()) as { llm?: number };
        return { turn, seen, quota, ghostModel, spendHeld: spend.data.size };
      } finally {
        vi.useRealTimers();
      }
    };

    it("words a turn with Haiku 5.5 through the gateway when the binding and a gateway are set, and takes one unit from the real SpendGuard", async () => {
      const r = await playOne({ AI_GATEWAY_ID: "default" }, true);
      // With the `AI` binding the voice is served too (ghost-voice 3.6), so the reply also names the line it can be heard as: an id and nothing else.
      expect(r.turn.reply).toEqual({ text: REPLY, scripted: false, voice: { lineId: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/) } });
      expect(r.turn.view.journal[0]!.text).toBe(REPLY);
      expect(r.seen).toHaveLength(1);
      expect(r.seen[0]!.model).toBe("anthropic/claude-haiku-5.5");
      expect(r.seen[0]!.options).toEqual({ gateway: { id: "default" } });
      expect(Object.keys(r.seen[0]!.input).sort()).toEqual(["max_tokens", "messages", "system", "thinking"]);
      expect(r.seen[0]!.input).toMatchObject({ max_tokens: 220, thinking: { type: "disabled" } });
      expect(r.quota.llm).toBe(39); // 40 for a visitor, one taken
      expect(r.ghostModel).toBe(true); // the Chat says typed words may go to a model
    });

    it("speaks only scripted lines, and calls no model, without a gateway, without the binding, or with the kill switch on", async () => {
      for (const [extra, withAi] of [[{}, true], [{ AI_GATEWAY_ID: "default" }, false], [{ AI_GATEWAY_ID: "default", GHOST_NARRATION_ENABLED: "false" }, true], [{ AI_GATEWAY_ID: "not a gateway!" }, true], [{ AI_GATEWAY_ID: "default", NARRATOR_MODEL_ID: "anthropic/claude-opus-5.5" }, true]] as const) {
        const r = await playOne({ ...extra }, withAi);
        expect(r.turn.reply.scripted, JSON.stringify(extra)).toBe(true);
        expect(r.turn.reply.text, JSON.stringify(extra)).not.toBe(REPLY);
        expect(r.seen, JSON.stringify(extra)).toHaveLength(0);
        expect(r.quota.llm, JSON.stringify(extra)).toBe(40);
        expect(r.ghostModel, JSON.stringify(extra)).toBe(false); // nothing can go to a model, so the Chat does not say so
      }
    });
  });

  describe("the real world at a game's start (ghost-engine 3.1, conditions 3.3 and 3.4)", () => {
    // The weather host is a function here: nothing in this block opens a connection, and a call to any host but the weather one fails the test.
    const FORECAST = JSON.stringify({ timezone: "America/New_York", current: { weather_code: 61, temperature_2m: 3, wind_speed_10m: 22 } });
    const NEW_YORK = { lat: 40.7128, lon: -74.006, tz: "America/New_York", label: "New York, New York, United States" };
    const playWithSky = async (extra: Record<string, string>, conditions: unknown) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const urls: string[] = [];
      globalThis.fetch = (async (input: unknown) => {
        urls.push(String(input));
        return new Response(FORECAST, { status: 200 });
      }) as typeof fetch;
      try {
        const { env, jobs } = envWith(extra);
        const c = ctx().ctx;
        const r0 = await worker.fetch(new Request(`${ORIGIN}/api/session`), env, c);
        const who = { Cookie: (r0.headers.get("Set-Cookie") as string).split(";")[0] as string, Origin: ORIGIN };
        const { verifySession } = await import("@hauntology/shared/session-cookie");
        const sid = (await verifySession(who.Cookie.slice(who.Cookie.indexOf("=") + 1), SECRET, Math.floor(Date.now() / 1000)))?.sid;
        await jobs.get("w-mine").fetch("https://world-job/record", { method: "PUT", body: JSON.stringify({ id: "w-mine", kind: "user", ownerSid: sid, status: "ready", manifest: sampleManifest("w-mine") }) });
        const call = (path: string, body?: unknown) => worker.fetch(new Request(`${ORIGIN}${path}`, { method: body === undefined ? "GET" : "POST", headers: { ...who, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), env, c);
        type View = { atmosphere: unknown; anchors: Array<{ pos: number[] }> };
        const started = (await (await call("/api/play/start", { worldId: "w-mine", ...(conditions === undefined ? {} : { conditions }) })).json()) as { playId: string; view: View };
        vi.setSystemTime(Date.now() + 2000);
        const turn = (await (await call(`/api/play/${started.playId}/turn`, { input: { text: "hello" }, pose: { pos: [0, 0, 0], yaw: 0 } })).json()) as { view: View };
        const reloaded = (await (await call(`/api/play/${started.playId}`)).json()) as { view: View };
        return { started, turn, reloaded, urls };
      } finally {
        vi.useRealTimers();
      }
    };
    const choice = { hostHour: 12, place: NEW_YORK };

    it("reads the weather once from the public host, and the sky stays the same through a turn and a reload from the real Durable Object's storage", async () => {
      const r = await playWithSky({}, choice);
      expect(r.urls).toEqual(["https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.01&current=weather_code,temperature_2m,wind_speed_10m&timezone=auto"]);
      expect(r.started.view.atmosphere).toMatchObject({ weather: "rain", tempBand: "cold", windBand: "breezy" });
      expect(r.turn.view.atmosphere).toEqual(r.started.view.atmosphere);
      expect(r.reloaded.view.atmosphere).toEqual(r.started.view.atmosphere);
      expect(JSON.stringify([r.started, r.turn, r.reloaded])).not.toMatch(/New York|America|40\.7|74\.0/);
    });

    it("makes no call, and shows the normal look, with no place chosen", async () => {
      for (const conditions of [undefined, { hostHour: 3 }]) {
        const r = await playWithSky({}, conditions);
        expect(r.urls).toEqual([]);
        expect(r.started.view.atmosphere).toBeNull();
        expect(r.reloaded.view.atmosphere).toBeNull();
      }
    });

    it("CONDITIONS_ENABLED=false makes no call at all", async () => {
      const r = await playWithSky({ CONDITIONS_ENABLED: "false" }, choice);
      expect(r.urls).toEqual([]);
      expect(r.started.view.atmosphere).toBeNull();
    });

    it("WEATHER_BASE_URL moves the call to a base on this machine, and an address that is not acceptable turns the feature off", async () => {
      const local = await playWithSky({ WEATHER_BASE_URL: "http://127.0.0.1:8788" }, choice);
      expect(local.urls).toHaveLength(1);
      expect(local.urls[0]!.startsWith("http://127.0.0.1:8788/v1/forecast?")).toBe(true);
      for (const bad of ["http://weather.example.org", "https://user:pw@weather.example.org", "nonsense"]) {
        const off = await playWithSky({ WEATHER_BASE_URL: bad }, choice);
        expect(off.urls, bad).toEqual([]);
        expect(off.started.view.atmosphere, bad).toBeNull();
      }
    });
  });

  it("lets a reader of a shared place play it through the real Durable Objects, and deletes the games with the world (ghost-engine 5)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const { env, jobs, plays, index } = envWith();
      const c = ctx().ctx;
      const session = async () => {
        const r = await worker.fetch(new Request(`${ORIGIN}/api/session`), env, c);
        return { Cookie: (r.headers.get("Set-Cookie") as string).split(";")[0] as string, Origin: ORIGIN };
      };
      const owner = await session();
      const reader = await session();
      const stranger = await session();
      const { verifySession } = await import("@hauntology/shared/session-cookie");
      const sid = (await verifySession(owner.Cookie.slice(owner.Cookie.indexOf("=") + 1), SECRET, Math.floor(Date.now() / 1000)))?.sid;
      await jobs.get("w-mine").fetch("https://world-job/record", { method: "PUT", body: JSON.stringify({ id: "w-mine", kind: "user", ownerSid: sid, status: "ready", shared: true, manifest: sampleManifest("w-mine") }) });
      const call = (who: Record<string, string>, path: string, method = "GET", body?: unknown) => worker.fetch(new Request(`${ORIGIN}${path}`, { method, headers: { ...who, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), env, c);

      expect((await call(stranger, "/api/play/start", "POST", { worldId: "w-mine" })).status).toBe(200); // shared: anyone with the link may play
      const started = (await (await call(reader, "/api/play/start", "POST", { worldId: "w-mine" })).json()) as { playId: string; view: { anchors: Array<{ pos: number[] }> } };
      expect(started.playId).toMatch(/^p-/);
      const results: Array<{ view: { ended: boolean; journal: unknown[] } }> = [];
      for (const a of started.view.anchors) {
        vi.setSystemTime(Date.now() + 2000);
        const r = await call(reader, `/api/play/${started.playId}/turn`, "POST", { input: { button: "look" }, pose: { pos: a.pos, yaw: 0 } });
        expect(r.status).toBe(200);
        results.push((await r.json()) as { view: { ended: boolean; journal: unknown[] } });
      }
      expect(results.at(-1)?.view.ended).toBe(true);
      expect(results.at(-1)?.view.journal).toHaveLength(3);
      expect((await call(stranger, `/api/play/${started.playId}`)).status).toBe(404); // not their game
      expect(((await (await call(reader, `/api/play/${started.playId}`)).json()) as { worldId: string }).worldId).toBe("w-mine");

      // The owner deletes the place: the games of that world are deleted with it, in the objects, not only unreachable.
      expect(plays.data.get(started.playId)?.size ?? 0).toBeGreaterThan(0);
      expect((await call(owner, "/api/worlds/w-mine", "DELETE")).status).toBeLessThan(300);
      expect(plays.data.get(started.playId)?.size ?? 0).toBe(0);
      expect((index.data.get("index")?.get("w:w-mine") as string[] | undefined) ?? []).toEqual([]);
      expect((await call(reader, `/api/play/${started.playId}`)).status).toBe(404);
    } finally {
      vi.useRealTimers();
    }
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

  it("logs one cleanup.done line after the cron run, with the counts and nothing else (world-pipeline 8.2)", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { bucket, jobs, env } = envWith();
      bucket.put("uploads/old", "x", new Date(NOW - 25 * 3_600_000)).put("uploads/new", "x", new Date(NOW - 3_600_000));
      bucket.put("worlds/w-1/world.json", "x", new Date(NOW - 8 * DAY));
      await jobs.get("w-1").fetch("https://world-job/record", { method: "PUT", body: JSON.stringify({ id: "w-1", kind: "user", ownerSid: "s", status: "ready", title: "My grandmother's kitchen" }) });
      const { ctx: c, done } = ctx();
      await worker.scheduled({ scheduledTime: NOW } as ScheduledController, env, c);
      await done();
      expect(spy).toHaveBeenCalledTimes(1);
      const line = JSON.parse(spy.mock.calls[0]![0] as string) as Record<string, unknown>;
      expect(line).toMatchObject({ level: "info", event: "cleanup.done", deleted: 2, worlds: 1 });
      expect(Object.keys(line).sort()).toEqual(["deleted", "event", "level", "t", "worlds"]);
      expect(spy.mock.calls[0]![0]).not.toMatch(/grandmother|w-1|uploads/);
    } finally {
      spy.mockRestore();
    }
  });

  it("answers an error nothing handled with a plain 500 and writes only one request.error line, never what the error said", async () => {
    const spies = { log: vi.spyOn(console, "log").mockImplementation(() => {}), error: vi.spyOn(console, "error").mockImplementation(() => {}) };
    try {
      const { env } = envWith();
      (env as unknown as { BUCKET: unknown }).BUCKET = { get: async () => { throw new Error("R2 said: my grandmother's kitchen"); }, head: async () => null, list: async () => ({ objects: [], truncated: false }), delete: async () => {} };
      const res = await worker.fetch(new Request(`${ORIGIN}/api/worlds/greenhouse`), env, ctx().ctx);
      expect(res.status).toBe(500);
      expect(await res.text()).toBe("Internal Server Error");
      expect(spies.error).not.toHaveBeenCalled();
      expect(spies.log).toHaveBeenCalledTimes(1);
      const line = spies.log.mock.calls[0]![0] as string;
      expect(JSON.parse(line)).toMatchObject({ level: "error", event: "request.error", route: "/api/worlds/:id", errorName: "Error", status: 500 });
      expect(line).not.toMatch(/grandmother|R2 said|greenhouse/);
    } finally {
      spies.log.mockRestore();
      spies.error.mockRestore();
    }
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

  describe("a sketch (world-pipeline 5.3)", () => {
    const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
    const picture = makeJpeg({ width: 1024, height: 768, head: [JFIF(), EXIF("Exif\0\0made by a model")], scans: [Uint8Array.from([1, 2, 3])] });
    /** The Workers AI binding for both models: the image model answers a picture, the vision model a brief. */
    const fakeAi = () => {
      const calls: { model: string; input: Record<string, any> }[] = [];
      const AI = {
        run: async (model: string, input: Record<string, any>) => {
          calls.push({ model, input });
          return model.includes("flux") ? { image: b64(picture) } : { response: JSON.stringify({ brief: "A narrow kitchen with a blue door.", safe: true }) };
        },
      };
      return { AI, calls };
    };
    const post = (env: WorkerEnv, path: string, headers: Record<string, string>, body: unknown) =>
      worker.fetch(new Request(`${ORIGIN}${path}`, { method: "POST", headers, body: JSON.stringify(body) }), env, ctx().ctx);

    it("renders two candidates through the image model, keeps them for their owner, and the chosen one goes through the check to the Quote", async () => {
      const { AI, calls } = fakeAi();
      const { env, bucket } = envWith({ WLT_API_KEY: KEY });
      (env as unknown as { AI: unknown }).AI = AI;
      const v = await visit(env);
      const sketch = await makeSketchPng(256, 192, (x, y) => (x + y) % 11 === 0);

      const rendered = await post(env, "/api/sketch/render", v.headers, { sketchPng: b64(sketch), caption: "my grandmother's kitchen" });
      expect(rendered.status).toBe(200);
      const body = (await rendered.json()) as { candidates: { imageId: string; imageUrl: string }[]; quota: { image: number } };
      expect(body.candidates).toHaveLength(2);
      expect(body.quota.image).toBe(7);
      const flux = calls.filter((c) => c.model === "@cf/black-forest-labs/flux-2-klein-9b");
      expect(flux).toHaveLength(2);
      const form = await new Response(flux[0]!.input.multipart.body, { headers: { "Content-Type": flux[0]!.input.multipart.contentType } }).formData();
      expect(form.get("prompt")).toContain("my grandmother's kitchen");
      expect(new Uint8Array(await (form.get("input_image_0") as unknown as File).arrayBuffer())).toEqual(sketch);
      for (const c of body.candidates) {
        const stored = bucket.objects.get(`candidates/${c.imageId}`)!;
        expect(stored.customMetadata).toMatchObject({ ownerSid: v.sid, source: "sketch" });
        expect(new TextDecoder("latin1").decode(stored.bytes)).not.toContain("made by a model");
        expect((await worker.fetch(new Request(`${ORIGIN}${c.imageUrl}`, { headers: v.headers }), env, ctx().ctx)).status).toBe(200);
      }

      const picked = await post(env, "/api/sketch/select", v.headers, { imageId: body.candidates[0]!.imageId });
      const { imageId } = (await picked.json()) as { imageId: string };
      expect(bucket.objects.get(`uploads/${imageId}`)!.customMetadata).toMatchObject({ ownerSid: v.sid, source: "sketch" });
      expect((await post(env, "/api/worlds/quote", v.headers, { imageId })).status).toBe(503); // not yet checked
      expect((await post(env, "/api/places/brief", v.headers, { imageId })).status).toBe(200);
      expect((await post(env, "/api/worlds/quote", v.headers, { imageId })).status).toBe(200);
    });

    it("cannot render when the Worker has no Workers AI binding, a model id it does not accept, or no key", async () => {
      const sketch = await makeSketchPng(256, 192, (x, y) => (x + y) % 11 === 0);
      for (const extra of [{ WLT_API_KEY: KEY }, { WLT_API_KEY: KEY, IMAGE_MODEL_ID: "not-a-model" }]) {
        const { env } = envWith(extra);
        const { AI, calls } = fakeAi();
        (env as unknown as { AI?: unknown }).AI = extra.IMAGE_MODEL_ID === undefined ? undefined : AI;
        const v = await visit(env);
        const res = await post(env, "/api/sketch/render", v.headers, { sketchPng: b64(sketch) });
        expect([res.status, await res.json()], JSON.stringify(extra)).toEqual([503, { ok: false, code: "world_gen_disabled" }]);
        expect(calls).toHaveLength(0);
      }
      const none = envWith();
      const { AI, calls } = fakeAi();
      (none.env as unknown as { AI: unknown }).AI = AI;
      const v = await visit(none.env);
      expect((await post(none.env, "/api/sketch/render", v.headers, { sketchPng: b64(sketch) })).status).toBe(503);
      expect(calls).toHaveLength(0);
    });

    it("uses IMAGE_MODEL_ID when it is a catalog id", async () => {
      const { AI, calls } = fakeAi();
      const { env } = envWith({ WLT_API_KEY: KEY, IMAGE_MODEL_ID: "@cf/black-forest-labs/flux-2-dev" });
      (env as unknown as { AI: unknown }).AI = AI;
      const v = await visit(env);
      await post(env, "/api/sketch/render", v.headers, { sketchPng: b64(await makeSketchPng(256, 192, (x, y) => (x + y) % 11 === 0)) });
      expect(new Set(calls.map((c) => c.model))).toEqual(new Set(["@cf/black-forest-labs/flux-2-dev"]));
    });

    it("spends no image unit, and calls nothing, for a blank page", async () => {
      const { AI, calls } = fakeAi();
      const { env } = envWith({ WLT_API_KEY: KEY });
      (env as unknown as { AI: unknown }).AI = AI;
      const v = await visit(env);
      const r = await post(env, "/api/sketch/render", v.headers, { sketchPng: b64(await makeSketchPng(256, 192, () => false)) });
      expect([r.status, await r.json()]).toEqual([422, { ok: false, code: "blank_sketch" }]);
      expect(calls).toHaveLength(0);
    });
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
