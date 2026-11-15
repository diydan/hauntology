import { describe, expect, it } from "vitest";
import worker, { SpendGuard, WorldJob, storeFor, type WorkerEnv } from "./worker";
import { FakeJobs, FakeNamespace, FakeR2 } from "./worlds/fake-cloudflare";
import { SECRET, sampleManifest, ORIGIN } from "./worlds/test-kit";

const NOW = 1_800_000_000_000;
const DAY = 24 * 3_600_000;

const envWith = () => {
  const bucket = new FakeR2();
  const jobs = new FakeJobs();
  const spend = new FakeNamespace((state) => new SpendGuard(state, {}));
  const env = { HMAC_SECRET: SECRET, BUCKET: bucket, WORLD_JOB: jobs, SPEND_GUARD: spend } as unknown as WorkerEnv;
  return { bucket, jobs, spend, env };
};
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
    const { env, spend } = envWith();
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
