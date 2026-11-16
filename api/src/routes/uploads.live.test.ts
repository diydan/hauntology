import { describe, expect, it } from "vitest";
import { COMMENT, EXIF, ICC, JFIF, XMP, bytesOf, makeJpeg, makePng, makeWebp, pngChunk, riffChunk } from "@hauntology/shared/world/upload-kit";
import { LIVE_URL, liveKit } from "../contract/live-kit";

/**
 * `POST /api/uploads` on a running `wrangler dev` with real local R2 and the runtime's own multipart parser and streams (the
 * test-only worker in `dev/check-worker.ts`). Skipped unless `LIVE_URL` is set.
 */
describe.skipIf(LIVE_URL === undefined)("uploads on wrangler dev (real R2, the real runtime)", () => {
  const kit = liveKit(LIVE_URL ?? "http://live.unset");
  const text = (b: Uint8Array) => new TextDecoder("latin1").decode(b);
  const SCAN = bytesOf(9, 8, 7, 0xff, 0x00, 6, 0xff, 0xd2, 5);
  const jpeg = () => makeJpeg({ width: 1024, height: 768, head: [JFIF(), EXIF(), XMP(), COMMENT("my house, 12 Elm St"), ICC()], scans: [SCAN] });

  const post = async (headers: Record<string, string>, files: { bytes: Uint8Array; type: string }[], field = "photo") => {
    const form = new FormData();
    for (const f of files) form.append(field, new File([f.bytes], "x", { type: f.type }));
    const res = await fetch(`${LIVE_URL}/api/uploads`, { method: "POST", headers, body: form });
    const body = await res.text();
    let json: Record<string, any> = {};
    try { json = JSON.parse(body); } catch { /* not JSON */ }
    return { status: res.status, json, body };
  };
  const read = async (headers: Record<string, string>, imageUrl: string) => {
    const res = await fetch(`${LIVE_URL}${imageUrl}`, { headers });
    return { status: res.status, type: res.headers.get("Content-Type"), bytes: new Uint8Array(await res.arrayBuffer()) };
  };

  it("keeps a photo stripped of its metadata, for its owner only, and the Quote refuses it until it is checked", async () => {
    const a = await kit.visitor();
    const b = await kit.visitor();
    const r = await post(a.headers, [{ bytes: jpeg(), type: "image/jpeg" }]);
    expect(r.status).toBe(201);
    expect(r.json.imageUrl).toBe(`/api/images/${r.json.imageId}`);
    expect(Object.keys(r.json).sort()).toEqual(["imageId", "imageUrl"]);

    const back = await read(a.headers, r.json.imageUrl);
    expect(back.status).toBe(200);
    expect(back.type).toBe("image/jpeg");
    expect(text(back.bytes)).not.toMatch(/Elm St|Exif|xmpmeta/);
    expect(text(back.bytes)).toContain("ICC_PROFILE");
    expect(back.bytes.slice(back.bytes.length - 2 - SCAN.length)).toEqual(new Uint8Array([...SCAN, 0xff, 0xd9]));
    expect((await read(b.headers, r.json.imageUrl)).status).toBe(404);
    expect((await read(kit.anonymous(), r.json.imageUrl)).status).toBe(404);

    const quote = await kit.send("/api/worlds/quote", { method: "POST", headers: a.headers, body: { imageId: r.json.imageId } });
    expect([quote.status, quote.json]).toEqual([503, { ok: false, code: "moderation_unavailable" }]);
  });

  it("takes a PNG, a WebP and up to four photos, the others after the first", async () => {
    const a = await kit.visitor();
    const png = makePng({ width: 800, height: 600, before: [pngChunk("tEXt", bytesOf("Author\0Someone")), pngChunk("eXIf", bytesOf("Exif\0\0GPS"))] });
    const webp = makeWebp({ width: 700, height: 700, kind: "extended", flags: 0x0c, extra: [riffChunk("EXIF", bytesOf("Exif\0\0GPS")), riffChunk("XMP ", bytesOf("<x:xmpmeta/>"))] });
    const r = await post(a.headers, [{ bytes: jpeg(), type: "image/jpeg" }, { bytes: png, type: "image/png" }, { bytes: webp, type: "image/webp" }]);
    expect(r.status).toBe(201);
    expect(r.json.others).toHaveLength(2);
    const [pngBack, webpBack] = await Promise.all(r.json.others.map((o: { imageUrl: string }) => read(a.headers, o.imageUrl)));
    expect([pngBack.type, webpBack.type]).toEqual(["image/png", "image/webp"]);
    expect(text(pngBack.bytes)).not.toMatch(/Someone|GPS/);
    expect(text(webpBack.bytes)).not.toMatch(/GPS|xmpmeta/);
  });

  it("refuses with the reason and keeps nothing: too small, not a picture, a type that is not allowed, animated, too big", async () => {
    const a = await kit.visitor();
    const cases: [string, { bytes: Uint8Array; type: string }, number, string][] = [
      ["small", { bytes: makeJpeg({ width: 300, height: 300 }), type: "image/jpeg" }, 422, "upload_too_small"],
      ["magic", { bytes: bytesOf("<html>nope</html>"), type: "image/png" }, 422, "upload_bad_magic"],
      ["type", { bytes: jpeg(), type: "image/gif" }, 415, "upload_bad_type"],
      ["animated", { bytes: makeWebp({ width: 800, height: 600, animated: true }), type: "image/webp" }, 400, "upload_rejected"],
      ["10 MB", { bytes: Object.assign(new Uint8Array(10 * 1024 * 1024 + 1), jpeg()), type: "image/jpeg" }, 413, "upload_too_large"],
      ["16 MiB", { bytes: Object.assign(new Uint8Array(16 * 1024 * 1024), jpeg()), type: "image/jpeg" }, 413, "upload_too_large"],
    ];
    for (const [name, file, status, code] of cases) {
      const r = await post(a.headers, [file]);
      expect([r.status, r.json], name).toEqual([status, { ok: false, code }]);
    }
    const none = await post(a.headers, [{ bytes: jpeg(), type: "image/jpeg" }], "image");
    expect([none.status, none.json]).toEqual([400, { ok: false, code: "upload_rejected" }]);
  });

  it("has no listing, and refuses a cross-origin upload", async () => {
    const a = await kit.visitor();
    for (const path of ["/api/uploads", "/api/uploads/"]) expect((await kit.send(path, { headers: a.headers })).status, path).toBe(404);
    const form = new FormData();
    form.append("photo", new File([jpeg()], "x", { type: "image/jpeg" }));
    const res = await fetch(`${LIVE_URL}/api/uploads`, { method: "POST", headers: { ...a.headers, Origin: "https://evil.example" }, body: form });
    expect(res.status).toBe(403);
  });
});
