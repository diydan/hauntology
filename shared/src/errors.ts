/**
 * Stable error codes shared across the whole project.
 * HTTP mapping lives in api/src/routes — never here.
 */
export const ErrorCode = {
  // World pipeline
  upload_too_large:        "upload_too_large",
  upload_bad_type:         "upload_bad_type",
  upload_rejected:         "upload_rejected",
  world_gen_disabled:      "world_gen_disabled",
  world_not_found:         "world_not_found",
  world_too_small:         "world_too_small",
  quota_image:             "quota_image",
  quota_model:             "quota_model",
  spend_denied:            "spend_denied",
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
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type Ok<T>   = { ok: true;  value: T };
export type Fail    = { ok: false; code: ErrorCode; message?: string };
export type Result<T> = Ok<T> | Fail;

export const ok   = <T>(value: T): Ok<T>     => ({ ok: true,  value });
export const fail = (code: ErrorCode, message?: string): Fail =>
  ({ ok: false, code, ...(message ? { message } : {}) });
