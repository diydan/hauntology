import type { ApiResult } from "@hauntology/shared/app/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LIVE_ENDED_NOTE, LIVE_SPEAK_REQUIRED, MAX_CLIP_MS, NOTE_NOT_HEARD, NOTE_UNAVAILABLE, createVoice,
  type AudioLike, type Recorder, type VoiceDeps,
} from "./voice";

afterEach(() => vi.useRealTimers());

const clip = new Blob([new Uint8Array(100)], { type: "audio/webm" });
const speech = new Blob([new Uint8Array(50)], { type: "audio/mpeg" });

function audioKit(playResult: "ok" | "blocked" = "ok") {
  const made: Array<{ audio: AudioLike & { paused: boolean; ended(): void }; released: boolean }> = [];
  const createAudio: VoiceDeps["createAudio"] = () => {
    const rec = {
      audio: {
        paused: false,
        onended: null as (() => void) | null,
        play: () => (playResult === "ok" ? Promise.resolve() : Promise.reject(new Error("NotAllowedError"))),
        pause() { this.paused = true; },
        ended() { this.onended?.(); },
      },
      released: false,
    };
    made.push(rec);
    return { audio: rec.audio, release: () => { rec.released = true; } };
  };
  return { made, createAudio };
}

function recorderKit() {
  const events: string[] = [];
  const recorder: Recorder = {
    start: () => { events.push("start"); },
    stop: async () => { events.push("stop"); return clip; },
    cancel: () => { events.push("cancel"); },
  };
  const factory = vi.fn(async () => recorder);
  return { events, factory };
}

type MakeOver = Omit<Partial<VoiceDeps>, "api" | "createAudio" | "recorder"> & {
  api?: Record<string, unknown>;
  createAudio?: VoiceDeps["createAudio"] | undefined;
  recorder?: VoiceDeps["recorder"] | undefined;
};

function make(over: MakeOver = {}) {
  const { api: apiOver, ...rest } = over;
  const api = {
    speak: vi.fn(async (): Promise<ApiResult<{ audio: Blob }>> => ({ ok: true, value: { audio: speech } })),
    listen: vi.fn(async (): Promise<ApiResult<{ transcript: string }>> => ({ ok: true, value: { transcript: "hello ghost" } })),
    ...apiOver,
  };
  const kit = audioKit();
  const rec = recorderKit();
  const onTranscript = vi.fn();
  const voice = createVoice({ api: api as unknown as VoiceDeps["api"], createAudio: kit.createAudio, recorder: rec.factory, onTranscript, ...rest } as VoiceDeps);
  return { voice, api, kit, rec, onTranscript };
}

