import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { soundEventsArb } from "./puzzles.arb";
import { NOTE_FREQS, RECIPES, SOUND_CAPS, planSound } from "./sound";

describe("Property 15: Sound plans respect consent and limits", () => {
  // Feature: puzzles, Property 15: Sound plans respect consent and limits
  // Validates: Requirements 10.2, 10.4
  it("plays nothing without the owner's yes", () => {
    fc.assert(fc.property(soundEventsArb, (events) => planSound(events, false).length === 0), propParams());
  });

  it("never has more than four voices at once or a gain above 0.5, and every sound is a known recipe", () => {
    fc.assert(
      fc.property(soundEventsArb, (events) => {
        const plan = planSound(events, true);
        return plan.every((p) => p.name in RECIPES && p.gain <= SOUND_CAPS.masterGain
          && plan.filter((o) => o.t <= p.t && o.t + o.ms > p.t).length <= SOUND_CAPS.voices);
      }),
      propParams(),
    );
  });

  it("drops the fifth sound of a burst", () => {
    const burst = (["note0", "note1", "note2", "note3", "note4", "creak"] as const).map((name, i) => ({ t: i * 10, name }));
    expect(planSound(burst, true)).toHaveLength(4);
  });

  it("has notes of at least 300 Hz, because phone speakers have no bass", () => {
    for (const f of NOTE_FREQS) expect(f).toBeGreaterThanOrEqual(SOUND_CAPS.minNoteHz);
    for (const [name, rec] of Object.entries(RECIPES)) {
      if (!name.startsWith("note")) continue;
      for (const part of rec.parts) if (part.type === "osc") expect(Math.min(part.from, part.to)).toBeGreaterThanOrEqual(SOUND_CAPS.minNoteHz);
    }
  });
});
