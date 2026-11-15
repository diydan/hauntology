import { verifyConfirm } from "@hauntology/shared/world/confirm-token";
import { QuoteSchema } from "@hauntology/shared/world/responses";
import { describe, expect, it } from "vitest";
import type { CapTable } from "@hauntology/shared/world/spend-ledger";
import { FakeTurnstile, MemoryImageStore, MemorySpendGuard, RecordingStarter, DEFAULT_CAPS } from "../worlds/fakes";
import type { ImageInfo } from "../worlds/ports";
import { NOW, SECRET, worldsKit, type Visitor } from "../worlds/test-kit";

const HASH = "ab".repeat(32);
const CLOCK = { t: NOW };

type Options = { guard?: boolean; starter?: boolean; turnstile?: FakeTurnstile | null; env?: Record<string, string>; caps?: CapTable };

function setup(opts: Options = {}) {
  CLOCK.t = NOW;
  const images = new MemoryImageStore();
  const guard = new MemorySpendGuard(opts.caps ?? DEFAULT_CAPS, () => CLOCK.t);
  const starter = new RecordingStarter();
  const turnstile = opts.turnstile === undefined ? new FakeTurnstile() : opts.turnstile;
  const kit = worldsKit(() => CLOCK.t, {
    creation: {
      images,
      ...(opts.guard === false ? {} : { guard }),
      ...(opts.starter === false ? {} : { starter }),
      ...(turnstile === null ? {} : { turnstile }),
    },
    ...(opts.env !== undefined ? { env: opts.env } : {}),
  });
  const addImage = (owner: Visitor, id: string, over: Partial<ImageInfo> = {}) =>
    images.put({ id, ownerSid: owner.sid, sha256: HASH.replace(/^../, id.length.toString(16).padStart(2, "0")), moderation: "safe", contentType: "image/jpeg", ...over });
  const quote = async (v: Visitor, imageId: string) => kit.send("/api/worlds/quote", { method: "POST", headers: v.headers, body: { imageId } });
  const create = (v: Visitor, body: unknown) => kit.send("/api/worlds", { method: "POST", headers: v.headers, body });
  /** Quote and create in one go. */
  const enter = async (v: Visitor, imageId: string, extra: Record<string, unknown> = {}) => {
    const q = await quote(v, imageId);
    return create(v, { imageId, confirmToken: (q.json as { confirmToken: string }).confirmToken, ...extra });
  };
  return { kit, images, guard, starter, turnstile, addImage, quote, create, enter };
}

