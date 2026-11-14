import type { ShellFlags } from "@hauntology/shared/app/types";
import type { Bindings } from "./env";

/** What `SpendGuard` knows. Passed in once the Durable Object exists (world-pipeline 4.1). */
export type SpendStatus = { dayCapReached: boolean; totalCapReached: boolean; killed: boolean };

const OFF = new Set(["false", "0", "off"]);
const ON = new Set(["true", "1", "on"]);

/**
 * The switches the shell shows. The world switch is on unless `WORLD_GEN_ENABLED` says off or
 * `SpendGuard` has tripped the kill switch. Until a `SpendStatus` is supplied the caps read as not
 * reached; that only affects what the Home screen offers, because `SpendGuard.reserve` still
 * decides every world creation.
 */
export function flagsFrom(env: Bindings | undefined, spend?: SpendStatus): ShellFlags {
  const envOn = !OFF.has((env?.WORLD_GEN_ENABLED ?? "true").trim().toLowerCase());
  return {
    worldGenEnabled: envOn && !(spend?.killed ?? false),
    dayCapReached: spend?.dayCapReached ?? false,
    totalCapReached: spend?.totalCapReached ?? false,
    voiceEnabled: !OFF.has((env?.VOICE_ENABLED ?? "true").trim().toLowerCase()),
    liveEnabled: ON.has((env?.VOICE_LIVE_ENABLED ?? "false").trim().toLowerCase()),
    partyEnabled: !OFF.has((env?.PARTY_ENABLED ?? "true").trim().toLowerCase()),
  };
}
