import { describe, expect, it } from "vitest";
import { FakeBriefer, MemoryImageStore, MemorySpendGuard, RecordingStarter, DEFAULT_CAPS } from "../worlds/fakes";
import type { ImageInfo } from "../worlds/ports";
import { NOW, worldsKit, type Visitor } from "../worlds/test-kit";

const HASH = "ab".repeat(32);
const CLOCK = { t: NOW };

type Options = { guard?: boolean; briefer?: boolean; verdicts?: boolean; env?: Record<string, string>; caps?: typeof DEFAULT_CAPS };

function setup(opts: Options = {}) {
  CLOCK.t = NOW;
  const images = new MemoryImageStore();
  const guard = new MemorySpendGuard(opts.caps ?? DEFAULT_CAPS, () => CLOCK.t);
  const briefer = new FakeBriefer();
  const kit = worldsKit(() => CLOCK.t, {
    creation: {
      images,
      ...(opts.guard === false ? {} : { guard }),
      starter: new RecordingStarter(),
      ...(opts.briefer === false ? {} : { briefer }),
      ...(opts.verdicts === false ? {} : { verdicts: images }),
    },
    ...(opts.env !== undefined ? { env: opts.env } : {}),
  });
  const add = (owner: Visitor, id: string, over: Partial<ImageInfo> = {}) =>
    images.put({ id, ownerSid: owner.sid, sha256: HASH, moderation: "pending", contentType: "image/jpeg", source: "upload", ...over }, Uint8Array.from([1, 2, 3, 4]));
  const brief = (v: Visitor, imageId: string) => kit.send("/api/places/brief", { method: "POST", headers: v.headers, body: { imageId } });
  const left = async (v: Visitor) => (await guard.remaining(v.sid, "ip")).llm;
  return { kit, images, guard, briefer, add, brief, left };
}

