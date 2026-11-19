/**
 * Closed counter whitelists for the `conditions` telemetry events (`conditions` 3.7; Requirements 1.1, 2.4).
 * Every field maps strictly to closed-set words, integers, or booleans: never a place, coordinate, label, date, or query.
 */
export const CONDITIONS_READ_REASONS = ["ok", "disabled", "no_place", "timeout", "error", "empty"] as const;
export type ConditionsReadReason = (typeof CONDITIONS_READ_REASONS)[number];

export const CONDITIONS_GEOCODE_OUTCOMES = ["ok", "disabled", "rate_limited", "bad_place", "unavailable"] as const;
export type ConditionsGeocodeOutcome = (typeof CONDITIONS_GEOCODE_OUTCOMES)[number];

export function conditionsReadCounter(
  source: "live" | "memory" | "default",
  reason: ConditionsReadReason,
  cache: boolean,
): Readonly<{ source: "live" | "memory" | "default"; reason: ConditionsReadReason; cache: boolean }> {
  return { source, reason, cache: Boolean(cache) };
}

export function conditionsGeocodeCounter(
  outcome: ConditionsGeocodeOutcome,
  count: number,
): Readonly<{ outcome: ConditionsGeocodeOutcome; count: number }> {
  return { outcome, count: Number.isInteger(count) && count >= 0 ? count : 0 };
}
