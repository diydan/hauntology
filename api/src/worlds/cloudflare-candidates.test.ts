import { describe, expect, it } from "vitest";
import { CloudflareCandidateStore, promotedImageId, type CandidateBucket } from "./cloudflare-candidates";
import { CloudflareImageStore } from "./cloudflare-images";
import { FakeR2 } from "./fake-cloudflare";

const bucketOf = (r2: FakeR2): CandidateBucket => ({ head: (k) => r2.head(k), get: (k) => r2.get(k), put: async (k, v, o) => void r2.put(k, v, o) });
const META = { contentType: "image/jpeg" as const, ownerSid: "sid-a", sha256: "ab".repeat(32) };

describe("CloudflareCandidateStore", () => {
  it("keeps a candidate under candidates/ with its owner, hash, origin and type, and reads it back for the owner", async () => {
    const r2 = new FakeR2();
    const store = new CloudflareCandidateStore(bucketOf(r2));
    await store.put("cand-1", Uint8Array.from([1, 2, 3]), META);
    expect([...r2.objects.keys()]).toEqual(["candidates/cand-1"]);
    expect(r2.objects.get("candidates/cand-1")!.customMetadata).toEqual({ ownerSid: "sid-a", sha256: "ab".repeat(32), source: "sketch" });
    const read = await store.read("cand-1");
    expect(read).toMatchObject({ size: 3, contentType: "image/jpeg", ownerSid: "sid-a" });
    expect(new Uint8Array(await new Response(read!.body as ReadableStream).arrayBuffer())).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it("reads nothing for a missing candidate, a bad id, an upload, or an object with no owner", async () => {
    const r2 = new FakeR2();
    r2.put("uploads/up-1", Uint8Array.from([1]), new Date(), { customMetadata: { ownerSid: "sid-a" } });
    r2.put("candidates/noowner", Uint8Array.from([1]), new Date(), { customMetadata: { sha256: "x" } });
    const store = new CloudflareCandidateStore(bucketOf(r2));
    for (const id of ["nope", "up-1", "noowner", "", "../uploads/up-1", "a/b"]) expect(await store.read(id), id).toBeNull();
  });

  it("promotes a candidate to a Place Image from a sketch, not yet checked, that the image store finds", async () => {
    const r2 = new FakeR2();
    const store = new CloudflareCandidateStore(bucketOf(r2));
    await store.put("cand-1", Uint8Array.from([7, 8, 9]), META);
    const id = await store.promote("cand-1", "sid-a");
    expect(id).toBe(await promotedImageId("cand-1"));
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(id).not.toBe("cand-1");
    const promoted = r2.objects.get(`uploads/${id}`)!;
    expect([...promoted.bytes]).toEqual([7, 8, 9]);
    expect(promoted.contentType).toBe("image/jpeg");
    expect(promoted.customMetadata).toEqual({ ownerSid: "sid-a", sha256: "ab".repeat(32), source: "sketch" });
    expect(await new CloudflareImageStore(r2).find(id as string)).toMatchObject({ ownerSid: "sid-a", sha256: "ab".repeat(32), moderation: "pending", source: "sketch" });
    // The candidate is left where it is, to expire.
    expect(r2.objects.has("candidates/cand-1")).toBe(true);
  });

  it("gives the same id for the same candidate and leaves the Place Image as it is, including a verdict it has since been given", async () => {
    const r2 = new FakeR2();
    const store = new CloudflareCandidateStore(bucketOf(r2));
    await store.put("cand-1", Uint8Array.from([1]), META);
    const first = await store.promote("cand-1", "sid-a");
    const o = r2.objects.get(`uploads/${first}`)!;
    o.customMetadata = { ...o.customMetadata, moderation: "safe", brief: "A kitchen." };
    expect(await store.promote("cand-1", "sid-a")).toBe(first);
    expect(r2.objects.get(`uploads/${first}`)!.customMetadata).toMatchObject({ moderation: "safe", brief: "A kitchen." });
  });

  it("promotes nothing for someone else's candidate, a missing one, a bad id, or an upload; and does not let another owner take a promoted one", async () => {
    const r2 = new FakeR2();
    const store = new CloudflareCandidateStore(bucketOf(r2));
    await store.put("cand-1", Uint8Array.from([1]), META);
    r2.put("uploads/up-1", Uint8Array.from([1]), new Date(), { customMetadata: { ownerSid: "sid-a", sha256: "ab".repeat(32) } });
    expect(await store.promote("cand-1", "sid-b")).toBeNull();
    for (const id of ["nope", "", "../x", "up-1"]) expect(await store.promote(id, "sid-a"), id).toBeNull();
    const id = await store.promote("cand-1", "sid-a");
    expect(await store.promote("cand-1", "sid-b")).toBeNull();
    expect(r2.objects.get(`uploads/${id}`)!.customMetadata!.ownerSid).toBe("sid-a");
    expect(r2.objects.size).toBe(3);
  });

  it("does not reach an object by an id that is not one: a key that only looks like it", async () => {
    const r2 = new FakeR2();
    r2.put("candidates/a/b", Uint8Array.from([1]), new Date(), { customMetadata: { ownerSid: "sid-a", sha256: "ab".repeat(32) } });
    const store = new CloudflareCandidateStore(bucketOf(r2));
    expect(await store.promote("a/b", "sid-a")).toBeNull();
    expect(r2.objects.size).toBe(1);
  });

  it("derives the id from the candidate id alone: the same every time, different for each candidate", async () => {
    expect(await promotedImageId("a")).toBe(await promotedImageId("a"));
    expect(await promotedImageId("a")).not.toBe(await promotedImageId("b"));
  });
});
