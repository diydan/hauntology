import { describe, expect, it } from "vitest";
import { ADOBE, COMMENT, EXIF, ICC, JFIF, XMP, bytesOf, makeJpeg, makePng, makeWebp, pngChunk, riffChunk } from "@hauntology/shared/world/upload-kit";
import { CloudflareUploadStore } from "../worlds/cloudflare-uploads";
import { CloudflareImageStore } from "../worlds/cloudflare-images";
import { FakeR2 } from "../worlds/fake-cloudflare";
import { MemoryUploads, MemorySpendGuard, RecordingStarter } from "../worlds/fakes";
import { NOW, worldsKit, type Visitor } from "../worlds/test-kit";
import { MAX_PHOTOS, MAX_REQUEST_BYTES, readLimited } from "./uploads";

const text = (b: Uint8Array) => new TextDecoder("latin1").decode(b);
const JPEG_WITH_META = () => makeJpeg({ width: 1024, height: 768, head: [JFIF(), EXIF(), XMP(), COMMENT("my house, 12 Elm St"), ICC(), ADOBE()], scans: [bytesOf(9, 8, 7, 0xff, 0x00, 6)] });
const PNG_WITH_META = () => makePng({ width: 800, height: 600, before: [pngChunk("tEXt", bytesOf("Author\0Someone")), pngChunk("eXIf", bytesOf("Exif\0\0GPS"))] });
const WEBP_WITH_META = () => makeWebp({ width: 700, height: 700, kind: "extended", flags: 0x0c, extra: [riffChunk("EXIF", bytesOf("Exif\0\0GPS")), riffChunk("XMP ", bytesOf("<x:xmpmeta/>"))] });

type Photo = { bytes: Uint8Array; type: string; name?: string };
const photo = (bytes: Uint8Array, type = "image/jpeg", name = "photo.jpg"): Photo => ({ bytes, type, name });

function setup(opts: { env?: Record<string, string>; systemRandom?: boolean } = {}) {
  const uploads = new MemoryUploads();
  const guard = new MemorySpendGuard(undefined, () => NOW);
  const starter = new RecordingStarter();
  let n = 0;
  const kit = worldsKit(() => NOW, {
    uploads: { store: uploads, ...(opts.systemRandom === true ? {} : { random: () => Uint8Array.from({ length: 16 }, (_, i) => (++n * 17 + i * 5) % 256) }) },
    creation: { images: uploads.images, guard, starter },
    ...(opts.env !== undefined ? { env: opts.env } : {}),
  });
  const form = (photos: Photo[], field = "photo") => {
    const f = new FormData();
    for (const p of photos) f.append(field, new File([p.bytes], p.name ?? "photo", { type: p.type }));
    return f;
  };
  const post = async (headers: Record<string, string>, body: BodyInit | null, extra: Record<string, string> = {}) => {
    const res = await kit.app.request("http://app.test/api/uploads", { method: "POST", headers: { ...headers, ...extra }, ...(body !== null ? { body } : {}) }, kit.env);
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, text, json: json as { imageId?: string; imageUrl?: string; others?: { imageId: string; imageUrl: string }[]; ok?: boolean; code?: string } };
  };
  const upload = (v: Visitor, photos: Photo[]) => post(v.headers, form(photos));
  return { kit, uploads, guard, starter, form, post, upload };
}

