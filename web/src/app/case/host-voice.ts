import type { ApiResult } from "@hauntology/shared/app/api";
import { SPEECH_DEADLINE_MS } from "@hauntology/shared/voice/limits";
import { createAudioPrefetcher, type AudioPrefetcher } from "../voice/prefetch";
import type { AudioLike } from "../play/voice";

/**
 * Host audio + subtitle + prefetch controller (ghost-voice 4.6 and 4.8).
 *
 * Requires an explicit unlock tap before playing audio; before unlock, shows Subtitles only
 * in the polite live region. Checks in-memory prefetched audio first, fetches `/api/voice/speak`
 * with the Host token within 5,000 ms (`SPEECH_DEADLINE_MS`), drops late audio, and falls back
 * silently to optional browser `speechSynthesis` and the Subtitle.
 */
export type HostVoiceCue = {
  lineId: string;
  text: string;
  kind: string;
};

export type HostAudioDeps = {
  roomCode: string;
  hostToken: string;
  fetchSpeech: (req: { roomCode: string; lineId: string; prefetch?: boolean }, hostToken: string) => Promise<ApiResult<{ audio: Blob }>>;
  createAudio: (blob: Blob) => { audio: AudioLike; release: () => void };
  decodePrefetch?: (blob: Blob) => Promise<Blob>;
  onSubtitle: (text: string) => void;
  fallbackSpeak?: (text: string) => boolean;
  unlockAudio?: () => Promise<void>;
  deadlineMs?: number;
};

export type HostAudio = {
  isUnlocked(): boolean;
  unlock(): void;
  onVoiceCue(cue: HostVoiceCue): Promise<boolean>;
  prefetch(lineIds: readonly string[]): Promise<void>;
  stop(): void;
  dispose(): void;
};

export function createHostAudio(deps: HostAudioDeps): HostAudio {
  const deadlineMs = deps.deadlineMs ?? SPEECH_DEADLINE_MS;
  const prefetcher: AudioPrefetcher<Blob> = createAudioPrefetcher({
    fetchPrefetch: (lineId) => deps.fetchSpeech({ roomCode: deps.roomCode, lineId, prefetch: true }, deps.hostToken),
    decode: deps.decodePrefetch ?? (async (b) => b),
  });

  let unlocked = false;
  let active = true;
  let current: { audio: AudioLike; release: () => void } | null = null;

  const stop = () => {
    if (current === null) return;
    const { audio, release } = current;
    current = null;
    audio.onended = null;
    audio.pause();
    release();
  };

  return {
    isUnlocked: () => unlocked,
    unlock() {
      if (unlocked) return;
      unlocked = true;
      void (deps.unlockAudio?.() ?? Promise.resolve()).catch(() => {
        unlocked = false;
      });
    },
    async onVoiceCue(cue) {
      deps.onSubtitle(cue.text);
      if (!unlocked || !active) return false;

      let blob = prefetcher.get(cue.lineId);
      if (blob === null) {
        let timedOut = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const got = await Promise.race([
          deps.fetchSpeech({ roomCode: deps.roomCode, lineId: cue.lineId }, deps.hostToken),
          new Promise<null>((resolve) => {
            timer = setTimeout(() => {
              timedOut = true;
              resolve(null);
            }, deadlineMs);
          }),
        ]);
        if (timer !== null) clearTimeout(timer);
        if (timedOut || !active || got === null || !got.ok) {
          deps.fallbackSpeak?.(cue.text);
          return false;
        }
        blob = got.value.audio;
      }

      if (!active || !unlocked) return false;
      stop();
      const made = deps.createAudio(blob);
      current = made;
      made.audio.onended = () => {
        if (current === made) {
          current = null;
          made.release();
        }
      };
      try {
        await made.audio.play();
        return true;
      } catch {
        if (current === made) {
          current = null;
          made.release();
        }
        deps.fallbackSpeak?.(cue.text);
        return false;
      }
    },
    async prefetch(lineIds) {
      if (!active) return;
      await prefetcher.warm(lineIds);
    },
    stop,
    dispose() {
      active = false;
      stop();
      prefetcher.clear();
    },
  };
}
