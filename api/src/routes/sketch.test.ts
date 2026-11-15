import { describe, expect, it } from "vitest";
import { INK_FLOOR, buildSketchPrompt } from "@hauntology/shared/sketch";
import { COMMENT, EXIF, JFIF, bytesOf, join, makeJpeg, makeSketchPng, makeWebp, pngChunk } from "@hauntology/shared/world/upload-kit";
import { FakeBriefer, FakeImager, MemoryCandidates, MemoryImageStore, MemorySpendGuard, RecordingStarter, DEFAULT_CAPS } from "../worlds/fakes";
import type { RenderAnswer } from "../worlds/ports";
import { NOW, worldsKit, type Visitor } from "../worlds/test-kit";
import { CANDIDATES, CANDIDATE_HEIGHT, CANDIDATE_WIDTH } from "./sketch";

const CLOCK = { t: NOW };
const b64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const text = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

/** A picture the stand-in model "draws": a JPEG of the size asked, with metadata the route must strip, and the seed in its scan. */
const picture = (seed: number, extra = true): RenderAnswer => ({
  ok: true,
  image: makeJpeg({ width: 1024, height: 768, head: extra ? [JFIF(), EXIF("Exif\0\0made by a model"), COMMENT("generated")] : [], scans: [bytesOf(`scan ${seed}`)] }),
});

type Options = { guard?: boolean; imager?: boolean; candidates?: boolean; briefer?: boolean; env?: Record<string, string>; caps?: typeof DEFAULT_CAPS };

async function setup(opts: Options = {}) {
  CLOCK.t = NOW;
  const images = new MemoryImageStore();
  const candidates = new MemoryCandidates(images);
  const guard = new MemorySpendGuard(opts.caps ?? DEFAULT_CAPS, () => CLOCK.t);
  const imager = new FakeImager();
  imager.fallback = (n) => picture(n);
  const briefer = new FakeBriefer();
  const kit = worldsKit(() => CLOCK.t, {
    creation: {
      images,
      ...(opts.guard === false ? {} : { guard }),
      starter: new RecordingStarter(),
      ...(opts.imager === false ? {} : { imager }),
      ...(opts.candidates === false ? {} : { candidates }),
      ...(opts.briefer === false ? {} : { briefer, verdicts: images }),
    },
    ...(opts.env !== undefined ? { env: opts.env } : {}),
  });
  const sketch = await makeSketchPng(256, 192, (x, y) => (x + y) % 17 === 0);
  const render = (v: Visitor, body: unknown) => kit.send("/api/sketch/render", { method: "POST", headers: v.headers, body });
  const select = (v: Visitor, imageId: unknown) => kit.send("/api/sketch/select", { method: "POST", headers: v.headers, body: { imageId } });
  const left = async (v: Visitor) => (await guard.remaining(v.sid, "ip")).image;
  const settled: string[] = [];
  const commit = guard.commit.bind(guard);
  const release = guard.release.bind(guard);
  guard.commit = async (t) => { settled.push("commit"); return commit(t); };
  guard.release = async (t) => { settled.push("release"); return release(t); };
  return { kit, images, candidates, guard, imager, briefer, sketch, render, select, left, settled };
}

