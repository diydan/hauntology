import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "@hauntology/shared/voice/digest";
import { LIBRARY_PREFIX, libraryKey, speechCacheKey } from "@hauntology/shared/voice/key";
import type { VoiceId } from "@hauntology/shared/voice/voices";
import { AUDIO_MAX_BYTES, AUDIO_MIN_BYTES } from "../guarded/workersai/speak";
import { FakeR2 } from "../worlds/fake-cloudflare";
import { R2SpeechLibrary, type LibraryBucket } from "./library";

const PIPPA: VoiceId = "inworld:Pippa";
const SPOKEN = "Somebody was in the kitchen before you.";
const mp3 = (n = 4_000, fill = 7): Uint8Array => { const b = new Uint8Array(n).fill(fill); b[0] = 0xff; b[1] = 0xfb; return b; };
const lib = (r2: FakeR2) => new R2SpeechLibrary(r2 as unknown as LibraryBucket);

describe("R2SpeechLibrary", () => {
  it("finds the clip kept under the Library key of the voice and the plain text", async () => {
    const r2 = new FakeR2();
    r2.put(await libraryKey(PIPPA, SPOKEN, sha256Hex), mp3(4_000, 9));
    expect(await lib(r2).lookup(PIPPA, SPOKEN)).toEqual(mp3(4_000, 9));
  });
  it("finds it for text that differs only in surrounding or repeated whitespace", async () => {
    const r2 = new FakeR2();
    r2.put(await libraryKey(PIPPA, SPOKEN, sha256Hex), mp3());
    expect(await lib(r2).lookup(PIPPA, `  Somebody was   in the kitchen\tbefore you.\n`)).not.toBeNull();
  });
  it("is a miss for another text or another voice, and never reads the cache's prefix", async () => {
    const r2 = new FakeR2();
    r2.put(await libraryKey(PIPPA, SPOKEN, sha256Hex), mp3());
    r2.put(await speechCacheKey("inworld:Ronald", SPOKEN, sha256Hex), mp3());
    expect(await lib(r2).lookup(PIPPA, "Somebody was in the hall.")).toBeNull();
    expect(await lib(r2).lookup("inworld:Ronald", SPOKEN)).toBeNull(); // only a cache object exists for Ronald: that is not the Library
    expect(await lib(r2).lookup("aura-2:luna", SPOKEN)).toBeNull();
  });
  it("is a miss for an object that is not playable audio: empty, too small, too large, or not an MP3", async () => {
    for (const bytes of [new Uint8Array(0), mp3(AUDIO_MIN_BYTES - 1), mp3(AUDIO_MAX_BYTES + 1), new TextEncoder().encode("<html>".repeat(500))]) {
      const r2 = new FakeR2();
      r2.put(await libraryKey(PIPPA, SPOKEN, sha256Hex), bytes);
      expect(await lib(r2).lookup(PIPPA, SPOKEN)).toBeNull();
    }
  });
  it("has no expiry: a Library object with no metadata, however old, is served", async () => {
    const r2 = new FakeR2();
    r2.put(await libraryKey(PIPPA, SPOKEN, sha256Hex), mp3(), new Date(0));
    expect(await lib(r2).lookup(PIPPA, SPOKEN)).not.toBeNull();
  });
  it("only ever reads: the bucket it is given has `get` and nothing else, and it calls nothing else", async () => {
    const calls: string[] = [];
    const spy = new Proxy({ get: async (k: string) => { calls.push(`get ${k.slice(0, 14)}`); return null; } }, { get: (t, p) => { if (p !== "get") calls.push(`touched ${String(p)}`); return (t as Record<string | symbol, unknown>)[p]; } });
    await new R2SpeechLibrary(spy as unknown as LibraryBucket).lookup(PIPPA, SPOKEN);
    expect(calls).toEqual([`get ${LIBRARY_PREFIX}`]);
  });
  it("is a miss, not an error, when R2 throws or rejects", async () => {
    for (const get of [() => { throw new Error("down"); }, () => Promise.reject(new Error("down"))]) {
      expect(await new R2SpeechLibrary({ get } as unknown as LibraryBucket).lookup(PIPPA, SPOKEN)).toBeNull();
    }
  });
});

describe("the uploaded Library: the runtime key is the object name that was uploaded", () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "shared", "fixtures", "voice-library.json"), "utf8")) as { prefix: string; entries: { key: string; voice: VoiceId; spoken: string }[] };

  it("has the Library's prefix and some entries", () => {
    expect(manifest.prefix).toBe(LIBRARY_PREFIX);
    expect(manifest.entries.length).toBeGreaterThan(100);
  });
  it("gives, for EVERY manifest entry, exactly the key the manifest (and so the upload) has", async () => {
    const wrong: string[] = [];
    for (const e of manifest.entries) if ((await libraryKey(e.voice, e.spoken, sha256Hex)) !== e.key) wrong.push(`${e.voice} ${e.key.slice(-8)}`);
    expect(wrong).toEqual([]);
  });
  it("finds a clip placed at the manifest key for each voice in the manifest", async () => {
    const byVoice = new Map<VoiceId, (typeof manifest.entries)[number]>();
    for (const e of manifest.entries) if (!byVoice.has(e.voice)) byVoice.set(e.voice, e);
    expect([...byVoice.keys()].sort()).toEqual(["inworld:Arjun", "inworld:Chloe", "inworld:Conrad", "inworld:Eleanor", "inworld:Mark", "inworld:Pippa", "inworld:Ronald", "inworld:Victoria"]);
    for (const e of byVoice.values()) {
      const r2 = new FakeR2();
      r2.put(e.key, mp3(4_000, 3));
      expect(await lib(r2).lookup(e.voice, e.spoken), e.voice).toEqual(mp3(4_000, 3));
    }
  });
});
