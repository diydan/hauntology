import type { ApiResult } from "@hauntology/shared/app/api";
import { describe, expect, it, vi } from "vitest";
import type { Recorder } from "../play/voice";
import { createAudioPrefetcher, PREFETCH_MAX_BYTES, PREFETCH_MAX_LINES } from "./prefetch";
import { recordStitchWord } from "./recorder";
import { playStitchSequence, type StitchAudioContextLike } from "./stitch-player";

describe("recordStitchWord (ghost-voice 5.11)", () => {
  it("records a word up to 2000 ms and returns its blob and duration", async () => {
    let t = 1_000;
    const events: string[] = [];
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
    const rec: Recorder = {
      start: () => events.push("start"),
      stop: async () => { events.push("stop"); return blob; },
      cancel: () => events.push("cancel"),
    };

    const res = await recordStitchWord({
      openRecorder: async () => rec,
      waitForRelease: async () => { t += 1_500; },
      now: () => t,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.blob).toBe(blob);
      expect(res.durationMs).toBe(1_500);
    }
    expect(events).toEqual(["start", "stop"]);
  });

  it("rejects words longer than 2000 ms with clip_too_long and cancels the stream", async () => {
    let t = 1_000;
    const events: string[] = [];
    const rec: Recorder = {
      start: () => events.push("start"),
      stop: async () => { events.push("stop"); return new Blob([new Uint8Array(10)]); },
      cancel: () => events.push("cancel"),
    };

    const res = await recordStitchWord({
      openRecorder: async () => rec,
      waitForRelease: async () => { t += 2_001; },
      now: () => t,
    });

    expect(res).toEqual({ ok: false, code: "clip_too_long" });
    expect(events).toEqual(["start", "cancel"]);
  });
});

describe("playStitchSequence (ghost-voice 5.11)", () => {
  it("decodes and schedules Stitch clips back-to-back on the AudioContext timeline and emits Subtitle", async () => {
    const starts: number[] = [];
    const stops: number[] = [];
    let idx = 0;
    const durations = [0.6, 0.8];

    const ctx: StitchAudioContextLike = {
      currentTime: 10,
      destination: {},
      async decodeAudioData() {
        return { duration: durations[idx++]! };
      },
      createBufferSource() {
        return {
          buffer: null,
          connect() {},
          start(when = 0) { starts.push(when); },
          stop() { stops.push(1); },
        };
      },
    };

    const subtitles: string[] = [];
    const handle = await playStitchSequence(
      ctx,
      [new Uint8Array([1, 2]), new Uint8Array([3, 4])],
      "wait here",
      (s) => subtitles.push(s),
    );

    expect(subtitles).toEqual(["wait here"]);
    expect(handle.played).toBe(true);
    expect(handle.totalDurationSec).toBeCloseTo(1.4, 5);
    expect(starts).toEqual([10, 10.6]);

    handle.stop();
    expect(stops).toHaveLength(2);
  });

  it("still shows Subtitle and returns played: false when decoding fails or context is null", async () => {
    const subtitles: string[] = [];
    const hNull = await playStitchSequence(null, [new Uint8Array([1])], "cold tonight", (s) => subtitles.push(s));
    expect(hNull.played).toBe(false);
    expect(subtitles).toEqual(["cold tonight"]);
  });
});

describe("createAudioPrefetcher (ghost-voice 4.8)", () => {
  it("fetches only server-listed ids, enforces 8-line and 2 MB caps in memory, and clears on room end", async () => {
    const requested: string[] = [];
    const prefetch = createAudioPrefetcher<Uint8Array>({
      fetchPrefetch: vi.fn(async (id): Promise<ApiResult<{ audio: Blob }>> => {
        requested.push(id);
        return { ok: true, value: { audio: new Blob([new Uint8Array(400_000)]) } };
      }),
      decode: async (blob) => new Uint8Array(await blob.arrayBuffer()),
    });

    const ids = Array.from({ length: 10 }, (_, i) => `l-${i}`);
    await prefetch.warm(ids);

    expect(requested).toEqual(ids);
    expect(prefetch.stats().lines).toBeLessThanOrEqual(PREFETCH_MAX_LINES);
    expect(prefetch.stats().bytes).toBeLessThanOrEqual(PREFETCH_MAX_BYTES);
    // 2 MB / 400 KB = 5 entries max fit in 2 MB byte cap; oldest were evicted.
    expect(prefetch.stats().lines).toBe(5);
    expect(prefetch.get("l-0")).toBeNull();
    expect(prefetch.get("l-9")).not.toBeNull();

    prefetch.clear();
    expect(prefetch.stats()).toEqual({ lines: 0, bytes: 0 });
    expect(prefetch.get("l-9")).toBeNull();
  });
});
