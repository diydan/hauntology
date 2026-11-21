/**
 * The telemetry whitelist (party-mode 10.5): counters and error codes only. No nickname, photo, Zone name, detail or
 * narration text is ever recorded, so anything that is not on these lists is dropped before it is written.
 */
export const COUNTERS = ["rooms", "players_seated", "turns", "suggestions", "accusations", "timeouts", "fallbacks"] as const;
export type Counter = (typeof COUNTERS)[number];
export const ERROR_CODES = [
  "party_disabled", "rooms_full", "world_too_small", "room_unknown", "room_full", "game_started", "bad_token", "rate_limited",
  "photo_rejected", "quota_image", "moderation_unavailable", "not_your_turn", "not_in_zone", "already_suggested", "bad_relic_token",
  "not_master", "world_not_set", "poltergeist", "cold_spot", "already_inspected", "eavesdrop_denied", "nudge_denied", "cue_denied",
  "frame_denied", "rattle_denied", "stitch_denied",
] as const;
export type PartyErrorCode = (typeof ERROR_CODES)[number];

export type Telemetry = Readonly<{ counters: Readonly<Record<Counter, number>>; errors: Readonly<Record<string, number>> }>;
export const emptyTelemetry = (): Telemetry => ({ counters: Object.fromEntries(COUNTERS.map((c) => [c, 0])) as Record<Counter, number>, errors: {} });

/** `code:reason` codes keep only the part before the colon, so a free-text reason cannot get in. */
export const errorCodeOf = (raw: string): PartyErrorCode | null => {
  const head = raw.split(":")[0] as string;
  return (ERROR_CODES as readonly string[]).includes(head) ? (head as PartyErrorCode) : null;
};

export function count(t: Telemetry, name: string, by = 1): Telemetry {
  if (!(COUNTERS as readonly string[]).includes(name) || !Number.isInteger(by) || by < 0) return t;
  return { ...t, counters: { ...t.counters, [name]: t.counters[name as Counter] + by } };
}
export function countError(t: Telemetry, raw: string): Telemetry {
  const code = errorCodeOf(raw);
  return code === null ? t : { ...t, errors: { ...t.errors, [code]: (t.errors[code] ?? 0) + 1 } };
}

/** What may be written: only whitelisted names with whole-number values. Everything else, strings included, is dropped. */
export function sanitizeTelemetry(raw: unknown): Telemetry {
  const out = emptyTelemetry();
  if (typeof raw !== "object" || raw === null) return out;
  const r = raw as { counters?: unknown; errors?: unknown };
  const counters: Record<string, number> = { ...out.counters };
  if (typeof r.counters === "object" && r.counters !== null)
    for (const c of COUNTERS) { const v = (r.counters as Record<string, unknown>)[c]; if (Number.isInteger(v) && (v as number) >= 0) counters[c] = v as number; }
  const errors: Record<string, number> = {};
  if (typeof r.errors === "object" && r.errors !== null)
    for (const [k, v] of Object.entries(r.errors)) if ((ERROR_CODES as readonly string[]).includes(k) && Number.isInteger(v) && (v as number) >= 0) errors[k] = v as number;
  return { counters: counters as Record<Counter, number>, errors };
}
