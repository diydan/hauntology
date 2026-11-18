import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../../app/prop-config";
import { CLIP_MAX_RETRIES, STITCH_PLAYER_CHECKS, STITCH_ROOM_CHECKS } from "../limits";
import { canCheck, emptyChecksState, heardWord, recordCheck } from "./check";
import type { StitchConsent } from "./consent";
import { seatArb, wordArb } from "./stitch.arb";

describe("Property 10: Word checks obey their limits", () => {
  // Feature: ghost-voice, Property 10: Word checks obey their limits
  // Validates: Requirements 5.2
  it("heardWord matches only the exact asked single word ignoring case and punctuation", () => {
    fc.assert(
      fc.property(
        wordArb,
        fc.constantFrom("", "!", "?", "...", "  "),
        fc.constantFrom(false, true),
        (word, punct, upper) => {
          const clean = (upper ? word.toUpperCase() : word) + punct;
          expect(heardWord(clean, word)).toBe(true);
          expect(heardWord(`${word} extra`, word)).toBe(false);
          expect(heardWord("", word)).toBe(false);
          expect(heardWord(`${word}z`, word)).toBe(false);
        },
      ),
      propParams(),
    );
  });

  it("enforces 3 attempts per (seat, word), none after acceptance, 30 per seat, 120 per room, and spends 0 on denied tickets", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            seat: seatArb,
            word: wordArb,
            accepted: fc.boolean(),
            ticketGranted: fc.boolean(),
          }),
          { minLength: 1, maxLength: 160 },
        ),
        (ops) => {
          let checks = emptyChecksState();
          const consents: StitchConsent[] = [0, 1, 2, 3, 4, 5].map((seat) => ({
            seat,
            yes: true,
            ageOrGuardianTick: true,
          }));

          for (const op of ops) {
            const allowed = canCheck({ enabled: true, consents, checks }, op.seat, op.word);
            const key = `${op.seat}:${op.word}`;

            if (!allowed) {
              const overRoom = checks.room >= STITCH_ROOM_CHECKS;
              const overSeat = (checks.perSeat[op.seat] ?? 0) >= STITCH_PLAYER_CHECKS;
              const overPair = (checks.attempts[key] ?? 0) >= CLIP_MAX_RETRIES + 1;
              const alreadyAccepted = checks.accepted.includes(key);
              expect(overRoom || overSeat || overPair || alreadyAccepted).toBe(true);
              continue;
            }

            const next = recordCheck(checks, op.seat, op.word, op.accepted, op.ticketGranted);
            if (!op.ticketGranted) {
              expect(next).toEqual(checks);
            } else {
              expect(next.room).toBe(checks.room + 1);
              expect(next.perSeat[op.seat]).toBe((checks.perSeat[op.seat] ?? 0) + 1);
              expect(next.attempts[key]).toBe((checks.attempts[key] ?? 0) + 1);
            }
            checks = next;

            expect(checks.room).toBeLessThanOrEqual(STITCH_ROOM_CHECKS);
            for (const count of Object.values(checks.perSeat)) {
              expect(count).toBeLessThanOrEqual(STITCH_PLAYER_CHECKS);
            }
            for (const attempts of Object.values(checks.attempts)) {
              expect(attempts).toBeLessThanOrEqual(CLIP_MAX_RETRIES + 1);
            }
          }
        },
      ),
      propParams(),
    );
  });
});