describe("speaking", () => {
  it("is on by default, and does nothing until audio is unlocked by a gesture", async () => {
    const t = make();
    expect(t.voice.getSnapshot().speak).toBe(true);
    expect(await t.voice.playLine("p", "l")).toBe(false);
    expect(t.api.speak).not.toHaveBeenCalled();
    t.voice.unlock();
    expect(await t.voice.playLine("p", "l")).toBe(true);
    expect(t.api.speak).toHaveBeenCalledWith({ playId: "p", lineId: "l" });
    expect(t.voice.getSnapshot().speaking).toBe(true);
  });

  it("unlocks once, inside the gesture, and tries again after a failure", async () => {
    const unlockAudio = vi.fn(async () => {});
    const t = make({ unlockAudio });
    t.voice.unlock();
    t.voice.unlock();
    expect(unlockAudio).toHaveBeenCalledTimes(1);
    const failing = vi.fn(async () => { throw new Error("no"); });
    const f = make({ unlockAudio: failing });
    f.voice.unlock();
    await Promise.resolve();
    await Promise.resolve();
    f.voice.unlock();
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("does nothing while the switch is off, and turning it off stops a line that is playing", async () => {
    const t = make();
    t.voice.unlock();
    t.voice.setSpeak(false);
    expect(await t.voice.playLine("p", "l")).toBe(false);
    expect(t.api.speak).not.toHaveBeenCalled();
    t.voice.setSpeak(true);
    await t.voice.playLine("p", "l");
    t.voice.setSpeak(false);
    expect(t.kit.made[0]!.audio.paused).toBe(true);
    expect(t.kit.made[0]!.released).toBe(true);
    expect(t.voice.getSnapshot()).toMatchObject({ speak: false, speaking: false });
  });

  it("plays one line at a time: a new line stops the old one, and a finished line releases its audio", async () => {
    const t = make();
    t.voice.unlock();
    await t.voice.playLine("p", "l1");
    await t.voice.playLine("p", "l2");
    expect(t.kit.made[0]!.audio.paused).toBe(true);
    expect(t.kit.made[0]!.released).toBe(true);
    expect(t.kit.made[1]!.released).toBe(false);
    t.kit.made[1]!.audio.ended();
    expect(t.kit.made[1]!.released).toBe(true);
    expect(t.voice.getSnapshot().speaking).toBe(false);
  });

  it("falls back to the subtitle, quietly, when the call fails, the player is blocked, or the meter is spent", async () => {
    const failing = make({ api: { speak: vi.fn(async () => ({ ok: false, code: "network_error" }) as ApiResult<never>) } });
    failing.voice.unlock();
    expect(await failing.voice.playLine("p", "l")).toBe(false);
    expect(await failing.voice.playLine("p", "l")).toBe(false);
    expect(failing.api.speak).toHaveBeenCalledTimes(2); // a passing failure does not turn speech off

    const spent = make({ api: { speak: vi.fn(async () => ({ ok: false, code: "voice_unavailable" }) as ApiResult<never>) } });
    spent.voice.unlock();
    expect(await spent.voice.playLine("p", "l")).toBe(false);
    expect(await spent.voice.playLine("p", "l2")).toBe(false);
    expect(spent.api.speak).toHaveBeenCalledTimes(1); // it will not change this game: stop asking
    expect(spent.voice.getSnapshot().note).toBeNull();

    const blocked = audioKit("blocked");
    const b = make({ createAudio: blocked.createAudio });
    b.voice.unlock();
    expect(await b.voice.playLine("p", "l")).toBe(false);
    expect(blocked.made[0]!.released).toBe(true);
    expect(b.voice.getSnapshot().speaking).toBe(false);
  });

  it("does not speak at all when the browser gave no way to play audio", async () => {
    const t = make({ createAudio: undefined });
    t.voice.unlock();
    expect(await t.voice.playLine("p", "l")).toBe(false);
    expect(t.api.speak).not.toHaveBeenCalled();
  });

  it("drops late audio after the 5-second deadline, runs fallbackSpeak, and persists speak toggle in storage", async () => {
    vi.useFakeTimers();
    let resolveLate!: (v: ApiResult<{ audio: Blob }>) => void;
    const fallbackSpeak = vi.fn(() => true);
    const t = make({
      api: { speak: vi.fn(() => new Promise<ApiResult<{ audio: Blob }>>((r) => { resolveLate = r; })) },
      deadlineMs: 5_000,
      fallbackSpeak,
    });
    t.voice.unlock();
    const pending = t.voice.playLine("p", "l", "The air turns cold.");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toBe(false);
    expect(fallbackSpeak).toHaveBeenCalledWith("The air turns cold.");
    // Late resolution arrives after 5 s: audio player must never be started.
    resolveLate({ ok: true, value: { audio: speech } });
    await Promise.resolve();
    expect(t.kit.made).toHaveLength(0);

    const store = new Map<string, string>([["hauntology.speak", "false"]]);
    const persisted = make({
      storage: {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => { store.set(k, v); },
      },
    });
    expect(persisted.voice.getSnapshot().speak).toBe(false);
    persisted.voice.setSpeak(true);
    expect(store.get("hauntology.speak")).toBe("true");
  });
});

describe("hold to talk", () => {
  it("records while held, sends the clip, and hands the transcript on as typed text", async () => {
    const t = make();
    await t.voice.pressTalk();
    expect(t.voice.getSnapshot().mic).toBe("recording");
    expect(t.rec.events).toEqual(["start"]);
    await t.voice.releaseTalk();
    expect(t.rec.events).toEqual(["start", "stop"]);
    expect(t.api.listen).toHaveBeenCalledWith(clip);
    expect(t.onTranscript).toHaveBeenCalledWith("hello ghost");
    expect(t.voice.getSnapshot()).toMatchObject({ mic: "idle", note: null });
  });

  it("stops by itself after 8 seconds", async () => {
    vi.useFakeTimers();
    const t = make();
    await t.voice.pressTalk();
    await vi.advanceTimersByTimeAsync(MAX_CLIP_MS - 1);
    expect(t.voice.getSnapshot().mic).toBe("recording");
    await vi.advanceTimersByTimeAsync(1);
    expect(t.rec.events).toEqual(["start", "stop"]);
    expect(t.onTranscript).toHaveBeenCalledTimes(1);
    expect(MAX_CLIP_MS).toBe(8000);
  });

  it("stops what is being said aloud when the visitor starts to talk", async () => {
    const t = make();
    t.voice.unlock();
    await t.voice.playLine("p", "l");
    await t.voice.pressTalk();
    expect(t.kit.made[0]!.audio.paused).toBe(true);
  });

  it("takes one press at a time", async () => {
    const t = make();
    await Promise.all([t.voice.pressTalk(), t.voice.pressTalk()]);
    await t.voice.pressTalk();
    expect(t.rec.factory).toHaveBeenCalledTimes(1);
    await t.voice.releaseTalk();
    await t.voice.releaseTalk();
    expect(t.api.listen).toHaveBeenCalledTimes(1);
  });

  it("cancels if the button is let go while the browser is still asking for the microphone, and keeps nothing", async () => {
    let allow!: (r: Recorder) => void;
    const events: string[] = [];
    const rec: Recorder = { start: () => events.push("start"), stop: async () => clip, cancel: () => events.push("cancel") };
    const t = make({ recorder: () => new Promise((r) => { allow = r; }) });
    const pressing = t.voice.pressTalk();
    expect(t.voice.getSnapshot().mic).toBe("starting");
    await t.voice.releaseTalk();
    allow(rec);
    await pressing;
    expect(events).toEqual(["cancel"]);
    expect(t.api.listen).not.toHaveBeenCalled();
    expect(t.voice.getSnapshot().mic).toBe("idle");
  });

  it("falls back to typing, with one calm note and no error screen, when the microphone is refused", async () => {
    const t = make({ recorder: async () => { throw new Error("NotAllowedError"); } });
    await t.voice.pressTalk();
    expect(t.voice.getSnapshot()).toMatchObject({ mic: "unavailable", note: NOTE_UNAVAILABLE });
    await t.voice.pressTalk();
    expect(t.api.listen).not.toHaveBeenCalled();
  });

  it("releases a microphone that arrives after the Screen has gone, and never starts it", async () => {
    let allow!: (r: Recorder) => void;
    const events: string[] = [];
    const rec: Recorder = { start: () => events.push("start"), stop: async () => clip, cancel: () => events.push("cancel") };
    const t = make({ recorder: () => new Promise((r) => { allow = r; }) });
    const pressing = t.voice.pressTalk();
    t.voice.destroy();
    allow(rec);
    await pressing;
    expect(events).toEqual(["cancel"]);
    expect(t.api.listen).not.toHaveBeenCalled();
  });

  it("reports that talking is not possible in a browser with no recorder", () => {
    const t = make({ recorder: null });
    expect(t.voice.getSnapshot().mic).toBe("unsupported");
  });

  it("asks the visitor to try again when nothing was heard, and goes off when the meter is spent or the call fails", async () => {
    for (const [code, mic, note] of [
      ["clip_not_heard", "idle", NOTE_NOT_HEARD], ["clip_too_long", "idle", NOTE_NOT_HEARD],
      ["voice_unavailable", "unavailable", NOTE_UNAVAILABLE], ["network_error", "unavailable", NOTE_UNAVAILABLE],
    ] as const) {
      const t = make({ api: { listen: vi.fn(async () => ({ ok: false, code }) as ApiResult<never>) } });
      await t.voice.pressTalk();
      await t.voice.releaseTalk();
      expect(t.voice.getSnapshot(), code).toMatchObject({ mic, note });
      expect(t.onTranscript).not.toHaveBeenCalled();
    }
  });

  it("says nothing was caught for an empty transcript, and sends nothing on", async () => {
    const t = make({ api: { listen: vi.fn(async () => ({ ok: true, value: { transcript: "  " } }) as ApiResult<{ transcript: string }>) } });
    await t.voice.pressTalk();
    await t.voice.releaseTalk();
    expect(t.onTranscript).not.toHaveBeenCalled();
    expect(t.voice.getSnapshot().note).toBe(NOTE_NOT_HEARD);
  });

  it("treats a recorder that breaks when stopped as unavailable", async () => {
    const t = make({ recorder: async () => ({ start() {}, stop: async () => { throw new Error("boom"); }, cancel() {} }) });
    await t.voice.pressTalk();
    await t.voice.releaseTalk();
    expect(t.voice.getSnapshot()).toMatchObject({ mic: "idle", note: NOTE_UNAVAILABLE });
    expect(t.api.listen).not.toHaveBeenCalled();
  });

  it("destroy releases the microphone and stops the sound", async () => {
    const t = make();
    t.voice.unlock();
    await t.voice.playLine("p", "l");
    await t.voice.pressTalk();
    t.voice.destroy();
    expect(t.rec.events).toEqual(["start", "cancel"]);
    expect(t.kit.made[0]!.released).toBe(true);
  });

  it("handles Live Mode lifecycle: refuses with speak off, opens when on, falls back cleanly on stop, silence, or transport refusal (4.5, 6.5)", async () => {
    const tOff = make({ openLiveSession: async () => ({ ok: true, value: { close() {} } }) });
    tOff.voice.setSpeak(false);
    expect(await tOff.voice.startLive()).toBe(false);
    expect(tOff.voice.getSnapshot()).toMatchObject({ live: "off", note: LIVE_SPEAK_REQUIRED });

    vi.useFakeTimers();
    let closed = 0;
    const tOn = make({ openLiveSession: async () => ({ ok: true, value: { close: () => { closed++; } } }), liveSilenceMs: 200 });
    expect(await tOn.voice.startLive()).toBe(true);
    expect(tOn.voice.getSnapshot().live).toBe("listening");
    await vi.advanceTimersByTimeAsync(200);
    expect(closed).toBe(1);
    expect(tOn.voice.getSnapshot()).toMatchObject({ live: "off", note: LIVE_ENDED_NOTE });

    const tFail = make({ openLiveSession: async () => ({ ok: false, code: "live_unavailable" }) });
    expect(await tFail.voice.startLive()).toBe(false);
    expect(tFail.voice.getSnapshot()).toMatchObject({ live: "off", note: LIVE_ENDED_NOTE });
  });
});
