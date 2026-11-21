import { describe, expect, it } from "vitest";
import { ErrorCode, fail, ok } from "./errors";

describe("ErrorCode", () => {
  it("has every value equal to its key", () => {
    for (const [key, value] of Object.entries(ErrorCode)) {
      expect(value).toBe(key);
    }
  });

  it("has the codes the web shell depends on", () => {
    expect(ErrorCode.shell_crash).toBe("shell_crash");
    expect(ErrorCode.session_expired).toBe("session_expired");
    expect(ErrorCode.world_not_found).toBe("world_not_found");
  });

  it("has every code named in the world-pipeline error list", () => {
    const names = [
      "upload_bad_type", "upload_too_large", "upload_too_small", "upload_bad_magic",
      "blank_sketch", "quota_session", "quota_day", "quota_total", "world_gen_disabled",
      "unsafe_image", "moderation_unavailable", "bad_confirm", "confirm_expired",
      "turnstile_failed", "upstream_rate_limited", "upstream_rejected",
      "upstream_no_credits", "ingest_failed", "timeout",
    ];
    for (const name of names) expect(Object.keys(ErrorCode)).toContain(name);
  });

  it("has the puzzle codes of the puzzles spec", () => {
    for (const name of [
      "puzzle_disabled", "puzzle_not_open", "puzzle_already_open", "puzzle_bad_transcript", "puzzle_too_fast",
      "puzzle_rate_limited", "puzzle_attempts_spent", "puzzle_bad_placement", "sight_unknown",
    ]) expect(Object.keys(ErrorCode)).toContain(name);
  });

  it("keeps the party meaning of world_too_small apart from the upload size code", () => {
    expect(ErrorCode.world_too_small).not.toBe(ErrorCode.upload_too_small);
  });
});

describe("ErrorCode is stable (world-pipeline 3.1)", () => {
  // A code is what a client matches on, so it is never renamed or dropped. Adding one means adding it here too, on purpose.
  const PINNED = [
    "already_suggested", "bad_confirm", "bad_memory_day", "bad_origin", "bad_place", "bad_relic_token", "bad_token",
    "blank_sketch", "clip_not_heard", "clip_too_long", "conditions_disabled", "confirm_expired", "game_started", "geocode_unavailable",
    "ingest_failed", "live_unavailable", "moderation_unavailable", "network_error", "not_in_zone", "not_your_turn", "party_disabled",
    "puzzle_already_open", "puzzle_attempts_spent", "puzzle_bad_placement", "puzzle_bad_transcript", "puzzle_disabled",
    "puzzle_not_open", "puzzle_rate_limited", "puzzle_too_fast", "quota_day", "quota_image", "quota_model", "quota_session",
    "quota_total", "rate_limited", "room_full", "room_unknown", "rooms_full", "session_ended", "session_expired", "session_not_found",
    "shell_crash", "sight_unknown", "spend_denied", "stitch_check_limit", "stitch_no_consent", "stitch_not_on", "timeout",
    "turnstile_failed", "unsafe_image", "upload_bad_magic", "upload_bad_type", "upload_rejected", "upload_too_large",
    "upload_too_small", "upstream_no_credits", "upstream_rate_limited", "upstream_rejected", "voice_unavailable", "world_gen_disabled",
    "world_not_found", "world_too_small",
    // party-mode 2.71
    "already_inspected", "cold_spot", "cue_denied", "eavesdrop_denied", "frame_denied", "not_master", "nudge_denied", "photo_rejected",
    "poltergeist", "rattle_denied", "stitch_denied", "world_not_set",
  ];

  it("is exactly this list: no code is renamed or dropped, and none is added without saying so here", () => {
    expect(Object.keys(ErrorCode).sort()).toEqual([...PINNED].sort());
  });

  it("is made of lower-case words joined by underscores, each one once", () => {
    const names = Object.keys(ErrorCode);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(Object.values(ErrorCode)).size).toBe(names.length);
    for (const name of names) expect(name, name).toMatch(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/);
  });
});

describe("Result helpers", () => {
  it("ok wraps a value", () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
  });

  it("fail carries the code and omits an empty message", () => {
    expect(fail(ErrorCode.timeout)).toEqual({ ok: false, code: "timeout" });
    expect(fail(ErrorCode.timeout, "slow")).toEqual({ ok: false, code: "timeout", message: "slow" });
  });
});
