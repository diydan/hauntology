import * as fc from "fast-check";
import type { QuotaSnapshot, ShellFlags } from "./types";

/** A remaining count. Zero is common, because "quota is zero" is the case that matters most. */
const remaining: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.constant(0) },
  { weight: 5, arbitrary: fc.integer({ min: 1, max: 50 }) },
);

export const quotaSnapshotArb: fc.Arbitrary<QuotaSnapshot> = fc.record({
  world: remaining,
  image: remaining,
  llm: remaining,
  tts: remaining,
  stt: remaining,
  live: remaining,
});

export const shellFlagsArb: fc.Arbitrary<ShellFlags> = fc.record({
  worldGenEnabled: fc.boolean(),
  dayCapReached: fc.boolean(),
  totalCapReached: fc.boolean(),
  voiceEnabled: fc.boolean(),
  liveEnabled: fc.boolean(),
  partyEnabled: fc.boolean(),
  ghostModel: fc.boolean(),
});
