import { describe, expect, it } from "vitest";
import { accessOf, mayDelete, mayRead } from "./access";
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
