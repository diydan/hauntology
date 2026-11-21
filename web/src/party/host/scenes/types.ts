import type { ShotLine } from "@hauntology/shared/party/scenes";

/**
 * What the Host's scenes need from the page (puzzles 14.2 to 14.4): where the clip files are, whether footage is on, and how to make the two
 * sounds and the spoken line. Every dependency is optional: with none the scenes are words only, and the game reads the same (Requirements
 * 19.4, 20.5, 21.5). The clip files are not shipped in `web/public` yet (their rights are still open, puzzles 13.6 and 13.7), so `clipUrl` gives
 * null until a build supplies them.
 */
export type SceneDeps = Readonly<{
  /** True when the Master has footage on. Off (or absent): the stills, or the words alone. */
  footage: boolean;
  /** The data-saver preference of the browser, read once by the page (`navigator.connection.saveData`). */
  saveData: boolean;
  /** The URL of a clip file by name and kind, or null when this build has none. */
  clipUrl: (clip: string, kind: "webm" | "mp4" | "jpg") => string | null;
  /** The Master's Sound switch (a sound of our own is never the only signal). */
  soundOn: boolean;
  /** Plays one of the Reel's two sounds from `web/public/sounds/`. */
  playSound?: (name: "scrape" | "knock") => void;
  /** The Master's narration switch (party-mode 7.6). */
  narrationOn: boolean;
  /** Asks the Voice Library for a line's recorded audio. The words are always shown whatever this does. */
  speak?: (line: ShotLine) => void;
}>;

/** True when footage may run at all: on, not reduced motion, not data saver (Requirements 19.4, 21.5). */
export const footageRuns = (d: SceneDeps | undefined, reducedMotion: boolean): boolean => d !== undefined && d.footage && !d.saveData && !reducedMotion;
