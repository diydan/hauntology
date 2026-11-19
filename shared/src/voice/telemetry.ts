import { formatLog, type LogFields, type LogLevel } from "../log";

/**
 * Voice telemetry whitelist helpers (ghost-voice 2.16, Requirements 3.3 and 5.5).
 * Reuses `LOG_SCHEMA` & `formatLog` from `shared/src/log.ts` so every voice event emits
 * only whitelisted counters/codes and never audio, a transcript, a prompt, a word, or text.
 */
export const VOICE_LOG_EVENTS = [
  "voice.speak",
  "voice.listen",
  "voice.stitch.check",
  "voice.stitch.play",
  "voice.live",
] as const;

export type VoiceLogEvent = (typeof VOICE_LOG_EVENTS)[number];
export type VoiceLogFields<E extends VoiceLogEvent> = LogFields<E>;

export function formatVoiceLog<E extends VoiceLogEvent>(
  level: LogLevel,
  event: E,
  fields: VoiceLogFields<E>,
  now: number,
): string {
  return formatLog(level, event, fields, now);
}