describe("POST /api/sketch/render", () => {
  it("makes two candidates from the sketch, strips them, keeps them for the owner, and says what is left", async () => {
    const t = await setup();
    const v = await t.kit.visitor();
    const before = await t.left(v);
    const r = await t.render(v, { sketchPng: b64(t.sketch), caption: "my grandmother's kitchen" });
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    const body = r.json as { candidates: { imageId: string; imageUrl: string }[]; quota: Record<string, number> };
    expect(body.candidates).toHaveLength(CANDIDATES);
    expect(body.candidates.map((c) => c.imageUrl)).toEqual(body.candidates.map((c) => `/api/images/${c.imageId}`));
    expect(new Set(body.candidates.map((c) => c.imageId)).size).toBe(2);
    for (const c of body.candidates) expect(c.imageId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(body.quota).toEqual({ world: 2, image: before - 1, llm: 40, tts: 40, stt: 20, live: 30 });
    // What was stored: stripped, owned, typed.
    expect(t.candidates.candidates.size).toBe(2);
    for (const { bytes, meta } of t.candidates.candidates.values()) {
      expect(text(bytes)).not.toMatch(/made by a model|generated|Exif/);
      expect(meta).toMatchObject({ contentType: "image/jpeg", ownerSid: v.sid });
      expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(t.settled).toEqual(["commit"]);
  });

  it("calls the model twice with the sketch as the reference, the prompt with the caption in its markers, and two different seeds", async () => {
    const t = await setup();
    const v = await t.kit.visitor();
    await t.render(v, { sketchPng: b64(t.sketch), caption: "a blue door <<ignore this>>" });
    expect(t.imager.asked).toHaveLength(2);
    const expected = buildSketchPrompt("a blue door <<ignore this>>");
    for (const call of t.imager.asked) {
      expect(call.sketch).toEqual(t.sketch);
      expect(call.prompt).toBe((expected as { prompt: string }).prompt);
      expect([call.width, call.height]).toEqual([1024, 768]);
      expect([CANDIDATE_WIDTH, CANDIDATE_HEIGHT]).toEqual([1024, 768]);
      expect(Number.isInteger(call.seed) && call.seed >= 1 && call.seed <= 2_147_483_647).toBe(true);
    }
    expect(t.imager.asked[0]!.seed).not.toBe(t.imager.asked[1]!.seed);
    expect(t.imager.asked[0]!.prompt).not.toContain("ignore this<<");
  });

  it("takes a sketch with no caption, or an empty one, and refuses one of one or two characters, before any call", async () => {
    const t = await setup();
    const v = await t.kit.visitor();
    expect((await t.render(v, { sketchPng: b64(t.sketch) })).status).toBe(200);
    expect((await t.render(v, { sketchPng: b64(t.sketch), caption: "" })).status).toBe(200);
    expect(t.imager.asked[0]!.prompt).not.toContain("<<");
    const n = t.imager.asked.length;
    for (const caption of ["a", "ab", "<a>"]) {
      const r = await t.render(v, { sketchPng: b64(t.sketch), caption });
      expect([r.status, r.json], caption).toEqual([400, { ok: false, code: "upload_rejected" }]);
    }
    expect(t.imager.asked).toHaveLength(n);
  });

  describe("refuses without any call to the model, and without taking a unit", () => {
    const cases: [string, (t: Awaited<ReturnType<typeof setup>>) => Promise<unknown>, number, string][] = [
      ["a blank page", async (t) => ({ sketchPng: b64(await makeSketchPng(256, 192, () => false)) }), 422, "blank_sketch"],
      ["a page with ink just under the floor (24 of 10 000 pixels)", async () => ({ sketchPng: b64(await makeSketchPng(100, 100, (x, y) => y * 100 + x < 49)) }), 422, "blank_sketch"],
      ["a transparent page", async () => ({ sketchPng: b64(await makeSketchPng(256, 192, () => false, true)) }), 422, "blank_sketch"],
      ["a sketch over 512 on its longest side", async () => ({ sketchPng: b64(await makeSketchPng(513, 100, (x) => x % 3 === 0)) }), 413, "upload_too_large"],
      ["a sketch under 64 on its shorter side", async () => ({ sketchPng: b64(await makeSketchPng(200, 63, (x) => x % 3 === 0)) }), 422, "upload_too_small"],
      ["bytes that are not a PNG", async () => ({ sketchPng: b64(makeJpeg({ width: 300, height: 300 })) }), 422, "upload_bad_magic"],
      ["a PNG that is not whole", async (t) => ({ sketchPng: b64(t.sketch.subarray(0, 100)) }), 422, "upload_bad_magic"],
      ["a PNG of a kind it does not read (16 bits)", async () => ({ sketchPng: b64(join(bytesOf(0x89, "PNG\r\n", 0x1a, "\n"), pngChunk("IHDR", bytesOf([0, 0, 1, 0], [0, 0, 1, 0], 16, 2, 0, 0, 0)), pngChunk("IDAT", [1, 2, 3]), pngChunk("IEND"))) }), 400, "upload_rejected"],
      ["text that is not base64", async () => ({ sketchPng: "not base64 at all!!" }), 400, "upload_rejected"],
      ["base64 of the wrong length", async () => ({ sketchPng: "QUJD=" }), 400, "upload_rejected"],
      ["a missing sketch", async () => ({ caption: "a kitchen" }), 400, "upload_rejected"],
      ["a sketch that is not a string", async () => ({ sketchPng: 5 }), 400, "upload_rejected"],
      ["a caption that is not a string", async (t) => ({ sketchPng: b64(t.sketch), caption: 5 }), 400, "upload_rejected"],
      ["a caption of one character", async (t) => ({ sketchPng: b64(t.sketch), caption: "a" }), 400, "upload_rejected"],
    ];
    for (const [name, make, status, code] of cases) {
      it(name, async () => {
        const t = await setup();
        const v = await t.kit.visitor();
        const start = await t.left(v);
        const r = await t.render(v, await make(t));
        expect([r.status, r.json]).toEqual([status, { ok: false, code }]);
        expect(t.imager.asked).toHaveLength(0);
        expect(await t.left(v)).toBe(start);
        expect(t.settled).toEqual([]);
        expect(t.candidates.candidates.size).toBe(0);
      });
    }
    it("a body that is not JSON, or too big", async () => {
      const t = await setup();
      const v = await t.kit.visitor();
      const raw = (body: string) => t.kit.app.request("http://app.test/api/sketch/render", { method: "POST", headers: { ...v.headers, "Content-Type": "application/json" }, body }, t.kit.env);
      expect((await raw("{nope")).status).toBe(400);
      expect((await raw("")).status).toBe(400);
      expect((await raw(JSON.stringify({ sketchPng: "A".repeat(1_600_000) }))).status).toBe(413);
      expect(t.imager.asked).toHaveLength(0);
    });
  });

  it("judges blank the way the shell does: exactly half a percent of ink is not blank", async () => {
    const t = await setup();
    const v = await t.kit.visitor();
    expect(INK_FLOOR).toBe(0.005);
    const at = await t.render(v, { sketchPng: b64(await makeSketchPng(100, 100, (x, y) => y * 100 + x < 50)) });
    expect(at.status).toBe(200);
    const under = await t.render(v, { sketchPng: b64(await makeSketchPng(100, 100, (x, y) => y * 100 + x < 49)) });
    expect(under.status).toBe(422);
  });

  it("takes the sizes the shell sends: 512 on the longest side, and 64 on the shortest", async () => {
    const t = await setup();
    const v = await t.kit.visitor();
    expect((await t.render(v, { sketchPng: b64(await makeSketchPng(512, 384, (x, y) => (x + y) % 11 === 0)) })).status).toBe(200);
    expect((await t.render(v, { sketchPng: b64(await makeSketchPng(384, 512, (x, y) => (x + y) % 11 === 0)) })).status).toBe(200);
    expect((await t.render(v, { sketchPng: b64(await makeSketchPng(64, 64, (x, y) => (x + y) % 5 === 0)) })).status).toBe(200);
    expect((await t.render(v, { sketchPng: b64(await makeSketchPng(513, 100, (x) => x % 3 === 0)) })).status).toBe(413);
    expect((await t.render(v, { sketchPng: b64(await makeSketchPng(100, 63, (x) => x % 3 === 0)) })).status).toBe(422);
  });

  it("says worlds are closed, not a quota, if SpendGuard refuses the unit because it is closed", async () => {
    const t = await setup();
    const v = await t.kit.visitor();
    t.guard.reserve = async () => ({ ok: false, reason: "killed" });
    const r = await t.render(v, { sketchPng: b64(t.sketch) });
    expect([r.status, r.json]).toEqual([503, { ok: false, code: "world_gen_disabled" }]);
    expect(t.imager.asked).toHaveLength(0);
  });

  it("takes nothing when worlds are closed or nothing is set up, and says so", async () => {
    for (const opts of [{ env: { WORLD_GEN_ENABLED: "false" } }, { imager: false }, { candidates: false }, { guard: false }]) {
      const t = await setup(opts);
      const v = await t.kit.visitor();
      const r = await t.render(v, { sketchPng: b64(t.sketch), caption: "a kitchen" });
      expect([r.status, r.json], JSON.stringify(opts)).toEqual([503, { ok: false, code: "world_gen_disabled" }]);
      expect(t.imager.asked).toHaveLength(0);
    }
  });

  describe("the image quota", () => {
    it("is used up after the allowed renders: no call, the code, what is left, and a pointer to the Gallery is the shell's copy for it", async () => {
      const caps = { ...DEFAULT_CAPS, image: { session: 2, day: 100 } };
      const t = await setup({ caps });
      const v = await t.kit.visitor();
      expect((await t.render(v, { sketchPng: b64(t.sketch) })).status).toBe(200);
      expect((await t.render(v, { sketchPng: b64(t.sketch) })).status).toBe(200);
      const calls = t.imager.asked.length;
      const r = await t.render(v, { sketchPng: b64(t.sketch) });
      expect([r.status, (r.json as { code: string }).code]).toEqual([429, "quota_image"]);
      expect((r.json as { quota: Record<string, number> }).quota).toMatchObject({ image: 0, world: 2 });
      expect(t.imager.asked).toHaveLength(calls);
      // The day cap too, across visitors.
      const day = await setup({ caps: { ...DEFAULT_CAPS, image: { session: 5, day: 1 } } });
      const a = await day.kit.visitor();
      const b = await day.kit.visitor();
      await day.render(a, { sketchPng: b64(day.sketch) });
      expect(((await day.render(b, { sketchPng: b64(day.sketch) })).json as { code: string }).code).toBe("quota_image");
    });

    it("costs one unit for a render of two pictures, and none for a render that failed", async () => {
      const t = await setup();
      const v = await t.kit.visitor();
      const start = await t.left(v);
      await t.render(v, { sketchPng: b64(t.sketch) });
      expect(await t.left(v)).toBe(start - 1);
      t.imager.fallback = null;
      t.imager.script = [{ ok: false, kind: "failed" }, { ok: false, kind: "failed" }];
      expect((await t.render(v, { sketchPng: b64(t.sketch) })).status).toBe(502);
      expect(await t.left(v)).toBe(start - 1);
    });

    it("is not closed by the kill switch, which stops new worlds only", async () => {
      const t = await setup();
      const v = await t.kit.visitor();
      t.guard.killed = true;
      expect((await t.render(v, { sketchPng: b64(t.sketch) })).status).toBe(200);
    });
  });

  describe("when the model fails", () => {
    it("fails both: gives the unit back and says the place could not be made", async () => {
      const t = await setup();
      const v = await t.kit.visitor();
      t.imager.fallback = null;
      t.imager.script = [{ ok: false, kind: "failed" }, { ok: false, kind: "failed" }];
      const r = await t.render(v, { sketchPng: b64(t.sketch) });
      expect([r.status, r.json]).toEqual([502, { ok: false, code: "upstream_rejected" }]);
      expect(t.settled).toEqual(["release"]);
      expect(t.candidates.candidates.size).toBe(0);
    });

    it("is busy on both: says wait, and gives the unit back", async () => {
      const t = await setup();
      const v = await t.kit.visitor();
      t.imager.fallback = null;
      t.imager.script = [{ ok: false, kind: "rate_limited" }, { ok: false, kind: "rate_limited" }];
      const r = await t.render(v, { sketchPng: b64(t.sketch) });
      expect([r.status, r.json]).toEqual([429, { ok: false, code: "upstream_rate_limited" }]);
      expect(t.settled).toEqual(["release"]);
    });

    it("is busy on one and broken on the other: not a wait", async () => {
      const t = await setup();
      const v = await t.kit.visitor();
      t.imager.fallback = null;
      t.imager.script = [{ ok: false, kind: "rate_limited" }, { ok: false, kind: "failed" }];
      expect(((await t.render(v, { sketchPng: b64(t.sketch) })).json as { code: string }).code).toBe("upstream_rejected");
    });

    it("reads a throw as a failure, and still answers", async () => {
      const t = await setup();
      const v = await t.kit.visitor();
      t.imager.throws = 2;
      const r = await t.render(v, { sketchPng: b64(t.sketch) });
      expect([r.status, (r.json as { code: string }).code]).toEqual([502, "upstream_rejected"]);
      expect(t.settled).toEqual(["release"]);
    });

    it("fails one of the two: gives the one that was made, and charges the unit", async () => {
      const t = await setup();
      const v = await t.kit.visitor();
      t.imager.fallback = null;
      t.imager.script = [picture(1), { ok: false, kind: "failed" }];
      const r = await t.render(v, { sketchPng: b64(t.sketch) });
      expect(r.status).toBe(200);
      expect((r.json as { candidates: unknown[] }).candidates).toHaveLength(1);
      expect(t.settled).toEqual(["commit"]);
    });

    it("answers pictures it cannot use: charged, because the model answered, and no candidate", async () => {
      const t = await setup();
      const v = await t.kit.visitor();
      const unusable: RenderAnswer[] = [
        { ok: true, image: bytesOf("not a picture") },
        { ok: true, image: makeJpeg({ width: 300, height: 300 }) },
        { ok: true, image: makeWebp({ width: 1024, height: 768, animated: true }) },
        { ok: true, image: new Uint8Array(0) },
      ];
      for (let i = 0; i < unusable.length; i += 2) {
        t.imager.fallback = null;
        t.imager.script = [unusable[i]!, unusable[i + 1]!];
        const r = await t.render(v, { sketchPng: b64(t.sketch) });
        expect([r.status, (r.json as { code: string }).code]).toEqual([502, "upstream_rejected"]);
      }
      expect(t.settled).toEqual(["commit", "commit"]);
      expect(t.candidates.candidates.size).toBe(0);
    });

    it("cannot store one: leaves it out and gives the other; cannot store either: a failure, charged", async () => {
      const t = await setup();
      const v = await t.kit.visitor();
      t.candidates.failures = 1;
      const one = await t.render(v, { sketchPng: b64(t.sketch) });
      expect((one.json as { candidates: unknown[] }).candidates).toHaveLength(1);
      t.candidates.failures = 2;
      const none = await t.render(v, { sketchPng: b64(t.sketch) });
      expect([none.status, none.json]).toEqual([502, { ok: false, code: "upstream_rejected" }]);
      expect(t.settled).toEqual(["commit", "commit"]);
    });
  });

  it("is a write like the others: a cross-origin request is refused, and nothing is called", async () => {
    const t = await setup();
    const v = await t.kit.visitor();
    const r = await t.kit.send("/api/sketch/render", { method: "POST", headers: { ...v.headers, Origin: "https://evil.example" }, body: { sketchPng: b64(t.sketch) } });
    expect(r.status).toBe(403);
    expect(t.imager.asked).toHaveLength(0);
  });
});

describe("a candidate", () => {
  it("is served to its owner only, with its type, and is not a Place Image: it cannot be quoted or checked", async () => {
    const t = await setup();
    const a = await t.kit.visitor();
    const b = await t.kit.visitor();
    const r = await t.render(a, { sketchPng: b64(t.sketch), caption: "a kitchen" });
    const first = (r.json as { candidates: { imageId: string; imageUrl: string }[] }).candidates[0]!;
    const own = await t.kit.app.request(`http://app.test${first.imageUrl}`, { headers: a.headers }, t.kit.env);
    expect(own.status).toBe(200);
    expect(own.headers.get("Content-Type")).toBe("image/jpeg");
    expect(own.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await own.arrayBuffer())).toEqual(t.candidates.candidates.get(first.imageId)!.bytes);
    for (const headers of [b.headers, t.kit.anonymous()]) expect((await t.kit.send(first.imageUrl, { headers })).status).toBe(404);
    // Not a Place Image until chosen.
    const quote = await t.kit.send("/api/worlds/quote", { method: "POST", headers: a.headers, body: { imageId: first.imageId } });
    expect([quote.status, quote.json]).toEqual([404, { ok: false, code: "upload_rejected" }]);
    const brief = await t.kit.send("/api/places/brief", { method: "POST", headers: a.headers, body: { imageId: first.imageId } });
    expect(brief.status).toBe(404);
    expect(t.briefer.asked).toHaveLength(0);
  });
});

describe("POST /api/sketch/select", () => {
  it("makes the chosen candidate a Place Image from a sketch, not yet checked, and the same candidate gives the same id", async () => {
    const t = await setup();
    const v = await t.kit.visitor();
    const r = await t.render(v, { sketchPng: b64(t.sketch), caption: "a kitchen" });
    const [one, two] = (r.json as { candidates: { imageId: string }[] }).candidates as [{ imageId: string }, { imageId: string }];
    const picked = await t.select(v, one.imageId);
    expect(picked.status).toBe(200);
    const { imageId } = picked.json as { imageId: string };
    expect(imageId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(imageId).not.toBe(one.imageId);
    expect(await t.images.find(imageId)).toMatchObject({ ownerSid: v.sid, moderation: "pending", source: "sketch", contentType: "image/jpeg" });
    expect(t.candidates.images.images.get(imageId)!.bytes).toEqual(t.candidates.candidates.get(one.imageId)!.bytes);
    expect(((await t.select(v, one.imageId)).json as { imageId: string }).imageId).toBe(imageId);
    expect(((await t.select(v, two.imageId)).json as { imageId: string }).imageId).not.toBe(imageId);
  });

  it("then goes the way an upload goes: the check, then the Quote", async () => {
    const t = await setup();
    const v = await t.kit.visitor();
    const r = await t.render(v, { sketchPng: b64(t.sketch) });
    const picked = (await t.select(v, (r.json as { candidates: { imageId: string }[] }).candidates[0]!.imageId)).json as { imageId: string };
    const quote = () => t.kit.send("/api/worlds/quote", { method: "POST", headers: v.headers, body: { imageId: picked.imageId } });
    expect((await quote()).json).toEqual({ ok: false, code: "moderation_unavailable" });
    expect((await t.kit.send("/api/places/brief", { method: "POST", headers: v.headers, body: { imageId: picked.imageId } })).status).toBe(200);
    expect((await quote()).status).toBe(200);
  });

  it("answers someone else's candidate, a missing one, an upload and a bad body without a hint of which", async () => {
    const t = await setup();
    const a = await t.kit.visitor();
    const b = await t.kit.visitor();
    const r = await t.render(a, { sketchPng: b64(t.sketch) });
    const id = (r.json as { candidates: { imageId: string }[] }).candidates[0]!.imageId;
    t.images.put({ id: "an-upload", ownerSid: a.sid, sha256: "ab".repeat(32), moderation: "safe", contentType: "image/jpeg" });
    for (const [v, imageId] of [[b, id], [a, "nope"], [a, "an-upload"]] as const) {
      const res = await t.select(v, imageId);
      expect([res.status, res.json], imageId).toEqual([404, { ok: false, code: "upload_rejected" }]);
    }
    expect((await t.kit.send("/api/sketch/select", { method: "POST", headers: t.kit.anonymous(), body: { imageId: id } })).status).toBe(404);
    for (const body of [{}, { imageId: "" }, { imageId: "../x" }, { imageId: 5 }]) {
      expect((await t.kit.send("/api/sketch/select", { method: "POST", headers: a.headers, body })).status, JSON.stringify(body)).toBe(400);
    }
  });

  it("takes nothing while worlds are closed, or when no candidates are kept", async () => {
    for (const opts of [{ env: { WORLD_GEN_ENABLED: "false" } }, { candidates: false }]) {
      const t = await setup(opts);
      const v = await t.kit.visitor();
      const r = await t.select(v, "some-id");
      expect([r.status, r.json], JSON.stringify(opts)).toEqual([503, { ok: false, code: "world_gen_disabled" }]);
    }
  });

  it("refuses a request from another origin", async () => {
    const t = await setup();
    const v = await t.kit.visitor();
    expect((await t.kit.send("/api/sketch/select", { method: "POST", headers: { ...v.headers, Origin: "https://evil.example" }, body: { imageId: "x" } })).status).toBe(403);
  });
});
