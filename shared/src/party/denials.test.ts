import { describe, expect, it } from "vitest";
import { ErrorCode } from "../errors";
import { DENIAL_REASONS, denialCopy, ERROR_COPY } from "../app/errors-copy";
import type { CueRefusal, FrameRefusal } from "./cues";
import type { NudgeReason } from "./nudge";
import type { RattleRefusal } from "./rattle";

// Every refusal reason of the party code has a plain line: the lists below are typed against the real unions, so a new reason without
// a line here (or a line without a reason) fails to compile or fails the check.
const NUDGE: Record<NudgeReason, true> = { no_clock: true, own_turn: true, bot: true, spook_off: true, nudges_off: true, no_resolve: true, help_turn_limit: true, spook_turn_limit: true, clock_at_cap: true, spook_time_left: true, spook_turn_too_short: true, spook_round_limit: true, spook_gap: true, spook_repeat: true };
const CUE: Record<CueRefusal, true> = { own_turn: true, bot: true, cue_gap: true, too_many_playing: true, turn_cue_limit: true };
const FRAME: Record<FrameRefusal, true> = { frames_off: true, own_turn: true, self: true, no_consent: true, phone_busy: true, sender_round_limit: true, target_round_limit: true, cue_limit: true, bot: true };
const RATTLE: Record<RattleRefusal, true> = { rattle_off: true, bot: true, not_poltergeist: true, rattle_not_on: true, cue_gap: true, too_many_playing: true, turn_cue_limit: true };

describe("party error codes and denial reasons (2.71)", () => {
  it("has every code of the design's error list, and copy for each", () => {
    for (const code of ["party_disabled", "rooms_full", "world_too_small", "room_unknown", "room_full", "game_started", "bad_token", "rate_limited", "photo_rejected", "quota_image", "moderation_unavailable", "not_your_turn", "not_in_zone", "already_suggested", "bad_relic_token", "not_master", "world_not_set", "poltergeist", "cold_spot", "already_inspected", "eavesdrop_denied", "nudge_denied", "cue_denied", "frame_denied", "rattle_denied", "stitch_denied"]) {
      expect(Object.keys(ErrorCode), code).toContain(code);
      expect(ERROR_COPY[code as keyof typeof ERROR_COPY].title.length, code).toBeGreaterThan(0);
    }
  });
  it("has a plain line for every reason a nudge, cue, frame or rattle can be refused for", () => {
    for (const r of [...Object.keys(NUDGE), ...Object.keys(CUE), ...Object.keys(FRAME), ...Object.keys(RATTLE)]) expect(DENIAL_REASONS, r).toHaveProperty(r);
  });
  it("has a plain line for each reason Stitch gives", () => {
    for (const r of ["disabled", "wrong_moment", "too_early", "accusation_active", "round_cap", "game_cap", "no_eligible_seat"]) expect(DENIAL_REASONS, r).toHaveProperty(r);
  });
  it("shows the reason's line for `code:reason`, the code's own copy for a code alone or an unknown reason, and never the server's words", () => {
    expect(denialCopy("nudge_denied:spook_round_limit").body).toBe("A Spook was already used this round.");
    expect(denialCopy("nudge_denied:spook_round_limit").title).toBe(ERROR_COPY.nudge_denied.title);
    expect(denialCopy("nudge_denied")).toEqual(ERROR_COPY.nudge_denied);
    expect(denialCopy("nudge_denied:<script>")).toEqual(ERROR_COPY.nudge_denied);
    expect(denialCopy("nudge_denied:__proto__")).toEqual(ERROR_COPY.nudge_denied);
    expect(denialCopy("nope:cue_gap").title).toBe("Something went wrong");
  });
  it("keeps the reason lines short, plain and free of digits and markup", () => {
    for (const line of Object.values(DENIAL_REASONS)) { expect(line.length).toBeLessThanOrEqual(60); expect(line).not.toMatch(/[<>{}0-9]/); }
  });
});