describe("POST /api/uploads", () => {
  it("keeps a photo privately under a random id, stripped of its metadata, owned by the Session and not yet checked", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    const input = JPEG_WITH_META();
    const r = await t.upload(v, [photo(input)]);
    expect(r.status).toBe(201);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(r.json.imageId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(r.json.imageUrl).toBe(`/api/images/${r.json.imageId}`);
    expect(r.json).not.toHaveProperty("others");

    expect(t.uploads.puts).toHaveLength(1);
    const put = t.uploads.puts[0]!;
    expect(put.imageId).toBe(r.json.imageId);
    expect(text(put.bytes)).not.toMatch(/Canon|GPS|xmpmeta|12 Elm/);
    expect(text(put.bytes)).toContain("ICC_PROFILE");
    expect(put.bytes.length).toBeLessThan(input.length);
    expect(put.meta.contentType).toBe("image/jpeg");
    expect(put.meta.ownerSid).toBe(v.sid);
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", put.bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(put.meta.sha256).toBe(hash);
    expect(await t.uploads.images.find(r.json.imageId as string)).toMatchObject({ ownerSid: v.sid, moderation: "pending", source: "upload" });
  });

  it("takes a PNG and a WebP too, and strips theirs", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    const png = await t.upload(v, [photo(PNG_WITH_META(), "image/png", "a.png")]);
    const webp = await t.upload(v, [photo(WEBP_WITH_META(), "image/webp", "a.webp")]);
    expect([png.status, webp.status]).toEqual([201, 201]);
    expect(t.uploads.puts.map((p) => p.meta.contentType)).toEqual(["image/png", "image/webp"]);
    for (const p of t.uploads.puts) expect(text(p.bytes)).not.toMatch(/Someone|GPS|xmpmeta/);
  });

  it("serves the photo back to its owner only, and the Quote refuses it until it has been checked", async () => {
    const t = setup();
    const a = await t.kit.visitor();
    const b = await t.kit.visitor();
    const r = await t.upload(a, [photo(JPEG_WITH_META())]);
    const id = r.json.imageId as string;
    const own = await t.kit.app.request(`http://app.test/api/images/${id}`, { headers: a.headers }, t.kit.env);
    expect(own.status).toBe(200);
    expect(own.headers.get("Content-Type")).toBe("image/jpeg");
    expect(new Uint8Array(await own.arrayBuffer())).toEqual(t.uploads.puts[0]!.bytes);
    for (const headers of [b.headers, t.kit.anonymous()]) expect((await t.kit.send(`/api/images/${id}`, { headers })).status).toBe(404);

    const quote = await t.kit.send("/api/worlds/quote", { method: "POST", headers: a.headers, body: { imageId: id } });
    expect(quote.status).toBe(503);
    expect(quote.json).toEqual({ ok: false, code: "moderation_unavailable" });
  });

  it("answers a new visitor with a Session of their own and keeps the photo for it", async () => {
    const t = setup();
    const r = await t.post(t.kit.anonymous(), t.form([photo(JPEG_WITH_META())]));
    expect(r.status).toBe(201);
    expect(r.headers.get("Set-Cookie")).toMatch(/^[^=]+=.+HttpOnly/i);
    expect(t.uploads.puts[0]!.meta.ownerSid).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  describe("refuses a photo with its reason, and stores nothing", () => {
    const cases: [string, () => Photo, number, string][] = [
      ["too small", () => photo(makeJpeg({ width: 511, height: 800 })), 422, "upload_too_small"],
      ["too large in pixels", () => photo(makeJpeg({ width: 8193, height: 600 })), 413, "upload_too_large"],
      ["a type that is not allowed", () => photo(JPEG_WITH_META(), "image/gif", "a.gif"), 415, "upload_bad_type"],
      ["no type", () => photo(JPEG_WITH_META(), "", "a"), 415, "upload_bad_type"],
      ["a type that disagrees with the bytes", () => photo(PNG_WITH_META(), "image/jpeg"), 422, "upload_bad_magic"],
      ["bytes that are not a picture", () => photo(bytesOf("<html><script>alert(1)</script></html>"), "image/png", "a.png"), 422, "upload_bad_magic"],
      ["a JPEG that is cut off", () => photo(JPEG_WITH_META().subarray(0, 60)), 422, "upload_bad_magic"],
      ["a JPEG with no end", () => photo(makeJpeg({ width: 800, height: 600, noEnd: true })), 422, "upload_bad_magic"],
      ["an animated WebP", () => photo(makeWebp({ width: 800, height: 600, animated: true }), "image/webp", "a.webp"), 400, "upload_rejected"],
      ["a file past 10 MB", () => photo(Object.assign(new Uint8Array(10 * 1024 * 1024 + 1), { 0: 0 }), "image/jpeg"), 413, "upload_too_large"],
    ];
    for (const [name, make, status, code] of cases) {
      it(name, async () => {
        const t = setup();
        const v = await t.kit.visitor();
        const r = await t.upload(v, [make()]);
        expect([r.status, r.json]).toEqual([status, { ok: false, code }]);
        expect(r.headers.get("Cache-Control")).toBe("no-store");
        expect(t.uploads.puts).toHaveLength(0);
      });
    }
  });

  it("refuses a whole request past the limit, by its stated length and by what it really sends, and does not read on", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    const big = new Uint8Array(MAX_REQUEST_BYTES);
    big.set(JPEG_WITH_META());
    const r = await t.upload(v, [photo(big)]);
    expect([r.status, r.json]).toEqual([413, { ok: false, code: "upload_too_large" }]);
    const lie = await t.post(v.headers, t.form([photo(JPEG_WITH_META())]), { "Content-Length": String(MAX_REQUEST_BYTES + 1) });
    expect([lie.status, lie.json]).toEqual([413, { ok: false, code: "upload_too_large" }]);
    expect(t.uploads.puts).toHaveLength(0);
  });

  it("takes up to four photos, the first being the primary, and lists the others after it", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    const r = await t.upload(v, [photo(JPEG_WITH_META()), photo(PNG_WITH_META(), "image/png"), photo(WEBP_WITH_META(), "image/webp"), photo(makeJpeg({ width: 900, height: 900 }))]);
    expect(r.status).toBe(201);
    expect(MAX_PHOTOS).toBe(4);
    expect(t.uploads.puts.map((p) => p.imageId)).toHaveLength(4);
    expect(new Set(t.uploads.puts.map((p) => p.imageId)).size).toBe(4);
    expect(r.json.imageId).toBe(t.uploads.puts[0]!.imageId);
    expect(r.json.others).toEqual(t.uploads.puts.slice(1).map((p) => ({ imageId: p.imageId, imageUrl: `/api/images/${p.imageId}` })));
    expect(t.uploads.puts.map((p) => p.meta.contentType)).toEqual(["image/jpeg", "image/png", "image/webp", "image/jpeg"]);
  });

  it("refuses all of them, and keeps none, when one is refused or there are more than four", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    const bad = await t.upload(v, [photo(JPEG_WITH_META()), photo(makeJpeg({ width: 100, height: 100 }))]);
    expect([bad.status, bad.json]).toEqual([422, { ok: false, code: "upload_too_small" }]);
    const five = await t.upload(v, Array.from({ length: 5 }, () => photo(makeJpeg({ width: 800, height: 600 }))));
    expect([five.status, five.json]).toEqual([400, { ok: false, code: "upload_rejected" }]);
    expect(t.uploads.puts).toHaveLength(0);
  });

  it("refuses a request that is not a multipart upload of photos", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    const refused = { ok: false, code: "upload_rejected" };
    const json = await t.post(v.headers, JSON.stringify({ photo: "x" }), { "Content-Type": "application/json" });
    expect([json.status, json.json]).toEqual([400, refused]);
    const noBody = await t.post(v.headers, null);
    expect([noBody.status, noBody.json]).toEqual([400, refused]);
    const wrongField = await t.post(v.headers, t.form([photo(JPEG_WITH_META())], "image"));
    expect([wrongField.status, wrongField.json]).toEqual([400, refused]);
    const text = new FormData();
    text.append("photo", "not a file");
    const asText = await t.post(v.headers, text);
    expect([asText.status, asText.json]).toEqual([400, refused]);
    const noParts = await t.post(v.headers, new FormData());
    expect([noParts.status, noParts.json]).toEqual([400, refused]);
    const broken = await t.post(v.headers, "--x\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"a\"\r\n\r\nabc", { "Content-Type": "multipart/form-data; boundary=zzz" });
    expect([broken.status, broken.json]).toEqual([400, refused]);
    const noBoundary = await t.post(v.headers, "abc", { "Content-Type": "multipart/form-data" });
    expect([noBoundary.status, noBoundary.json]).toEqual([400, refused]);
    expect(t.uploads.puts).toHaveLength(0);
  });

  it("is a write like the others: a cross-origin request is refused", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    const r = await t.post({ ...v.headers, Origin: "https://evil.example" }, t.form([photo(JPEG_WITH_META())]));
    expect(r.status).toBe(403);
    expect(t.uploads.puts).toHaveLength(0);
  });

  it("takes no upload while worlds are closed, by the switch or the kill switch's flag", async () => {
    for (const env of [{ WORLD_GEN_ENABLED: "false" }, { WORLD_GEN_ENABLED: "off" }]) {
      const t = setup({ env });
      const v = await t.kit.visitor();
      const r = await t.upload(v, [photo(JPEG_WITH_META())]);
      expect([r.status, r.json]).toEqual([503, { ok: false, code: "world_gen_disabled" }]);
      expect(t.uploads.puts).toHaveLength(0);
    }
  });

  it("has no listing of what is stored: nothing answers a GET at the route or below it", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    const r = await t.upload(v, [photo(JPEG_WITH_META())]);
    for (const path of ["/api/uploads", "/api/uploads/", `/api/uploads/${r.json.imageId}`, "/api/uploads/list", "/api/uploads?prefix=uploads/"]) {
      const res = await t.kit.send(path, { headers: v.headers });
      expect(res.status, path).toBe(404);
      expect(res.text, path).not.toContain(r.json.imageId as string);
    }
    for (const method of ["PUT", "DELETE", "PATCH"]) expect((await t.kit.send("/api/uploads", { method, headers: v.headers })).status, method).toBe(404);
  });

  it("answers a storage failure without saying anything about the storage, and works again afterwards", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    t.uploads.failures = 1;
    const r = await t.upload(v, [photo(JPEG_WITH_META())]);
    expect([r.status, r.json]).toEqual([500, { ok: false, code: "upload_rejected" }]);
    expect(r.text).not.toMatch(/storage|down|Error/i);
    expect((await t.upload(v, [photo(JPEG_WITH_META())])).status).toBe(201);
  });

  it("gives each photo an id of its own, even for the same bytes, from the system's random numbers", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    const a = await t.upload(v, [photo(JPEG_WITH_META())]);
    const b = await t.upload(v, [photo(JPEG_WITH_META())]);
    expect(a.json.imageId).not.toBe(b.json.imageId);
    const real = setup({ systemRandom: true });
    const w = await real.kit.visitor();
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) ids.add((await real.upload(w, [photo(JPEG_WITH_META())])).json.imageId as string);
    expect(ids.size).toBe(20);
  });

  it("does not return the file name, the bytes or anything of the picture", async () => {
    const t = setup();
    const v = await t.kit.visitor();
    const r = await t.upload(v, [photo(JPEG_WITH_META(), "image/jpeg", "my-secret-house.jpg")]);
    expect(Object.keys(r.json).sort()).toEqual(["imageId", "imageUrl"]);
    expect(r.text).not.toMatch(/secret|house|Elm|1024|768/);
  });
});

