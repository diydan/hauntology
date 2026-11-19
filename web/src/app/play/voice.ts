import type { ShellApi } from "@hauntology/shared/app/api";
import type { QuotaSnapshot, ShellFlags } from "@hauntology/shared/app/types";
import { SPEECH_DEADLINE_MS } from "@hauntology/shared/voice/limits";

/**
 * The ghost's voice in Single player (Requirement 12.3): speaking the line the server holds, and
 * hold-to-talk. Every failure is quiet: a spent meter, a refused microphone, a blocked player or a
 * failed call leaves the subtitle and typing, with no error screen. Nothing the visitor says is
 * kept: the clip lives in memory for one call, the microphone is released as soon as the button is
 * let go, and only the transcript, which then counts as typed text, comes back.
 */

export const MAX_CLIP_MS = 8000;
export const SPEAK_STORAGE_KEY = "hauntology.speak";

export type AudioLike = { play(): Promise<void>; pause(): void; onended: (() => void) | null };
export type Recorder = { start(): void; stop(): Promise<Blob>; cancel(): void };
export type RecorderFactory = () => Promise<Recorder>;

export type VoiceDeps = {
  api: Pick<ShellApi, "speak" | "listen">;
  createAudio?: (blob: Blob) => { audio: AudioLike; release: () => void };
  /** Called inside a user gesture, so the browser lets audio play afterwards. */
  unlockAudio?: () => Promise<void>;
  /** `null` when the browser cannot record. */
  recorder?: RecorderFactory | null;
  /** The visitor said something: treat it exactly like typed text. */
  onTranscript: (text: string) => void;
  maxClipMs?: number;
  /** Maximum wait for fetched line audio before falling back quietly (default 5000 ms). */
  deadlineMs?: number;
  /** Optional browser fallback (e.g. speechSynthesis) when fetched audio fails or times out. */
  fallbackSpeak?: (text: string) => boolean;
  /** Optional `sessionStorage` to persist the visitor's speak switch. */
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
};

export type MicState = "unsupported" | "idle" | "starting" | "recording" | "sending" | "unavailable";
export type VoiceUi = {
  /** The speak switch. */
  speak: boolean;
  /** A line is playing. */
  speaking: boolean;
  mic: MicState;
  /** A calm one-line note about the microphone, or null. */
  note: string | null;
};

export type Voice = {
  getSnapshot(): VoiceUi;
  subscribe(listener: () => void): () => void;
  setSpeak(on: boolean): void;
  /** Call from a click or key press. */
  unlock(): void;
  /** Speaks a line if the switch is on and audio is unlocked. Returns whether it started. */
  playLine(playId: string, lineId: string, subtitleText?: string): Promise<boolean>;
  stopSpeaking(): void;
  /** The talk button went down. */
  pressTalk(): Promise<void>;
  /** The talk button came up (or the key did). */
  releaseTalk(): Promise<void>;
  destroy(): void;
};

export const NOTE_UNAVAILABLE = "Talking is not available right now. You can type instead.";
export const NOTE_NOT_HEARD = "I did not catch that. Try again, or type.";
export const VOICE_TTS_UNAVAILABLE = "Ghost voice is out right now — subtitles stay on.";
export const VOICE_STT_UNAVAILABLE = "Talking out loud is unavailable right now. You can type instead.";

export type VoiceQuota = {
  /** Whether the server switch allows voice controls to appear at all. */
  enabled: boolean;
  /** Whether text-to-speech quota remains (`tts > 0`). */
  tts: boolean;
  /** Whether speech-to-text quota remains (`stt > 0`). */
  stt: boolean;
  /** Whether live voice mode is enabled and quota remains (`live > 0`). */
  live: boolean;
};

/** Derives per-control voice availability from boot flags and quota snapshot (ghost-voice 4.4). */
export function voiceQuotaState(
  flags: Pick<ShellFlags, "voiceEnabled" | "liveEnabled">,
  quota: Pick<QuotaSnapshot, "tts" | "stt" | "live">,
): VoiceQuota {
  const enabled = flags.voiceEnabled;
  return {
    enabled,
    tts: enabled && quota.tts > 0,
    stt: enabled && quota.stt > 0,
    live: enabled && flags.liveEnabled && quota.live > 0,
  };
}

