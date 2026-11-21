import type { JoinRefusal } from "@hauntology/shared/party/seats";
import type { PublicDoor } from "@hauntology/shared/party/doors";
import type { Errand, ErrandObject } from "@hauntology/shared/party/errands";
import type { Preset } from "@hauntology/shared/puzzles/settings";
import type { Kind, LockView, PuzzleSetting, Sight, Transcript } from "@hauntology/shared/puzzles/types";
import type { CluePlace, PublicWorldClue, Sign } from "@hauntology/shared/puzzles/world-clues";
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
  /** World Clue mark & prompt when the Lock's clue lives in the shared world (world-clues 3.1, 3.2). */
  sign?: Sign;
  prompt?: string;
  canSeeAgain?: boolean;
  attempts: number;
  /** The most Turn time this Lock may use, or null. */
  capMs: number | null;
}>;

export type ControllerErrandsView = Readonly<{
  on: boolean;
  optOut: boolean;
  poltergeist: boolean;
  errand: Errand | null;
  doneTriedThisRound: boolean;
  ask: Readonly<{ errandId: string; object: ErrandObject; deadlineMs: number }> | null;
  poltergeists: readonly Readonly<{ seat: number; nickname: string }>[];
  caughtUsed: boolean;
  seatName: (seat: number) => string;
}>;

export type ControllerDoorLock = Readonly<{
  doorId: string;
  triesLeft: number;
  faded: Sight | null;
  lastResult?: Readonly<{ outcome: "opened" | "wrong" | "failed"; heard: string; triesLeft: number }>;
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
  master: Readonly<{ puzzles: PuzzleSetting; preset: Preset; cluePlace?: CluePlace; errands?: boolean }> | null;
  lock: LockOffer | null;
  /** This seat's sound consent as the Room has it; absent means yes. */
  soundConsent?: boolean;
  /** World Clues and Decoys kept on this seat's own Turn (shown when Assist is on). */
  worldClues?: readonly PublicWorldClue[];
  /** Private Errands state for this phone (errands spec Groups 3 & 4). */
  errands?: ControllerErrandsView;
  /** Public door states in this Room (knock-door 4.2, 8.2). */
  doors?: readonly PublicDoor[];
  /** Validation fault codes if the picked world's doors were disabled at start (knock-door 1.4). */
  doorProblems?: readonly string[];
  /** Active shut knock door at this Detective's feet on their Turn (knock-door 3.3). */
  doorLock?: ControllerDoorLock | null;
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
  /** This seat's sound consent changed (the Sound switch): the Room keeps it with the seat, and the Synth plays only while it is yes (puzzles 5.6). */
  setSound?(consent: boolean): void;
  /** The Master chose another Puzzle setting. A seat that is not the Master is refused by the Room. */
  setPuzzles(setting: PuzzleSetting): void;
  /** The Master chose where Memory clues live (`phone` or `world`). */
  setCluePlace?(place: CluePlace): void;
  /** Master-only: switch Haunting errands on or off (from next Errand). */
  setErrands?(on: boolean): void;
  /** Any Player: opt out of being chosen as an Errand Target. */
  setErrandOptOut?(on: boolean): void;
  /** Poltergeist taps Done on their open Errand. */
  errandDone?(): void;
  /** Target answers the private "Are you holding a <object>?" prompt. */
  errandAnswer?(yes: boolean): void;
  /** Detective calls Caught once per Round. */
  errandCaught?(poltergeist: number, object: ErrandObject): void;
  /** Player acts on a shut heavy door (knock-door 4.2). */
  doorAct?(doorId: string): void;
  /** Detective sends knock timestamps (ms) for a shut knock door (knock-door 3.3). */
  doorKnock?(doorId: string, times: readonly number[]): void;
  /** Give the seat up and close the connection. */
  leave(): Promise<void>;
}
