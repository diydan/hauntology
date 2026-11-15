import { afterEach, describe, expect, it } from "vitest";
import examples from "../../../shared/fixtures/worldlabs/docs-examples.json";
import { HttpWorldLabs } from "../guarded/worldlabs-http";
import { SpendGuardClient } from "../spend/client";
import { CloudflareImageStore } from "../worlds/cloudflare-images";
import { fakeState, FakeNamespace, FakeR2 } from "../worlds/fake-cloudflare";
import { WorldIngestor } from "../worlds/ingest";
import { uploadKey } from "../worlds/keys";
import { SpendGuard } from "./spend-guard";
import { WorldJob, jobDepsFromEnv, type LiveJobEnv } from "./live-world-job";

const KEY = "wlt_test_KEY_0123456789";
const OWNER = "sid-owner-0000000000000";
const WORLD = "w-aaaaaaaaaaaaaaaaaaaaaa";
const SHA = "ab".repeat(32);

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const bucket = () => new FakeR2() as unknown as NonNullable<LiveJobEnv["BUCKET"]>;
const namespace = () => new FakeNamespace((state) => new SpendGuard(state, {}));
const env = (over: { [K in keyof LiveJobEnv]?: LiveJobEnv[K] | undefined } = {}): LiveJobEnv => ({ WLT_API_KEY: KEY, BUCKET: bucket(), SPEND_GUARD: namespace(), ...over }) as LiveJobEnv;

describe("jobDepsFromEnv", () => {
  it("builds the real parts when there is a key and both bindings: the adapter as service and source, ingest, pictures, and a strict SpendGuard", () => {
    const deps = jobDepsFromEnv(env());
    expect(deps).toBeDefined();
    expect(deps!.upstream).toBeInstanceOf(HttpWorldLabs);
    expect(deps!.ingestor).toBeInstanceOf(WorldIngestor);
    expect(deps!.images).toBeInstanceOf(CloudflareImageStore);
    expect(deps!.guard).toBeInstanceOf(SpendGuardClient);
    expect(deps!.timing).toBeUndefined(); // the real timing: a 10 second poll and 20 minutes
  });

  it("builds nothing without a usable key or a binding, so the object spends nothing", () => {
    for (const e of [undefined, {}, { BUCKET: bucket(), SPEND_GUARD: namespace() }, env({ WLT_API_KEY: "" }), env({ WLT_API_KEY: "a b" }), env({ WORLD_MODEL: "marble-9" }), env({ WORLD_API_BASE: "https://evil.example" }), env({ BUCKET: undefined as never }), env({ SPEND_GUARD: undefined as never })]) {
      expect(jobDepsFromEnv(e as LiveJobEnv | undefined), JSON.stringify(e && Object.keys(e))).toBeUndefined();
    }
  });

  it("settles through a strict SpendGuard: a commit that cannot be delivered throws, so the job tries again", async () => {
    const down = { idFromName: (n: string) => n, get: () => ({ fetch: async () => new Response("no", { status: 500 }) }) };
    const deps = jobDepsFromEnv(env({ SPEND_GUARD: down }));
    await expect(deps!.guard.commit({ id: "t", meter: "world", sessionId: "s", issuedAt: 1 })).rejects.toThrow();
  });
});

describe("the WorldJob the Worker exports", () => {
  const call = (job: WorldJob, path: string, method: string, body?: unknown) =>
    job.fetch(new Request(`https://world-job${path}`, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
  const ticket = { id: "t-1", meter: "world", sessionId: OWNER, issuedAt: 1 };

  it("answers /start with 503 and starts nothing when no key is set", async () => {
    const { state, data, alarm } = fakeState();
    const job = new WorldJob(state, env({ WLT_API_KEY: undefined }));
    await call(job, "/record", "PUT", { id: WORLD, kind: "user", ownerSid: OWNER, status: "queued", imageId: "img-1" });
    const res = await call(job, "/start", "POST", { ticket, imageId: "img-1", ownerSid: OWNER });
    expect(res.status).toBe(503);
    expect(alarm.at).toBeNull();
    expect(data.has("job")).toBe(false);
  });

  it("starts, and on its first wake sends the stored picture to the real service with the stored content type and the world's id", async () => {
    const seen: { url: string; key: string | null; body: Record<string, any> }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      seen.push({ url: String(input), key: new Headers(init.headers).get("WLT-Api-Key"), body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify(examples.generate), { status: 200 });
    }) as typeof fetch;
    const e = env();
    (e.BUCKET as unknown as FakeR2).put(uploadKey("img-1"), Uint8Array.from([9, 8, 7]), new Date(), { contentType: "image/webp", customMetadata: { ownerSid: OWNER, sha256: SHA, moderation: "safe" } });
    const { state, alarm } = fakeState();
    const job = new WorldJob(state, e);
    await call(job, "/record", "PUT", { id: WORLD, kind: "user", ownerSid: OWNER, status: "queued", imageId: "img-1" });
    expect((await call(job, "/start", "POST", { ticket, imageId: "img-1", ownerSid: OWNER })).status).toBe(202);
    expect(alarm.at).not.toBeNull();
    alarm.at = null;
    await job.alarm();

    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe("https://api.worldlabs.ai/marble/v1/worlds:generate");
    expect(seen[0]!.key).toBe(KEY);
    expect(seen[0]!.body.display_name).toBe(WORLD);
    expect(seen[0]!.body.world_prompt.image_prompt).toEqual({ source: "data_base64", data_base64: btoa(String.fromCharCode(9, 8, 7)), extension: "webp" });
    // It is now generating, and has set the next wake.
    expect(((await (await call(job, "/record", "GET")).json()) as { status: string }).status).toBe("generating");
    expect(alarm.at).not.toBeNull();
  });

  it("is still the WorldJob of the record side: the same records, the same class name for the binding", async () => {
    const { state } = fakeState();
    const job = new WorldJob(state, env({ WLT_API_KEY: undefined }));
    expect((await call(job, "/record", "PUT", { id: WORLD, kind: "user", ownerSid: OWNER, status: "queued" })).status).toBe(201);
    expect(WorldJob.name).toBe("WorldJob");
  });
});
