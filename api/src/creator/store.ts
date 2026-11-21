import type { GhostProfile } from "@hauntology/shared/creator/profile";
import { parseProfile } from "@hauntology/shared/creator/profile";
import type { Traits } from "@hauntology/shared/creator/traits";
import type { CandidateBucket } from "../worlds/cloudflare-candidates";
import { bundleKey, candidateKey, spriteKey } from "../worlds/keys";

/**
 * Where the Creator keeps things (ghost-creator task 3): portrait candidates (a Session's,
 * for a day, under the candidates prefix), the accepted sprite and the Ghost Profile of a
 * world (the profile rides in the world's own bundle as `ghost.json`, so deleting a world
 * deletes it too; the sprite under the sprite key retention already knows). Memory here
 * for tests, R2 in production; both answer the same way.
 */
export type StoredCandidate = { bytes: Uint8Array; contentType: string; ownerSid: string; traits: Traits; seed: number };

export interface CreatorStore {
  putCandidate(candidateId: string, bytes: Uint8Array, meta: Omit<StoredCandidate, "bytes">): Promise<void>;
  readCandidate(candidateId: string): Promise<StoredCandidate | null>;
  saveGhost(worldId: string, profile: GhostProfile, spritePng: Uint8Array): Promise<void>;
  /** A profile whose sprite is a shipped static file (a chosen Preset): only the profile is stored. */
  saveProfile(worldId: string, profile: GhostProfile): Promise<void>;
  readProfile(worldId: string): Promise<GhostProfile | null>;
  readSprite(worldId: string): Promise<Uint8Array | null>;
}

export class MemoryCreatorStore implements CreatorStore {
  readonly candidates = new Map<string, StoredCandidate>();
  readonly profiles = new Map<string, GhostProfile>();
  readonly sprites = new Map<string, Uint8Array>();

  async putCandidate(id: string, bytes: Uint8Array, meta: Omit<StoredCandidate, "bytes">): Promise<void> {
    this.candidates.set(id, { bytes, ...meta });
  }
  async readCandidate(id: string): Promise<StoredCandidate | null> {
    return this.candidates.get(id) ?? null;
  }
  async saveGhost(worldId: string, profile: GhostProfile, spritePng: Uint8Array): Promise<void> {
    this.profiles.set(worldId, profile);
    this.sprites.set(worldId, spritePng);
  }
  async saveProfile(worldId: string, profile: GhostProfile): Promise<void> {
    this.profiles.set(worldId, profile);
  }
  async readProfile(worldId: string): Promise<GhostProfile | null> {
    return this.profiles.get(worldId) ?? null;
  }
  async readSprite(worldId: string): Promise<Uint8Array | null> {
    return this.sprites.get(worldId) ?? null;
  }
}

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const sha256Hex = async (bytes: Uint8Array): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer))].map((b) => b.toString(16).padStart(2, "0")).join("");

export class R2CreatorStore implements CreatorStore {
  constructor(private readonly bucket: CandidateBucket) {}

  async putCandidate(id: string, bytes: Uint8Array, meta: Omit<StoredCandidate, "bytes">): Promise<void> {
    await this.bucket.put(candidateKey(id), bytes, {
      httpMetadata: { contentType: meta.contentType },
      customMetadata: { ownerSid: meta.ownerSid, sha256: await sha256Hex(bytes), traits: encodeURIComponent(JSON.stringify(meta.traits)), seed: String(meta.seed) },
    });
  }

  async readCandidate(id: string): Promise<StoredCandidate | null> {
    if (!ID.test(id)) return null;
    const object = await this.bucket.get(candidateKey(id));
    const md = object?.customMetadata;
    if (!object || !md) return null;
    try {
      return {
        bytes: new Uint8Array(await object.arrayBuffer()),
        contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
        ownerSid: md.ownerSid as string,
        traits: JSON.parse(decodeURIComponent(md.traits as string)) as Traits,
        seed: Number(md.seed),
      };
    } catch {
      return null;
    }
  }

  async saveGhost(worldId: string, profile: GhostProfile, spritePng: Uint8Array): Promise<void> {
    await this.bucket.put(spriteKey(worldId), spritePng, { httpMetadata: { contentType: "image/png" }, customMetadata: {} });
    await this.saveProfile(worldId, profile);
  }

  async saveProfile(worldId: string, profile: GhostProfile): Promise<void> {
    await this.bucket.put(bundleKey(worldId, "ghost.json"), new TextEncoder().encode(JSON.stringify(profile)), {
      httpMetadata: { contentType: "application/json" }, customMetadata: {},
    });
  }

  async readProfile(worldId: string): Promise<GhostProfile | null> {
    if (!ID.test(worldId)) return null;
    const object = await this.bucket.get(bundleKey(worldId, "ghost.json"));
    if (!object) return null;
    const parsed = parseProfile(new TextDecoder().decode(await object.arrayBuffer()));
    return parsed.ok ? parsed.profile : null;
  }

  async readSprite(worldId: string): Promise<Uint8Array | null> {
    if (!ID.test(worldId)) return null;
    const object = await this.bucket.get(spriteKey(worldId));
    return object ? new Uint8Array(await object.arrayBuffer()) : null;
  }
}
