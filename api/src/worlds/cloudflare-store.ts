import { WorldManifestSchema } from "@hauntology/shared/world/manifest";
import type { StoredObject } from "@hauntology/shared/world/retention";
import { MANIFEST_NAME } from "@hauntology/shared/world/manifest";
import { USER_PREFIXES, bundleKey, bundlePrefix, candidateKey, describeKey, galleryKey, spriteKey, uploadKey } from "./keys";
import { parseStoredWorld } from "./record";
import type { ByteRange, WorldRecord, WorldStore } from "./store";

/** The part of an R2 bucket this store uses. The real `R2Bucket` fits it; tests use a fake. */
export interface R2BucketLike {
  head(key: string): Promise<{ size: number } | null>;
  get(key: string, options?: { range?: { offset: number; length: number } }): Promise<(R2ObjectLike & { body: ReadableStream<Uint8Array>; text(): Promise<string> }) | null>;
  list(options: { prefix: string; cursor?: string; limit?: number }): Promise<{ objects: R2ObjectLike[]; truncated: boolean; cursor?: string }>;
  delete(keys: string | string[]): Promise<void>;
}
type R2ObjectLike = { key: string; size: number; uploaded: Date };

/** The part of a Durable Object namespace this store uses. */
export interface JobNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> };
}

/** Deletes the play sessions of a world (ghost-engine 5, not built yet). */
export interface PlaySessionPurger {
  deleteForWorld(worldId: string): Promise<void>;
}

export type CloudflareStoreDeps = { bucket: R2BucketLike; jobs: JobNamespaceLike; playSessions?: PlaySessionPurger };

const RECORD_URL = "https://world-job/record";
const BATCH = 1000;
/** A bound on one listing, so a cleanup run cannot loop for ever: 100 pages of 1000. */
const MAX_PAGES = 100;

/**
 * The real `WorldStore`: R2 for the bytes, the `WorldJob` Durable Object for a user world's record, and
 * the manifest in the bucket for a Gallery world. Nothing is cached, so a delete is seen at once.
 *
 * - `find`: a Gallery world is `gallery/<id>/world.json` (it must name the same id); anything else asks
 *   the `WorldJob`. The Gallery is looked up first so a Gallery visit never wakes a Durable Object.
 *   An id nobody has still wakes one empty `WorldJob`; the Worker's rate limit, not this store, bounds that.
 * - `purge` and `removeObjects` can never reach `gallery/`: they only act on the four user prefixes.
 */
export class CloudflareWorldStore implements WorldStore {
  constructor(private readonly deps: CloudflareStoreDeps) {}

  private job(id: string) {
    return this.deps.jobs.get(this.deps.jobs.idFromName(id));
  }

  async find(id: string): Promise<WorldRecord | null> {
    const gallery = await this.deps.bucket.get(galleryKey(id, MANIFEST_NAME));
    if (gallery !== null) {
      let parsed: unknown;
      try { parsed = JSON.parse(await gallery.text()); } catch { return null; }
      const manifest = WorldManifestSchema.safeParse(parsed);
      // A manifest that names a different world is not trusted for this id.
      if (!manifest.success || manifest.data.id !== id) return null;
      return { id, kind: "gallery", status: "ready", title: manifest.data.title, manifest: manifest.data };
    }

    const res = await this.job(id).fetch(RECORD_URL);
    if (!res.ok) return null;
    const record = parseStoredWorld(await res.json());
    // The Durable Object is addressed by name; make sure it holds this very world.
    return record !== null && record.id === id ? record : null;
  }

  private keyOf(world: WorldRecord, name: string): string {
    return world.kind === "gallery" ? galleryKey(world.id, name) : bundleKey(world.id, name);
  }

  async stat(world: WorldRecord, name: string): Promise<{ size: number } | null> {
    const head = await this.deps.bucket.head(this.keyOf(world, name));
    return head === null ? null : { size: head.size };
  }

  async read(world: WorldRecord, name: string, range?: ByteRange): Promise<ReadableStream<Uint8Array> | null> {
    const key = this.keyOf(world, name);
    const object = await this.deps.bucket.get(key, range === undefined ? undefined : { range: { offset: range.start, length: range.end - range.start + 1 } });
    return object === null ? null : object.body;
  }

  async purge(id: string): Promise<void> {
    const { bucket } = this.deps;
    const record = await this.find(id);
    const keys: string[] = [spriteKey(id)];
    // Only a user's record names pictures to delete; a Gallery world is never purged.
    if (record !== null && record.kind === "user") {
      if (record.imageId !== undefined) keys.push(uploadKey(record.imageId));
      for (const c of record.candidateIds ?? []) keys.push(candidateKey(c));
    }
    for await (const object of this.listAll(bundlePrefix(id))) keys.push(object.key);
    await this.deleteKeys(keys);

    await this.deps.playSessions?.deleteForWorld(id);
    // The record goes last, so a purge that failed half way can be run again.
    await this.job(id).fetch(RECORD_URL, { method: "DELETE" });
  }

  async inventory(): Promise<StoredObject[]> {
    const out: StoredObject[] = [];
    for (const prefix of USER_PREFIXES) {
      for await (const o of this.listAll(prefix)) {
        const d = describeKey(o.key);
        if (d === null || d.kind === "gallery") continue;
        out.push({ key: o.key, kind: d.kind, createdAt: o.uploaded.getTime(), ...(d.worldId !== undefined ? { worldId: d.worldId } : {}) });
      }
    }
    return out;
  }

  async removeObjects(keys: readonly string[]): Promise<void> {
    await this.deleteKeys(keys.filter((k) => USER_PREFIXES.some((p) => k.startsWith(p))));
  }

  private async deleteKeys(keys: readonly string[]): Promise<void> {
    const unique = [...new Set(keys)];
    for (let i = 0; i < unique.length; i += BATCH) await this.deps.bucket.delete(unique.slice(i, i + BATCH));
  }

  private async *listAll(prefix: string): AsyncGenerator<R2ObjectLike> {
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await this.deps.bucket.list({ prefix, limit: BATCH, ...(cursor !== undefined ? { cursor } : {}) });
      yield* res.objects;
      if (!res.truncated || res.cursor === undefined) return;
      cursor = res.cursor;
    }
  }
}
