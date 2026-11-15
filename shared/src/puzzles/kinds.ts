import type { BuiltKind, Lock } from "./types";

/** What the registry says about each built Kind. Every Kind has a touch path; tilt, buzz and sound are extras. */
export type KindInfo = Readonly<{ memory: boolean; usesTilt: boolean; touchPath: true }>;

export const KIND_INFO: Readonly<Record<BuiltKind, KindInfo>> = {
  lockpick: { memory: false, usesTilt: true, touchPath: true },
  wires: { memory: true, usesTilt: false, touchPath: true },
  clock: { memory: true, usesTilt: false, touchPath: true },
};

/** The smallest believable solve time for a Lock, in ms (starting guesses; Spike puzzles 1.5 tunes them). */
export function minSolveMs(lock: Lock): number {
  switch (lock.kind) {
    case "lockpick": return 800 * lock.view.pins;
    case "wires": return 2500;
    case "clock": return 1500;
  }
}
