import type { JoinRefusal } from "@hauntology/shared/party/seats";
import type { Preset } from "@hauntology/shared/puzzles/settings";
import type { Kind, LockView, PuzzleSetting, Sight, Transcript } from "@hauntology/shared/puzzles/types";
import type { AttemptReply } from "../../puzzles/PuzzleHost";

/**
 * The Controller's side of a party Room (party-mode group 9), with nothing of the network in it. The shell talks only to this, so it is
 * tested and looked at with a scripted Room (`standin-port.ts`) and the real socket joins later without the screens changing.
 * It carries no game rule: a refusal, a Lock offered and an answer to an Attempt are all the Room's words.
 */

/** Why a join did not seat the phone. `unreachable` is the phone's own: the Room could not be asked. The three of the Room say the same whatever is inside it (Requirement 1.3). */
export type JoinFailure = Extract<JoinRefusal, "room_full" | "game_started" | "room_unknown"> | "unreachable";

export type JoinResult =
  | Readonly<{ ok: true; seat: number; nickname: string }>
  | Readonly<{ ok: false; code: JoinFailure }>;

/** How the phone stands with the Room, in the words the header uses. */
export type Connection = "connecting" | "online" | "reconnecting" | "offline";

export type RoomPhase = "lobby" | "playing" | "paused" | "ended";

/** A Lock this seat has been given to open (the Room made it; the phone only plays it). */
export type LockOffer = Readonly<{
  id: string;
  kind: Kind;
  view: LockView;
  /** The clue to show first when the Sight was missed, or null. */
  faded: Sight | null;
  /** The Lock's clue, to look at again while playing (offered only with Assist on). */
  clue: Sight | null;
  attempts: number;
  /** The most Turn time this Lock may use, or null. */
  capMs: number | null;
}>;

/** What the Room last said to this seat. The shell draws from it and keeps nothing else about the game. */
export type RoomView = Readonly<{
  connection: Connection;
  phase: RoomPhase;
  /** The Room Code, once seated. */
  code: string | null;
  seat: number | null;
  nickname: string | null;
  /** Set only for the Master seat: the room controls are the Master's alone (Requirement 1.7). */
  master: Readonly<{ puzzles: PuzzleSetting; preset: Preset }> | null;
  lock: LockOffer | null;
}>;

export const NOT_SEATED: RoomView = { connection: "offline", phase: "lobby", code: null, seat: null, nickname: null, master: null, lock: null };

export interface ControllerPort {
  /** Ask for a seat. The code is the canonical one (see `normalizeCode`) and the nickname is already clean (see `sanitizeNickname`). */
  join(code: string, nickname: string): Promise<JoinResult>;
  getView(): RoomView;
  /** Called with every new view; returns the way to stop. */
  subscribe(listener: (view: RoomView) => void): () => void;
  /** Send the Player's answer to a Lock. The Room says only whether it opened, not which part was wrong. */
  attempt(lockId: string, transcript: Transcript): AttemptReply | Promise<AttemptReply>;
  /** The Player is done with a Lock: they tapped Done on the result, gave up, or the Turn time ran out. The Room decides what comes next. */
  closeLock(lockId: string, why: "finished" | "gave_up" | "time_up"): void;
  /** The Master chose another Puzzle setting. A seat that is not the Master is refused by the Room. */
  setPuzzles(setting: PuzzleSetting): void;
  /** Give the seat up and close the connection. */
  leave(): Promise<void>;
}
