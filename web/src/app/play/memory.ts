import type { CaseSetup } from "@hauntology/shared/app/case-setup";
import type { ConditionsChoice, MemoryDay } from "@hauntology/shared/conditions/types";

/**
 * What one visit remembers between Screens, in memory only (never storage, a cookie or a URL):
 * the ghost and sky the visitor chose on Haunt, the play session Play started, and the last words
 * the ghost spoke. The API's Session record holds only ids; this holds the rest for the tab.
 *
 * `startFresh` makes Play begin a new play session even when the Session names an old one:
 * "Wander" and "Haunt again" set it; a reload does not.
 *
 * A case (Requirement 13): `caseSetup` is what the setup card holds for this visit. `caseStart` is
 * set by its Start action and means "the Case Screen may open one Room"; it is cleared when the
 * Case Screen is left, so Back, or a reload, shows the setup again and never opens a Room by
 * itself. `caseRefusal` is set when the Host would not make a Room for a world, so Haunt can say why.
 */
export type PlayMemory = {
  playId?: string | undefined;
  ghostPreset?: string | undefined;
  /** The chosen Preset Ghost's name, only to label the choice on Haunt. */
  ghostName?: string | undefined;
  /** The chosen Preset Ghost's picture (an address on this site), for the portrait in the Chat. */
  ghostSprite?: string | undefined;
  conditions?: ConditionsChoice | undefined;
  /** A Memory Day suggested by a photo's capture date (Requirement 12.2); the sky card offers it and the visitor can change or clear it. */
  suggestedDay?: MemoryDay | undefined;
  startFresh: boolean;
  caseSetup?: CaseSetup | undefined;
  caseStart: boolean;
  caseRefusal?: { worldId: string; code: string } | undefined;
  /** The ghost's last line when the game ended, for the Ending card. */
  farewell?: string | undefined;
};

export type PlayMemoryStore = {
  get(): PlayMemory;
  set(patch: Partial<PlayMemory>): void;
  clear(): void;
};

export function createPlayMemory(): PlayMemoryStore {
  let memory: PlayMemory = { startFresh: false, caseStart: false };
  return {
    get: () => memory,
    set(patch) {
      memory = { ...memory, ...patch };
    },
    clear() {
      memory = { startFresh: false, caseStart: false };
    },
  };
}
