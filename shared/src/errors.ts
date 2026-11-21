/**
 * Stable error codes shared across the whole project.
 * HTTP mapping lives in api/src/routes — never here.
 */
export const ErrorCode = {
  // World pipeline: upload and sketch
  upload_too_large:        "upload_too_large",
  upload_too_small:        "upload_too_small",
  upload_bad_type:         "upload_bad_type",
  upload_bad_magic:        "upload_bad_magic",
  upload_rejected:         "upload_rejected",
  blank_sketch:            "blank_sketch",
  unsafe_image:            "unsafe_image",
  // World pipeline: confirm gate and spend
  bad_confirm:             "bad_confirm",
  confirm_expired:         "confirm_expired",
  turnstile_failed:        "turnstile_failed",
  world_gen_disabled:      "world_gen_disabled",
  quota_image:             "quota_image",
  quota_model:             "quota_model",
  quota_session:           "quota_session",
  quota_day:               "quota_day",
  quota_total:             "quota_total",
  spend_denied:            "spend_denied",
  // World pipeline: job and upstream
  upstream_rate_limited:   "upstream_rate_limited",
  upstream_rejected:       "upstream_rejected",
  upstream_no_credits:     "upstream_no_credits",
  ingest_failed:           "ingest_failed",
  timeout:                 "timeout",
  // World access
  world_not_found:         "world_not_found",
  // Party mode world check (walk radius below 7 m), not an upload size
  world_too_small:         "world_too_small",
  // Web shell
  shell_crash:             "shell_crash",
  network_error:           "network_error",
  session_expired:         "session_expired",
  bad_origin:              "bad_origin",
  // Conditions
  conditions_disabled:     "conditions_disabled",
  bad_place:               "bad_place",
  bad_memory_day:          "bad_memory_day",
  geocode_unavailable:     "geocode_unavailable",
  // Ghost voice
  voice_unavailable:       "voice_unavailable",
  clip_too_long:           "clip_too_long",
  clip_not_heard:          "clip_not_heard",
  stitch_not_on:           "stitch_not_on",
  stitch_no_consent:       "stitch_no_consent",
  stitch_check_limit:      "stitch_check_limit",
  live_unavailable:        "live_unavailable",
  // Ghost engine
  session_not_found:       "session_not_found",
  session_ended:           "session_ended",
  not_your_turn:           "not_your_turn",
  // Party mode
  party_disabled:          "party_disabled",
  rooms_full:              "rooms_full",
  room_unknown:            "room_unknown",
  room_full:               "room_full",
  game_started:            "game_started",
  bad_token:               "bad_token",
  rate_limited:            "rate_limited",
  not_in_zone:             "not_in_zone",
  already_suggested:       "already_suggested",
  bad_relic_token:         "bad_relic_token",
  moderation_unavailable:  "moderation_unavailable",
  photo_rejected:          "photo_rejected",
  not_master:              "not_master",
  world_not_set:           "world_not_set",
  poltergeist:             "poltergeist",
  cold_spot:               "cold_spot",
  already_inspected:       "already_inspected",
  eavesdrop_denied:        "eavesdrop_denied",
  // A refusal with a reason: sent as `code:reason`, the reason is one of `DENIAL_REASONS` in app/errors-copy.ts.
  nudge_denied:            "nudge_denied",
  cue_denied:              "cue_denied",
  frame_denied:            "frame_denied",
  rattle_denied:           "rattle_denied",
  stitch_denied:           "stitch_denied",
  // Puzzles
  puzzle_disabled:         "puzzle_disabled",
  puzzle_not_open:         "puzzle_not_open",
  puzzle_already_open:     "puzzle_already_open",
  puzzle_bad_transcript:   "puzzle_bad_transcript",
  puzzle_too_fast:         "puzzle_too_fast",
  puzzle_rate_limited:     "puzzle_rate_limited",
  puzzle_attempts_spent:   "puzzle_attempts_spent",
  puzzle_bad_placement:    "puzzle_bad_placement",
  sight_unknown:           "sight_unknown",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type Ok<T>   = { ok: true;  value: T };
export type Fail    = { ok: false; code: ErrorCode; message?: string };
export type Result<T> = Ok<T> | Fail;

export const ok   = <T>(value: T): Ok<T>     => ({ ok: true,  value });
export const fail = (code: ErrorCode, message?: string): Fail =>
  ({ ok: false, code, ...(message ? { message } : {}) });
