import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../../app/prop-config";
import { STITCH_GAME_CAP, STITCH_MIN_GAME_MS, STITCH_ROUND_CAP } from "../limits";
import type { StitchClip } from "./compose";
import { stitchEligible, stitchPublicEvent, stitchReveal, type StitchEventKind } from "./play";
import { CLIP_TTL_MS, nextPurgeAt, purgeClips } from "./purge";
import { clipArb, seatArb } from "./stitch.arb";

const okClip = (seat: number, word: string, recordedAt = 1_000): StitchClip => ({
  seat,
  word,
  bytes: new Uint8Array([1, 2, 3]),
  durationMs: 900,
  recordedAt,
  contentType: "audio/webm",
});

describe("Property 11: Stitch is rare and is deleted at the end or after 6 hours", () => {
  // Feature: ghost-voice, Property 11: Stitch is rare and is deleted at the end or after 6 hours
  // Validates: Requirements 5.4, 5.5
  it("stitchEligible checks moment, >= 60s elapsed, no Accusation, caps, non-repeat seat, effective consent, and whole template", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<StitchEventKind>("haunt_event", "midnight", "other"),
        fc.integer({ min: 0, max: 180_000 }),
        fc.boolean(),
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 0, max: 3 }),
        fc.option(seatArb, { nil: null }),
        fc.boolean(),
        fc.double({ min: 0, max: 0.9999, noNaN: true }),
        (kind, gameElapsedMs, accusationActive, roundStitches, gameStitches, lastSeat, enabled, roll) => {
          const seats = [
            { seat: 0, consent: { seat: 0, yes: true, ageOrGuardianTick: true }, clips: [okClip(0, "wait"), okClip(0, "here")] },
            { seat: 1, consent: { seat: 1, yes: true, ageOrGuardianTick: true }, clips: [okClip(1, "cold"), okClip(1, "tonight")] },
            { seat: 2, consent: { seat: 2, yes: false, ageOrGuardianTick: true }, clips: [okClip(2, "wait"), okClip(2, "here")] },
          ];

          const res = stitchEligible(
            { kind, gameElapsedMs, accusationActive, roundStitches, gameStitches, lastSeat, seats, enabled },
            () => roll,
          );

          const shouldAllow =
            enabled &&
            (kind === "haunt_event" || kind === "midnight") &&
            gameElapsedMs >= STITCH_MIN_GAME_MS &&
            !accusationActive &&
            roundStitches < STITCH_ROUND_CAP &&
            gameStitches < STITCH_GAME_CAP;

          expect(res.ok).toBe(shouldAllow);
          if (res.ok) {
            expect(res.seat).not.toBe(lastSeat);
            expect([0, 1]).toContain(res.seat);
          }

          // When the only ready seat was also the last seat to whisper, stitch is refused.
          const repeatOnly = stitchEligible(
            {
              kind: "haunt_event",
              gameElapsedMs: STITCH_MIN_GAME_MS,
              accusationActive: false,
              roundStitches: 0,
              gameStitches: 0,
              lastSeat: 0,
              seats: [seats[0]!],
              enabled: true,
            },
            () => 0,
          );
          expect(repeatOnly.ok).toBe(false);

          expect(stitchPublicEvent()).toEqual({ kind: "stitch", text: "a voice whispered" });
          const reveal = stitchReveal([{ eventId: "e1", seat: 1, templateId: "tpl-4", subtitle: "cold tonight", at: 90_000 }]);
          expect(reveal).toEqual([{ eventId: "e1", seat: 1, templateId: "tpl-4", subtitle: "cold tonight", at: 90_000 }]);
        },
      ),
      propParams(),
    );
  });

  it("purgeClips drops clips at game end, switch off, leave/withdraw, or >= 6 hours old and nextPurgeAt returns earliest expiry", () => {
    fc.assert(
      fc.property(
        fc.array(clipArb, { minLength: 0, maxLength: 20 }),
        fc.boolean(),
        fc.boolean(),
        fc.integer({ min: 1_000, max: 30_000_000 }),
        (clips, gameOver, enabled, now) => {
          const activeSeats = new Set([0, 1, 2]);
          const consents = [
            { seat: 0, yes: true, ageOrGuardianTick: true },
            { seat: 1, yes: true, ageOrGuardianTick: false },
          ];

          const kept = purgeClips(clips, { gameOver, enabled, activeSeats, consents }, now);
          if (gameOver || !enabled) {
            expect(kept).toEqual([]);
          } else {
            for (const c of kept) {
              expect(c.seat).toBe(0);
              expect(now - c.recordedAt).toBeLessThan(CLIP_TTL_MS);
            }
          }

          const alarmAt = nextPurgeAt(kept);
          if (kept.length === 0) {
            expect(alarmAt).toBeNull();
          } else {
            expect(alarmAt).toBe(Math.min(...kept.map((c) => c.recordedAt + CLIP_TTL_MS)));
          }
        },
      ),
      propParams(),
    );
  });
});