describe("readLimited", () => {
  const streamOf = (chunk: number, pulls: { n: number }) =>
    new ReadableStream<Uint8Array>({ pull: (c) => { pulls.n++; c.enqueue(new Uint8Array(chunk)); } });

  it("reads a body up to the limit, whole", async () => {
    const req = new Request("http://x.test/", { method: "POST", body: new Uint8Array(1000) });
    expect((await readLimited(req, 1000))?.byteLength).toBe(1000);
    expect((await readLimited(new Request("http://x.test/", { method: "POST", body: new Uint8Array(1001) }), 1000))).toBeNull();
    expect((await readLimited(new Request("http://x.test/"), 10))?.byteLength).toBe(0);
  });

  it("stops pulling soon after the limit, so a body that never ends costs nothing more", async () => {
    const pulls = { n: 0 };
    const req = new Request("http://x.test/", { method: "POST", body: streamOf(1024, pulls), duplex: "half" } as RequestInit);
    expect(await readLimited(req, 10 * 1024)).toBeNull();
    expect(pulls.n).toBeLessThan(20);
  });
});

describe("CloudflareUploadStore", () => {
  it("writes what CloudflareImageStore reads: the owner, the hash, the origin and the type, and no moderation", async () => {
    const r2 = new FakeR2();
    const store = new CloudflareUploadStore({ put: async (k, v, o) => void r2.put(k, v, o) });
    await store.put("img-abc", Uint8Array.from([1, 2, 3]), { contentType: "image/webp", ownerSid: "sid-a", sha256: "ab".repeat(32) });
    expect([...r2.objects.keys()]).toEqual(["uploads/img-abc"]);
    const images = new CloudflareImageStore(r2);
    expect(await images.find("img-abc")).toMatchObject({ id: "img-abc", ownerSid: "sid-a", sha256: "ab".repeat(32), moderation: "pending", source: "upload", brief: "" });
    const read = await images.read("img-abc");
    expect(read?.contentType).toBe("image/webp");
    expect(read?.size).toBe(3);
  });
});
