import type { CapabilityReason, Capabilities, QuotaSnapshot, ShellFlags } from "./types";

/**
 * What the Home screen may offer, from the Quota Snapshot and the server flags.
 *
 * - `canUpload`: world creation is on, neither cap is reached, and a world is left.
 * - `canDraw`: the same, and an image is left too (a sketch needs a FLUX.2 call first).
 * - `canGallery`: always true. The Gallery needs no paid call.
 * - `reason`: set exactly when drawing or uploading is off. It is the first cause in this order:
 *   kill switch, total cap, day cap, image quota, world quota.
 */
export function capabilities(quota: QuotaSnapshot, flags: ShellFlags): Capabilities {
  const worldOpen = flags.worldGenEnabled && !flags.dayCapReached && !flags.totalCapReached && quota.world > 0;
  const canUpload = worldOpen;
  const canDraw = worldOpen && quota.image > 0;

  if (canDraw && canUpload) return { canDraw, canUpload, canGallery: true };
  return { canDraw, canUpload, canGallery: true, reason: firstReason(quota, flags) };
}

function firstReason(quota: QuotaSnapshot, flags: ShellFlags): CapabilityReason {
  if (!flags.worldGenEnabled) return "kill_switch";
  if (flags.totalCapReached) return "total_cap";
  if (flags.dayCapReached) return "day_cap";
  if (quota.image <= 0) return "quota_image";
  return "quota_world";
}
