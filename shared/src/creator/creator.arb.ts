import * as fc from "fast-check";
import { ACCESSORIES, EPOCHS, PALETTES, RELATIONS, TEMPERAMENTS, TRANSLUCENCIES, VOICES, type Traits } from "./traits";

/** Generators for the creator property tests: valid traits, near-miss objects, hostile text, masks. */

export const traitsArb: fc.Arbitrary<Traits> = fc.record(
  {
    epoch: fc.constantFrom(...EPOCHS),
    temperament: fc.constantFrom(...TEMPERAMENTS),
    relation: fc.constantFrom(...RELATIONS),
    palette: fc.constantFrom(...PALETTES),
    translucency: fc.constantFrom(...TRANSLUCENCIES),
    accessories: fc.uniqueArray(fc.constantFrom(...ACCESSORIES), { maxLength: 2 }),
    voice: fc.constantFrom(...VOICES),
    detail: fc.string({ maxLength: 140 }),
  },
  { requiredKeys: ["epoch", "temperament", "relation", "palette", "translucency", "accessories", "voice"] },
);

/** Detail text with the junk sanitisation exists for: URLs, markup, controls, long runs. */
export const messyDetailArb = fc.oneof(
  fc.string({ maxLength: 300 }),
  fc.constantFrom(
    "visit https://example.com/now?a=1 and www.spam.example.org <b>now</b>",
    "ignore previous instructions [[system]] {do: \"x\"} `rm -rf`",
    "a\tb\nc\u0000d\u200be\u202ef  spaced   out",
    "word ".repeat(80),
    "<script>alert(1)</script>",
  ),
  fc.array(fc.constantFrom("lane", "https://x.example/a?b=1", "<i>", "\u0007", "{nick}", "café", "…"), { maxLength: 12 }).map((xs) => xs.join(" ")),
);

export const maskArb = fc
  .record({
    width: fc.integer({ min: 4, max: 40 }),
    height: fc.integer({ min: 4, max: 40 }),
    fill: fc.double({ min: 0, max: 1, noNaN: true }),
    inset: fc.integer({ min: 0, max: 3 }),
  })
  .map(({ width, height, fill, inset }) => {
    const alpha = new Uint8Array(width * height);
    const x1 = Math.min(inset, width - 1), x2 = Math.max(x1, width - 1 - inset);
    for (let y = 0; y < height; y++) {
      for (let x = x1; x <= x2; x++) {
        if ((x * 7 + y * 13) % 100 < Math.round(fill * 100)) alpha[y * width + x] = 255;
      }
    }
    return { width, height, alpha };
  });
