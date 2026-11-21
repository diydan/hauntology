import type { ReactNode } from "react";
import type { Kind, LockView, Transcript } from "@hauntology/shared/puzzles/types";
import type { PuzzleFeel } from "../feel/types";

/** The view of one Kind. */
export type ViewOf<K extends Kind> = Extract<LockView, { kind: K }>;
/** What a screen sends for an Attempt: the Transcript without `kind` and `elapsedMs`, which the host adds. */
export type Payload<K extends Kind> = Omit<Extract<Transcript, { kind: K }>, "kind" | "elapsedMs">;

/**
 * What every Kind screen receives. A screen draws the Lock, plays with the touch path first and the phone extras
 * (tilt, buzz, sound, breath) as a bonus, and calls `submit` when the Player gives an answer. It does not keep the
 * time, the Attempts or the result: the host does.
 */
export type KindProps<K extends Kind> = Readonly<{
  view: ViewOf<K>;
  feel: PuzzleFeel;
  /** Assist is on: show text for sounds and keep clues longer. */
  assist: boolean;
  /** The Player prefers reduced motion: no shake, no beam sway, no animation that is not needed. */
  reducedMotion: boolean;
  /** Milliseconds since the Lock started (the host's clock). */
  elapsed: () => number;
  submit: (payload: Payload<K>) => void;
  /** Goes up by one after every wrong Attempt. Reset the screen's answer when it changes. */
  resetKey: number;
  /** Say something to a screen reader (a polite live region). */
  announce: (text: string) => void;
  /**
   * Spirit board only: say the word aloud. The real game keeps the word on the server, so the screen never knows it;
   * the Room plays the Whisper's line (or the host speaks it) when this is called. Returns false when nothing could be
   * said (no voice), and the screen falls back to the clue. Absent in the other Kinds.
   */
  hear?: (() => boolean | void | Promise<boolean | void>) | undefined;
  /** Spirit board only, with Assist on: the word as text, which the Room sends to this seat alone (puzzles 8.3). Absent otherwise. */
  assistText?: string | undefined;
  /**
   * The Kinds that steer with Tilt only: the host's tilt buttons ("Tilt", and "Hold level" while it is on), with no
   * wrapper. The screen puts them in a row with its own buttons, so tilt sits with the play controls and apart from Give up.
   */
  tiltButtons?: ReactNode;
}>;
