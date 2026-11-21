import * as fc from "fast-check";
import type { StitchClip } from "./compose";
import type { ConsentEvent } from "./consent";
import type { StitchTemplate } from "./templates";
import { WORD_BANK } from "./wordbank";

/** Arbitraries for Stitch property tests (Properties 8 to 11). */

export const seatArb = fc.integer({ min: 0, max: 5 });
export const wordArb = fc.constantFrom<string>(...WORD_BANK);

export const lowercaseWordArb = fc.stringMatching(/^[a-z]{3,8}$/);

export const validBankArb = fc.uniqueArray(lowercaseWordArb, { minLength: 2, maxLength: 12 });
export const oversizedBankArb = fc.uniqueArray(lowercaseWordArb, { minLength: 13, maxLength: 18 });

export function templatesForBankArb(bank: readonly string[]): fc.Arbitrary<StitchTemplate[]> {
  // Guarantee every word in the bank is used at least once across valid 2-4 word templates.
  return fc
    .array(
      fc.record({
        words: fc.array(fc.constantFrom(...bank), { minLength: 2, maxLength: 4 }),
      }),
      { minLength: 1, maxLength: 8 },
    )
    .map((extra) => {
      const covering: StitchTemplate[] = [];
      for (let i = 0; i < bank.length; i += 2) {
        const pair = [bank[i]!, bank[(i + 1) % bank.length]!];
        covering.push({ id: `cov-${i}`, words: pair, subtitle: pair.join(" ") });
      }
      const more = extra.map((e, idx) => ({
        id: `tpl-${idx}`,
        words: e.words,
        subtitle: e.words.join(" "),
      }));
      return [...covering, ...more];
    });
}

export const clipArb: fc.Arbitrary<StitchClip> = fc.record({
  seat: seatArb,
  word: wordArb,
  bytes: fc.uint8Array({ minLength: 1, maxLength: 64 }),
  durationMs: fc.integer({ min: 100, max: 3_500 }),
  recordedAt: fc.integer({ min: 1_000, max: 10_000_000 }),
  contentType: fc.constantFrom("audio/webm", "audio/mp4"),
});

export const consentEventArb: fc.Arbitrary<ConsentEvent> = fc.oneof(
  fc.record({ t: fc.constant("master_switch" as const), actorIsMaster: fc.boolean(), on: fc.boolean() }),
  fc.record({
    t: fc.constant("answer" as const),
    actorSeat: seatArb,
    seat: seatArb,
    isBot: fc.boolean(),
    yes: fc.boolean(),
    tick: fc.boolean(),
  }),
  fc.record({ t: fc.constant("leave" as const), seat: seatArb }),
);
