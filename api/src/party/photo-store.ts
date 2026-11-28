import { bundlePrefix, spriteKey } from "../worlds/keys";
import type { SongBucket } from "../songs/store";
import type { PhotoStore } from "./contribute";
import { ghostKey, roomScope } from "./contribute";

/**
 * Where a Room's contributed pictures live (party-mode 10.4): photos under `party/room-<code>/photos/<id>`, private and
 * never listed to a client, and the ghosts the Ghost Creator saved under the world-style keys of `room-<code>-<seat>`.
 * Everything goes when the Room ends: `deleteRoom` removes the photos and every seat's ghost profile and Sprite.
 */
export type PartyBucket = SongBucket;

const photoPrefix = (scope: string): string => `party/${scope}/photos/`;
const safe = (s: string): string => s.replace(/[^A-Za-z0-9_-]/g, "_");

export class R2PhotoStore implements PhotoStore {
  constructor(private readonly bucket: PartyBucket) {}

  async put(photoId: string, bytes: Uint8Array, meta: { contentType: string; room: string; seat: number; promptId?: string }): Promise<void> {
    await this.bucket.put(`${photoPrefix(meta.room)}${safe(photoId)}`, bytes, { httpMetadata: { contentType: meta.contentType } });
  }

  async get(room: string, photoId: string): Promise<Readonly<{ bytes: ArrayBuffer; contentType: string }> | null> {
    const obj = await this.bucket.get(`${photoPrefix(room)}${safe(photoId)}`);
    return obj === null ? null : { bytes: await obj.arrayBuffer(), contentType: obj.httpMetadata?.contentType ?? "image/jpeg" };
  }

  async deleteRoom(room: string): Promise<void> {
    await this.deletePrefix(photoPrefix(room));
    for (let seat = 1; seat <= 6; seat++) {
      const key = ghostKey(room, seat);
      await this.deletePrefix(bundlePrefix(key));
      await this.bucket.delete(spriteKey(key));
    }
  }

  private async deletePrefix(prefix: string): Promise<void> {
    let cursor: string | undefined;
    do {
      const page = await this.bucket.list({ prefix, ...(cursor !== undefined ? { cursor } : {}) });
      for (const item of page.objects) await this.bucket.delete(item.key);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor !== undefined);
  }
}

/** The scope (and so the key prefix) for a Room code. */
export const scopeOf = roomScope;