describe("POST /api/worlds/quote", () => {
  it("gives the owner the picture's address, what is left and a token for exactly this picture and Session", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.addImage(v, "img-1");
    const r = await t.quote(v, "img-1");
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    // The shape the shell reads, defined once (world-pipeline 3.1): the address is on this origin, the quota has the six meters.
    expect(QuoteSchema.parse(r.json)).toEqual(r.json);
    const body = r.json as { imageUrl: string; quota: Record<string, number>; confirmToken: string; needsTurnstile: boolean };
    expect(body.imageUrl).toBe("/api/images/img-1");
    expect(body.quota).toEqual({ world: 2, image: 8, llm: 40, tts: 40, stt: 20, live: 30 });
    expect(body.needsTurnstile).toBe(false);
    expect(body).not.toHaveProperty("turnstileSiteKey");
    const image = (await t.images.find("img-1"))!;
    expect(await verifyConfirm(body.confirmToken, { imageId: "img-1", imageHash: image.sha256, sid: v.sid }, NOW, SECRET)).toEqual({ ok: true, issuedAt: NOW });
  });

  it("shows no places left when SpendGuard is not there", async () => {
    const t = setup({ guard: false });
    const v = await t.kit.visitor();
    t.addImage(v, "img-1");
    expect(((await t.quote(v, "img-1")).json as { quota: object }).quota).toEqual({ world: 0, image: 0, llm: 0, tts: 0, stt: 0, live: 0 });
  });

  it("shows the places left for this Session only", async () => {
    const t = setup();
    const a = await t.kit.visitor();
    const b = await t.kit.visitor();
    t.addImage(a, "img-a");
    t.addImage(b, "img-b");
    await t.enter(a, "img-a");
    expect(((await t.quote(a, "img-a")).json as { quota: { world: number } }).quota.world).toBe(1);
    expect(((await t.quote(b, "img-b")).json as { quota: { world: number } }).quota.world).toBe(2);
  });

  it("answers someone else's picture and a missing one alike", async () => {
    const t = setup();
    const a = await t.kit.visitor();
    const b = await t.kit.visitor();
    t.addImage(a, "img-a");
    const foreign = await t.quote(b, "img-a");
    const missing = await t.quote(b, "img-none");
    const anon = await t.kit.send("/api/worlds/quote", { method: "POST", headers: t.kit.anonymous(), body: { imageId: "img-a" } });
    for (const r of [foreign, missing, anon]) {
      expect(r.status).toBe(404);
      expect(r.json).toEqual({ ok: false, code: "upload_rejected" });
    }
  });

  it("refuses a body that is not a picture id", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    for (const body of [{}, { imageId: "" }, { imageId: "a/b" }, { imageId: "x".repeat(129) }, { imageId: 7 }, [], "text", null]) {
      const r = await t.kit.send("/api/worlds/quote", { method: "POST", headers: v.headers, body });
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.json).toEqual({ ok: false, code: "upload_rejected" });
    }
    const big = await t.kit.send("/api/worlds/quote", { method: "POST", headers: v.headers, body: { imageId: "a", pad: "x".repeat(9000) } });
    expect(big.status).toBe(400);
  });

  it("refuses a picture that was judged unsafe, or has not been judged", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.addImage(v, "img-bad", { moderation: "unsafe" });
    t.addImage(v, "img-new", { moderation: "pending" });
    expect((await t.quote(v, "img-bad")).json).toEqual({ ok: false, code: "unsafe_image" });
    expect((await t.quote(v, "img-bad")).status).toBe(422);
    expect((await t.quote(v, "img-new")).json).toEqual({ ok: false, code: "moderation_unavailable" });
    expect((await t.quote(v, "img-new")).status).toBe(503);
  });

  it("asks for Turnstile only when its secret is set, and sends the public site key with it", async () => {
    const on = setup({ env: { HMAC_SECRET: SECRET, TURNSTILE_SECRET: "ts-secret", TURNSTILE_SITE_KEY: "0xSITE" } });
    const v = await on.kit.visitor();
    on.addImage(v, "img-1");
    expect((await on.quote(v, "img-1")).json).toMatchObject({ needsTurnstile: true, turnstileSiteKey: "0xSITE" });
    expect(QuoteSchema.parse((await on.quote(v, "img-1")).json).turnstileSiteKey).toBe("0xSITE");
    on.kit.env.TURNSTILE_SITE_KEY = "";
    expect((await on.quote(v, "img-1")).json).toMatchObject({ needsTurnstile: true });
    expect((await on.quote(v, "img-1")).json).not.toHaveProperty("turnstileSiteKey");

    const off = setup({ env: { HMAC_SECRET: SECRET, TURNSTILE_SITE_KEY: "0xSITE" } });
    const w = await off.kit.visitor();
    off.addImage(w, "img-1");
    const q = (await off.quote(w, "img-1")).json as object;
    expect(q).toMatchObject({ needsTurnstile: false });
    expect(q).not.toHaveProperty("turnstileSiteKey");
  });

  it("treats an empty Turnstile secret as off", async () => {
    const t = setup({ env: { HMAC_SECRET: SECRET, TURNSTILE_SECRET: "", TURNSTILE_SITE_KEY: "0xSITE" } });
    const v = await t.kit.visitor();
    t.addImage(v, "img-1");
    expect((await t.quote(v, "img-1")).json).toMatchObject({ needsTurnstile: false });
    expect((await t.enter(v, "img-1")).status).toBe(201);
    expect(t.turnstile?.calls).toHaveLength(0);
  });

  it("never sends the Turnstile secret", async () => {
    const t = setup({ env: { HMAC_SECRET: SECRET, TURNSTILE_SECRET: "ts-secret-VALUE", TURNSTILE_SITE_KEY: "0xSITE" } });
    const v = await t.kit.visitor();
    t.addImage(v, "img-1");
    expect((await t.quote(v, "img-1")).text).not.toContain("ts-secret-VALUE");
  });
});

