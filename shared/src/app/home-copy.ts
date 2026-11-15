import type { CapabilityReason } from "./types";

/**
 * The fixed words of the Home screen (Requirements 1.1 to 1.3). Plain, terse, never cute, and no
 * claim about money or quota beyond what the screen knows.
 */

export const HOME_PREMISE = "Draw or photograph any place. Wander it and meet whoever is still there, or solve it as a case.";

/** What the visitor should know before they start (Requirement 1.2). */
export const HOME_FACTS: readonly string[] = [
  "Places are static: nothing in them moves or changes while you walk.",
  "The ghost is a flat picture that always turns to face you (a billboard sprite), not a 3D figure.",
  "A photo you upload is deleted after 24 hours.",
  "A case is a deduction game: work out which ghost haunts the place, where, and with which relic. You can play one alone, against Bots, on this screen.",
];

/** One line for why drawing or uploading is off (Requirement 1.3). The Gallery is always open. */
export const REASON_COPY: Record<CapabilityReason, string> = {
  kill_switch: "Making new places is switched off for now. The Gallery is open.",
  total_cap: "The limit for new places has been reached. The Gallery is open.",
  day_cap: "Today's limit for new places has been reached. Try again tomorrow, or visit the Gallery.",
  quota_image: "You are out of sketch renders for this visit. You can still upload a photo, or visit the Gallery.",
  quota_world: "You have made all the places this visit allows. You can still visit the Gallery.",
};

export const reasonCopy = (reason: CapabilityReason): string => REASON_COPY[reason];
