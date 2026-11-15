import { describe, expect, it } from "vitest";
import { makeRealPng, makeSketchPng } from "@hauntology/shared/world/upload-kit";
import { LIVE_URL, liveKit } from "../contract/live-kit";

/**
 * The sketch routes on a running `wrangler dev` with real local R2 and the runtime's own `DecompressionStream` (the test-only
 * worker in `dev/check-worker.ts`, with stand-ins for the image model and the picture check). Skipped unless `LIVE_URL` is set.
 * A caption with `BROKEN` makes the stand-in model fail and one with `BUSY` makes it say it is busy.
 */
describe.skipIf(LIVE_URL === undefined)("the sketch routes on wrangler dev (real R2, the real runtime, stand-in models)", () => {
  const kit = liveKit(LIVE_URL ?? "http://live.unset");
  const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
  const sketch = () => makeSketchPng(256, 192, (x, y) => (x * 3 + y) % 13 === 0);
  const render = async (headers: Record<string, string>, body: unknown) => kit.send("/api/sketch/render", { method: "POST", headers, body });
  const status = async (headers: Record<string, string>, url: string) => (await fetch(`${LIVE_URL}${url}`, { headers })).status;

  it("draws two candidates, keeps them for their owner, and the chosen one goes through the check, the Quote and a ready world", async () => {
    const a = await kit.visitor();
    const b = await kit.visitor();
    const r = await render(a.headers, { sketchPng: b64(await sketch()), caption: "my grandmother's kitchen, blue door" });
    expect(r.status).toBe(200);
    const body = r.json as { candidates: { imageId: string; imageUrl: string }[]; quota: { image: number; world: number } };
    expect(body.candidates).toHaveLength(2);
    expect(body.quota.image).toBe(7);
    for (const c of body.candidates) {
      expect(await status(a.headers, c.imageUrl)).toBe(200);
      expect(await status(b.headers, c.imageUrl)).toBe(404);
      expect(await status(kit.anonymous(), c.imageUrl)).toBe(404);
    }
    const bytes = await Promise.all(body.candidates.map(async (c) => new Uint8Array(await (await fetch(`${LIVE_URL}${c.imageUrl}`, { headers: a.headers })).arrayBuffer())));
    expect(bytes[0]).not.toEqual(bytes[1]); // two seeds, two pictures

    const first = body.candidates[0]!;
    expect((await kit.send("/api/worlds/quote", { method: "POST", headers: a.headers, body: { imageId: first.imageId } })).status).toBe(404); // a candidate is not a Place Image
    const picked = await kit.send("/api/sketch/select", { method: "POST", headers: a.headers, body: { imageId: first.imageId } });
    expect(picked.status).toBe(200);
    const { imageId } = picked.json as { imageId: string };
    expect(((await kit.send("/api/sketch/select", { method: "POST", headers: a.headers, body: { imageId: first.imageId } })).json as { imageId: string }).imageId).toBe(imageId);
    expect((await kit.send("/api/sketch/select", { method: "POST", headers: b.headers, body: { imageId: first.imageId } })).status).toBe(404);

    expect((await kit.send("/api/worlds/quote", { method: "POST", headers: a.headers, body: { imageId } })).json).toEqual({ ok: false, code: "moderation_unavailable" });
    expect((await kit.send("/api/places/brief", { method: "POST", headers: a.headers, body: { imageId } })).status).toBe(200);
    const q = await kit.send("/api/worlds/quote", { method: "POST", headers: a.headers, body: { imageId } });
    expect(q.status).toBe(200);
    const created = await kit.send("/api/worlds", { method: "POST", headers: a.headers, body: { imageId, confirmToken: (q.json as { confirmToken: string }).confirmToken } });
    expect(created.status).toBe(201);
    const worldId = (created.json as { worldId: string }).worldId;
    let state = "?";
    for (let i = 0; i < 60 && state !== "ready" && state !== "failed"; i++) {
      state = ((await kit.send(`/api/worlds/${worldId}`, { headers: a.headers })).json as { status: string }).status;
      if (state !== "ready") await new Promise((res) => setTimeout(res, 300));
    }
    expect(state).toBe("ready");
  }, 60_000);

  it("refuses a blank page, a sketch that is too big or too small, and one that is not a PNG, with the reason and no unit taken", async () => {
    const a = await kit.visitor();
    const cases: [string, unknown, number, string][] = [
      ["blank", { sketchPng: b64(await makeSketchPng(256, 192, () => false)) }, 422, "blank_sketch"],
      ["big", { sketchPng: b64(await makeSketchPng(600, 100, (x) => x % 3 === 0)) }, 413, "upload_too_large"],
      ["small", { sketchPng: b64(await makeSketchPng(200, 40, (x) => x % 3 === 0)) }, 422, "upload_too_small"],
      ["not a png", { sketchPng: b64(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])) }, 422, "upload_bad_magic"],
      ["short caption", { sketchPng: b64(await sketch()), caption: "ab" }, 400, "upload_rejected"],
    ];
    for (const [name, body, statusCode, code] of cases) {
      const r = await render(a.headers, body);
      expect([r.status, r.json], name).toEqual([statusCode, { ok: false, code }]);
    }
    const ok = await render(a.headers, { sketchPng: b64(await sketch()) });
    expect((ok.json as { quota: { image: number } }).quota.image).toBe(7); // the refusals took nothing
  });

  it("decodes every kind of PNG a canvas may make, on the real runtime, and judges its ink", async () => {
    const a = await kit.visitor();
    for (const color of ["rgba", "rgb", "gray", "graya"] as const) {
      const channels = { rgba: 4, rgb: 3, gray: 1, graya: 2 }[color];
      const png = await makeRealPng({ width: 128, height: 96, color, filter: (y) => y % 5, pixel: (x, y) => Array.from({ length: channels }, (_, c) => (color === "rgba" || color === "graya") && c === channels - 1 ? 255 : (x + y) % 9 === 0 ? 0 : 255) });
      const r = await render(a.headers, { sketchPng: b64(png) });
      expect(r.status, color).toBe(200);
    }
    const blank = await makeRealPng({ width: 128, height: 96, color: "rgb", filter: 4, pixel: () => [255, 255, 255] });
    expect((await render(a.headers, { sketchPng: b64(blank) })).status).toBe(422);
  });

  it("gives the unit back when the model fails, and says wait when it is busy", async () => {
    const a = await kit.visitor();
    const broken = await render(a.headers, { sketchPng: b64(await sketch()), caption: "BROKEN kitchen" });
    expect([broken.status, broken.json]).toEqual([502, { ok: false, code: "upstream_rejected" }]);
    const busy = await render(a.headers, { sketchPng: b64(await sketch()), caption: "BUSY kitchen" });
    expect([busy.status, busy.json]).toEqual([429, { ok: false, code: "upstream_rate_limited" }]);
    const ok = await render(a.headers, { sketchPng: b64(await sketch()), caption: "a kitchen" });
    expect((ok.json as { quota: { image: number } }).quota.image).toBe(7); // neither failure took a unit
  });

  it("is used up after eight renders: no call, the code, and what is left", async () => {
    const a = await kit.visitor();
    for (let i = 0; i < 8; i++) expect((await render(a.headers, { sketchPng: b64(await sketch()) })).status, `render ${i + 1}`).toBe(200);
    const ninth = await render(a.headers, { sketchPng: b64(await sketch()) });
    expect([ninth.status, (ninth.json as { code: string }).code]).toEqual([429, "quota_image"]);
    expect((ninth.json as { quota: { image: number } }).quota.image).toBe(0);
  }, 60_000);
});
