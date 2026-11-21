import { normalizeCode } from "@hauntology/shared/party/roomCode";
import { VoiceLineSchema, type VoiceLine } from "@hauntology/shared/voice/line";
import type { PlaySessions } from "../play/ports";
import type { JobNamespaceLike } from "../worlds/cloudflare-store";

/**
 * Where the speech route finds the line a visitor asks to hear (ghost-voice 3.5, 3.6, and 3.9). A line is found by its id AND the game or Room
 * it belongs to AND the Session or Host token that owns it: someone else's line, a line that has expired and a line that never existed are
 * the same answer, `null`, so an id tells nobody anything.
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

export interface RoomVoiceLineStore {
  findRoomLine(roomCode: string, lineId: string, hostToken: string): Promise<VoiceLine | null>;
}

/** Reads a live line from a `PartyRoom` Durable Object when presented with that Room's Host token (`ghost-voice` 3.9). */
export class CloudflareRoomVoiceLines implements RoomVoiceLineStore {
  constructor(private readonly rooms: JobNamespaceLike) {}

  async findRoomLine(roomCode: string, lineId: string, hostToken: string): Promise<VoiceLine | null> {
    const code = normalizeCode(roomCode);
    if (code === null || hostToken === "") return null;
    try {
      const stub = this.rooms.get(this.rooms.idFromName(code));
      const res = await stub.fetch("https://party/voice-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineId, token: hostToken }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { line?: unknown };
      const parsed = VoiceLineSchema.safeParse(body.line);
      return parsed.success ? (parsed.data as VoiceLine) : null;
    } catch {
      return null;
    }
  }
}
