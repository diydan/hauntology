import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { offerFor, offerPrompts, PHOTO_PROMPTS, skipFor, skipOffer } from "./photoPrompts";

describe("Property 30: Photo Prompt offers are deterministic, complete and bounded", () => {
  // Feature: party-mode, Property 30: Photo Prompt offers are deterministic, complete and bounded
  // Validates: Requirements 3.6, 3.7, 3.8
  it("has twelve entries, each tip ending with the no-faces rule", () => {
    expect(PHOTO_PROMPTS).toHaveLength(12);
    expect(new Set(PHOTO_PROMPTS.map((p) => p.id)).size).toBe(12);
    for (const p of PHOTO_PROMPTS) expect(p.tip.endsWith("No people or faces.")).toBe(true);
  });
  it("offers three distinct entries per round, all twelve once over four rounds, the same for the same seed and seat, and null after", () => {
    fc.assert(fc.property(fc.integer(), fc.integer({ min: 1, max: 6 }), (seed, seat) => {
      const rounds = [0, 1, 2, 3].map((r) => offerPrompts(seed, seat, r));
      if (rounds.some((r) => r === null)) return false;
      const all = rounds.flat() as string[];
      if (new Set(all).size !== 12) return false;
      if (!rounds.every((r) => new Set(r).size === 3)) return false;
      if (JSON.stringify(rounds) !== JSON.stringify([0, 1, 2, 3].map((r) => offerPrompts(seed, seat, r)))) return false;
      return offerPrompts(seed, seat, 4) === null && offerPrompts(seed, seat, -1) === null;
    }), propParams());
  });
  it("derives a separate stream per seat (two seats are usually offered different prompts)", () => {
    const orders = new Set([1, 2, 3, 4, 5, 6].map((s) => (offerPrompts(42, s, 0) as string[]).join()));
    expect(orders.size).toBeGreaterThan(1);
  });
  it("allows exactly three skips", () => {
    expect([0, 1, 2, 3].map(skipOffer)).toEqual([1, 2, 3, null]);
    expect(skipOffer(-1)).toBeNull();
    expect(skipOffer(1.5)).toBeNull();
  });
  it("gives the whole entries of an offer, and walks three skips through all twelve with no repeat, then nothing", () => {
    const seen = new Set<string>();
    let offer = offerFor(7, 3, 0)!;
    for (const p of offer.prompts) { expect(p.tip.endsWith("No people or faces.")).toBe(true); seen.add(p.id); }
    for (let i = 0; i < 3; i++) { offer = skipFor(7, 3, offer.round)!; expect(offer.round).toBe(i + 1); for (const p of offer.prompts) { expect(seen.has(p.id)).toBe(false); seen.add(p.id); } }
    expect(seen.size).toBe(12);
    expect(skipFor(7, 3, 3)).toBeNull();
    expect(offerFor(7, 3, 4)).toBeNull();
  });
});