describe("POST /api/places/brief", () => {
  it("checks a picture, keeps the brief with it, returns both, and charges one unit of the llm meter", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.add(v, "img-1");
    const before = await t.left(v);
    const r = await t.brief(v, "img-1");
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(r.json).toEqual({ brief: "A quiet room with a window and soft light.", safe: true });
    expect(await t.images.find("img-1")).toMatchObject({ moderation: "safe", brief: "A quiet room with a window and soft light." });
    expect(await t.left(v)).toBe(before - 1);
    // The model was given the stored bytes and the stored type, and nothing else.
    expect(t.briefer.asked).toEqual([{ image: Uint8Array.from([1, 2, 3, 4]), contentType: "image/jpeg" }]);
  });

  it("settles the unit it reserved, exactly once: commits when the model answered, releases when the call failed", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.add(v, "img-1");
    t.add(v, "img-2");
    t.add(v, "img-3");
    const settled: string[] = [];
    const commit = t.guard.commit.bind(t.guard);
    const release = t.guard.release.bind(t.guard);
    t.guard.commit = async (tk) => { settled.push("commit"); return commit(tk); };
    t.guard.release = async (tk) => { settled.push("release"); return release(tk); };
    await t.brief(v, "img-1");
    expect(settled).toEqual(["commit"]);
    t.briefer.script = [{ ok: false }];
    await t.brief(v, "img-2");
    expect(settled).toEqual(["commit", "release"]);
    t.briefer.script = [{ ok: true, verdict: { kind: "unusable" } }];
    await t.brief(v, "img-3");
    expect(settled).toEqual(["commit", "release", "commit"]);
  });

  it("answers moderation_unavailable, and keeps the picture, when a brief is so long in a script that it cannot be kept at all", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.add(v, "img-1");
    t.briefer.script = [{ ok: true, verdict: { kind: "safe", brief: "青".repeat(500) } }];
    const r = await t.brief(v, "img-1");
    expect([r.status, r.json]).toEqual([503, { ok: false, code: "moderation_unavailable" }]);
    expect(await t.images.find("img-1")).toMatchObject({ moderation: "pending" });
  });

  it("makes a picture usable: the Quote refuses it before the check and gives a token after", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.add(v, "img-1");
    const before = await t.kit.send("/api/worlds/quote", { method: "POST", headers: v.headers, body: { imageId: "img-1" } });
    expect([before.status, before.json]).toEqual([503, { ok: false, code: "moderation_unavailable" }]);
    expect((await t.brief(v, "img-1")).status).toBe(200);
    const after = await t.kit.send("/api/worlds/quote", { method: "POST", headers: v.headers, body: { imageId: "img-1" } });
    expect(after.status).toBe(200);
    expect(after.json).toHaveProperty("confirmToken");
  });

  it("answers a picture already checked from what is stored, with no call and no charge", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.add(v, "img-1");
    await t.brief(v, "img-1");
    const spent = await t.left(v);
    const again = await t.brief(v, "img-1");
    expect(again.json).toEqual({ brief: "A quiet room with a window and soft light.", safe: true });
    expect(t.briefer.asked).toHaveLength(1);
    expect(await t.left(v)).toBe(spent);
    // A picture that was marked safe without a brief (for example by hand) answers an empty one.
    t.add(v, "img-2", { moderation: "safe" });
    expect((await t.brief(v, "img-2")).json).toEqual({ brief: "", safe: true });
    expect(t.briefer.asked).toHaveLength(1);
  });

  it("deletes an unsafe picture at once and says nothing of what was seen", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.add(v, "img-1");
    t.briefer.script = [{ ok: true, verdict: { kind: "unsafe" } }];
    const r = await t.brief(v, "img-1");
    expect([r.status, r.json]).toEqual([200, { brief: "", safe: false }]);
    expect(await t.images.find("img-1")).toBeNull();
    expect(t.images.verdicts).toEqual(["remove:img-1"]);
    expect(r.text).not.toMatch(/nude|violence|person|unsafe/i);
    // The call was made, so it is charged; asking again finds no picture.
    expect((await t.guard.remaining(v.sid, "ip")).llm).toBe(DEFAULT_CAPS.llm.session - 1);
    expect(((await t.brief(v, "img-1")).json as { code: string }).code).toBe("upload_rejected");
  });

  it("deletes a picture that was already marked unsafe, without a call", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.add(v, "img-1", { moderation: "unsafe" });
    const r = await t.brief(v, "img-1");
    expect([r.status, r.json]).toEqual([200, { brief: "", safe: false }]);
    expect(await t.images.find("img-1")).toBeNull();
    expect(t.briefer.asked).toHaveLength(0);
  });

  describe("fails closed, keeps the picture, and lets the visitor ask again", () => {
    it("when the call fails or times out: not charged", async () => {
      const t = setup();
      const v = await t.kit.visitor();
      t.add(v, "img-1");
      const start = await t.left(v);
      t.briefer.script = [{ ok: false }];
      const a = await t.brief(v, "img-1");
      expect([a.status, a.json]).toEqual([503, { ok: false, code: "moderation_unavailable" }]);
      t.briefer.throws = 1;
      const b = await t.brief(v, "img-1");
      expect([b.status, b.json]).toEqual([503, { ok: false, code: "moderation_unavailable" }]);
      expect(await t.images.find("img-1")).toMatchObject({ moderation: "pending" });
      expect(await t.left(v)).toBe(start);
      // The next ask works.
      expect((await t.brief(v, "img-1")).status).toBe(200);
    });

    it("when the answer cannot be used: the call was made, so it is charged", async () => {
      const t = setup();
      const v = await t.kit.visitor();
      t.add(v, "img-1");
      const start = await t.left(v);
      t.briefer.script = [{ ok: true, verdict: { kind: "unusable" } }];
      const r = await t.brief(v, "img-1");
      expect([r.status, r.json]).toEqual([503, { ok: false, code: "moderation_unavailable" }]);
      expect(await t.images.find("img-1")).toMatchObject({ moderation: "pending" });
      expect(await t.left(v)).toBe(start - 1);
    });

    it("when nothing is set up to check: no briefer, no verdict store, or no SpendGuard", async () => {
      for (const opts of [{ briefer: false }, { verdicts: false }, { guard: false }]) {
        const t = setup(opts);
        const v = await t.kit.visitor();
        t.add(v, "img-1");
        const r = await t.brief(v, "img-1");
        expect([r.status, r.json], JSON.stringify(opts)).toEqual([503, { ok: false, code: "moderation_unavailable" }]);
        expect(await t.images.find("img-1")).toMatchObject({ moderation: "pending" });
      }
    });

    it("when the picture's bytes cannot be read: gives the unit back", async () => {
      const t = setup();
      const v = await t.kit.visitor();
      t.add(v, "img-1");
      const start = await t.left(v);
      t.images.read = async () => null;
      const r = await t.brief(v, "img-1");
      expect([r.status, r.json]).toEqual([404, { ok: false, code: "upload_rejected" }]);
      expect(t.briefer.asked).toHaveLength(0);
      expect(await t.left(v)).toBe(start);
    });
  });

  it("refuses without a call when the llm caps are reached, and says which", async () => {
    const caps = { ...DEFAULT_CAPS, llm: { session: 1, day: 100 } };
    const t = setup({ caps });
    const v = await t.kit.visitor();
    t.add(v, "img-1");
    t.add(v, "img-2");
    expect((await t.brief(v, "img-1")).status).toBe(200);
    const r = await t.brief(v, "img-2");
    expect([r.status, r.json]).toEqual([429, { ok: false, code: "quota_session" }]);
    expect(t.briefer.asked).toHaveLength(1);
    const day = setup({ caps: { ...DEFAULT_CAPS, llm: { session: 10, day: 1 } } });
    const a = await day.kit.visitor();
    const b = await day.kit.visitor();
    day.add(a, "a1");
    day.add(b, "b1");
    await day.brief(a, "a1");
    expect(((await day.brief(b, "b1")).json as { code: string }).code).toBe("quota_day");
  });

  it("does not check a picture while worlds are closed, and spends nothing", async () => {
    const t = setup({ env: { WORLD_GEN_ENABLED: "false" } });
    const v = await t.kit.visitor();
    t.add(v, "img-1");
    const start = await t.left(v);
    const r = await t.brief(v, "img-1");
    expect([r.status, r.json]).toEqual([503, { ok: false, code: "world_gen_disabled" }]);
    expect(t.briefer.asked).toHaveLength(0);
    expect(await t.left(v)).toBe(start);
  });

  it("answers someone else's picture, a missing one and a bad body alike or with the right code, and calls nothing", async () => {
    const t = setup();
    const a = await t.kit.visitor();
    const b = await t.kit.visitor();
    t.add(a, "img-a");
    for (const [v, id] of [[b, "img-a"], [b, "img-none"]] as const) {
      const r = await t.brief(v, id);
      expect([r.status, r.json]).toEqual([404, { ok: false, code: "upload_rejected" }]);
    }
    const anon = await t.kit.send("/api/places/brief", { method: "POST", headers: t.kit.anonymous(), body: { imageId: "img-a" } });
    expect(anon.status).toBe(404);
    for (const body of [{}, { imageId: "../x" }, { imageId: 5 }, { imageId: "" }]) {
      expect((await t.kit.send("/api/places/brief", { method: "POST", headers: a.headers, body })).status, JSON.stringify(body)).toBe(400);
    }
    expect(t.briefer.asked).toHaveLength(0);
    expect(await t.images.find("img-a")).toMatchObject({ moderation: "pending" });
  });

  it("stores a brief that fits the picture's metadata, and returns what was stored", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.add(v, "img-1");
    const long = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
    t.briefer.script = [{ ok: true, verdict: { kind: "safe", brief: long } }];
    const r = await t.brief(v, "img-1");
    const brief = (r.json as { brief: string }).brief;
    expect(brief.split(" ")).toHaveLength(80);
    expect((await t.images.find("img-1"))?.brief).toBe(brief);
  });

  it("is a write like the others: a cross-origin request is refused", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.add(v, "img-1");
    const r = await t.kit.send("/api/places/brief", { method: "POST", headers: { ...v.headers, Origin: "https://evil.example" }, body: { imageId: "img-1" } });
    expect(r.status).toBe(403);
    expect(t.briefer.asked).toHaveLength(0);
  });

  it("only goes through the guarded call: a Ticket for another meter is refused", async () => {
    const { briefPlace } = await import("../guarded/workersai/place-brief");
    const b = new FakeBriefer();
    const ticket = { id: "t-1", meter: "llm" as const, sessionId: "s", issuedAt: 1 };
    expect(await briefPlace(b, ticket, { image: Uint8Array.from([1]), contentType: "image/png" })).toMatchObject({ ok: true });
    for (const bad of [{ ...ticket, meter: "world" }, { ...ticket, meter: "image" }, { ...ticket, id: "" }, null, undefined, "t", {}]) {
      expect(() => briefPlace(b, bad as never, { image: Uint8Array.from([1]), contentType: "image/png" })).toThrow();
    }
    expect(b.asked).toHaveLength(1);
  });
});
