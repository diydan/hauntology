/**
 * Stitch consent model (ghost-voice 5.3, Requirement 5.3).
 *
 * Stitch starts off. Only the Master can toggle Stitch on/off; turning it off deletes all clips.
 * Only a human player answering for their own seat (`actorSeat === seat && !isBot`) changes that
 * seat's consent. Consent stores strictly `{ seat, yes, ageOrGuardianTick }` (no age/name/date).
 */
export const STITCH_QUESTION = {
  prompt:
    "Say these short words if you want the ghost to whisper using your voice. Clips are deleted when the game ends, lines may be played aloud on the shared screen and revealed at the end, and a parent or guardian should say yes for a child.",
  tickLabel: "I am 16 or older, or a parent or guardian is saying yes for me",
} as const;

export type StitchConsent = {
  seat: number;
  yes: boolean;
  ageOrGuardianTick: boolean;
};

export type ConsentState = {
  enabled: boolean;
  consents: StitchConsent[];
};

export const INITIAL_CONSENT_STATE: ConsentState = {
  enabled: false,
  consents: [],
};

export type ConsentEvent =
  | { t: "master_switch"; actorIsMaster: boolean; on: boolean }
  | { t: "answer"; actorSeat: number; seat: number; isBot: boolean; yes: boolean; tick: boolean }
  | { t: "leave"; seat: number };

export function consentEffective(c: StitchConsent | null | undefined): boolean {
  return c !== null && c !== undefined && c.yes === true && c.ageOrGuardianTick === true;
}

export function consentReduce(
  state: ConsentState,
  event: ConsentEvent,
): { state: ConsentState; deleteClipsFor: number[] | "all" } {
  switch (event.t) {
    case "master_switch": {
      if (!event.actorIsMaster) return { state, deleteClipsFor: [] };
      if (!event.on) {
        return { state: { enabled: false, consents: [] }, deleteClipsFor: "all" };
      }
      return { state: { ...state, enabled: true }, deleteClipsFor: [] };
    }
    case "answer": {
      if (!state.enabled || event.isBot || event.actorSeat !== event.seat) {
        return { state, deleteClipsFor: [] };
      }
      const nextEntry: StitchConsent = {
        seat: event.seat,
        yes: event.yes,
        ageOrGuardianTick: event.tick,
      };
      const rest = state.consents.filter((c) => c.seat !== event.seat);
      const nextState: ConsentState = {
        ...state,
        consents: [...rest, nextEntry],
      };
      const effective = consentEffective(nextEntry);
      return { state: nextState, deleteClipsFor: effective ? [] : [event.seat] };
    }
    case "leave": {
      const existed = state.consents.some((c) => c.seat === event.seat);
      return {
        state: {
          ...state,
          consents: state.consents.filter((c) => c.seat !== event.seat),
        },
        deleteClipsFor: existed ? [event.seat] : [],
      };
    }
  }
}
