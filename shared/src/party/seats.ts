import { sanitizeNickname } from "./nickname";
import { MAX_PLAYERS, SEATS, type RoomState, type Seat } from "./room";

/** Why a join is refused (1.3). The same answer whatever is inside the Room, so a refusal reveals nothing else. */
export type JoinRefusal = "room_full" | "game_started" | "room_unknown" | "bad_token";

/** Why this Room would refuse a new seat now, or null when it would take one (1.3). */
export function canJoin(state: RoomState): JoinRefusal | null {
  if (state.started) return "game_started";
  if (state.seats.length >= MAX_PLAYERS) return "room_full";
  return null;
}

const firstFree = (state: RoomState): Seat | null => SEATS.find((s) => !state.seats.some((x) => x.seat === s)) ?? null;

/**
 * Seat a phone, or a Bot when `token` is null (1.2). The first seated human becomes the Master. A refused join changes
 * nothing.
 */
export function seatPlayer(
  state: RoomState, nickname: string, token: string | null, nowMs: number,
): { ok: true; state: RoomState; seat: Seat } | { ok: false; code: JoinRefusal } {
  const refusal = canJoin(state);
  if (refusal) return { ok: false, code: refusal };
  const seat = firstFree(state);
  if (seat === null) return { ok: false, code: "room_full" };
  const bot = token === null;
  const seats = [...state.seats, { seat, nickname: sanitizeNickname(nickname), token, bot, connected: !bot, awaySinceMs: null }]
    .sort((a, b) => a.seat - b.seat);
  const masterSeat = state.masterSeat ?? (bot ? null : seat);
  return { ok: true, seat, state: { ...state, seats, masterSeat, lastActiveMs: Math.max(state.lastActiveMs, nowMs) } };
}

/**
 * A phone coming back with its player token gets the same seat (1.4). A phone with no token, or a token this Room
 * never gave, gets no seat once the game has started.
 */
export function rejoin(state: RoomState, token: string | null, nowMs: number): { ok: true; state: RoomState; seat: Seat } | { ok: false; code: JoinRefusal } {
  const mine = token === null ? undefined : state.seats.find((s) => !s.bot && s.token === token);
  if (!mine) return { ok: false, code: state.started ? "game_started" : "bad_token" };
  const seats = state.seats.map((s) => (s.seat === mine.seat ? { ...s, connected: true, awaySinceMs: null } : s));
  return { ok: true, seat: mine.seat, state: { ...state, seats, lastActiveMs: Math.max(state.lastActiveMs, nowMs) } };
}

/** A seat lost its connection. Its Hand and seat stay (1.4). */
export function markAway(state: RoomState, seat: Seat, nowMs: number): RoomState {
  return { ...state, seats: state.seats.map((s) => (s.seat === seat && s.connected ? { ...s, connected: false, awaySinceMs: nowMs } : s)) };
}

export const humanCount = (state: RoomState): number => state.seats.filter((s) => !s.bot).length;
