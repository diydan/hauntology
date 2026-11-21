import type { PuzzleSetting } from "@hauntology/shared/puzzles/types";
import type { CluePlace } from "@hauntology/shared/puzzles/world-clues";
import { openRoom, type RoomClient, type RoomDeps, type RoomSnapshot } from "../app/case/room-client";
import { NOT_SEATED, type ControllerPort, type JoinFailure, type JoinResult, type RoomPhase, type RoomView } from "./controller/controller-port";

/**
 * The Controller's real Room (party-mode 9, integration 5.1): the phone joins by code, opens the socket and shows what the Room says. It holds
 * no game rule: every game word is the Room's, and the Room refuses what is not allowed. The socket is the one the solo screen uses
 * (`openRoom`), so a Lock, a Sight, an Attempt and a refusal mean the same on a phone and on the shared screen.
 * Not mapped yet: Errands and doors on the phone, which the Room sends and this port does not turn into the Controller's panels.
 */
const REFUSALS: readonly JoinFailure[] = ["room_full", "game_started", "room_unknown"];

const phaseOf = (snap: RoomSnapshot): RoomPhase => {
  const pub = snap.public;
  if (pub === null) return "lobby";
  if (pub.phase === "ended") return "ended";
  if (pub.phase === "playing") return pub.paused ? "paused" : "playing";
  return "lobby";
};

/** What the screen draws, from the socket's snapshot. Pure. */
export function viewOf(snap: RoomSnapshot, nickname: string | null, joinedSeat: number | null = null): RoomView {
  const lock = snap.lock;
  const seat = snap.seat ?? joinedSeat; // the Room's own word wins; until it has said it, the seat the join gave
  return {
    connection: snap.status === "connecting" ? "connecting" : snap.status === "closed" ? "offline" : "online",
    phase: phaseOf(snap),
    code: snap.code,
    seat,
    nickname,
    master: seat !== null && seat === snap.masterSeat ? { puzzles: snap.public?.puzzleSetting ?? "off", preset: "classic" } : null,
    lock: lock === null ? null : {
      id: lock.id, kind: lock.kind, view: lock.view, faded: lock.faded, clue: null, attempts: lock.attempts, capMs: lock.capMs,
      ...(lock.sign !== undefined ? { sign: lock.sign } : {}),
      ...(lock.prompt !== undefined ? { prompt: lock.prompt } : {}),
      ...(lock.canSeeAgain !== undefined ? { canSeeAgain: lock.canSeeAgain } : {}),
      ...(lock.assistText !== undefined ? { assistText: lock.assistText } : {}),
    },
    ...(snap.public === null ? {} : { game: { pub: snap.public, priv: snap.private } }),
    ...(snap.refused === null ? {} : { refused: snap.refused }),
    ...(snap.sight === null ? {} : { sight: snap.sight }),
  };
}

export function createRoomPort(deps: RoomDeps): ControllerPort {
  let view: RoomView = NOT_SEATED;
  let client: RoomClient | null = null;
  let stop: (() => void) | null = null;
  let nickname: string | null = null;
  let seated: number | null = null;
  const listeners = new Set<(v: RoomView) => void>();
  const publish = (next: RoomView): void => {
    view = next;
    for (const l of [...listeners]) l(view);
  };
  const send = (msg: Readonly<{ t: string }> & Record<string, unknown>): void => client?.send(msg);

  return {
    getView: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async join(code, name): Promise<JoinResult> {
      let res: Response;
      try {
        res = await deps.fetch(`/api/party/${code}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ nickname: name }) });
      } catch {
        return { ok: false, code: "unreachable" };
      }
      let body: Record<string, unknown> = {};
      try { body = (await res.json()) as Record<string, unknown>; } catch { /* not JSON */ }
      if (!res.ok || body.ok !== true || typeof body.token !== "string" || typeof body.seat !== "number") {
        const said = REFUSALS.find((r) => r === body.code);
        return { ok: false, code: said ?? "unreachable" };
      }
      nickname = name;
      seated = body.seat;
      const room = openRoom(deps, code, body.token);
      client = room;
      stop?.();
      stop = room.subscribe(() => publish(viewOf(room.getSnapshot(), nickname, seated)));
      publish(viewOf(room.getSnapshot(), nickname, seated));
      return { ok: true, seat: body.seat, nickname: name };
    },
    attempt: (lockId, transcript) => (client === null ? { outcome: "failed", reason: "offline" } : client.attempt(lockId, transcript)),
    closeLock: (lockId, why) => client?.closeLock(lockId, why),
    ackSight: (sightId) => client?.ackSight(sightId),
    setSound: (consent) => send({ t: "sound", consent }),
    setAssist: (on) => send({ t: "assist", on }),
    setPuzzles: (setting: PuzzleSetting) => send({ t: "settings", puzzles: setting }),
    setCluePlace: (place: CluePlace) => send({ t: "settings", cluePlace: place }),
    setErrands: (on) => send({ t: "settings", errands: on }),
    setErrandOptOut: (on) => send({ t: "errandOptOut", on }),
    act: send,
    async leave() {
      stop?.();
      stop = null;
      client?.disconnect();
      client = null;
      nickname = null;
      seated = null;
      publish(NOT_SEATED);
    },
  };
}
