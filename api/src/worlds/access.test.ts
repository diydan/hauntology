import { describe, expect, it } from "vitest";
import { accessOf, mayDelete, mayRead, mayShare } from "./access";
import type { WorldRecord } from "./store";

const user = (ownerSid?: string): WorldRecord => ({ id: "w", kind: "user", status: "ready", ...(ownerSid !== undefined ? { ownerSid } : {}) });
const gallery: WorldRecord = { id: "g", kind: "gallery", status: "ready" };

describe("accessOf", () => {
  it("makes the maker of a user world its owner and everyone else nobody", () => {
    expect(accessOf(user("s1"), "s1")).toBe("owner");
    expect(accessOf(user("s1"), "s2")).toBe("none");
    expect(accessOf(user("s1"), "")).toBe("none");
  });

  it("fails closed for a user world with no owner, even for a visitor whose id is empty", () => {
    expect(accessOf(user(), "s1")).toBe("none");
    expect(accessOf(user(), "")).toBe("none");
    expect(accessOf(user(""), "")).toBe("none");
  });

  it("makes a Gallery world public, even when someone is named as its owner", () => {
    expect(accessOf(gallery, "s1")).toBe("public");
    expect(accessOf({ ...gallery, ownerSid: "s1" }, "s1")).toBe("public");
  });
});

describe("what each access allows", () => {
  it("lets the owner and the public read, and only the owner delete", () => {
    expect([mayRead("owner"), mayRead("public"), mayRead("none")]).toEqual([true, true, false]);
    expect([mayDelete("owner"), mayDelete("public"), mayDelete("none")]).toEqual([true, false, false]);
  });
});

describe("the share link (world-pipeline 9.2)", () => {
  const shared = (over: Partial<WorldRecord> = {}): WorldRecord => ({ ...user("s1"), shared: true, ...over });

  it("lets anyone read a ready world whose owner turned the link on, and nobody change it", () => {
    expect(accessOf(shared(), "s2")).toBe("shared");
    expect(accessOf(shared(), "")).toBe("shared");
    expect(accessOf(shared(), "s1")).toBe("owner");
    expect([mayRead("shared"), mayDelete("shared"), mayShare("shared")]).toEqual([true, false, false]);
    expect([mayShare("owner"), mayShare("public"), mayShare("none")]).toEqual([true, false, false]);
  });

  it("keeps a world private unless the link is on: off, absent and not true all mean none", () => {
    expect(accessOf(shared({ shared: false }), "s2")).toBe("none");
    expect(accessOf(user("s1"), "s2")).toBe("none");
    expect(accessOf({ ...user("s1"), shared: "yes" as unknown as boolean }, "s2")).toBe("none");
  });

  it("shares only a ready world", () => {
    for (const status of ["queued", "generating", "ingesting", "failed"] as const) expect(accessOf(shared({ status }), "s2"), status).toBe("none");
  });

  it("fails closed for a shared world with no owner", () => {
    expect(accessOf(shared({ ownerSid: undefined as unknown as string }), "s2")).toBe("none");
    expect(accessOf(shared({ ownerSid: "" }), "")).toBe("none");
  });
});
