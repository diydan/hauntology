import { validateGhostReply } from "../ghost/narration";
import { LIVE_DAY_SLICES, LIVE_SESSION_SLICES, LIVE_SILENCE_MS, LIVE_SLICE_MS } from "./limits";
import type { SpeakMode } from "./policy";
import { toVoiceLine } from "./to-line";
import type { LodgerVoice, Speaker } from "./voices";

/**
 * Pure Live Mode state machine and sentence validation (ghost-voice 6.1 & 6.4, Requirements 6.1 to 6.3).
 *
 * Transport-independent reducer: enforces 10-second slices bought one at a time (30 per session,
 * 180 per day), 10-second silence cutoff, immediate stop on user `stop` or `hidden`, no Multiplayer
 * mode, hold-to-talk fallback on every problem/stop, and no effect that stores audio.
 */
export type LivePhase = "idle" | "listening" | "thinking" | "speaking" | "stopped";

export type LiveStop =
  | "silence"
  | "stop"
  | "hidden"
  | "session_cap"
  | "day_cap"
  | "denied"
  | "kill"
  | "transport"
  | "mic"
  | "unsupported";

export type LiveState = {
  phase: LivePhase;
  stop?: LiveStop;
  since: number;
  lastVoiceAt: number | null;
  usedMs: number;
  sliceEndsAt: number;
  slicesUsed: number;
};

export type LiveEvent =
  | { t: "start"; mode: SpeakMode; speakingOn: boolean; daySlicesUsed?: number }
  | { t: "voice" }
  | { t: "tick"; daySlicesUsed?: number }
  | { t: "utterance_end" }
  | { t: "reply_sentence"; text: string }
  | { t: "reply_done" }
  | { t: "stop" }
  | { t: "hidden" }
  | { t: "slice_granted" }
  | { t: "slice_denied"; reason?: "denied" | "kill" | "session_cap" | "day_cap" }
  | { t: "transport_error" }
  | { t: "mic_error" };

export type LiveEffect =
  | { t: "open_mic" }
  | { t: "close_mic" }
  | { t: "reserve_slice" }
  | { t: "speak_sentence"; text: string }
  | { t: "show_hold_to_talk" };

export function initialLiveState(now = 0): LiveState {
  return {
    phase: "idle",
    since: now,
    lastVoiceAt: null,
    usedMs: 0,
    sliceEndsAt: 0,
    slicesUsed: 0,
  };
}

function stopWith(state: LiveState, reason: LiveStop, now: number): { state: LiveState; effects: LiveEffect[] } {
  const wasMicOpen = state.phase === "listening";
  const effects: LiveEffect[] = [];
  if (wasMicOpen) effects.push({ t: "close_mic" });
  effects.push({ t: "show_hold_to_talk" });
  return {
    state: {
      ...state,
      phase: "stopped",
      stop: reason,
      since: now,
    },
    effects,
  };
}

