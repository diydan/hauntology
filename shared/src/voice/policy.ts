import { VOICE_ROOM_LATE_AT, VOICE_ROOM_LINE_CAP } from "./limits";
import type { LineKind } from "./line";

/**
 * The speaking policy (ghost-voice 2.8, Requirements 2.1, 2.2, 2.3, 2.4). Pure.
 *
 * - Single player starts with speaking on until the visitor switches it off.
 * - Multiplayer starts with speaking off until the Master switches it on.
 * - In Multiplayer, at most 20 lines may be spoken in a room, and from the 15th spoken line onward,
 *   only key moments (`haunt_event`, `midnight`, `ending`) are spoken (`narration` is skipped as `late_line`).
 */
export type SpeakMode = "single" | "multi";
export type SpeakActor = "visitor" | "master" | "player";

export type SpeakInput = {
  mode: SpeakMode;
  switch: boolean | null;
  kind: LineKind;
  roomSpoken: number;
};

export type SpeakDecision = { speak: true } | { speak: false; reason: "off" | "room_cap" | "late_line" };

const LATE_ALLOWED: ReadonlySet<LineKind> = new Set(["haunt_event", "midnight", "ending"]);

export function decideSpeak(i: SpeakInput): SpeakDecision {
  const on = i.switch ?? (i.mode === "single");
  if (!on) return { speak: false, reason: "off" };
  if (i.mode === "multi") {
    if (i.roomSpoken >= VOICE_ROOM_LINE_CAP) return { speak: false, reason: "room_cap" };
    if (i.roomSpoken >= VOICE_ROOM_LATE_AT && !LATE_ALLOWED.has(i.kind)) return { speak: false, reason: "late_line" };
  }
  return { speak: true };
}

export function canSwitchSpeaking(mode: SpeakMode, actor: SpeakActor): boolean {
  return mode === "single" ? actor === "visitor" : actor === "master";
}
