import { describe, expect, it } from "vitest";
import { LIVE_URL, liveKit } from "../contract/live-kit";

/**
 * The Quote and create routes, the Gallery and the cleanup on a running `wrangler dev` with real local R2 and a
 * real Durable Object (the test-only worker in `dev/check-worker.ts`). Skipped unless `LIVE_URL` is set. The
 * Worker for this run has `UPLOAD_TTL_HOURS` and `WORLD_TTL_DAYS` set tiny (see the cleanup test).
 */
describe.skipIf(LIVE_URL === undefined)("world creation on wrangler dev (real R2, real WorldJob)", () => {
  // The body of a skipped suite still runs while tests are collected, so this must not throw without a LIVE_URL.
  const kit = liveKit(LIVE_URL ?? "http://live.unset");
  const pic = async (owner: { sid: string }, salt: number, moderation = "safe") => {
    const imageId = kit.unique("img");
    expect((await kit.dev("seed-image", { imageId, ownerSid: owner.sid, salt, moderation })).status).toBe(200);
    return imageId;
  };

  /** Polls a world's status as its owner until `done` says yes, or 12 seconds pass. */
  const waitFor = async (owner: { headers: Record<string, string> }, worldId: string, done: (s: { status: string }) => boolean) => {
    let last: { status: string } = { status: "?" };
    for (let i = 0; i < 40; i++) {
      last = (await kit.send(`/api/worlds/${worldId}`, { headers: owner.headers })).json as { status: string };
      if (done(last)) return last;
      await new Promise((r) => setTimeout(r, 300));
    }
    return last;
  };
  const enter = async (owner: { headers: Record<string, string> }, imageId: string) => {
    const q = await kit.send("/api/worlds/quote", { method: "POST", headers: owner.headers, body: { imageId } });
    return kit.send("/api/worlds", { method: "POST", headers: owner.headers, body: { imageId, confirmToken: (q.json as { confirmToken: string }).confirmToken } });
  };
  const places = async (owner: { headers: Record<string, string> }, imageId: string) =>
    ((await kit.send("/api/worlds/quote", { method: "POST", headers: owner.headers, body: { imageId } })).json as { quota: { world: number } }).quota.world;

  it("quotes, creates once, answers a repeat with the same world, and hides it from everyone else", async () => {
    const a = await kit.visitor();
    const b = await kit.visitor();
    const imageId = await pic(a, 11);

    const q = await kit.send("/api/worlds/quote", { method: "POST", headers: a.headers, body: { imageId } });
    expect(q.status).toBe(200);
    const quote = q.json as { imageUrl: string; confirmToken: string; quota: { world: number } };
    expect(quote.imageUrl).toBe(`/api/images/${imageId}`);
    expect(quote.quota.world).toBe(2); // the real SpendGuard: a fresh Session has its two worlds

    const created = await kit.send("/api/worlds", { method: "POST", headers: a.headers, body: { imageId, confirmToken: quote.confirmToken } });
    expect(created.status).toBe(201);
    const { worldId, status } = created.json as { worldId: string; status: string };
    expect(["queued", "generating", "ingesting", "ready"]).toContain(status);

    const again = await kit.send("/api/worlds", { method: "POST", headers: a.headers, body: { imageId, confirmToken: quote.confirmToken } });
    expect(again.status).toBe(200);
    expect((again.json as { worldId: string }).worldId).toBe(worldId);

    expect(["queued", "generating", "ingesting", "ready"]).toContain(((await kit.send(`/api/worlds/${worldId}`, { headers: a.headers })).json as { status: string }).status);
    const second = await kit.send("/api/worlds/quote", { method: "POST", headers: a.headers, body: { imageId } });
    expect((second.json as { quota: { world: number } }).quota.world).toBe(1); // one unit is held for the world just made
    for (const headers of [b.headers, kit.anonymous()]) {
      const r = await kit.send(`/api/worlds/${worldId}`, { headers });
      expect(r.status).toBe(404);
      expect(r.json).toEqual({ ok: false, code: "world_not_found" });
    }

    // The picture is the owner's: the owner sees it, nobody else does, and nobody else can quote it.
    const mine = await fetch(`${LIVE_URL}${quote.imageUrl}`, { headers: a.headers });
    expect(mine.status).toBe(200);
    expect(mine.headers.get("Content-Type")).toBe("image/png");
    expect((await kit.send(quote.imageUrl, { headers: b.headers })).status).toBe(404);
    expect((await kit.send("/api/worlds/quote", { method: "POST", headers: b.headers, body: { imageId } })).json).toEqual({ ok: false, code: "upload_rejected" });

    // Deleting the world removes its record and its picture.
    expect((await kit.send(`/api/worlds/${worldId}`, { method: "DELETE", headers: b.headers })).status).toBe(404);
    expect((await kit.send(`/api/worlds/${worldId}`, { method: "DELETE", headers: a.headers })).status).toBe(204);
    expect((await kit.send(`/api/worlds/${worldId}`, { headers: a.headers })).status).toBe(404);
    expect(((await kit.dev("exists", { key: `uploads/${imageId}` })).json as { exists: boolean }).exists).toBe(false);
  });

  it("runs the job on the real Durable Object alarm: queued, generating, ingesting, ready, and the unit stays spent", async () => {
    const a = await kit.visitor();
    const imageId = await pic(a, 51);
    const created = await enter(a, imageId);
    expect(created.status).toBe(201);
    const { worldId } = created.json as { worldId: string };
    const ready = await waitFor(a, worldId, (s) => s.status === "ready");
    expect(ready.status).toBe("ready");
    const full = (await kit.send(`/api/worlds/${worldId}`, { headers: a.headers })).json as { manifest: { title: string }; thumbUrl: string };
    expect(full.manifest.title).toBe("A planted place");
    const thumb = await fetch(`${LIVE_URL}${full.thumbUrl}`, { headers: a.headers });
    expect(thumb.status).toBe(200);
    expect([...new Uint8Array(await thumb.arrayBuffer())]).toEqual([20, 21, 22]);
    expect(await places(a, imageId)).toBe(1); // committed: one of the two worlds is used
  });

  it("stops at the session cap once two worlds are made", async () => {
    const a = await kit.visitor();
    for (const salt of [61, 62]) expect((await enter(a, await pic(a, salt))).status).toBe(201);
    const third = await enter(a, await pic(a, 63));
    expect(third.status).toBe(429);
    expect(third.json).toEqual({ ok: false, code: "quota_session" });
  });

  it("fails a world the service refuses, gives the unit back and offers no retry", async () => {
    const a = await kit.visitor();
    const imageId = await pic(a, 201);
    const { worldId } = (await enter(a, imageId)).json as { worldId: string };
    const failed = (await waitFor(a, worldId, (s) => s.status === "failed")) as { status: string; failure?: { code: string; quotaReturned: boolean; retryAllowed: boolean } };
    expect(failed.status).toBe("failed");
    expect(failed.failure).toEqual({ code: "upstream_rejected", quotaReturned: true, retryAllowed: false });
    expect(await places(a, imageId)).toBe(2);
  });

  it("fails a world that never finishes with a timeout, and gives the unit back", async () => {
    const a = await kit.visitor();
    const imageId = await pic(a, 204);
    const { worldId } = (await enter(a, imageId)).json as { worldId: string };
    expect(await places(a, imageId)).toBe(1); // held while the job runs
    const failed = (await waitFor(a, worldId, (s) => s.status === "failed")) as { failure?: { code: string; retryAllowed: boolean } };
    expect(failed.failure).toMatchObject({ code: "timeout", retryAllowed: true });
    expect(await places(a, imageId)).toBe(2);
  }, 30000);

  it("closes world creation when the service is out of credits", async () => {
    const a = await kit.visitor();
    const flags = async () => ((await kit.send("/api/session", { headers: a.headers })).json as { flags: { worldGenEnabled: boolean } }).flags.worldGenEnabled;
    try {
      const imageId = await pic(a, 202);
      const { worldId } = (await enter(a, imageId)).json as { worldId: string };
      const failed = (await waitFor(a, worldId, (s) => s.status === "failed")) as { failure?: { code: string; retryAllowed: boolean } };
      expect(failed.failure).toMatchObject({ code: "upstream_no_credits", retryAllowed: false });
      expect(await flags()).toBe(false);
      const refused = await enter(a, await pic(a, 71));
      expect(refused.json).toEqual({ ok: false, code: "world_gen_disabled" });
    } finally {
      await kit.dev("kill", { on: false });
    }
    expect(await flags()).toBe(true);
  }, 30000);

  it("serves a Gallery world with ranges, and never sets a cookie on its cacheable files", async () => {
    const id = kit.unique("gallery");
    await kit.dev("seed-gallery", { id });
    const whole = await fetch(`${LIVE_URL}/api/worlds/${id}/assets/splat-500k.spz`, { headers: kit.anonymous() });
    expect(whole.status).toBe(200);
    expect(whole.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(whole.headers.get("Set-Cookie")).toBeNull();
    const part = await fetch(`${LIVE_URL}/api/worlds/${id}/assets/splat-500k.spz`, { headers: { ...kit.anonymous(), Range: "bytes=2-5" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect([...new Uint8Array(await part.arrayBuffer())]).toEqual([2, 3, 4, 5]);
    expect((await fetch(`${LIVE_URL}/api/worlds/${id}/assets/splat-500k.spz`, { headers: { ...kit.anonymous(), Range: "bytes=10-20" } })).status).toBe(416);
  });

  it("closes world creation with the kill switch, shows it on Home, and opens again", async () => {
    const a = await kit.visitor();
    const imageId = await pic(a, 41);
    const flags = async () => ((await kit.send("/api/session", { headers: a.headers })).json as { flags: { worldGenEnabled: boolean } }).flags.worldGenEnabled;
    expect(await flags()).toBe(true);
    try {
      expect((await kit.dev("kill", { on: true })).status).toBe(200);
      expect(await flags()).toBe(false);
      const q = await kit.send("/api/worlds/quote", { method: "POST", headers: a.headers, body: { imageId } });
      const refused = await kit.send("/api/worlds", { method: "POST", headers: a.headers, body: { imageId, confirmToken: (q.json as { confirmToken: string }).confirmToken } });
      expect(refused.status).toBe(503);
      expect(refused.json).toEqual({ ok: false, code: "world_gen_disabled" });
      // The Gallery is not affected.
      const gallery = kit.unique("gallery");
      await kit.dev("seed-gallery", { id: gallery });
      expect((await kit.send(`/api/worlds/${gallery}`, { headers: a.headers })).status).toBe(200);
    } finally {
      await kit.dev("kill", { on: false });
    }
    expect(await flags()).toBe(true);
  });

  it("deletes what is past its time on the cron trigger, and never a Gallery world", async () => {
    const gallery = kit.unique("gallery");
    await kit.dev("seed-gallery", { id: gallery });
    const a = await kit.visitor();
    const world = kit.unique("w-old");
    await kit.dev("seed-world", { id: world, ownerSid: a.sid });
    const upload = kit.unique("old-upload");
    await kit.dev("put", { key: `uploads/${upload}` });
    expect((await kit.send(`/api/worlds/${world}`, { headers: a.headers })).status).toBe(200);

    await new Promise((r) => setTimeout(r, 6000)); // longer than the tiny limits this Worker runs with
    const run = await fetch(`${LIVE_URL}/cdn-cgi/handler/scheduled`);
    expect(run.status).toBe(200);
    await new Promise((r) => setTimeout(r, 1500));

    expect((await kit.send(`/api/worlds/${world}`, { headers: a.headers })).status).toBe(404);
    expect(((await kit.dev("exists", { key: `worlds/${world}/thumb.jpg` })).json as { exists: boolean }).exists).toBe(false);
    expect(((await kit.dev("exists", { key: `uploads/${upload}` })).json as { exists: boolean }).exists).toBe(false);
    expect((await kit.send(`/api/worlds/${gallery}`, { headers: kit.anonymous() })).status).toBe(200);
  }, 30000);
});
