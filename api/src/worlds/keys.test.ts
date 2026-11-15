import { describe, expect, it } from "vitest";
import { USER_PREFIXES, bundleKey, bundlePrefix, candidateKey, describeKey, galleryKey, spriteKey, uploadKey } from "./keys";

describe("keys", () => {
  it("names each kind of object", () => {
    expect(uploadKey("i1")).toBe("uploads/i1");
    expect(candidateKey("c1")).toBe("candidates/c1");
    expect(bundleKey("w1", "world.json")).toBe("worlds/w1/world.json");
    expect(bundlePrefix("w1")).toBe("worlds/w1/");
    expect(spriteKey("w1")).toBe("sprites/w1");
    expect(galleryKey("g1", "thumb.jpg")).toBe("gallery/g1/thumb.jpg");
  });

  it("reads each key back to its kind and world", () => {
    expect(describeKey(uploadKey("i1"))).toEqual({ kind: "upload" });
    expect(describeKey(candidateKey("c1"))).toEqual({ kind: "candidate" });
    expect(describeKey(bundleKey("w1", "splat.spz"))).toEqual({ kind: "world", worldId: "w1" });
    expect(describeKey(spriteKey("w1"))).toEqual({ kind: "sprite", worldId: "w1" });
    expect(describeKey(galleryKey("g1", "world.json"))).toEqual({ kind: "gallery" });
  });

  it("says nothing about a key that is none of them", () => {
    for (const k of ["", "uploads/", "candidates/", "sprites/", "gallery/", "worlds/", "worlds/w1", "worlds/w1/", "worlds//x", "other/x", "Uploads/x", "/uploads/x"]) {
      expect(describeKey(k), k).toBeNull();
    }
  });

  it("keeps gallery out of the prefixes that delete and retention may touch", () => {
    expect([...USER_PREFIXES]).toEqual(["uploads/", "candidates/", "worlds/", "sprites/"]);
    expect(USER_PREFIXES.some((p) => galleryKey("g", "x").startsWith(p))).toBe(false);
  });
});
