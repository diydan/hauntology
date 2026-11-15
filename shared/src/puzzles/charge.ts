/** A plain Inspect takes 10 seconds of a Turn; a Lock never costs less. */
export const PLAIN_INSPECT_MS = 10_000;

const finite = (v: number): number => (Number.isFinite(v) ? v : 0);

/**
 * The Turn time a Lock charges, solved or failed: the time spent, never under 10 seconds and never over the Cap.
 * (A Cap under 10 seconds is treated as 10, so the floor always holds.)
 */
export function lockCharge(elapsedMs: number, capMs: number): number {
  const cap = Math.max(PLAIN_INSPECT_MS, finite(capMs));
  return Math.min(cap, Math.max(PLAIN_INSPECT_MS, finite(elapsedMs)));
}

/** A Player on Plain Inspect (an access setting) always succeeds and always pays the whole Cap. */
export const plainInspectCharge = (capMs: number): number => Math.max(PLAIN_INSPECT_MS, finite(capMs));
