import type { RoomState, Seat } from "./room";

/**
 * Who may see and do what (party-mode 1.6, 1.7, 9.3). Every route and socket asks `authorize` with the token it was
 * given; nothing trusts a seat number sent by a client.
 */
export type Resource =
  | Readonly<{ kind: "public" }>
  | Readonly<{ kind: "private"; seat: Seat }>
  /** The room controls: world, settings, start, pause, resume, add Bot, end, Play again, hand-over. */
  | Readonly<{ kind: "control" }>
  /** Ending the Room: the Master or the Host. */
  | Readonly<{ kind: "end" }>
  /** The solo peek of 9.3: only when every other seated Player is a Bot. */
  | Readonly<{ kind: "peek"; seat: Seat }>;

export type Role = "host" | "display" | "controller";
export type Who = Readonly<{ role: Role; seat: Seat | null }>;

/** Which device holds this token in this Room, or null for a token this Room never gave. Bots have no token. */
export function whoIs(state: RoomState, token: string): Who | null {
  if (token.length === 0) return null;
  if (token === state.hostToken) return { role: "host", seat: null };
  if (token === state.displayToken) return { role: "display", seat: null };
  const s = state.seats.find((x) => !x.bot && x.token === token);
  return s ? { role: "controller", seat: s.seat } : null;
}

/** True when every other seated Player is a Bot: the one case where a phone may peek (9.3). */
export function peekAllowed(state: RoomState, seat: Seat): boolean {
  const others = state.seats.filter((s) => s.seat !== seat);
  return state.seats.some((s) => s.seat === seat && !s.bot) && others.length > 0 && others.every((s) => s.bot);
}

export function authorize(state: RoomState, token: string, resource: Resource): boolean {
  const who = whoIs(state, token);
  if (who === null) return false;
  switch (resource.kind) {
    case "public": return true;
    case "private": return who.role === "controller" && who.seat === resource.seat;
    case "control": return who.role === "controller" && who.seat !== null && who.seat === state.masterSeat;
    case "end": return who.role === "host" || (who.role === "controller" && who.seat !== null && who.seat === state.masterSeat);
    case "peek": return who.role === "controller" && who.seat === resource.seat && peekAllowed(state, resource.seat);
  }
}
