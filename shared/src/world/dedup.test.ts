import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { deriveWorldId, normaliseOptions, worldKey } from "./dedup";

const SECRET = "secret-0123456789abcdef-secret";
const H1 = "a".repeat(64);
const H2 = "b".repeat(64);

describe("worldKey", () => {
  it("is a 64-character hex key", async () => {
    expect(await worldKey(H1)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("treats a missing option as off", async () => {
    expect(await worldKey(H1)).toBe(await worldKey(H1, { enhance: false }));
    expect(await worldKey(H1)).toBe(await worldKey(H1, {}));
    expect(await worldKey(H1)).not.toBe(await worldKey(H1, { enhance: true }));
    expect(normaliseOptions({ enhance: "yes" as unknown as boolean })).toEqual({ enhance: false });
  });

  it("refuses a hash that is not 64 lowercase hex characters", async () => {
    for (const bad of ["", "a".repeat(63), "a".repeat(65), "A".repeat(64), "g".repeat(64)]) await expect(worldKey(bad)).rejects.toThrow(RangeError);
  });
});

/** Property 10: the dedup key is a function of the image and the options. */
describe("Property 10: dedup key is a function of image and options", () => {
  const hash = fc.stringMatching(/^[0-9a-f]{64}$/);
  const options = fc.record({ enhance: fc.boolean() });
  it("is equal iff the image hashes and the normalised options are equal", async () => {
    await fc.assert(
      fc.asyncProperty(hash, options, hash, options, async (h1, o1, h2, o2) => {
        const equal = h1 === h2 && normaliseOptions(o1).enhance === normaliseOptions(o2).enhance;
        expect((await worldKey(h1, o1)) === (await worldKey(h2, o2))).toBe(equal);
      }),
      propParams(),
    );
  });
});

describe("deriveWorldId", () => {
  it("is 128 bits: 16 bytes of the MAC in 22 characters, so a share link cannot be guessed (Requirement 9.4)", async () => {
    const ids = new Set<string>();
    for (let attempt = 0; attempt < 50; attempt++) {
      const id = await deriveWorldId("sid-a", await worldKey(H1), attempt, SECRET);
      const bytes = Uint8Array.from(atob(id.slice(2).replace(/-/g, "+").replace(/_/g, "/") + "=="), (c) => c.charCodeAt(0));
      expect(bytes.length * 8).toBeGreaterThanOrEqual(128);
      expect(id).toMatch(/^w-[A-Za-z0-9_-]{22}$/);
      ids.add(id);
    }
    expect(ids.size).toBe(50);
  });

  it("is w- and 22 URL-safe characters", async () => {
    expect(await deriveWorldId("sid", await worldKey(H1), 0, SECRET)).toMatch(/^w-[A-Za-z0-9_-]{22}$/);
  });

  it("is the same for the same Session, key and attempt, and different for any change", async () => {
    const k1 = await worldKey(H1);
    const k2 = await worldKey(H2);
    const base = await deriveWorldId("sid-a", k1, 0, SECRET);
    expect(await deriveWorldId("sid-a", k1, 0, SECRET)).toBe(base);
    expect(await deriveWorldId("sid-b", k1, 0, SECRET)).not.toBe(base);
    expect(await deriveWorldId("sid-a", k2, 0, SECRET)).not.toBe(base);
    expect(await deriveWorldId("sid-a", k1, 1, SECRET)).not.toBe(base);
    expect(await deriveWorldId("sid-a", k1, 0, "another-secret-0123456789abcdef")).not.toBe(base);
  });

  it("does not let one part run into the next", async () => {
    expect(await deriveWorldId("ab", "c", 0, SECRET)).not.toBe(await deriveWorldId("a", "bc", 0, SECRET));
  });

  it("refuses a short secret and a bad attempt", async () => {
    await expect(deriveWorldId("s", "k", 0, "short")).rejects.toThrow(RangeError);
    await expect(deriveWorldId("s", "k", 0, "x".repeat(15))).rejects.toThrow(RangeError);
    await expect(deriveWorldId("s", "k", 0, "x".repeat(16))).resolves.toMatch(/^w-/);
    for (const bad of [-1, 1.5, Number.NaN]) await expect(deriveWorldId("s", "k", bad, SECRET)).rejects.toThrow(RangeError);
  });
});