describe("POST /api/worlds", () => {
  it("makes a queued world for the owner, reserves one unit, starts the job with the Ticket, and remembers it in the Session", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.addImage(v, "img-1");
    const r = await t.enter(v, "img-1");
    expect(r.status).toBe(201);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    const { worldId, status } = r.json as { worldId: string; status: string };
    expect(worldId).toMatch(/^w-[A-Za-z0-9_-]{22}$/);
    expect(status).toBe("queued");

    expect(t.kit.store.records.get(worldId)).toMatchObject({ id: worldId, kind: "user", ownerSid: v.sid, status: "queued", imageId: "img-1" });
    expect(t.guard.usedOn("world", v.sid)).toBe(1);
    expect(t.starter.started).toHaveLength(1);
    expect(t.starter.started[0]).toMatchObject({ worldId, imageId: "img-1", ownerSid: v.sid, ticket: { meter: "world", sessionId: v.sid } });
    expect(t.guard.stateOf(t.starter.started[0]!.ticket.id)).toBe("reserved");

    const cookie = (r.headers.get("Set-Cookie") as string).split(";")[0] as string;
    const session = await t.kit.send("/api/session", { headers: { Cookie: cookie, Origin: "http://app.test" } });
    expect(session.json).toMatchObject({ lastWorldId: worldId });
    const status2 = await t.kit.send(`/api/worlds/${worldId}`, { headers: v.headers });
    expect(status2.json).toEqual({ id: worldId, status: "queued", label: "Queued", shared: false });
  });

  it("copies where the picture came from and its Place Brief onto the world's record, for the manifest", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.addImage(v, "img-1", { source: "sketch", brief: "A quiet kitchen." });
    t.addImage(v, "img-22");
    const a = (await t.enter(v, "img-1")).json as { worldId: string };
    const b = (await t.enter(v, "img-22")).json as { worldId: string };
    expect(t.kit.store.records.get(a.worldId)).toMatchObject({ source: "sketch", brief: "A quiet kitchen." });
    const plain = t.kit.store.records.get(b.worldId);
    expect(plain).not.toHaveProperty("source");
    expect(plain).not.toHaveProperty("brief");
  });

  it("gives the same world, and spends nothing more, for the same token again", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.addImage(v, "img-1");
    const q = await t.quote(v, "img-1");
    const body = { imageId: "img-1", confirmToken: (q.json as { confirmToken: string }).confirmToken };
    const first = await t.create(v, body);
    const second = await t.create(v, body);
    const third = await t.create(v, body);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
    expect((second.json as { worldId: string }).worldId).toBe((first.json as { worldId: string }).worldId);
    expect((third.json as { worldId: string }).worldId).toBe((first.json as { worldId: string }).worldId);
    expect(t.guard.reserveCalls).toHaveLength(1);
    expect(t.starter.started).toHaveLength(1);
  });

  it("gives the same world for the same picture under a new token (a revisit costs nothing)", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.addImage(v, "img-1");
    const first = await t.enter(v, "img-1");
    CLOCK.t += 1000; // a new Quote a moment later is a new token
    const again = await t.enter(v, "img-1");
    expect(again.status).toBe(200);
    expect((again.json as { worldId: string }).worldId).toBe((first.json as { worldId: string }).worldId);
    expect(t.guard.reserveCalls).toHaveLength(1);
  });

  it("gives the world in whatever state it is in, and does not ask Turnstile again for it", async () => {
    const t = setup({ env: { HMAC_SECRET: SECRET, TURNSTILE_SECRET: "ts" } });
    const v = await t.kit.visitor();
    t.addImage(v, "img-1");
    const first = await t.enter(v, "img-1", { turnstile: "good-token" });
    const id = (first.json as { worldId: string }).worldId;
    await t.kit.store.update(id, { status: "ready" });
    const again = await t.enter(v, "img-1"); // no Turnstile token this time
    expect(again.status).toBe(200);
    expect(again.json).toEqual({ worldId: id, status: "ready" });
    expect(t.turnstile?.calls).toHaveLength(1);
  });

  it("makes a different world for a different picture, and for another visitor with the same picture bytes", async () => {
    const t = setup();
    const a = await t.kit.visitor();
    const b = await t.kit.visitor();
    t.addImage(a, "img-1");
    t.addImage(a, "img-22");
    t.addImage(b, "img-b", { sha256: (await t.images.find("img-1"))!.sha256 });
    const ids = [await t.enter(a, "img-1"), await t.enter(a, "img-22"), await t.enter(b, "img-b")].map((r) => (r.json as { worldId: string }).worldId);
    expect(new Set(ids).size).toBe(3);
    expect(t.guard.reserveCalls).toHaveLength(3);
    // B's world is B's: A cannot read it.
    expect((await t.kit.send(`/api/worlds/${ids[2]}`, { headers: a.headers })).status).toBe(404);
  });

  it("after a failed world, the same token still means that failed world, and a new token tries again", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.addImage(v, "img-1");
    const q = await t.quote(v, "img-1");
    const body = { imageId: "img-1", confirmToken: (q.json as { confirmToken: string }).confirmToken };
    const first = await t.create(v, body);
    const id1 = (first.json as { worldId: string }).worldId;
    await t.kit.store.update(id1, { status: "failed", failure: { code: "timeout", quotaReturned: true, retryAllowed: true } });
    await t.guard.release(t.starter.started[0]!.ticket);

    const same = await t.create(v, body);
    expect(same.json).toEqual({ worldId: id1, status: "failed" });
    expect(t.guard.reserveCalls).toHaveLength(1);

    CLOCK.t += 1000; // a token is made from the claims and the time, so a Quote a moment later is a new token
    const retry = await t.enter(v, "img-1");
    expect(retry.status).toBe(201);
    const id2 = (retry.json as { worldId: string }).worldId;
    expect(id2).not.toBe(id1);
    expect(t.guard.reserveCalls).toHaveLength(2);
    expect(t.kit.store.records.get(id1)?.status).toBe("failed");
  });

  it("stops trying new worlds after 8 failed ones and answers the last, without spending", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.addImage(v, "img-1");
    let last = "";
    for (let i = 0; i < 8; i++) {
      CLOCK.t += 1000;
      const r = await t.enter(v, "img-1");
      expect(r.status).toBe(201);
      last = (r.json as { worldId: string }).worldId;
      await t.kit.store.update(last, { status: "failed", failure: { code: "timeout", quotaReturned: true, retryAllowed: true } });
      await t.guard.release(t.starter.started[i]!.ticket);
    }
    CLOCK.t += 1000;
    const ninth = await t.enter(v, "img-1");
    expect(ninth.status).toBe(200);
    expect(ninth.json).toEqual({ worldId: last, status: "failed" });
    expect(t.guard.reserveCalls).toHaveLength(8);
  });

  describe("the token", () => {
    it("is refused when it is not ours, is for another picture, or for another visitor, with no spend", async () => {
      const t = setup();
      const a = await t.kit.visitor();
      const b = await t.kit.visitor();
      t.addImage(a, "img-1");
      t.addImage(a, "img-22");
      t.addImage(b, "img-b");
      const token = ((await t.quote(a, "img-1")).json as { confirmToken: string }).confirmToken;
      const forB = ((await t.quote(b, "img-b")).json as { confirmToken: string }).confirmToken;
      for (const [who, body] of [
        [a, { imageId: "img-1", confirmToken: "nonsense" }],
        [a, { imageId: "img-22", confirmToken: token }],
        [b, { imageId: "img-b", confirmToken: token }],
        [a, { imageId: "img-1", confirmToken: forB }],
      ] as const) {
        const r = await t.create(who, body);
        expect(r.json, JSON.stringify(body)).toEqual({ ok: false, code: "bad_confirm" });
        expect(r.status).toBe(400);
      }
      expect(t.guard.reserveCalls).toHaveLength(0);
      expect(t.starter.started).toHaveLength(0);
    });

    it("is expired after 10 minutes, and still good at exactly 10", async () => {
      const t = setup();
      const v = await t.kit.visitor();
      t.addImage(v, "img-1");
      const token = ((await t.quote(v, "img-1")).json as { confirmToken: string }).confirmToken;
      CLOCK.t = NOW + 10 * 60_000 + 1;
      const late = await t.create(v, { imageId: "img-1", confirmToken: token });
      expect(late.json).toEqual({ ok: false, code: "confirm_expired" });
      CLOCK.t = NOW + 10 * 60_000;
      expect((await t.create(v, { imageId: "img-1", confirmToken: token })).status).toBe(201);
    });

    it("is not looked at for a picture that is not the visitor's", async () => {
      const t = setup();
      const a = await t.kit.visitor();
      const b = await t.kit.visitor();
      t.addImage(a, "img-1");
      const token = ((await t.quote(a, "img-1")).json as { confirmToken: string }).confirmToken;
      expect((await t.create(b, { imageId: "img-1", confirmToken: token })).json).toEqual({ ok: false, code: "upload_rejected" });
      expect((await t.create(b, { imageId: "img-none", confirmToken: "x" })).json).toEqual({ ok: false, code: "upload_rejected" });
    });

    it("is required: a body without one, or that is not JSON, is bad_confirm", async () => {
      const t = setup();
      const v = await t.kit.visitor();
      t.addImage(v, "img-1");
      for (const body of [{ imageId: "img-1" }, { imageId: "img-1", confirmToken: "" }, { imageId: "img-1", confirmToken: "x".repeat(513) }, { confirmToken: "x" }, [], null]) {
        const r = await t.create(v, body);
        expect(r.json, JSON.stringify(body)).toEqual({ ok: false, code: "bad_confirm" });
        expect(r.status).toBe(400);
      }
      const raw = await t.kit.app.request("http://app.test/api/worlds", { method: "POST", headers: { ...v.headers, "Content-Type": "application/json" }, body: "{not json" }, t.kit.env);
      expect(raw.status).toBe(400);
    });
  });

  describe("the switches", () => {
    it("says world_gen_disabled, and reserves nothing, when generation is off", async () => {
      const t = setup({ env: { HMAC_SECRET: SECRET, WORLD_GEN_ENABLED: "false" } });
      const v = await t.kit.visitor();
      t.addImage(v, "img-1");
      const r = await t.enter(v, "img-1");
      expect(r.json).toEqual({ ok: false, code: "world_gen_disabled" });
      expect(r.status).toBe(503);
      expect(t.guard.reserveCalls).toHaveLength(0);
      expect(t.kit.store.records.size).toBe(0);
    });

    it("says world_gen_disabled when SpendGuard or the job starter is not there", async () => {
      for (const opts of [{ guard: false }, { starter: false }]) {
        const t = setup(opts);
        const v = await t.kit.visitor();
        t.addImage(v, "img-1");
        const r = await t.enter(v, "img-1");
        expect(r.json, JSON.stringify(opts)).toEqual({ ok: false, code: "world_gen_disabled" });
        expect(t.kit.store.records.size).toBe(0);
      }
    });

    it("says world_gen_disabled when the kill switch is on", async () => {
      const t = setup();
      t.guard.killed = true;
      const v = await t.kit.visitor();
      t.addImage(v, "img-1");
      const r = await t.enter(v, "img-1");
      expect(r.json).toEqual({ ok: false, code: "world_gen_disabled" });
      expect(t.kit.store.records.size).toBe(0);
    });
  });

  describe("Turnstile", () => {
    const withTurnstile = (turnstile?: FakeTurnstile | null) => setup({ env: { HMAC_SECRET: SECRET, TURNSTILE_SECRET: "ts" }, ...(turnstile !== undefined ? { turnstile } : {}) });

    it("is required when configured: no token, a wrong token, or no verifier is turnstile_failed, with no spend", async () => {
      for (const [turnstile, extra] of [[undefined, {}], [undefined, { turnstile: "wrong" }], [null, { turnstile: "good-token" }]] as const) {
        const t = withTurnstile(turnstile);
        const v = await t.kit.visitor();
        t.addImage(v, "img-1");
        const r = await t.enter(v, "img-1", extra);
        expect(r.json).toEqual({ ok: false, code: "turnstile_failed" });
        expect(r.status).toBe(403);
        expect(t.guard.reserveCalls).toHaveLength(0);
        expect(t.kit.store.records.size).toBe(0);
      }
    });

    it("lets a good token through, and sends the token and the visitor's address, nothing else", async () => {
      const t = withTurnstile();
      const v = await t.kit.visitor();
      t.addImage(v, "img-1");
      const q = await t.quote(v, "img-1");
      const r = await t.kit.send("/api/worlds", { method: "POST", headers: { ...v.headers, "CF-Connecting-IP": "203.0.113.9" }, body: { imageId: "img-1", confirmToken: (q.json as { confirmToken: string }).confirmToken, turnstile: "good-token" } });
      expect(r.status).toBe(201);
      expect(t.turnstile?.calls).toEqual([{ token: "good-token", ip: "203.0.113.9" }]);
    });

    it("is not asked for when it is not configured", async () => {
      const t = setup();
      const v = await t.kit.visitor();
      t.addImage(v, "img-1");
      await t.enter(v, "img-1", { turnstile: "good-token" });
      expect(t.turnstile?.calls).toHaveLength(0);
    });
  });

  it("refuses a picture that was judged unsafe after the Quote, before any spend", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.addImage(v, "img-1");
    const q = await t.quote(v, "img-1");
    t.images.images.get("img-1")!.info.moderation = "unsafe";
    const r = await t.create(v, { imageId: "img-1", confirmToken: (q.json as { confirmToken: string }).confirmToken });
    expect(r.json).toEqual({ ok: false, code: "unsafe_image" });
    expect(t.guard.reserveCalls).toHaveLength(0);
  });

  describe("the caps", () => {
    it("says quota_session at the session cap, and quota_day, quota_total and killed at theirs, and leaves no record", async () => {
      const t = setup();
      const v = await t.kit.visitor();
      for (const id of ["img-1", "img-22", "img-333"]) t.addImage(v, id);
      expect((await t.enter(v, "img-1")).status).toBe(201);
      expect((await t.enter(v, "img-22")).status).toBe(201);
      const third = await t.enter(v, "img-333");
      expect(third.json).toEqual({ ok: false, code: "quota_session" });
      expect(third.status).toBe(429);
      expect(t.kit.store.records.size).toBe(2);

      const day = setup({ caps: { ...DEFAULT_CAPS, world: { session: 5, day: 1, total: 30 } } });
      const d = await day.kit.visitor();
      day.addImage(d, "img-1"); day.addImage(d, "img-22");
      await day.enter(d, "img-1");
      expect((await day.enter(d, "img-22")).json).toEqual({ ok: false, code: "quota_day" });

      const total = setup({ caps: { ...DEFAULT_CAPS, world: { session: 5, day: 5, total: 1 } } });
      const w = await total.kit.visitor();
      total.addImage(w, "img-1"); total.addImage(w, "img-22");
      await total.enter(w, "img-1");
      expect((await total.enter(w, "img-22")).json).toEqual({ ok: false, code: "quota_total" });
    });
  });

  describe("when something fails after the reservation", () => {
    it("releases the unit and marks the world failed when the job will not start, and the next Quote can try again", async () => {
      const t = setup();
      const v = await t.kit.visitor();
      t.addImage(v, "img-1");
      t.starter.fail = { code: "upstream_rejected" };
      const r = await t.enter(v, "img-1");
      expect(r.json).toEqual({ ok: false, code: "upstream_rejected" });
      expect(r.status).toBe(502);
      expect(t.guard.usedOn("world", v.sid)).toBe(0);
      const [record] = [...t.kit.store.records.values()];
      expect(record).toMatchObject({ status: "failed", failure: { code: "upstream_rejected", quotaReturned: true, retryAllowed: true } });

      t.starter.fail = null;
      CLOCK.t += 1000;
      const retry = await t.enter(v, "img-1");
      expect(retry.status).toBe(201);
      expect(t.guard.usedOn("world", v.sid)).toBe(1);
    });

    it("treats a job that throws as upstream_rejected, and releases the unit", async () => {
      const t = setup();
      const v = await t.kit.visitor();
      t.addImage(v, "img-1");
      t.starter.fail = "throw";
      const r = await t.enter(v, "img-1");
      expect(r.json).toEqual({ ok: false, code: "upstream_rejected" });
      expect(t.guard.usedOn("world", v.sid)).toBe(0);
    });

    it("releases the unit and answers with the other request's world when two requests race", async () => {
      const t = setup();
      const v = await t.kit.visitor();
      t.addImage(v, "img-1");
      const real = t.kit.store.create.bind(t.kit.store);
      t.kit.store.create = async (record) => {
        await real(record); // the other request got there first
        return false;
      };
      const r = await t.enter(v, "img-1");
      expect(r.status).toBe(200);
      expect(r.json).toMatchObject({ status: "queued" });
      expect(t.guard.usedOn("world", v.sid)).toBe(0);
      expect(t.starter.started).toHaveLength(0);
    });

    it("releases the unit when the record cannot be made", async () => {
      const t = setup();
      const v = await t.kit.visitor();
      t.addImage(v, "img-1");
      t.kit.store.create = async () => { throw new Error("storage down"); };
      const r = await t.enter(v, "img-1");
      expect(r.json).toEqual({ ok: false, code: "world_gen_disabled" });
      expect(t.guard.usedOn("world", v.sid)).toBe(0);
      expect(t.starter.started).toHaveLength(0);
    });
  });

  it("is refused from another origin, without a Session or a spend", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.addImage(v, "img-1");
    const q = await t.quote(v, "img-1");
    const r = await t.kit.send("/api/worlds", { method: "POST", headers: { ...v.headers, Origin: "http://evil.test" }, body: { imageId: "img-1", confirmToken: (q.json as { confirmToken: string }).confirmToken } });
    expect(r.status).toBe(403);
    expect(r.json).toEqual({ ok: false, code: "bad_origin" });
    expect(t.guard.reserveCalls).toHaveLength(0);
  });

  it("passes a hash of the address to SpendGuard and never the address; the same address gives the same hash and another gives another", async () => {
    const seen: string[] = [];
    const run = async (ip: string | null) => {
      const t = setup();
      const original = t.guard.reserve.bind(t.guard);
      t.guard.reserve = async (req) => { seen.push(req.ipHash); return original(req); };
      const v = await t.kit.visitor();
      t.addImage(v, "img-1");
      const q = await t.quote(v, "img-1");
      await t.kit.send("/api/worlds", { method: "POST", headers: { ...v.headers, ...(ip !== null ? { "CF-Connecting-IP": ip } : {}) }, body: { imageId: "img-1", confirmToken: (q.json as { confirmToken: string }).confirmToken } });
    };
    await run("203.0.113.9");
    await run("203.0.113.9");
    await run("198.51.100.4");
    await run(null);
    expect(seen).toHaveLength(4);
    for (const h of seen) expect(h).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(seen.some((h) => h.includes("203"))).toBe(false);
    expect(seen[0]).toBe(seen[1]);
    expect(new Set(seen).size).toBe(3);
  });
});

