import { describe, expect, it } from "vitest";
import { CloudflareImageStore } from "./cloudflare-images";
import { CloudflareImageVerdicts, type VerdictBucket } from "./cloudflare-verdicts";
import { FakeR2 } from "./fake-cloudflare";

/** The in-memory bucket as the real one is written to: `put` takes the R2 options and returns a promise. */
const bucketOf = (r2: FakeR2): VerdictBucket => ({ get: (k) => r2.get(k), put: async (k, v, o) => void r2.put(k, v, o), delete: (k) => r2.delete(k) });

const put = (r2: FakeR2, id: string, over: Record<string, string> = {}) =>
  r2.put(`uploads/${id}`, Uint8Array.from([9, 8, 7]), new Date(), { contentType: "image/webp", customMetadata: { ownerSid: "sid-a", sha256: "ab".repeat(32), source: "upload", ...over } });

describe("CloudflareImageVerdicts", () => {
  it("marks a picture safe and keeps its brief, leaving the bytes, the type and the rest of the metadata as they were", async () => {
    const r2 = new FakeR2();
    put(r2, "img-1");
    expect(await new CloudflareImageVerdicts(bucketOf(r2)).recordSafe("img-1", "A café with a blue door — 青い扉.")).toBe(true);
    const stored = r2.objects.get("uploads/img-1")!;
    expect([...stored.bytes]).toEqual([9, 8, 7]);
    expect(stored.contentType).toBe("image/webp");
    expect(stored.customMetadata).toMatchObject({ ownerSid: "sid-a", sha256: "ab".repeat(32), source: "upload", moderation: "safe" });
    // The brief is kept percent-encoded (metadata travels as headers), and reads back whole.
    expect(stored.customMetadata!.brief).toMatch(/^[A-Za-z0-9\-_.!~*'()%]+$/);
    expect(await new CloudflareImageStore(r2).find("img-1")).toMatchObject({ moderation: "safe", brief: "A café with a blue door — 青い扉.", ownerSid: "sid-a" });
  });

  it("keeps the whole metadata inside what R2 allows, even for a brief of 80 long non-Latin words", async () => {
    const r2 = new FakeR2();
    put(r2, "img-1");
    await new CloudflareImageVerdicts(bucketOf(r2)).recordSafe("img-1", Array.from({ length: 80 }, () => "青い扉の部屋").join(" "));
    const md = r2.objects.get("uploads/img-1")!.customMetadata!;
    expect(Object.entries(md).reduce((n, [k, v]) => n + k.length + v.length, 0)).toBeLessThan(2048);
  });

  it("says there is no such picture, and writes nothing, for a missing or ill-formed id", async () => {
    const r2 = new FakeR2();
    const v = new CloudflareImageVerdicts(bucketOf(r2));
    for (const id of ["nope", "", "../x", "a/b"]) expect(await v.recordSafe(id, "A room."), id).toBe(false);
    expect(r2.objects.size).toBe(0);
  });

  it("does not reach an object by an id that is not one: a key that only looks like it", async () => {
    const r2 = new FakeR2();
    r2.put("uploads/a/b", Uint8Array.from([1]), new Date(), { customMetadata: { ownerSid: "x" } });
    const v = new CloudflareImageVerdicts(bucketOf(r2));
    expect(await v.recordSafe("a/b", "A room.")).toBe(false);
    await v.remove("a/b");
    expect(r2.objects.get("uploads/a/b")!.customMetadata).toEqual({ ownerSid: "x" });
  });

  it("deletes a picture, and only that one", async () => {
    const r2 = new FakeR2();
    put(r2, "img-1");
    put(r2, "img-2");
    const v = new CloudflareImageVerdicts(bucketOf(r2));
    await v.remove("img-1");
    await v.remove("../img-2");
    await v.remove("missing");
    expect([...r2.objects.keys()]).toEqual(["uploads/img-2"]);
  });
});

describe("CloudflareImageStore and the brief", () => {
  it("reads a plain brief written by hand, and a percent-encoded one, and refuses one that is too long", async () => {
    const r2 = new FakeR2();
    put(r2, "plain", { brief: "A plain brief." });
    put(r2, "encoded", { brief: "A%20caf%C3%A9." });
    put(r2, "weird", { brief: "100% sure" });
    put(r2, "long", { brief: "x".repeat(2001) });
    const images = new CloudflareImageStore(r2);
    expect((await images.find("plain"))?.brief).toBe("A plain brief.");
    expect((await images.find("encoded"))?.brief).toBe("A café.");
    expect((await images.find("weird"))?.brief).toBe("100% sure");
    expect((await images.find("long"))?.brief).toBe("");
  });
});
