import type { Parameters } from "fast-check";

/** Fixed default so a failing property reproduces from the log. */
export const DEFAULT_SEED = 20261114;
export const MIN_RUNS = 100;

/**
 * Parameters for every property test in `shared/src/app/`:
 * `fc.assert(fc.property(...), propParams())`.
 * A seed is always set, and fewer than 100 runs is refused.
 */
export function propParams(seed: number = DEFAULT_SEED, numRuns: number = MIN_RUNS): Parameters<unknown> {
  if (!Number.isInteger(seed)) throw new RangeError("seed must be an integer");
  if (!Number.isInteger(numRuns) || numRuns < MIN_RUNS) {
    throw new RangeError(`numRuns must be an integer of at least ${MIN_RUNS}`);
  }
  return { seed, numRuns };
}
