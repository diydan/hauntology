/**
 * Named limits and caps for the ghost's voice (ghost-voice design, "Budget meters and variables").
 * The 200-character input cap and 1.5-second turn gap are imported from `shared/src/ghost/`.
 */
import { INPUT_MAX } from "../ghost/parse";
import { TURN_GAP_MS } from "../ghost/rate";
import { VOICE_LINE_TTL_MS, VOICE_LINES_KEPT } from "./line";
import { MAX_SPOKEN_CHARS } from "./speakable";

export { INPUT_MAX, MAX_SPOKEN_CHARS, TURN_GAP_MS, VOICE_LINE_TTL_MS, VOICE_LINES_KEPT };

/** No step in the Fallback Chain may start after, or return audio after, 5 seconds. */
export const SPEECH_DEADLINE_MS = 5_000;

/** Speech cache objects in R2 expire after 60 days. */
export const CACHE_MAX_AGE_DAYS = 60;

/** Multiplayer room speech limits: 20 spoken lines total, with lines 15..19 reserved for key moments. */
export const VOICE_ROOM_LINE_CAP = 20;
export const VOICE_ROOM_LATE_AT = 15;

/** Single-player recording & Stitch limits. */
export const LISTEN_MAX_MS = 8_000;
export const WORD_BANK_MAX_WORDS = 12;
export const CLIP_MAX_MS = 2_000;
export const CLIP_MAX_RETRIES = 2;
export const STITCH_PLAYER_CHECKS = 30;
export const STITCH_ROOM_CHECKS = 120;
export const STITCH_MIN_GAME_MS = 60_000;
export const STITCH_ROUND_CAP = 1;
export const STITCH_GAME_CAP = 2;
export const CLIP_TTL_HOURS = 6;

/** Live Mode limits. */
export const LIVE_SILENCE_MS = 10_000;
export const LIVE_SLICE_MS = 10_000;
export const LIVE_SESSION_SLICES = 30;
export const LIVE_DAY_SLICES = 180;
