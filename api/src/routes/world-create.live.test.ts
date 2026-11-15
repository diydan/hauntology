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
    expect(status).toBe("queued");

    const again = await kit.send("/api/worlds", { method: "POST", headers: a.headers, body: { imageId, confirmToken: quote.confirmToken } });
    expect(again.status).toBe(200);
    expect((again.json as { worldId: string }).worldId).toBe(worldId);

    expect((await kit.send(`/api/worlds/${worldId}`, { headers: a.headers })).json).toEqual({ id: worldId, status: "queued" });
    const second = await kit.send("/api/worlds/quote", { method: "POST", headers: a.headers, body: { imageId } });
    expect((second.json as { quota: { world: number } }).quota.world).toBe(1); // one unit is held for the world just made
    for (const headers of [b.headers, kit.anonymous()]) {
      const r = await kit.send(`/api/worlds/${worldId}`, { headers });
      expect(r.status).toBe(404);
      expect(r.json).toEqual({ ok: false, code: "world_not_found" });
    }
    const started = (await kit.send("/dev/started")).json as { started: { worldId: string }[] };
    expect(started.started.filter((s) => s.worldId === worldId)).toHaveLength(1);

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

  it("stops at the session cap, and gives the unit back when the job will not start", async () => {
    const a = await kit.visitor();
    const enter = async (imageId: string) => {
      const q = await kit.send("/api/worlds/quote", { method: "POST", headers: a.headers, body: { imageId } });
      return kit.send("/api/worlds", { method: "POST", headers: a.headers, body: { imageId, confirmToken: (q.json as { confirmToken: string }).confirmToken } });
    };
    expect((await enter(await pic(a, 21))).status).toBe(201);
    expect((await enter(await pic(a, 22))).status).toBe(201);
    const third = await enter(await pic(a, 23));
    expect(third.status).toBe(429);
    expect(third.json).toEqual({ ok: false, code: "quota_session" });

    const b = await kit.visitor();
    await kit.dev("starter", { fail: { code: "upstream_rejected" } });
    const imageId = await pic(b, 31);
    const q = await kit.send("/api/worlds/quote", { method: "POST", headers: b.headers, body: { imageId } });
    const failed = await kit.send("/api/worlds", { method: "POST", headers: b.headers, body: { imageId, confirmToken: (q.json as { confirmToken: string }).confirmToken } });
    await kit.dev("starter", { fail: null });
    expect(failed.status).toBe(502);
    expect(failed.json).toEqual({ ok: false, code: "upstream_rejected" });
    // The unit came back: b can still make two worlds.
    expect(((await kit.send("/api/worlds/quote", { method: "POST", headers: b.headers, body: { imageId } })).json as { quota: { world: number } }).quota.world).toBe(2);
  });

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
