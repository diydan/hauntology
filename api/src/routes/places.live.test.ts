import { describe, expect, it } from "vitest";
import { bytesOf, makeJpeg } from "@hauntology/shared/world/upload-kit";
import { LIVE_URL, liveKit } from "../contract/live-kit";

/**
 * The Place Brief check on a running `wrangler dev` with real local R2: an upload, the check (with a stand-in for the model in
 * `dev/check-worker.ts`: `UNSAFE` in the picture is unsafe, `BROKEN` fails the call, `GARBLED` is an answer that cannot be
 * used), the verdict written onto the stored object, and, once checked, the Quote and a world. Skipped unless `LIVE_URL` is set.
 */
describe.skipIf(LIVE_URL === undefined)("the Place Brief check on wrangler dev (real R2, a stand-in model)", () => {
  const kit = liveKit(LIVE_URL ?? "http://live.unset");
  const photo = (marker = "") => makeJpeg({ width: 1024, height: 768, scans: [bytesOf(marker === "" ? "plain scan data" : `${marker} scan data`)] });

  const upload = async (headers: Record<string, string>, bytes: Uint8Array) => {
    const form = new FormData();
    form.append("photo", new File([bytes], "x.jpg", { type: "image/jpeg" }));
    const res = await fetch(`${LIVE_URL}/api/uploads`, { method: "POST", headers, body: form });
    return (await res.json()) as { imageId: string; imageUrl: string };
  };
  const brief = (headers: Record<string, string>, imageId: string) => kit.send("/api/places/brief", { method: "POST", headers, body: { imageId } });
  const quote = (headers: Record<string, string>, imageId: string) => kit.send("/api/worlds/quote", { method: "POST", headers, body: { imageId } });
  const read = async (headers: Record<string, string>, url: string) => (await fetch(`${LIVE_URL}${url}`, { headers })).status;

  it("checks a photo, writes the verdict onto the stored object, and the photo then goes through the Quote to a ready world", async () => {
    const a = await kit.visitor();
    const up = await upload(a.headers, photo());
    expect((await quote(a.headers, up.imageId)).json).toEqual({ ok: false, code: "moderation_unavailable" });

    const r = await brief(a.headers, up.imageId);
    expect([r.status, r.json]).toEqual([200, { brief: "A stand-in brief: a quiet room with a window.", safe: true }]);
    // Asked again: answered from the stored object.
    expect((await brief(a.headers, up.imageId)).json).toEqual({ brief: "A stand-in brief: a quiet room with a window.", safe: true });
    // The bytes and the type are unchanged by the write.
    expect(await read(a.headers, up.imageUrl)).toBe(200);

    const q = await quote(a.headers, up.imageId);
    expect(q.status).toBe(200);
    const created = await kit.send("/api/worlds", { method: "POST", headers: a.headers, body: { imageId: up.imageId, confirmToken: (q.json as { confirmToken: string }).confirmToken } });
    expect(created.status).toBe(201);
    const worldId = (created.json as { worldId: string }).worldId;
    let status = "?";
    let manifest: { brief?: string } | undefined;
    for (let i = 0; i < 60 && status !== "ready" && status !== "failed"; i++) {
      const w = (await kit.send(`/api/worlds/${worldId}`, { headers: a.headers })).json as { status: string; manifest?: { brief?: string } };
      status = w.status;
      manifest = w.manifest;
      if (status !== "ready") await new Promise((r) => setTimeout(r, 300));
    }
    expect(status).toBe("ready");
    // The brief travelled with the picture into the world.
    expect(manifest?.brief).toBe("A stand-in brief: a quiet room with a window.");
  }, 60_000);

  it("deletes an unsafe photo and says nothing of what was seen", async () => {
    const a = await kit.visitor();
    const up = await upload(a.headers, photo("UNSAFE"));
    const r = await brief(a.headers, up.imageId);
    expect([r.status, r.json]).toEqual([200, { brief: "", safe: false }]);
    expect(await read(a.headers, up.imageUrl)).toBe(404);
    expect((await quote(a.headers, up.imageId)).json).toEqual({ ok: false, code: "upload_rejected" });
  });

  it("fails closed when the call fails or its answer cannot be used, keeps the photo, and lets the visitor ask again", async () => {
    const a = await kit.visitor();
    for (const marker of ["BROKEN", "GARBLED"]) {
      const up = await upload(a.headers, photo(marker));
      const r = await brief(a.headers, up.imageId);
      expect([r.status, r.json], marker).toEqual([503, { ok: false, code: "moderation_unavailable" }]);
      expect(await read(a.headers, up.imageUrl), marker).toBe(200);
      expect((await quote(a.headers, up.imageId)).json, marker).toEqual({ ok: false, code: "moderation_unavailable" });
    }
  });

  it("is for the owner only", async () => {
    const a = await kit.visitor();
    const b = await kit.visitor();
    const up = await upload(a.headers, photo());
    expect([(await brief(b.headers, up.imageId)).status, (await brief(kit.anonymous(), up.imageId)).status]).toEqual([404, 404]);
    expect(await read(a.headers, up.imageUrl)).toBe(200);
  });
});
