import type { Kind, Lock } from "./types";

/** What the registry says about each Kind. Every Kind has a touch path; tilt, buzz, sound and breath are extras. */
export type KindInfo = Readonly<{ memory: boolean; usesTilt: boolean; touchPath: true }>;

export const KIND_INFO: Readonly<Record<Kind, KindInfo>> = {
  lockpick: { memory: false, usesTilt: true, touchPath: true },
  wires: { memory: true, usesTilt: false, touchPath: true },
  clock: { memory: true, usesTilt: false, touchPath: true },
  safe: { memory: true, usesTilt: false, touchPath: true },
  musicbox: { memory: false, usesTilt: false, touchPath: true },
  candles: { memory: false, usesTilt: false, touchPath: true },
  moved: { memory: true, usesTilt: false, touchPath: true },
  photo: { memory: true, usesTilt: false, touchPath: true },
  words: { memory: false, usesTilt: true, touchPath: true },
  board: { memory: false, usesTilt: true, touchPath: true },
  maze: { memory: false, usesTilt: true, touchPath: true },
};

/** The smallest believable solve time for a Lock, in ms (starting guesses; Spike puzzles 1.5 tunes them). */
export function minSolveMs(lock: Lock): number {
  switch (lock.kind) {
    case "lockpick": return 800 * lock.view.pins;
    case "wires": return 2500;
    case "clock": return lock.view.stepMin === 1 ? 2500 : 1500;
    case "safe": return 3000;
    case "musicbox": return 600 * lock.view.n;
    case "candles": return 2000;
    case "moved": return 3000;
    case "photo": return 1000 * lock.view.cols * lock.view.rows;
    case "words": return 3000;
    case "board": return 800 * lock.view.length;
    case "maze": return 3000;
  }
}
