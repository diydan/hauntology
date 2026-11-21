// @vitest-environment jsdom
import type { ApiResult } from "@hauntology/shared/app/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LIVE_ENDED_NOTE, createVoice, type VoiceDeps } from "./voice";

// haunwallker 6.7: the Live mode controls' behaviour against a fake transport (`openLiveSession`). Nothing here touches a network or a microphone.
afterEach(() => { vi.useRealTimers(); Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); });

function make(open: VoiceDeps["openLiveSession"], extra: Partial<VoiceDeps> = {}) {
  const api = {
    speak: vi.fn(async (): Promise<ApiResult<{ audio: Blob }>> => ({ ok: true, value: { audio: new Blob([new Uint8Array(10)], { type: "audio/mpeg" }) } })),
    listen: vi.fn(async (): Promise<ApiResult<{ transcript: string }>> => ({ ok: true, value: { transcript: "hi" } })),
  };
  const voice = createVoice({
    api: api as unknown as VoiceDeps["api"], createAudio: () => ({ audio: { paused: false, onended: null, play: () => Promise.resolve(), pause() {} }, release() {} }),
    recorder: async () => ({ start() {}, stop: async () => new Blob(), cancel() {} }), onTranscript: vi.fn(), openLiveSession: open, ...extra,
  } as VoiceDeps);
  return { voice, api };
}
const session = () => { const s = { closed: 0, close() { s.closed++; } }; return s; };

describe("Live mode controls: every end falls back to Hold to talk with no error screen (haunwallker 6.7, ghost-voice 6.5)", () => {
  it("stops at once, closes the transport and says so when the page is hidden", async () => {
    const conn = session();
    const t = make(async () => ({ ok: true, value: conn }));
    expect(await t.voice.startLive()).toBe(true);
    expect(t.voice.getSnapshot().live).toBe("listening");
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(conn.closed).toBe(1);
    expect(t.voice.getSnapshot()).toMatchObject({ live: "off", note: LIVE_ENDED_NOTE });
  });

  it("the Stop button ends it quietly (no note) and closes the transport once, even if pressed twice", async () => {
    const conn = session();
    const t = make(async () => ({ ok: true, value: conn }));
    await t.voice.startLive();
    t.voice.stopLive();
    t.voice.stopLive();
    expect(conn.closed).toBe(1);
    const snap = t.voice.getSnapshot();
    expect(snap.live).toBe("off");
    expect(snap.note ?? null).toBeNull();
  });

  it("a microphone or transport problem ends it with the fallback note, and the page is not left listening", async () => {
    for (const reason of ["mic", "transport", "denied"] as const) {
      const conn = session();
      const t = make(async () => ({ ok: true, value: conn }));
      await t.voice.startLive();
      t.voice.stopLive(reason);
      expect(conn.closed, reason).toBe(1);
      expect(t.voice.getSnapshot(), reason).toMatchObject({ live: "off", note: LIVE_ENDED_NOTE });
    }
  });

  it("stops after the silence cutoff, and not before", async () => {
    vi.useFakeTimers();
    const conn = session();
    const t = make(async () => ({ ok: true, value: conn }), { liveSilenceMs: 10_000 });
    await t.voice.startLive();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(t.voice.getSnapshot().live).toBe("listening");
    await vi.advanceTimersByTimeAsync(1);
    expect(t.voice.getSnapshot()).toMatchObject({ live: "off", note: LIVE_ENDED_NOTE });
    expect(conn.closed).toBe(1);
  });

  it("is not offered with no transport (the default today): it stays off with a quiet note and opens nothing", async () => {
    const t = make(undefined);
    expect(await t.voice.startLive()).toBe(false);
    expect(t.voice.getSnapshot().live).toBe("off");
  });

  it("closes the transport when the screen goes away", async () => {
    const conn = session();
    const t = make(async () => ({ ok: true, value: conn }));
    await t.voice.startLive();
    t.voice.destroy();
    expect(conn.closed).toBe(1);
  });
});
