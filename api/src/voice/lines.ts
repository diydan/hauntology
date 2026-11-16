import type { VoiceLine } from "@hauntology/shared/voice/line";

/**
 * Where the speech route finds the line a visitor asks to hear (ghost-voice 3.5 and 3.6). A line is found by its id AND the game it belongs to
 * AND the Session that owns the game, the way a game is found (`PlaySessions`): someone else's line, a line that has expired and a line that
 * never existed are the same answer, `null`, so an id tells nobody anything.
 *
 * Behind it sit the lines a `PlaySession` keeps (the last 8, valid for 10 minutes, under unguessable ids); that is task 3.5 and is not built yet.
 * Until it is, nothing in the Worker passes this port, and the route is not served.
 */
export type LineScope = { playId: string; ownerSid: string };

export interface VoiceLines {
  find(scope: LineScope, lineId: string): Promise<VoiceLine | null>;
}
