/**
 * Abuse caps (party-mode 10.6): join attempts are rate limited by hashed IP, a host session gets one active Room, and
 * only 20 Rooms are live in total. Pure: the PartyDirectory and the join route feed it their state.
 */
export const JOINS_PER_MINUTE = 20;
export const ROOM_TOTAL_CAP = 20;
export const JOIN_WINDOW_MS = 60_000;

export type JoinLog = Readonly<Record<string, readonly number[]>>;
export type JoinResult = Readonly<{ ok: true; log: JoinLog }> | Readonly<{ ok: false; code: "rate_limited"; log: JoinLog }>;

/** Accepts a join attempt from a hashed IP unless it already made `perMinute` in the last minute. Old attempts are forgotten. */
export function acceptJoin(log: JoinLog, ipHash: string, now: number, perMinute = JOINS_PER_MINUTE): JoinResult {
  const recent = (log[ipHash] ?? []).filter((t) => now - t < JOIN_WINDOW_MS && t <= now);
  if (recent.length >= perMinute) return { ok: false, code: "rate_limited", log: { ...log, [ipHash]: recent } };
  return { ok: true, log: { ...log, [ipHash]: [...recent, now] } };
}

export type ActiveRoom = Readonly<{ code: string; sessionId: string }>;
export type RoomResult = Readonly<{ ok: true }> | Readonly<{ ok: false; code: "party_disabled" | "rooms_full" | "session_has_room"; existing?: string }>;

/** A new Room is refused with the switch off, with the session already hosting one, or with the total cap reached. */
export function acceptRoom(active: readonly ActiveRoom[], sessionId: string, o: Readonly<{ enabled: boolean; cap?: number }>): RoomResult {
  if (!o.enabled) return { ok: false, code: "party_disabled" };
  const mine = active.find((r) => r.sessionId === sessionId);
  if (mine !== undefined) return { ok: false, code: "session_has_room", existing: mine.code };
  if (active.length >= (o.cap ?? ROOM_TOTAL_CAP)) return { ok: false, code: "rooms_full" };
  return { ok: true };
}
