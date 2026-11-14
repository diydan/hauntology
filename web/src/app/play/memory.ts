import type { ConditionsChoice } from "@hauntology/shared/conditions/types";

/**
 * What one visit remembers between Screens, in memory only (never storage, a cookie or a URL):
 * the ghost and sky the visitor chose on Haunt, the play session Play started, and the last words
 * the ghost spoke. The API's Session record holds only ids; this holds the rest for the tab.
 *
 * `startFresh` makes Play begin a new play session even when the Session names an old one:
 * "Walk in" and "Haunt again" set it; a reload does not.
 */
export type PlayMemory = {
  playId?: string | undefined;
  ghostPreset?: string | undefined;
  conditions?: ConditionsChoice | undefined;
  startFresh: boolean;
  /** The ghost's last line when the game ended, for the Ending card. */
  farewell?: string | undefined;
};

export type PlayMemoryStore = {
  get(): PlayMemory;
  set(patch: Partial<PlayMemory>): void;
  clear(): void;
};

export function createPlayMemory(): PlayMemoryStore {
  let memory: PlayMemory = { startFresh: false };
  return {
    get: () => memory,
    set(patch) {
      memory = { ...memory, ...patch };
    },
    clear() {
      memory = { startFresh: false };
    },
  };
}
