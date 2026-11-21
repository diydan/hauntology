import { decideSpeak, canSwitchSpeaking } from "./policy";
import { findLine, keepLine, type LineKind, type VoiceLine } from "./line";
import { hash } from "../puzzles/rng";
import { canonicalSpeechKey } from "./key";
import { prefetchPlan, type LibraryEntry, type PrefetchView } from "./library";
import { toVoiceLine } from "./to-line";
import type { LodgerVoice, Speaker } from "./voices";
import { emptyChecksState, type ChecksState } from "./stitch/check";
import { consentReduce, INITIAL_CONSENT_STATE, type StitchConsent } from "./stitch/consent";
import { stitchPublicEvent, stitchReveal, type PlayedStitch } from "./stitch/play";

/**
 * Pure PartyRoom voice + Stitch state helpers (ghost-voice 3.9 and 5.12).
 *
 * - Keeps room speech off by default; only the Master can toggle it (`canSwitchSpeaking`).
 * - Applies `decideSpeak` (`roomSpoken` counts only spoken non-empty lines, max 20, lines 15..19 reserved).
 * - Sends `{ t: "voice", lineId, text, kind }` strictly to the Host (never phones) and retains recent lines
 *   for 10 minutes (`keepLine`, `findLine`).
 * - Tracks room Stitch consents (`consentReduce`), checks, and played whispers without touching EngineState rules.
 */
export type HostVoiceMsg = {
  t: "voice";
  lineId: string;
  text: string;
  kind: LineKind;
};

export type RoomStitchState = {
  enabled: boolean;
  consents: StitchConsent[];
  checks: ChecksState;
  played: {
    round: number;
    game: number;
    lastSeat: number | null;
    list: PlayedStitch[];
  };
};

export type RoomVoiceState = {
  speechOn: boolean;
  spokenCount: number;
  voiceLines: VoiceLine[];
  /** The Library lines the Room listed for the Host to warm (ghost-voice 4.8), kept apart from the spoken ones so they never push a spoken line out of its 8 slots. */
  prefetchLines?: VoiceLine[];
  stitch: RoomStitchState;
};

export function initialRoomStitchState(): RoomStitchState {
  return {
    enabled: INITIAL_CONSENT_STATE.enabled,
    consents: [...INITIAL_CONSENT_STATE.consents],
    checks: emptyChecksState(),
    played: { round: 0, game: 0, lastSeat: null, list: [] },
  };
}

export function initialRoomVoiceState(): RoomVoiceState {
  return {
    speechOn: false,
    spokenCount: 0,
    voiceLines: [],
    stitch: initialRoomStitchState(),
  };
}

export function applyRoomSpeechToggle(
  state: RoomVoiceState,
  isMaster: boolean,
  on: boolean,
): { ok: true; state: RoomVoiceState } | { ok: false; code: "not_master" } {
  if (!canSwitchSpeaking("multi", isMaster ? "master" : "player")) {
    return { ok: false, code: "not_master" };
  }
  return { ok: true, state: { ...state, speechOn: on } };
}

export function prepareRoomNarration(
  state: RoomVoiceState,
  input: {
    id: string;
    kind: LineKind;
    speaker: Speaker;
    lodgerVoice?: LodgerVoice;
    text: string;
    playerText: readonly string[];
    now: number;
  },
): { state: RoomVoiceState; hostMsg: HostVoiceMsg | null } {
  const decision = decideSpeak({
    mode: "multi",
    switch: state.speechOn,
    kind: input.kind,
    roomSpoken: state.spokenCount,
  });
  if (!decision.speak) return { state, hostMsg: null };

  const line = toVoiceLine({
    id: input.id,
    text: input.text,
    kind: input.kind,
    speaker: input.speaker,
    ...(input.lodgerVoice !== undefined ? { lodgerVoice: input.lodgerVoice } : {}),
    playerText: input.playerText,
    now: input.now,
  });
  if (line === null || line.spoken === "") return { state, hostMsg: null };

  return {
    state: {
      ...state,
      spokenCount: state.spokenCount + 1,
      voiceLines: keepLine(state.voiceLines, line, input.now),
    },
    hostMsg: { t: "voice", lineId: line.id, text: line.text, kind: line.kind },
  };
}

export function findRoomVoiceLine(state: RoomVoiceState, lineId: string, now: number): VoiceLine | null {
  return findLine(state.voiceLines, lineId, now) ?? findLine(state.prefetchLines, lineId, now);
}

/** At most this many lines are listed at once, the Host's own cap (ghost-voice 4.8). */
export const ROOM_PREFETCH_MAX = 8;

