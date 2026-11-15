import { describe, expect, it } from "vitest";
import { StoredWorldSchema } from "./record";

const base = { id: "w-1", kind: "user", ownerSid: "sid", status: "queued" };
const ok = (over: Record<string, unknown>) => StoredWorldSchema.safeParse({ ...base, ...over }).success;

describe("StoredWorldSchema", () => {
  it("accepts a bare record", () => {
    expect(ok({})).toBe(true);
  });

  it("limits ids to plain characters, at most 128", () => {
    expect(ok({ id: "a".repeat(128) })).toBe(true);
    expect(ok({ id: "a".repeat(129) })).toBe(false);
    for (const bad of ["", "a/b", "a b", "a.b", "é", "a\n"]) expect(ok({ id: bad }), JSON.stringify(bad)).toBe(false);
    expect(ok({ imageId: "a".repeat(128) })).toBe(true);
    expect(ok({ imageId: "a".repeat(129) })).toBe(false);
  });

  it("is always a user world with a named owner", () => {
    expect(ok({ kind: "gallery" })).toBe(false);
    expect(ok({ ownerSid: "" })).toBe(false);
    expect(ok({ ownerSid: "s".repeat(128) })).toBe(true);
    expect(ok({ ownerSid: "s".repeat(129) })).toBe(false);
    expect(StoredWorldSchema.safeParse({ id: "w-1", kind: "user", status: "queued" }).success).toBe(false);
  });

  it("limits the title and the candidates", () => {
    expect(ok({ title: "t".repeat(200) })).toBe(true);
    expect(ok({ title: "t".repeat(201) })).toBe(false);
    expect(ok({ candidateIds: Array.from({ length: 16 }, (_, i) => `c${i}`) })).toBe(true);
    expect(ok({ candidateIds: Array.from({ length: 17 }, (_, i) => `c${i}`) })).toBe(false);
  });

  it("knows only the states and error codes of the pipeline", () => {
    for (const status of ["queued", "generating", "ingesting", "ready", "failed"]) expect(ok({ status })).toBe(true);
    expect(ok({ status: "done" })).toBe(false);
    expect(ok({ failure: { code: "timeout", quotaReturned: true, retryAllowed: false } })).toBe(true);
    expect(ok({ failure: { code: "nope", quotaReturned: true, retryAllowed: false } })).toBe(false);
    expect(ok({ failure: { code: "timeout", quotaReturned: "yes", retryAllowed: false } })).toBe(false);
  });

  it("drops a field it does not list", () => {
    const parsed = StoredWorldSchema.parse({ ...base, apiKey: "SECRET" });
    expect(parsed).not.toHaveProperty("apiKey");
  });
});
