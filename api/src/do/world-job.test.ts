import { describe, expect, it } from "vitest";
import { fakeState } from "../worlds/fake-cloudflare";
import { sampleManifest } from "../worlds/test-kit";
import { WorldJob } from "./world-job";

const record = (over: Record<string, unknown> = {}) => ({ id: "w-1", kind: "user", ownerSid: "sid-owner", status: "queued", ...over });

const setup = () => {
  const { state, data } = fakeState();
  const job = new WorldJob(state);
  const call = async (method: string, body?: unknown, path = "/record") => {
    const res = await job.fetch(new Request(`https://world-job${path}`, { method, ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) }));
    const text = await res.text();
    return { status: res.status, json: text === "" ? null : (JSON.parse(text) as unknown) };
  };
  return { call, data };
};

describe("WorldJob record", () => {
  it("has no record at first", async () => {
    expect(await setup().call("GET")).toEqual({ status: 200, json: null });
  });

  it("creates a record and answers it back", async () => {
    const { call } = setup();
    expect(await call("PUT", record())).toEqual({ status: 201, json: record() });
    expect(await call("GET")).toEqual({ status: 200, json: record() });
  });

  it("will not replace a record that exists", async () => {
    const { call } = setup();
    await call("PUT", record());
    const again = await call("PUT", record({ ownerSid: "sid-thief" }));
    expect(again.status).toBe(409);
    expect(((await call("GET")).json as { ownerSid: string }).ownerSid).toBe("sid-owner");
  });

  it("refuses a record that does not fit, and keeps nothing", async () => {
    const bad: unknown[] = [
      record({ id: "a/b" }), record({ id: "" }), record({ id: "x".repeat(129) }), record({ kind: "gallery" }), record({ ownerSid: "" }),
      record({ status: "weird" }), record({ imageId: "../x" }), record({ candidateIds: ["ok", "no/pe"] }), record({ failure: { code: "nope", quotaReturned: true, retryAllowed: false } }),
      record({ manifest: { ...sampleManifest("w-1"), assets: { splat: [] } } }), { id: "w-1" }, [], "text",
    ];
    for (const b of bad) {
      const { call, data } = setup();
      expect((await call("PUT", b)).status, JSON.stringify(b)).toBe(400);
      expect(data.size).toBe(0);
    }
    expect((await setup().call("PUT", "{not json")).status).toBe(400);
  });

  it("drops fields it does not list", async () => {
    const { call } = setup();
    await call("PUT", record({ apiKey: "WLT-SECRET", upstreamUrl: "https://cdn.worldlabs.ai/x" }));
    expect(JSON.stringify((await call("GET")).json)).not.toMatch(/WLT-SECRET|worldlabs/);
  });

  it("changes the state, title, failure, manifest and pictures with a patch", async () => {
    const { call } = setup();
    await call("PUT", record());
    const patched = await call("PATCH", { status: "ready", title: "Kitchen", manifest: sampleManifest("w-1"), imageId: "img-1", candidateIds: ["c-1", "c-2"] });
    expect(patched.status).toBe(200);
    expect(patched.json).toEqual(record({ status: "ready", title: "Kitchen", manifest: sampleManifest("w-1"), imageId: "img-1", candidateIds: ["c-1", "c-2"] }));
    const failed = await call("PATCH", { status: "failed", failure: { code: "timeout", quotaReturned: true, retryAllowed: true } });
    expect((failed.json as { failure: unknown }).failure).toEqual({ code: "timeout", quotaReturned: true, retryAllowed: true });
  });

  it("never lets a patch change who the record is or who owns it", async () => {
    const { call } = setup();
    await call("PUT", record());
    const r = await call("PATCH", { id: "w-other", kind: "gallery", ownerSid: "sid-thief", status: "generating" });
    expect(r.status).toBe(200);
    expect(r.json).toEqual(record({ status: "generating" }));
  });

  it("refuses a patch that would not fit, and leaves the record as it was", async () => {
    const { call } = setup();
    await call("PUT", record());
    for (const bad of [{ status: "weird" }, { imageId: "a/b" }, { title: "x".repeat(201) }, [], "x", null]) {
      expect((await call("PATCH", bad as unknown)).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await call("PATCH", "{bad json")).status).toBe(400);
    expect((await call("GET")).json).toEqual(record());
  });

  it("has nothing to patch before it is created", async () => {
    expect((await setup().call("PATCH", { status: "ready" })).status).toBe(404);
  });

  it("forgets everything on delete, and can be deleted again", async () => {
    const { call, data } = setup();
    await call("PUT", record());
    expect((await call("DELETE")).status).toBe(204);
    expect(data.size).toBe(0);
    expect(await call("GET")).toEqual({ status: 200, json: null });
    expect((await call("DELETE")).status).toBe(204);
  });

  it("answers only /record, and only GET, PUT, PATCH and DELETE", async () => {
    const { call } = setup();
    expect((await call("GET", undefined, "/other")).status).toBe(404);
    expect((await call("GET", undefined, "/record/x")).status).toBe(404);
    expect((await call("POST", record())).status).toBe(405);
  });
});
