/**
 * Room-scoped generated song storage (game-songs 3.1, Requirement 3.3).
 *
 * Objects live under `songs/room-<roomCode>/<key>.mp3` and are purged cleanly when the Room ends.
 */
export type SongBucket = {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string } } | null>;
  put(key: string, value: ArrayBuffer | ArrayBufferView, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(key: string): Promise<unknown>;
  list(options?: { prefix?: string; cursor?: string }): Promise<{ objects: Array<{ key: string }>; truncated?: boolean; cursor?: string }>;
};

const roomPrefix = (roomCode: string): string => `songs/room-${roomCode.trim().toUpperCase()}/`;
const safeKey = (key: string): string => key.replace(/[^A-Za-z0-9_-]/g, "_");
export const roomSongObjectKey = (roomCode: string, songKey: string): string => `${roomPrefix(roomCode)}${safeKey(songKey)}.mp3`;

export class RoomSongStore {
  constructor(private readonly bucket: SongBucket) {}

  async put(roomCode: string, songKey: string, audio: Uint8Array): Promise<void> {
    await this.bucket.put(roomSongObjectKey(roomCode, songKey), audio, {
      httpMetadata: { contentType: "audio/mpeg" },
    });
  }

  async get(roomCode: string, songKey: string): Promise<Uint8Array | null> {
    const obj = await this.bucket.get(roomSongObjectKey(roomCode, songKey));
    if (obj === null) return null;
    return new Uint8Array(await obj.arrayBuffer());
  }

  async deleteRoomSongs(roomCode: string): Promise<number> {
    const prefix = roomPrefix(roomCode);
    let cursor: string | undefined;
    let deleted = 0;
    do {
      const page = await this.bucket.list({ prefix, ...(cursor !== undefined ? { cursor } : {}) });
      for (const item of page.objects) {
        await this.bucket.delete(item.key);
        deleted++;
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor !== undefined);
    return deleted;
  }
}