export function liveReduce(
  state: LiveState,
  event: LiveEvent,
  now: number,
  caps: { sessionSlices?: number; daySlices?: number } = {},
): { state: LiveState; effects: LiveEffect[] } {
  const maxSessionSlices = caps.sessionSlices ?? LIVE_SESSION_SLICES;
  const maxDaySlices = caps.daySlices ?? LIVE_DAY_SLICES;

  switch (event.t) {
    case "start": {
      if (state.phase === "stopped") return { state, effects: [] };
      if (event.mode === "multi" || !event.speakingOn) {
        return stopWith(state, "unsupported", now);
      }
      if (state.slicesUsed >= maxSessionSlices) return stopWith(state, "session_cap", now);
      if ((event.daySlicesUsed ?? 0) >= maxDaySlices) return stopWith(state, "day_cap", now);
      return {
        state: { ...state, since: now },
        effects: [{ t: "reserve_slice" }],
      };
    }

    case "slice_granted": {
      if (state.phase === "stopped") return { state, effects: [] };
      const nextSlices = state.slicesUsed + 1;
      if (nextSlices > maxSessionSlices) return stopWith(state, "session_cap", now);
      const nextUsedMs = Math.min(maxSessionSlices * LIVE_SLICE_MS, state.usedMs + LIVE_SLICE_MS);
      const openMic = state.phase === "idle" || state.phase === "speaking";
      const effects: LiveEffect[] = openMic ? [{ t: "open_mic" }] : [];
      return {
        state: {
          ...state,
          phase: openMic ? "listening" : state.phase,
          lastVoiceAt: openMic ? null : state.lastVoiceAt,
          since: openMic ? now : state.since,
          usedMs: nextUsedMs,
          slicesUsed: nextSlices,
          sliceEndsAt: now + LIVE_SLICE_MS,
        },
        effects,
      };
    }

    case "voice": {
      if (state.phase !== "listening") return { state, effects: [] };
      return {
        state: { ...state, lastVoiceAt: now },
        effects: [],
      };
    }

    case "tick": {
      if (state.phase === "idle" || state.phase === "stopped") return { state, effects: [] };
      if (state.phase === "listening") {
        const lastActive = Math.max(state.since, state.lastVoiceAt ?? state.since);
        if (now - lastActive >= LIVE_SILENCE_MS) {
          return stopWith(state, "silence", now);
        }
      }
      if (now >= state.sliceEndsAt) {
        if (state.slicesUsed >= maxSessionSlices) return stopWith(state, "session_cap", now);
        if ((event.daySlicesUsed ?? 0) >= maxDaySlices) return stopWith(state, "day_cap", now);
        return { state, effects: [{ t: "reserve_slice" }] };
      }
      return { state, effects: [] };
    }

    case "utterance_end": {
      if (state.phase !== "listening") return { state, effects: [] };
      return {
        state: { ...state, phase: "thinking", since: now },
        effects: [{ t: "close_mic" }],
      };
    }

    case "reply_sentence": {
      if (state.phase !== "thinking" && state.phase !== "speaking") return { state, effects: [] };
      return {
        state: { ...state, phase: "speaking", since: now },
        effects: [{ t: "speak_sentence", text: event.text }],
      };
    }

    case "reply_done": {
      if (state.phase !== "thinking" && state.phase !== "speaking") return { state, effects: [] };
      return {
        state: { ...state, phase: "listening", since: now, lastVoiceAt: null },
        effects: [{ t: "open_mic" }],
      };
    }

    case "stop":
      return stopWith(state, "stop", now);
    case "hidden":
      return stopWith(state, "hidden", now);
    case "slice_denied":
      return stopWith(state, event.reason ?? "denied", now);
    case "transport_error":
      return stopWith(state, "transport", now);
    case "mic_error":
      return stopWith(state, "mic", now);
  }
}

/**
 * Checks a streamed Live Mode sentence through `toVoiceLine` (ghost-engine `validateGhostReply`,
 * <= 240 characters, free of player text); if rejected or unspeakable, replaces the remainder with a
 * validated scripted line.
 */
export function checkLiveSentence(input: {
  id: string;
  sentence: string;
  speaker: Speaker;
  lodgerVoice?: LodgerVoice;
  playerText: readonly string[];
  fallbackScripted: string;
  now: number;
}): { spoken: string; subtitle: string; replaced: boolean } {
  const checked = toVoiceLine({
    id: input.id,
    text: input.sentence,
    kind: "narration",
    speaker: input.speaker,
    ...(input.lodgerVoice !== undefined ? { lodgerVoice: input.lodgerVoice } : {}),
    playerText: input.playerText,
    now: input.now,
  });

  if (checked !== null && checked.spoken !== "" && validateGhostReply(checked.spoken).ok) {
    return { spoken: checked.spoken, subtitle: checked.text, replaced: false };
  }

  const fallback = toVoiceLine({
    id: `${input.id}-fb`,
    text: input.fallbackScripted,
    kind: "narration",
    speaker: input.speaker,
    ...(input.lodgerVoice !== undefined ? { lodgerVoice: input.lodgerVoice } : {}),
    playerText: input.playerText,
    now: input.now,
  });
  const safe = fallback?.spoken || "The air grows quiet.";
  return { spoken: safe, subtitle: fallback?.text ?? safe, replaced: true };
}
