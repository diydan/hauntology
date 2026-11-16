import { describe, expect, it } from "vitest";
import { sha256Hex } from "./digest";
import { CACHE_PREFIX, LIBRARY_PREFIX, canonicalSpeechKey, libraryKey, normalise, speechCacheKey } from "./key";

describe("normalise", () => {
  it("collapses whitespace, trims and applies NFC", () => {
    expect(normalise("  Hello \n\t there  ")).toBe("Hello there");
    expect(normalise("é")).toBe("é"); // e + combining acute, composed
  });
});

describe("canonicalSpeechKey", () => {
  it("is a JSON array of the voice and the normalised text", () => {
    expect(canonicalSpeechKey("inworld:Mark", "  Me?  Well...")).toBe('["inworld:Mark","Me? Well..."]');
  });
});

describe("libraryKey and speechCacheKey", () => {
  it("are a prefix plus 64 hex characters, and differ only in the prefix", async () => {
    const lib = await libraryKey("inworld:Pippa", "Hello.", sha256Hex);
    const cache = await speechCacheKey("inworld:Pippa", "Hello.", sha256Hex);
    expect(lib).toMatch(/^speech\/lib\/v1\/[0-9a-f]{64}$/);
    expect(cache).toMatch(/^speech\/v1\/[0-9a-f]{64}$/);
    expect(lib.slice(LIBRARY_PREFIX.length)).toBe(cache.slice(CACHE_PREFIX.length));
  });

  it("matches a known SHA-256 value (so Node and Workers agree)", async () => {
    // SHA-256 of the canonical string ["inworld:Mark","Hello."]
    const hex = await sha256Hex('["inworld:Mark","Hello."]');
    expect(hex).toHaveLength(64);
    expect(await libraryKey("inworld:Mark", "Hello.", sha256Hex)).toBe(LIBRARY_PREFIX + hex);
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("gives a different key to a different voice", async () => {
    expect(await libraryKey("inworld:Mark", "Hello.", sha256Hex)).not.toBe(await libraryKey("inworld:Chloe", "Hello.", sha256Hex));
  });

  it("refuses a digest that is not 64 lowercase hex characters", async () => {
    await expect(libraryKey("inworld:Mark", "Hello.", () => "nope")).rejects.toThrow(/64 lowercase hex/);
  });
});
