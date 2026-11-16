import type { VoiceLine } from "@hauntology/shared/voice/line";
import type { PlaySessions } from "../play/ports";

/**
 * Where the speech route finds the line a visitor asks to hear (ghost-voice 3.5 and 3.6). A line is found by its id AND the game it belongs to
 * AND the Session that owns the game, the way a game is found (`PlaySessions`): someone else's line, a line that has expired and a line that
 * never existed are the same answer, `null`, so an id tells nobody anything.
 *
 * Behind it sit the lines a `PlaySession` keeps (the last 8, valid for 10 minutes, under unguessable ids): `PlayVoiceLines` below.
 */
export type LineScope = { playId: string; ownerSid: string };

export interface VoiceLines {
  find(scope: LineScope, lineId: string): Promise<VoiceLine | null>;
}

/** The lines of a Single-player game, read through the same port the play routes use, so the owner check and the expiry are the game's own. */
export class PlayVoiceLines implements VoiceLines {
  constructor(private readonly sessions: Pick<PlaySessions, "voiceLine">) {}

  find(scope: LineScope, lineId: string): Promise<VoiceLine | null> {
    return this.sessions.voiceLine(scope.playId, scope.ownerSid, lineId);
  }
}
