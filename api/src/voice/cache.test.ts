import { describe, expect, it } from "vitest";
import { CACHE_MAX_AGE_MS } from "@hauntology/shared/voice/cache";
import { sha256Hex } from "@hauntology/shared/voice/digest";
import { CACHE_PREFIX, LIBRARY_PREFIX, libraryKey, speechCacheKey } from "@hauntology/shared/voice/key";
import type { VoiceId } from "@hauntology/shared/voice/voices";
import { AUDIO_MAX_BYTES, AUDIO_MIN_BYTES } from "../guarded/workersai/speak";
import { FakeR2 } from "../worlds/fake-cloudflare";
import { R2SpeechCache, type SpeechBucket } from "./cache";

const PIPPA: VoiceId = "inworld:Pippa";
const LUNA: VoiceId = "aura-2:luna";
const SPOKEN = "The kettle is still warm.";
const T0 = 1_700_000_000_000;

const mp3 = (n = 4_000, fill = 7): Uint8Array => { const b = new Uint8Array(n).fill(fill); b[0] = 0xff; b[1] = 0xfb; return b; };
function setup(start = T0) {
  const r2 = new FakeR2();
  let clock = start;
  const cache = new R2SpeechCache(r2 as unknown as SpeechBucket, { now: () => clock });
  return { r2, cache, at: (t: number) => { clock = t; }, advance: (ms: number) => { clock += ms; } };
}

describe("R2SpeechCache.put", () => {
  it("keeps the clip under speech/v1/ with the key from the voice and the plain text, as audio/mpeg", async () => {
    const { r2, cache } = setup();
    expect(await cache.put(PIPPA, SPOKEN, mp3())).toBe(true);
    const key = await speechCacheKey(PIPPA, SPOKEN, sha256Hex);
    expect([...r2.objects.keys()]).toEqual([key]);
    expect(key.startsWith(CACHE_PREFIX)).toBe(true);
    expect(r2.objects.get(key)!.contentType).toBe("audio/mpeg");
    expect(r2.objects.get(key)!.bytes).toEqual(mp3());
  });
  it("writes metadata that is exactly storedAt and voice, and nothing of the text anywhere", async () => {
    const { r2, cache } = setup();
    await cache.put(PIPPA, SPOKEN, mp3());
    const [key, held] = [...r2.objects.entries()][0]!;
    expect(held.customMetadata).toEqual({ storedAt: String(T0), voice: PIPPA });
    const everything = JSON.stringify([key, held.customMetadata, held.contentType]);
    for (const word of ["kettle", "warm", SPOKEN]) expect(everything).not.toContain(word);
    expect(everything).not.toMatch(/\[whisper\]|\[speak nervously\]/);
  });
  it("never writes outside speech/v1/, so never under the Library's prefix", async () => {
    const { r2, cache } = setup();
    await cache.put(PIPPA, SPOKEN, mp3());
    await cache.put(LUNA, SPOKEN, mp3());
    expect([...r2.objects.keys()].every((k) => k.startsWith(CACHE_PREFIX) && !k.startsWith(LIBRARY_PREFIX))).toBe(true);
  });
  it("refuses a clip that is too small or too large, and writes nothing", async () => {
    const { r2, cache } = setup();
    expect(await cache.put(PIPPA, SPOKEN, new Uint8Array(0))).toBe(false);
    expect(await cache.put(PIPPA, SPOKEN, mp3(AUDIO_MIN_BYTES - 1))).toBe(false);
    expect(await cache.put(PIPPA, SPOKEN, mp3(AUDIO_MAX_BYTES + 1))).toBe(false);
    expect(r2.objects.size).toBe(0);
  });
  it("says false and does not throw when R2 fails", async () => {
    const broken: SpeechBucket = { get: async () => null, put: () => { throw new Error("R2 is down"); } };
    expect(await new R2SpeechCache(broken).put(PIPPA, SPOKEN, mp3())).toBe(false);
    const rejecting: SpeechBucket = { get: async () => null, put: () => Promise.reject(new Error("R2 is down")) };
    expect(await new R2SpeechCache(rejecting).put(PIPPA, SPOKEN, mp3())).toBe(false);
  });
});

