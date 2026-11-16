import { authorize } from "./auth";
import { MASTER_TIMEOUT_MS, type RoomState, type Seat } from "./room";

/** The Master role (party-mode 1.7): only the Master runs the room; the role moves only to a human. */

/** True when this token may use the room controls. */
export const canControl = (state: RoomState, token: string): boolean => authorize(state, token, { kind: "control" });

/** The next human seat after `from` in seat order, wrapping round; never a Bot; null when there is no other human (1.7). */
export function nextMaster(state: RoomState, from: Seat): Seat | null {
  const humans = state.seats.filter((s) => !s.bot && s.seat !== from).map((s) => s.seat).sort((a, b) => a - b);
  return humans.find((s) => s > from) ?? humans[0] ?? null;
}

/** The Master hands the role to another human (1.7). Refused for a Bot, an empty seat or a token that is not the Master's. */
export function handOver(state: RoomState, token: string, to: Seat): RoomState | null {
  if (!authorize(state, token, { kind: "control" })) return null;
  const target = state.seats.find((s) => s.seat === to);
  if (!target || target.bot || to === state.masterSeat) return null;
  return { ...state, masterSeat: to };
}

/** After 60 s away, the Master role passes to the next human; with no other human, the Master keeps it (1.7). */
export function checkMasterTimeout(state: RoomState, nowMs: number): RoomState {
  const m = state.seats.find((s) => s.seat === state.masterSeat);
  if (!m || m.connected || m.awaySinceMs === null || nowMs - m.awaySinceMs < MASTER_TIMEOUT_MS) return state;
  const next = nextMaster(state, m.seat);
  return next === null ? state : { ...state, masterSeat: next };
}