export function createVoice(deps: VoiceDeps): Voice {
  const maxClipMs = deps.maxClipMs ?? MAX_CLIP_MS;
  const deadlineMs = deps.deadlineMs ?? SPEECH_DEADLINE_MS;
  const recorderFactory = deps.recorder === undefined ? null : deps.recorder;
  let storedSpeak = true;
  try {
    if (deps.storage) storedSpeak = deps.storage.getItem(SPEAK_STORAGE_KEY) !== "false";
  } catch {
    storedSpeak = true;
  }
  let ui: VoiceUi = { speak: storedSpeak, speaking: false, mic: recorderFactory === null ? "unsupported" : "idle", note: null };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<VoiceUi>) => {
    ui = { ...ui, ...patch };
    for (const l of [...listeners]) l();
  };

  let unlocked = false;
  let speechRefused = false;
  let current: { audio: AudioLike; release: () => void } | null = null;
  let recorder: Recorder | null = null;
  let held = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let session = 0;

  const stopSpeaking = () => {
    if (current === null) return;
    const { audio, release } = current;
    current = null;
    audio.onended = null;
    audio.pause();
    release();
    set({ speaking: false });
  };

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  /** Ends a recording and sends it. `mine` guards against a later press. */
  const finish = async (mine: number): Promise<void> => {
    clearTimer();
    const rec = recorder;
    recorder = null;
    held = false;
    if (rec === null || mine !== session) return;
    set({ mic: "sending" });
    let clip: Blob;
    try {
      clip = await rec.stop();
    } catch {
      set({ mic: "idle", note: NOTE_UNAVAILABLE });
      return;
    }
    const heard = await deps.api.listen(clip);
    if (heard.ok) {
      set({ mic: "idle", note: null });
      const text = heard.value.transcript.trim();
      if (text !== "") deps.onTranscript(text);
      else set({ note: NOTE_NOT_HEARD });
    } else if (heard.code === "clip_not_heard" || heard.code === "clip_too_long") {
      set({ mic: "idle", note: NOTE_NOT_HEARD });
    } else {
      // A spent meter, a switch that is off or a failure: talking is off for now, typing is not.
      set({ mic: "unavailable", note: NOTE_UNAVAILABLE });
    }
  };

  return {
    getSnapshot: () => ui,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    setSpeak(on) {
      if (!on) stopSpeaking();
      try {
        deps.storage?.setItem(SPEAK_STORAGE_KEY, on ? "true" : "false");
      } catch {
        // storage disabled
      }
      set({ speak: on });
    },
    unlock() {
      if (unlocked) return;
      unlocked = true;
      void (deps.unlockAudio?.() ?? Promise.resolve()).catch(() => {
        unlocked = false;
      });
    },
    async playLine(playId, lineId, subtitleText) {
      if (!ui.speak || !unlocked || speechRefused || deps.createAudio === undefined) return false;
      let timedOut = false;
      let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
      const got = await Promise.race([
        deps.api.speak({ playId, lineId }),
        new Promise<null>((resolve) => {
          deadlineTimer = setTimeout(() => {
            timedOut = true;
            resolve(null);
          }, deadlineMs);
        }),
      ]);
      if (deadlineTimer !== null) clearTimeout(deadlineTimer);
      if (timedOut || got === null) {
        if (subtitleText !== undefined) deps.fallbackSpeak?.(subtitleText);
        return false;
      }
      if (!got.ok) {
        // A spent meter or a switch that is off will not change this game: stop asking.
        if (got.code === "voice_unavailable") speechRefused = true;
        if (subtitleText !== undefined) deps.fallbackSpeak?.(subtitleText);
        return false;
      }
      if (!ui.speak) return false;
      stopSpeaking();
      const made = deps.createAudio(got.value.audio);
      current = made;
      made.audio.onended = () => {
        if (current === made) {
          current = null;
          made.release();
          set({ speaking: false });
        }
      };
      try {
        await made.audio.play();
      } catch {
        // The browser would not play it (no gesture yet, a silent switch): the subtitle carries on.
        if (current === made) {
          current = null;
          made.release();
        }
        if (subtitleText !== undefined) deps.fallbackSpeak?.(subtitleText);
        return false;
      }
      set({ speaking: true });
      return true;
    },
    stopSpeaking,
    async pressTalk() {
      if (recorderFactory === null || held || ui.mic === "starting" || ui.mic === "recording" || ui.mic === "sending" || ui.mic === "unavailable") return;
      held = true;
      const mine = ++session;
      stopSpeaking();
      set({ mic: "starting", note: null });
      let rec: Recorder;
      try {
        rec = await recorderFactory();
      } catch {
        held = false;
        set({ mic: "unavailable", note: NOTE_UNAVAILABLE });
        return;
      }
      if (!held) {
        // The button was let go (or the Screen closed) while the browser asked for permission: nothing was said.
        rec.cancel();
        set({ mic: "idle" });
        return;
      }
      recorder = rec;
      rec.start();
      set({ mic: "recording" });
      timer = setTimeout(() => void finish(mine), maxClipMs);
    },
    async releaseTalk() {
      if (!held && recorder === null) return;
      if (recorder === null) {
        // Let go before the recording began: the press handler cancels it.
        held = false;
        return;
      }
      await finish(session);
    },
    destroy() {
      stopSpeaking();
      clearTimer();
      session++;
      recorder?.cancel();
      recorder = null;
      held = false;
    },
  };
}

/** The browser's recorder, or `null` when it has none. Checked by hand on a real device (task 10.3). */
export function browserRecorderFactory(): RecorderFactory | null {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return null;
  return async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const release = () => stream.getTracks().forEach((t) => t.stop());
    return {
      start: () => rec.start(),
      stop: () =>
        new Promise<Blob>((resolve, reject) => {
          rec.onstop = () => {
            release();
            resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
          };
          rec.onerror = () => {
            release();
            reject(new Error("recording failed"));
          };
          if (rec.state === "inactive") {
            release();
            resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
          } else rec.stop();
        }),
      cancel: release,
    };
  };
}

/** The browser's audio element, and a silent resume of the audio context inside a gesture. */
export function browserAudio(blob: Blob): { audio: AudioLike; release: () => void } {
  const url = URL.createObjectURL(blob);
  const el = new Audio(url);
  const audio: AudioLike = {
    play: () => el.play(),
    pause: () => el.pause(),
    get onended() {
      return el.onended as (() => void) | null;
    },
    set onended(handler) {
      el.onended = handler;
    },
  };
  return { audio, release: () => URL.revokeObjectURL(url) };
}

export async function browserUnlock(): Promise<void> {
  const g = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Context = g.AudioContext ?? g.webkitAudioContext;
  if (Context === undefined) return;
  const ctx = new Context();
  await ctx.resume();
}
