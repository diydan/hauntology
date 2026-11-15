import { describe, expect, it } from "vitest";
import { LIVE_URL, liveKit } from "../contract/live-kit";

/**
 * The operator's kill switch on a running `wrangler dev` with the real `SpendGuard` Durable Object (the test-only worker in
 * `dev/check-worker.ts`, started with `--var ADMIN_TOKEN:<a token of at least 32 characters>`). Skipped unless `LIVE_URL` and
 * `ADMIN_TOKEN` are both set. Run it on its own: it closes worlds for a moment, and always opens them again.
 */
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const TOKEN = env.ADMIN_TOKEN;

describe.skipIf(LIVE_URL === undefined || TOKEN === undefined)("the operator's kill switch on wrangler dev (real SpendGuard object)", () => {
  const kit = liveKit(LIVE_URL ?? "http://live.unset");
  const admin = async (path: string, init: { method?: string; token?: string | null; body?: unknown } = {}) => {
    const res = await fetch(`${LIVE_URL}${path}`, {
      method: init.method ?? "GET",
      headers: init.token === null ? {} : { Authorization: `Bearer ${init.token ?? TOKEN}` },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, text, json };
  };
  const flag = async () => ((await kit.send("/api/session")).json as { flags: { worldGenEnabled: boolean } }).flags.worldGenEnabled;

  it("refuses a wrong token and no token, with nothing changed", async () => {
    for (const token of ["wrong-" + TOKEN, null]) {
      expect((await admin("/admin/status", { token })).status).toBe(401);
      expect((await admin("/admin/kill", { method: "POST", token, body: { on: true } })).status).toBe(401);
    }
    expect(await flag()).toBe(true);
  });

  it("closes new worlds, uploads and Home for everyone, keeps the Gallery, and opens them again", async () => {
    const gallery = kit.unique("gallery");
    await kit.dev("seed-gallery", { id: gallery });
    const a = await kit.visitor();
    const imageId = kit.unique("img");
    await kit.dev("seed-image", { imageId, ownerSid: a.sid, salt: 11 });
    const quote = () => kit.send("/api/worlds/quote", { method: "POST", headers: a.headers, body: { imageId } });
    const create = async () => {
      const q = await quote();
      return kit.send("/api/worlds", { method: "POST", headers: a.headers, body: { imageId, confirmToken: (q.json as { confirmToken: string }).confirmToken } });
    };
    try {
      expect(await (await admin("/admin/status")).json).toMatchObject({ worldGen: "open", killed: false });

      const closed = await admin("/admin/kill", { method: "POST", body: { on: true } });
      expect([closed.status, closed.json]).toMatchObject([200, { worldGen: "closed", reasons: ["kill_switch"], killed: true }]);
      expect(closed.headers.get("Set-Cookie")).toBeNull();
      expect(await flag()).toBe(false);
      expect((await admin("/admin/status")).json).toMatchObject({ worldGen: "closed" });
      const refused = await create();
      expect([refused.status, refused.json]).toEqual([503, { ok: false, code: "world_gen_disabled" }]);
      const form = new FormData();
      form.append("photo", new File([new Uint8Array(8)], "x.jpg", { type: "image/jpeg" }));
      const upload = await fetch(`${LIVE_URL}/api/uploads`, { method: "POST", headers: a.headers, body: form });
      expect([upload.status, ((await upload.json()) as { code: string }).code]).toEqual([503, "world_gen_disabled"]);
      // The Gallery is not touched.
      expect((await kit.send(`/api/worlds/${gallery}`, { headers: kit.anonymous() })).status).toBe(200);
    } finally {
      const opened = await admin("/admin/kill", { method: "POST", body: { on: false } });
      expect([opened.status, opened.json]).toMatchObject([200, { worldGen: "open", reasons: [], killed: false }]);
    }
    expect(await flag()).toBe(true);
    expect((await create()).status).toBe(201);
  }, 30_000);
});
