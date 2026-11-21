import { describe, expect, it } from "vitest";
import type { VoiceLine } from "@hauntology/shared/voice/line";
import type { SpeakDeps } from "./speak";
import { FakeR2 } from "../worlds/fake-cloudflare";
import { R2SpeechCache, type SpeechBucket } from "./cache";
import { speakDepsForDo, speculateLine } from "./room-speak";

const line: VoiceLine = { id: "L1", kind: "narration", speaker: "keeper", text: "A name was sealed.", spoken: "A name was sealed.", voice: "inworld:Ronald", createdAt: 1 };
const reserved = { n: 0 };
const spend = { reserve: async () => { reserved.n += 1; return { ok: false as const, reason: "killed" as const }; }, commit: async () => undefined, release: async () => undefined };

describe("speculation from a Durable Object (ghost-voice 3.12)", () => {
  it("has no speak dependencies without the AI binding or the bucket, or with an unknown model name, so nothing is ever started", () => {
    expect(speakDepsForDo({}, spend)).toBeNull();
    expect(speakDepsForDo({ BUCKET: {} as never }, spend)).toBeNull();
    expect(speakDepsForDo({ AI: {} as never, BUCKET: {} as never, VOICE_TTS_MODEL_ID: "not-a-model" }, spend)).toBeNull();
    expect(speculateLine(null, { sessionId: "s", ipHash: "h" }, line, { speaking: true })).toBe("unavailable");
  });
  it("starts nothing while speaking is off, and starts one call (through the deferred work) while it is on", async () => {
    const deferred: Promise<unknown>[] = [];
    const deps = { lines: { find: async () => null }, cache: new R2SpeechCache(new FakeR2() as unknown as SpeechBucket, { now: () => 1 }), maker: { speak: async () => ({ ok: false as const, reason: "failed" as const, attempts: [] }) }, spend } as unknown as SpeakDeps;
    expect(speculateLine(deps, { sessionId: "s", ipHash: "h" }, line, { speaking: false, defer: (w) => deferred.push(w) })).toBe("off");
    expect(deferred).toHaveLength(0);
    expect(speculateLine(deps, { sessionId: "s", ipHash: "h" }, line, { speaking: true, defer: (w) => deferred.push(w) })).toBe("started");
    await Promise.all(deferred);
    expect(deferred).toHaveLength(1);
    expect(reserved.n).toBe(1); // no Library or cached clip, so it asked the spend guard once (here: refused)
  });
});
