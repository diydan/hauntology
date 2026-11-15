import * as fc from "fast-check";
import type { BankLine, FinitePlaceholders, ScriptedBanks } from "./library";

/** Values for every finite placeholder, so no generated line can throw for a missing table. */
export const FINITE: FinitePlaceholders = {
  weather: ["clear", "rain"],
  time: ["dawn", "dusk", "night"],
  moon: ["new moon"],
  bearing: ["ahead", "behind"],
  band: ["far", "nearer"],
};

const wordArb = fc.stringMatching(/^[A-Za-z][a-z]{0,7}$/);

/** A word, now and then a placeholder (player text or finite) or an ellipsis. */
const pieceArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 8, arbitrary: wordArb },
  { weight: 1, arbitrary: fc.constantFrom("{nick}", "{zone}", "{memory}") },
  { weight: 1, arbitrary: fc.constantFrom("{weather}", "{time}", "{moon}", "{bearing}", "{band}") },
  { weight: 1, arbitrary: fc.constant("...") },
);

const sentenceArb: fc.Arbitrary<string> = fc
  .tuple(fc.array(pieceArb, { minLength: 1, maxLength: 20 }), fc.constantFrom(".", "!", "?"))
  .map(([pieces, end]) => pieces.join(" ") + end);

/** One to eight sentences, single-spaced, so some lines are longer than 240 characters. */
const lineTextArb: fc.Arbitrary<string> = fc.array(sentenceArb, { minLength: 1, maxLength: 8 }).map((s) => s.join(" "));

function linesArb(prefix: string): fc.Arbitrary<BankLine[]> {
  return fc
    .array(fc.record({ text: lineTextArb, kind: fc.constantFrom("a", "b", "c"), spoken: fc.boolean() }), { maxLength: 8 })
    .map((rows) => rows.map((r, i) => ({ id: `${prefix}.${r.kind}.${i}`, kind: r.kind, text: r.text, spoken: r.spoken })));
}

export const scriptedBanksArb: fc.Arbitrary<ScriptedBanks> = fc.record({
  whisper: linesArb("whisper"),
  keeper: linesArb("keeper"),
  lodger: linesArb("lodger"),
});
