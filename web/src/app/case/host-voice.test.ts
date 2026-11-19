import type { ApiResult } from "@hauntology/shared/app/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudioLike } from "../play/voice";
import { createHostAudio } from "./host-voice";

afterEach(() => vi.useRealTimers());

const clip = new Blob([new Uint8Array(200)], { type: "audio/mpeg" });

describe("createHostAudio (ghost-voice 4.6 & 4.8)", () => {
  it("shows subtitles only before unlock tap, then fetches with Host token and plays after unlock", async () => {
    const subtitles: string[] = [];
    const made: Array<{ played: boolean; paused: boolean; released: boolean }> = [];
    const fetchSpeech = vi.fn(async (): Promise<ApiResult<{ audio: Blob }>> => ({ ok: true, value: { audio: clip } }));

    const host = createHostAudio({
      roomCode: "WXYZ",
      hostToken: "host-tok",
      fetchSpeech,
      createAudio: () => {
        const rec = { played: false, paused: false, released: false };
        made.push(rec);
        const audio: AudioLike = {
          onended: null,
          async play() { rec.played = true; },
          pause() { rec.paused = true; },
        };
        return { audio, release: () => { rec.released = true; } };
      },
      onSubtitle: (t) => subtitles.push(t),
    });

    // Before unlock: subtitle shown, no speech request.
    expect(await host.onVoiceCue({ lineId: "l1", text: "Night falls.", kind: "midnight" })).toBe(false);
    expect(subtitles).toEqual(["Night falls."]);
    expect(fetchSpeech).not.toHaveBeenCalled();

    // After unlock: plays with Host token.
    host.unlock();
    expect(await host.onVoiceCue({ lineId: "l2", text: "The bell strikes.", kind: "haunt_event" })).toBe(true);
    expect(subtitles).toEqual(["Night falls.", "The bell strikes."]);
    expect(fetchSpeech).toHaveBeenCalledWith({ roomCode: "WXYZ", lineId: "l2" }, "host-tok");
    expect(made[0]!.played).toBe(true);

    // Uses prefetched buffer without making a second live fetch.
    await host.prefetch(["l3"]);
    expect(fetchSpeech).toHaveBeenCalledWith({ roomCode: "WXYZ", lineId: "l3", prefetch: true }, "host-tok");
    fetchSpeech.mockClear();
    expect(await host.onVoiceCue({ lineId: "l3", text: "Prefetched line.", kind: "midnight" })).toBe(true);
    expect(fetchSpeech).not.toHaveBeenCalled();

    host.dispose();
    expect(made[1]!.paused).toBe(true);
    expect(made[1]!.released).toBe(true);
  });

  it("drops late audio after 5s deadline and falls back silently", async () => {
    vi.useFakeTimers();
    let resolveLate!: (v: ApiResult<{ audio: Blob }>) => void;
    const fallbackSpeak = vi.fn(() => true);
    const playSpy = vi.fn();

    const host = createHostAudio({
      roomCode: "WXYZ",
      hostToken: "tok",
      fetchSpeech: vi.fn(() => new Promise<ApiResult<{ audio: Blob }>>((r) => { resolveLate = r; })),
      createAudio: () => ({ audio: { onended: null, play: playSpy, pause() {} }, release() {} }),
      onSubtitle: () => {},
      fallbackSpeak,
      deadlineMs: 5_000,
    });
    host.unlock();
    const pending = host.onVoiceCue({ lineId: "slow", text: "Slow line.", kind: "narration" });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toBe(false);
    expect(fallbackSpeak).toHaveBeenCalledWith("Slow line.");

    resolveLate({ ok: true, value: { audio: clip } });
    await Promise.resolve();
    expect(playSpy).not.toHaveBeenCalled();
  });
});
