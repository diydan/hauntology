import { z } from "zod";
import {
  STITCH_PLAYER_CHECKS,
  STITCH_ROOM_CHECKS,
  VOICE_LIVE_DAY_SECONDS,
  VOICE_LIVE_SESSION_SECONDS,
  VOICE_ROOM_LINE_CAP,
  VOICE_STT_DAY_CAP,
  VOICE_STT_SESSION_CAP,
  VOICE_TTS_DAY_CAP,
  VOICE_TTS_SESSION_CAP,
} from "./limits";

/**
 * Runtime configuration for Ghost Voice (`ghost-voice` 2.1, design "Budget meters and variables").
 * Parses `VOICE_*` environment variables with `zod`, falls back per field to spec defaults when missing
 * or invalid, and never allows `roomLineCap` above `VOICE_ROOM_LINE_CAP` (20).
 */
export type VoiceConfig = Readonly<{
  enabled: boolean;
  ttsModel: string;
  ttsFallbackModel: string;
  sttModel: string;
  ttsSessionCap: number;
  ttsDayCap: number;
  sttSessionCap: number;
  sttDayCap: number;
  roomLineCap: number;
  stitchEnabled: boolean;
  stitchPlayerChecks: number;
  stitchRoomChecks: number;
  liveEnabled: boolean;
  liveSessionSeconds: number;
  liveDaySeconds: number;
}>;

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  enabled: true,
  ttsModel: "inworld/tts-2",
  ttsFallbackModel: "@cf/deepgram/aura-2-en",
  sttModel: "@cf/openai/whisper-large-v3-turbo",
  ttsSessionCap: VOICE_TTS_SESSION_CAP,
  ttsDayCap: VOICE_TTS_DAY_CAP,
  sttSessionCap: VOICE_STT_SESSION_CAP,
  sttDayCap: VOICE_STT_DAY_CAP,
  roomLineCap: VOICE_ROOM_LINE_CAP,
  stitchEnabled: true,
  stitchPlayerChecks: STITCH_PLAYER_CHECKS,
  stitchRoomChecks: STITCH_ROOM_CHECKS,
  liveEnabled: false,
  liveSessionSeconds: VOICE_LIVE_SESSION_SECONDS,
  liveDaySeconds: VOICE_LIVE_DAY_SECONDS,
};

const boolSchema = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (t === "true" || t === "1") return true;
    if (t === "false" || t === "0") return false;
  }
  return undefined;
}, z.boolean());

const wholeSchema = z.preprocess((v) => {
  if (typeof v === "number") return Number.isSafeInteger(v) && v >= 0 ? v : undefined;
  if (typeof v === "string") {
    const t = v.trim();
    if (!/^\d+$/.test(t)) return undefined;
    const n = Number(t);
    return Number.isSafeInteger(n) && n >= 0 ? n : undefined;
  }
  return undefined;
}, z.number().int().nonnegative());

const nonEmptyStringSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined),
  z.string().min(1),
);

function fieldOrDefault<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: unknown, fallback: T): T {
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : fallback;
}

export function parseVoiceConfig(env: Record<string, unknown> | undefined): VoiceConfig {
  const e = env ?? {};
  const d = DEFAULT_VOICE_CONFIG;
  const rawRoomCap = fieldOrDefault(wholeSchema, e["VOICE_ROOM_LINE_CAP"], d.roomLineCap);
  return {
    enabled: fieldOrDefault(boolSchema, e["VOICE_ENABLED"], d.enabled),
    ttsModel: fieldOrDefault(nonEmptyStringSchema, e["VOICE_TTS_MODEL_ID"], d.ttsModel),
    ttsFallbackModel: fieldOrDefault(nonEmptyStringSchema, e["VOICE_TTS_FALLBACK_MODEL_ID"], d.ttsFallbackModel),
    sttModel: fieldOrDefault(nonEmptyStringSchema, e["VOICE_STT_MODEL_ID"], d.sttModel),
    ttsSessionCap: fieldOrDefault(wholeSchema, e["VOICE_TTS_SESSION_CAP"], d.ttsSessionCap),
    ttsDayCap: fieldOrDefault(wholeSchema, e["VOICE_TTS_DAY_CAP"], d.ttsDayCap),
    sttSessionCap: fieldOrDefault(wholeSchema, e["VOICE_STT_SESSION_CAP"], d.sttSessionCap),
    sttDayCap: fieldOrDefault(wholeSchema, e["VOICE_STT_DAY_CAP"], d.sttDayCap),
    roomLineCap: Math.min(VOICE_ROOM_LINE_CAP, rawRoomCap),
    stitchEnabled: fieldOrDefault(boolSchema, e["VOICE_STITCH_ENABLED"], d.stitchEnabled),
    stitchPlayerChecks: fieldOrDefault(wholeSchema, e["VOICE_STITCH_PLAYER_CHECKS"], d.stitchPlayerChecks),
    stitchRoomChecks: fieldOrDefault(wholeSchema, e["VOICE_STITCH_ROOM_CHECKS"], d.stitchRoomChecks),
    liveEnabled: fieldOrDefault(boolSchema, e["VOICE_LIVE_ENABLED"], d.liveEnabled),
    liveSessionSeconds: fieldOrDefault(wholeSchema, e["VOICE_LIVE_SESSION_SECONDS"], d.liveSessionSeconds),
    liveDaySeconds: fieldOrDefault(wholeSchema, e["VOICE_LIVE_DAY_SECONDS"], d.liveDaySeconds),
  };
}
