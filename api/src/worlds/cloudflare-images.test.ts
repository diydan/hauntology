import { describe, expect, it } from "vitest";
import { CloudflareImageStore } from "./cloudflare-images";
import { FakeR2 } from "./fake-cloudflare";

const HASH = "cd".repeat(32);
const put = (r2: FakeR2, key: string, md: Record<string, string> | undefined, contentType?: string) =>
  r2.put(key, Uint8Array.from([7, 8, 9]), new Date(0), { ...(md ? { customMetadata: md } : {}), ...(contentType ? { contentType } : {}) });

describe("CloudflareImageStore", () => {
  it("reads the owner, the hash and the moderation result from the object's metadata", async () => {
    const r2 = new FakeR2();
    put(r2, "uploads/img-1", { ownerSid: "sid-a", sha256: HASH, moderation: "safe" });
    expect(await new CloudflareImageStore(r2).find("img-1")).toEqual({ id: "img-1", ownerSid: "sid-a", sha256: HASH, moderation: "safe", contentType: "application/octet-stream", source: "upload", brief: "" });
  });

  it("reads where the picture came from and its Place Brief, and falls back to an upload with no brief", async () => {
    const r2 = new FakeR2();
    put(r2, "uploads/a", { ownerSid: "s", sha256: HASH, source: "sketch", brief: "A quiet kitchen." });
    put(r2, "uploads/b", { ownerSid: "s", sha256: HASH, source: "weird", brief: "x".repeat(2001) });
    put(r2, "uploads/c", { ownerSid: "s", sha256: HASH });
    const store = new CloudflareImageStore(r2);
    expect(await store.find("a")).toMatchObject({ source: "sketch", brief: "A quiet kitchen." });
    expect(await store.find("b")).toMatchObject({ source: "upload", brief: "" });
    expect(await store.find("c")).toMatchObject({ source: "upload", brief: "" });
    const edge = new FakeR2();
    put(edge, "uploads/d", { ownerSid: "s", sha256: HASH, brief: "y".repeat(2000) });
    expect((await new CloudflareImageStore(edge).find("d"))?.brief).toBe("y".repeat(2000));
  });

  it("treats a missing or unknown moderation result as pending, and keeps unsafe", async () => {
    const r2 = new FakeR2();
    put(r2, "uploads/a", { ownerSid: "s", sha256: HASH });
    put(r2, "uploads/b", { ownerSid: "s", sha256: HASH, moderation: "maybe" });
    put(r2, "uploads/c", { ownerSid: "s", sha256: HASH, moderation: "unsafe" });
    const store = new CloudflareImageStore(r2);
    expect((await store.find("a"))?.moderation).toBe("pending");
    expect((await store.find("b"))?.moderation).toBe("pending");
    expect((await store.find("c"))?.moderation).toBe("unsafe");
  });

  it("does not use an image with no owner or no proper hash, or no metadata at all", async () => {
    const r2 = new FakeR2();
    put(r2, "uploads/no-owner", { sha256: HASH, moderation: "safe" });
    put(r2, "uploads/empty-owner", { ownerSid: "", sha256: HASH, moderation: "safe" });
    put(r2, "uploads/no-hash", { ownerSid: "s", moderation: "safe" });
    put(r2, "uploads/bad-hash", { ownerSid: "s", sha256: "ABC", moderation: "safe" });
    put(r2, "uploads/upper", { ownerSid: "s", sha256: HASH.toUpperCase(), moderation: "safe" });
    put(r2, "uploads/no-md", undefined);
    const store = new CloudflareImageStore(r2);
    for (const id of ["no-owner", "empty-owner", "no-hash", "bad-hash", "upper", "no-md", "missing"]) expect(await store.find(id), id).toBeNull();
  });

  it("looks only under uploads/, and only for a plain id", async () => {
    const r2 = new FakeR2();
    put(r2, "candidates/img-1", { ownerSid: "s", sha256: HASH, moderation: "safe" });
    put(r2, "uploads/a/b", { ownerSid: "s", sha256: HASH, moderation: "safe" });
    const store = new CloudflareImageStore(r2);
    expect(await store.find("img-1")).toBeNull();
    for (const bad of ["a/b", "", "../x", "a b", "x".repeat(129)]) expect(await store.find(bad), bad).toBeNull();
    for (const bad of ["a/b", "", "x".repeat(129)]) expect(await store.read(bad), bad).toBeNull();
  });

  it("reads the bytes, with a type only when it is a picture type", async () => {
    const r2 = new FakeR2();
    put(r2, "uploads/jpg", { ownerSid: "s", sha256: HASH }, "image/jpeg");
    put(r2, "uploads/html", { ownerSid: "s", sha256: HASH }, "text/html");
    put(r2, "uploads/none", { ownerSid: "s", sha256: HASH });
    const store = new CloudflareImageStore(r2);
    const jpg = (await store.read("jpg"))!;
    expect(jpg.contentType).toBe("image/jpeg");
    expect(jpg.size).toBe(3);
    expect(new Uint8Array(await new Response(jpg.body as ReadableStream).arrayBuffer())).toEqual(Uint8Array.from([7, 8, 9]));
    expect((await store.read("html"))!.contentType).toBe("application/octet-stream");
    expect((await store.read("none"))!.contentType).toBe("application/octet-stream");
    expect(await store.read("missing")).toBeNull();
  });
});