describe("R2SpeechCache.lookup", () => {
  it("returns the clip that was put, with its voice and when it was stored", async () => {
    const { cache } = setup();
    await cache.put(PIPPA, SPOKEN, mp3(4_000, 9));
    const hit = await cache.lookup([PIPPA], SPOKEN);
    expect(hit).toMatchObject({ voice: PIPPA, storedAt: T0 });
    expect(hit!.audio).toEqual(mp3(4_000, 9));
  });
  it("is a miss for another text, another voice or nothing stored", async () => {
    const { cache } = setup();
    expect(await cache.lookup([PIPPA], SPOKEN)).toBeNull();
    await cache.put(PIPPA, SPOKEN, mp3());
    expect(await cache.lookup([PIPPA], "The kettle is cold.")).toBeNull();
    expect(await cache.lookup([LUNA], SPOKEN)).toBeNull();
    expect(await cache.lookup([], SPOKEN)).toBeNull();
  });
  it("finds the same clip for text that differs only in surrounding or repeated whitespace", async () => {
    const { cache } = setup();
    await cache.put(PIPPA, SPOKEN, mp3());
    expect(await cache.lookup([PIPPA], `  The kettle   is still\twarm.\n`)).not.toBeNull();
  });
  it("tries the line's own Inworld voice first and then its Aura-2 voice", async () => {
    const { cache } = setup();
    await cache.put(LUNA, SPOKEN, mp3(4_000, 2));
    expect((await cache.lookup([PIPPA, LUNA], SPOKEN))!.voice).toBe(LUNA);
    await cache.put(PIPPA, SPOKEN, mp3(4_000, 3));
    const both = await cache.lookup([PIPPA, LUNA], SPOKEN);
    expect(both!.voice).toBe(PIPPA);
    expect(both!.audio).toEqual(mp3(4_000, 3));
  });

  it("serves a clip up to the last millisecond of day 60 and not at day 60, and does not delete the stale object", async () => {
    const { r2, cache, at } = setup();
    await cache.put(PIPPA, SPOKEN, mp3());
    at(T0 + CACHE_MAX_AGE_MS - 1);
    expect(await cache.lookup([PIPPA], SPOKEN)).not.toBeNull();
    at(T0 + CACHE_MAX_AGE_MS);
    expect(await cache.lookup([PIPPA], SPOKEN)).toBeNull();
    expect(r2.objects.size).toBe(1);
  });
  it("is a miss when the Inworld clip is stale but the Aura-2 clip is fresh, and serves the fresh one", async () => {
    const { cache, at } = setup();
    await cache.put(PIPPA, SPOKEN, mp3(4_000, 3));
    at(T0 + CACHE_MAX_AGE_MS - 10);
    await cache.put(LUNA, SPOKEN, mp3(4_000, 2));
    at(T0 + CACHE_MAX_AGE_MS + 5);
    expect((await cache.lookup([PIPPA, LUNA], SPOKEN))!.voice).toBe(LUNA);
  });

  it("is a miss, not an error, for damaged metadata, a voice that does not match, or a clip of the wrong size", async () => {
    const key = await speechCacheKey(PIPPA, SPOKEN, sha256Hex);
    const cases: [string, Record<string, string> | undefined, Uint8Array][] = [
      ["no metadata", undefined, mp3()],
      ["no storedAt", { voice: PIPPA }, mp3()],
      ["storedAt not a number", { storedAt: "yesterday", voice: PIPPA }, mp3()],
      ["storedAt negative", { storedAt: "-5", voice: PIPPA }, mp3()],
      ["storedAt with junk", { storedAt: `${T0}abc`, voice: PIPPA }, mp3()],
      ["no voice", { storedAt: String(T0) }, mp3()],
      ["another voice", { storedAt: String(T0), voice: LUNA }, mp3()],
      ["empty clip", { storedAt: String(T0), voice: PIPPA }, new Uint8Array(0)],
      ["tiny clip", { storedAt: String(T0), voice: PIPPA }, mp3(AUDIO_MIN_BYTES - 1)],
      ["huge clip", { storedAt: String(T0), voice: PIPPA }, mp3(AUDIO_MAX_BYTES + 1)],
    ];
    for (const [name, customMetadata, bytes] of cases) {
      const r2 = new FakeR2();
      r2.put(key, bytes, { httpMetadata: { contentType: "audio/mpeg" }, ...(customMetadata ? { customMetadata } : {}) });
      const cache = new R2SpeechCache(r2 as unknown as SpeechBucket, { now: () => T0 + 1_000 });
      expect(await cache.lookup([PIPPA], SPOKEN), name).toBeNull();
    }
  });
  it("is a miss, not an error, when R2 throws or rejects, and goes on to the next voice", async () => {
    const calls: string[] = [];
    const first: SpeechBucket = { get: async (k) => { calls.push(k); throw new Error("R2 is down"); }, put: () => undefined };
    expect(await new R2SpeechCache(first).lookup([PIPPA, LUNA], SPOKEN)).toBeNull();
    expect(calls).toHaveLength(2);
    const { r2 } = setup();
    let n = 0;
    const flaky: SpeechBucket = {
      get: async (k) => { n += 1; if (n === 1) throw new Error("blip"); return r2.get(k); },
      put: (k, v, o) => r2.put(k, v, o),
    };
    const cache = new R2SpeechCache(flaky, { now: () => T0 });
    await cache.put(LUNA, SPOKEN, mp3());
    expect((await cache.lookup([PIPPA, LUNA], SPOKEN))!.voice).toBe(LUNA);
  });

  it("never serves a Library object, even one that holds the same text and voice", async () => {
    const { r2, cache } = setup();
    r2.put(await libraryKey(PIPPA, SPOKEN, sha256Hex), mp3(), { httpMetadata: { contentType: "audio/mpeg" }, customMetadata: { storedAt: String(T0), voice: PIPPA } });
    expect(await cache.lookup([PIPPA], SPOKEN)).toBeNull();
  });
});
