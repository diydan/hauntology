import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../../app/prop-config";
import { CLIP_MAX_MS, WORD_BANK_MAX_WORDS } from "../limits";
import { composeStitch } from "./compose";
import { clipArb, oversizedBankArb, seatArb, templatesForBankArb, validBankArb } from "./stitch.arb";
import { STARTER_TEMPLATES, validateTemplates } from "./templates";
import { validateWordBank, WORD_BANK } from "./wordbank";

describe("Property 8: Stitched lines contain only template and Word Bank words", () => {
  // Feature: ghost-voice, Property 8: Stitched lines contain only template and Word Bank words
  // Validates: Requirements 5.1
  it("validates starter WORD_BANK (12 words) and STARTER_TEMPLATES (10 templates)", () => {
    expect(WORD_BANK).toHaveLength(WORD_BANK_MAX_WORDS);
    expect(STARTER_TEMPLATES).toHaveLength(10);
    expect(validateWordBank(WORD_BANK).ok).toBe(true);
    expect(validateTemplates(STARTER_TEMPLATES, WORD_BANK).ok).toBe(true);
  });

  it("rejects banks > 12 words, templates outside the bank, and composes strictly single-seat clips <= 2000 ms matching template words in order", () => {
    fc.assert(
      fc.property(
        validBankArb.chain((bank) => fc.tuple(fc.constant(bank), templatesForBankArb(bank))),
        oversizedBankArb,
        seatArb,
        fc.array(clipArb, { minLength: 0, maxLength: 30 }),
        ([bank, templates], tooBigBank, seat, clips) => {
          expect(validateWordBank(tooBigBank).ok).toBe(false);
          expect(validateTemplates(templates, bank).ok).toBe(true);

          const outsideTpl = { id: "bad", words: [bank[0]!, "forbiddenword"], subtitle: `${bank[0]!} forbiddenword` };
          expect(validateTemplates([...templates, outsideTpl], bank).ok).toBe(false);

          for (const tpl of STARTER_TEMPLATES) {
            const composed = composeStitch(seat, tpl, clips);
            if (composed !== null) {
              expect(composed.subtitle).toBe(tpl.subtitle);
              expect(composed.subtitle).toBe(tpl.words.join(" "));
              expect(composed.clips).toHaveLength(tpl.words.length);
              for (let i = 0; i < tpl.words.length; i++) {
                const c = composed.clips[i]!;
                expect(c.seat).toBe(seat);
                expect(c.word).toBe(tpl.words[i]);
                expect(WORD_BANK).toContain(c.word);
                expect(c.durationMs).toBeGreaterThan(0);
                expect(c.durationMs).toBeLessThanOrEqual(CLIP_MAX_MS);
              }
            }
          }
        },
      ),
      propParams(),
    );
  });
});