/**
 * Property 6: creation is idempotent. Random sequences of create requests for one picture, some with the same
 * token, some with a new token a moment later, some at the same instant, all get one world and start one job.
 * (A seeded loop, not fast-check: this package has no fast-check dependency.)
 */
describe("Property 6: creation is idempotent", () => {
  const mulberry32 = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  it("makes exactly one world and starts exactly one job for any run of requests for the same picture", async () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rnd = mulberry32(seed);
      const t = setup();
      const v = await t.kit.visitor();
      t.addImage(v, "img-1");
      const tokens: string[] = [];
      const newToken = async () => {
        const q = await t.quote(v, "img-1");
        tokens.push((q.json as { confirmToken: string }).confirmToken);
        return tokens[tokens.length - 1] as string;
      };
      await newToken();
      const ids: string[] = [];
      const ask = async (token: string) => {
        const r = await t.create(v, { imageId: "img-1", confirmToken: token });
        expect([200, 201], `seed ${seed}`).toContain(r.status);
        ids.push((r.json as { worldId: string }).worldId);
      };
      const steps = 1 + Math.floor(rnd() * 12);
      for (let i = 0; i < steps; i++) {
        const pick = rnd();
        if (pick < 0.4) await ask(tokens[Math.floor(rnd() * tokens.length)] as string);
        else if (pick < 0.7) { CLOCK.t += 1 + Math.floor(rnd() * 30_000); await ask(await newToken()); }
        else { const token = tokens[Math.floor(rnd() * tokens.length)] as string; await Promise.all([ask(token), ask(token)]); }
      }
      expect(new Set(ids).size, `seed ${seed}`).toBe(1);
      expect(t.starter.started, `seed ${seed}`).toHaveLength(1);
      expect(t.guard.usedOn("world", v.sid), `seed ${seed}`).toBe(1);
      expect(t.kit.store.records.size, `seed ${seed}`).toBe(1);
    }
  }, 30_000);
});

