import type { ErrorCode } from "../errors";
import type { ShellFlags } from "./types";

/**
 * "Play a case" setup (shell Requirement 13.2): a preset and two to five Bots. Pure. The shell holds
 * no game rule: the Host page hands these two values to `soloSetup` (party-mode 9.5), which makes the
 * settings and the seats. Here are only the words the visitor reads, the limits of the card and the
 * reasons a case is not offered.
 */

/** The party-mode preset names. The visitor reads "Relaxed" for `gentle` (party-mode 9.5). */
export const CASE_PRESETS = ["classic", "gentle", "quick"] as const;
export type CasePreset = (typeof CASE_PRESETS)[number];

export const BOTS_MIN = 2;
export const BOTS_MAX = 5;
export const BOTS_DEFAULT = 2;

export type CaseSetup = { preset: CasePreset; bots: number };

export const DEFAULT_CASE_SETUP: CaseSetup = { preset: "classic", bots: BOTS_DEFAULT };

/** One line each, from the rows in party-mode's `applyPreset`: the Turn time and who the Bots are. */
export const CASE_PRESET_COPY: Record<CasePreset, { label: string; line: string }> = {
  classic: { label: "Classic", line: "60 seconds a turn. The usual Bots." },
  gentle: { label: "Relaxed", line: "90 seconds a turn, gentler Bots, and your notebook crosses cards off for you." },
  quick: { label: "Quick", line: "45 seconds a turn and a shorter haunting. Over fast." },
};

export const isCasePreset = (value: unknown): value is CasePreset => typeof value === "string" && (CASE_PRESETS as readonly string[]).includes(value);

/** A whole Bot count from 2 to 5. Anything else (a fraction, NaN, text, a count out of range) is the nearest allowed count, or the default. */
export function clampBots(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return BOTS_DEFAULT;
  return Math.min(BOTS_MAX, Math.max(BOTS_MIN, Math.round(value)));
}

/** Any input becomes a setup the Host accepts, so the card can never send a count `soloSetup` refuses. */
export function normalizeCaseSetup(input: { preset?: unknown; bots?: unknown } | null | undefined): CaseSetup {
  return {
    preset: isCasePreset(input?.preset) ? input.preset : DEFAULT_CASE_SETUP.preset,
    bots: clampBots(input?.bots),
  };
}

/** Why "Play a case" is not offered, before the Host has been asked. `world_too_small` is only known to the Host. */
export type CaseAvailability = { available: true } | { available: false; reason: string };

/** Codes the Host may answer a solo case with, and the one line shown for each (Requirement 13.4). Never an error screen. */
export const CASE_REFUSAL_COPY: Partial<Record<ErrorCode, string>> = {
  world_too_small: "This place is too small for a case. You can wander it, or pick a bigger place from the Gallery.",
  party_disabled: "Cases are switched off for now. You can still wander, and the Gallery is open.",
  rooms_full: "Too many cases are running right now. Try again in a minute, or wander.",
};
export const CASE_REFUSAL_FALLBACK = "A case could not start. You can still wander, and the Gallery is open.";

export const caseRefusalCopy = (code: string): string => CASE_REFUSAL_COPY[code as ErrorCode] ?? CASE_REFUSAL_FALLBACK;

/**
 * A "too small" place stays too small, so Haunt keeps the case off for that world for the visit. Every other
 * refusal (no Room free, the Host would not load) may pass, so Haunt shows it once and offers the case again
 * the next time it opens.
 */
export const refusalPasses = (code: string): boolean => code !== "world_too_small";

/** The reason, or nothing, a case is not offered for this world: party mode off, or the Host refused it earlier this visit. */
export function caseAvailability(flags: Pick<ShellFlags, "partyEnabled">, refusal?: { worldId: string; code: string } | undefined, worldId?: string): CaseAvailability {
  if (!flags.partyEnabled) return { available: false, reason: caseRefusalCopy("party_disabled") };
  if (refusal !== undefined && refusal.worldId === worldId) return { available: false, reason: caseRefusalCopy(refusal.code) };
  return { available: true };
}