/**
 * The lines the Host may warm ahead (ghost-voice 3.12, 4.8): while speaking is on, the Library lines `prefetchPlan` names for this public state (the
 * turn-start lines, the Haunt Event lines one level below a threshold, the midnight lines within the hour), each kept as a line of its own so the Host's
 * `speak {prefetch: true}` finds it, Library or cached audio only, never a paid call. Not the Lodger (six voices, and its lines are spoken only at the
 * reveal). The ids are derived from the speech key, so the same line keeps the same id and the message goes out only when the list changes.
 */
export function planRoomPrefetch(
  state: RoomVoiceState,
  view: PrefetchView,
  entries: readonly LibraryEntry[],
  now: number,
): { state: RoomVoiceState; hostMsg: { t: "prefetch"; lineIds: string[] } | null } {
  if (!state.speechOn) return { state, hostMsg: null };
  const wanted = new Set(prefetchPlan(view, entries.filter((e) => e.speaker !== "lodger")));
  const picked: VoiceLine[] = [];
  for (const e of entries) {
    if (picked.length >= ROOM_PREFETCH_MAX) break;
    if (e.speaker === "lodger") continue;
    const key = canonicalSpeechKey(e.voice, e.spoken);
    if (!wanted.has(key)) continue;
    wanted.delete(key);
    picked.push({ id: `pf-${hash(key).toString(36)}${hash(key, "2").toString(36)}`, kind: "narration", speaker: e.speaker, text: e.spoken, spoken: e.spoken, voice: e.voice, createdAt: now });
  }
  const ids = picked.map((l) => l.id);
  const had = (state.prefetchLines ?? []).map((l) => l.id);
  if (ids.length === had.length && ids.every((id, i) => id === had[i])) return { state, hostMsg: null };
  return { state: { ...state, prefetchLines: picked }, hostMsg: ids.length === 0 ? null : { t: "prefetch", lineIds: ids } };
}

export function applyStitchMasterSwitch(
  state: RoomVoiceState,
  actorIsMaster: boolean,
  on: boolean,
): { state: RoomVoiceState; deleteClipsFor: number[] | "all"; refused: boolean } {
  if (!actorIsMaster) return { state, deleteClipsFor: [], refused: true };
  const r = consentReduce(
    { enabled: state.stitch.enabled, consents: state.stitch.consents },
    { t: "master_switch", actorIsMaster, on },
  );
  return {
    state: {
      ...state,
      stitch: {
        ...state.stitch,
        enabled: r.state.enabled,
        consents: r.state.consents,
        checks: on ? state.stitch.checks : emptyChecksState(),
      },
    },
    deleteClipsFor: r.deleteClipsFor,
    refused: false,
  };
}

export function applyStitchAnswer(
  state: RoomVoiceState,
  input: { actorSeat: number; seat: number; isBot: boolean; yes: boolean; tick: boolean },
): { state: RoomVoiceState; deleteClipsFor: number[] | "all"; refused: boolean } {
  if (!state.stitch.enabled || input.isBot || input.actorSeat !== input.seat) {
    return { state, deleteClipsFor: [], refused: true };
  }
  const r = consentReduce(
    { enabled: state.stitch.enabled, consents: state.stitch.consents },
    { t: "answer", ...input },
  );
  return {
    state: { ...state, stitch: { ...state.stitch, consents: r.state.consents } },
    deleteClipsFor: r.deleteClipsFor,
    refused: false,
  };
}

export function applyStitchLeave(
  state: RoomVoiceState,
  seat: number,
): { state: RoomVoiceState; deleteClipsFor: number[] | "all" } {
  const r = consentReduce(
    { enabled: state.stitch.enabled, consents: state.stitch.consents },
    { t: "leave", seat },
  );
  return {
    state: { ...state, stitch: { ...state.stitch, consents: r.state.consents } },
    deleteClipsFor: r.deleteClipsFor,
  };
}

export function recordStitchPlayed(
  state: RoomVoiceState,
  event: PlayedStitch,
  clips: readonly unknown[],
): {
  state: RoomVoiceState;
  hostMsg: { t: "stitch"; eventId: string; subtitle: string; clips: readonly unknown[] };
  publicLog: { t: "stitch_log"; kind: "stitch"; text: "a voice whispered" };
  reveals: ReturnType<typeof stitchReveal>;
} {
  const nextList = [...state.stitch.played.list, event];
  return {
    state: {
      ...state,
      stitch: {
        ...state.stitch,
        played: {
          round: state.stitch.played.round + 1,
          game: state.stitch.played.game + 1,
          lastSeat: event.seat,
          list: nextList,
        },
      },
    },
    hostMsg: { t: "stitch", eventId: event.eventId, subtitle: event.subtitle, clips },
    publicLog: { t: "stitch_log", ...stitchPublicEvent() },
    reveals: stitchReveal(nextList),
  };
}