describe("GET /api/images/:id", () => {
  it("serves the picture to its owner with its type, and never caches it", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.addImage(v, "img-1");
    const res = await t.kit.app.request("http://app.test/api/images/img-1", { headers: v.headers }, t.kit.env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Content-Length")).toBe("3");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it("serves the type the bytes were stored with, not the one the lookup reports (the real store's lookup always says octet-stream)", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.addImage(v, "img-1", { contentType: "image/webp" });
    const real = t.images;
    t.images.find = async (id: string) => { const i = await real.images.get(id)?.info; return i === undefined ? null : { ...i, contentType: "application/octet-stream" }; };
    const res = await t.kit.app.request("http://app.test/api/images/img-1", { headers: v.headers }, t.kit.env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
  });

  it("answers someone else's picture, no cookie and a missing picture alike", async () => {
    const t = setup();
    const a = await t.kit.visitor();
    const b = await t.kit.visitor();
    t.addImage(a, "img-1");
    for (const [headers, id] of [[b.headers, "img-1"], [t.kit.anonymous(), "img-1"], [a.headers, "img-none"]] as const) {
      const r = await t.kit.send(`/api/images/${id}`, { headers });
      expect(r.status).toBe(404);
      expect(r.json).toEqual({ ok: false, code: "upload_rejected" });
      expect(r.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });
});

describe("without creation deps", () => {
  it("does not serve the quote, the create call or the pictures", async () => {
    const kit = worldsKit();
    const v = await kit.visitor();
    expect((await kit.send("/api/worlds/quote", { method: "POST", headers: v.headers, body: { imageId: "a" } })).status).toBe(404);
    expect((await kit.send("/api/images/a", { headers: v.headers })).status).toBe(404);
  });
});
