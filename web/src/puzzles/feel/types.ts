import type { HapticName } from "@hauntology/shared/puzzles/haptics";
import type { Tilt } from "@hauntology/shared/puzzles/motion";
import type { SoundName } from "@hauntology/shared/puzzles/sound";

/**
 * The phone's extras: tilt, buzz, sound and breath. Each is optional and every Kind works with touch alone, so every
 * interface here can be swapped for a fake (tests, the demo, a desktop browser). Nothing here is ever required.
 */
export type TiltState = "off" | "on" | "denied" | "unsupported";
export type SoundState = "locked" | "on" | "unsupported";
export type MicState = "off" | "on" | "denied" | "unsupported";

/** A buzz or sound that was made, so the screen can show its visual twin. A sound with `muted` was not heard. */
export type FeelEvent = Readonly<{ type: "buzz"; name: HapticName }> | Readonly<{ type: "sound"; name: SoundName; muted: boolean }>;

export type FeelSettings = Readonly<{
  /** No tilt, buzz, sound or microphone at all: the Touch path. */
  touchOnly: boolean;
  /** Multiplier on tilt, 0.4 to 2.5. */
  sensitivity: number;
  /** `auto` buzzes where the phone can and shows the twin where it cannot. */
  hapticMode: "auto" | "vibrate" | "visual";
  /** Flip the twist direction (platforms disagree on the sign). */
  dialInvert: boolean;
  /** The owner's yes to sound (the seat's choice in Party Mode, the Sound switch in Wander). */
  soundConsent: boolean;
}>;

export const DEFAULT_FEEL_SETTINGS: FeelSettings = { touchOnly: false, sensitivity: 1, hapticMode: "auto", dialInvert: false, soundConsent: true };

/** Subscribe to changes of a piece of state; the returned function unsubscribes. */
export type Subscribe = (listener: () => void) => () => void;

export interface Motion {
  readonly state: TiltState;
  /** The latest tilt (smoothed, zeroed, clamped and scaled by the sensitivity), degrees. Read it inside a frame; it is not state. */
  readonly tilt: Tilt;
  /** The turn of the phone about its screen axis (twist), degrees, or null when the phone lies flat or there is no data. */
  readonly dial: number | null;
  /** Ask for tilt. Must be called from a tap (an iPhone only prompts for a direct tap). Resolves to the new state. */
  enable(): Promise<TiltState>;
  disable(): void;
  /** The angle the phone is held at now becomes neutral. */
  holdLevel(): void;
  /** Called when `state` changes. */
  subscribe: Subscribe;
}

export interface Haptics {
  /** `vibrate` where the phone can buzz; `visual` where it cannot (every buzz then has only its twin). */
  readonly mode: "vibrate" | "visual";
  /** Whether this phone can buzz at all (feature detection), whatever the Player's setting says. */
  readonly supported: boolean;
  /** Start a fresh Attempt: the limits (four pulses a second, six seconds, one rumble) count from here. */
  newAttempt(): void;
  /** Buzz and show the twin. False when the limiter dropped it. */
  buzz(name: HapticName): boolean;
  /** Lock pick hot and cold: call every frame; pulses when the interval for this distance has passed. Returns the interval. */
  hotCold(distanceDeg: number, windowDeg: number): number;
}

export interface Synth {
  readonly state: SoundState;
  /** Unlock audio. Must be called from a tap. */
  unlock(): Promise<SoundState>;
  /** Make a sound. False when nothing was heard (locked, no consent, or too many voices); the twin event still fires. */
  play(name: SoundName): boolean;
  note(index: 0 | 1 | 2 | 3 | 4): boolean;
  subscribe: Subscribe;
}

export interface Breath {
  readonly state: MicState;
  /** Loudness of the room now, 0 to 1. A number only: no audio is ever kept or sent. */
  readonly level: number;
  /** True while a breath (loudness above the threshold for 300 ms) is happening. */
  readonly blowing: boolean;
  /** The loudness a breath must pass. */
  readonly threshold: number;
  /** Ask for the microphone. Must be called from a tap. */
  start(): Promise<MicState>;
  stop(): void;
  subscribe: Subscribe;
}

export type PuzzleFeel = Readonly<{
  motion: Motion;
  haptics: Haptics;
  synth: Synth;
  breath: Breath;
  /** Every buzz and sound that is made, for the visual twin. */
  onEvent(listener: (e: FeelEvent) => void): () => void;
  /** Stop every sensor (a Lock closing, the page leaving). */
  closeLock(): void;
}>;
