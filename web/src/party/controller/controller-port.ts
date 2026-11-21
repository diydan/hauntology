import type { JoinRefusal } from "@hauntology/shared/party/seats";
import type { PublicDoor } from "@hauntology/shared/party/doors";
import type { Errand, ErrandObject } from "@hauntology/shared/party/errands";
import type { Preset } from "@hauntology/shared/puzzles/settings";
import type { Kind, LockView, PuzzleSetting, Sight, Transcript } from "@hauntology/shared/puzzles/types";
import type { CluePlace, PublicWorldClue, Sign } from "@hauntology/shared/puzzles/world-clues";
import type { PrivateSnapshot, PublicSnapshot } from "@hauntology/shared/party/engine";
import type { TablePrivateInput, TablePublicInput } from "@hauntology/shared/table/data";
import type { TableNotebook } from "@hauntology/shared/table/notebook";
import type { AttemptReply } from "../../puzzles/PuzzleHost";
import type { ContributionApi } from "./contribute-api";
import type { GameView } from "./game-view";

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
  /** Spirit board under Assist: the word as text, from the Room, for this seat alone (puzzles 8.3). */
  assistText?: string;
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

/**
 * What the Spirit table may draw (spirit-table 3.1): the Public View as the table reads it, the Player's own seat, the Player's own notebook
 * and, where the Room has any, how many Spirit clues are read. Nothing else reaches the Table, so a hidden fact cannot, by type. A port that
 * has no such view leaves `table` out, and the Controller then has no Spirit table switch. `solo` is the solo-case rule that removes it.
 */
export type TableFeed = Readonly<{
  pub: TablePublicInput;
  priv: TablePrivateInput | null;
  solo: boolean;
  notebook?: TableNotebook;
  clueCount?: number | null;
}>;

/** The ghost's knock at the TV after a Slam, as a phone sees it: the pattern is heard at the TV, never sent here (knock-door 5.3). */
export type ControllerTvKnock = Readonly<{
  /** The seat that knocked it back first, or null while nobody has. */
  answeredBy: number | null;
  lastResult?: Readonly<{ outcome: "help" | "wrong"; heard: string }>;
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
  /** What the Spirit table may draw (spirit-table 1.1, 3.1). Absent: no Spirit table switch. */
  table?: TableFeed;
  /** The ghost's knock at the TV after a Slam, or none (knock-door 5.3). */
  tvKnock?: ControllerTvKnock | null;
  /** The last thing the Room refused, until its next public view. */
  refused?: string;
  /** A clue the Room showed this seat once (a Sight, on entering a Zone), waiting to be seen. Later ones wait behind it. */
  sight?: Readonly<{ id: string; sight: Sight }>;
  /** The game as this phone knows it, built only from the Room's messages (party-mode 9). Absent in the scripted stand-in. */
  game?: GameView;
  /** This phone's clock against the Room's (`server = phone + offsetMs`), measured with ping and pong; 0 until measured. */
  clock?: Readonly<{ offsetMs: number; errorMs: number }>;
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
  /** This seat's Assist setting changed: under Assist the Room also sends the Spirit board's word as text (puzzles 8.3). */
  setAssist?(on: boolean): void;
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
  /** Any Player: knock the ghost's pattern back at the TV after a Slam; the first right knock gets a Help (knock-door 5.3). */
  tvKnock?(times: readonly number[]): void;
  /** The Sight on screen has been seen, or its time ran out. */
  ackSight?(sightId: string): void;
  /** Send the Room one game message (walk, inspect, suggest, show, seal, choose, hauntPuzzle...). The Room checks it and refuses what is not allowed. Absent in the scripted stand-in. */
  act?(msg: Readonly<{ t: string }> & Record<string, unknown>): void;
  /** Send one message to the Room (a Suggestion, a Cue, a setting...). The Room checks it; the page never does. Absent in the scripted stand-in. */
  send?(msg: Readonly<{ t: string } & Record<string, unknown>>): void;
  /** This seat's contributions to the lobby (a photo, a Zone name, a Suspect); absent in the scripted stand-in. */
  contributions?(): ContributionApi | null;
  /** The Player answered or dismissed the Room's Rattle prompt; it is not shown again until the Room sends another. */
  dismissPrompt?(): void;
  /** After a reload: take the seat this device already holds, from its stored token. Resolves to the join result, or `null` when there is none. */
  restore?(code?: string): Promise<JoinResult | null>;
  /** Give the seat up and close the connection. */
  leave(): Promise<void>;
}
