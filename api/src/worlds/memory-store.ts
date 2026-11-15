import type { ObjectKind, StoredObject } from "@hauntology/shared/world/retention";
import { bundleKey } from "./keys";
import type { ByteRange, WorldPatch, WorldRecord, WorldStore } from "./store";

type Stored = { bytes: Uint8Array; kind: ObjectKind; createdAt: number; worldId?: string };

/**
 * A `WorldStore` in memory, for tests and for `wrangler dev` with fakes. It does what the real store
 * must: `purge` removes the record, every object of the world and its play sessions.
 */
export class MemoryWorldStore implements WorldStore {
  readonly records = new Map<string, WorldRecord>();
  readonly objects = new Map<string, Stored>();
  /** Play session ids by world, so a test can see `purge` remove them. */
  readonly playSessions = new Map<string, Set<string>>();

  putWorld(record: WorldRecord): this {
    this.records.set(record.id, record);
    return this;
  }

  putObject(key: string, kind: ObjectKind, createdAt: number, bytes: Uint8Array, worldId?: string): this {
    this.objects.set(key, { bytes, kind, createdAt, ...(worldId !== undefined ? { worldId } : {}) });
    return this;
  }

  /** A bundle file of a world (kind `world`). */
  putBundleFile(worldId: string, name: string, bytes: Uint8Array, createdAt: number): this {
    return this.putObject(bundleKey(worldId, name), "world", createdAt, bytes, worldId);
  }

  addPlaySession(worldId: string, playId: string): this {
    const set = this.playSessions.get(worldId) ?? new Set<string>();
    set.add(playId);
    this.playSessions.set(worldId, set);
    return this;
  }

  async find(id: string): Promise<WorldRecord | null> {
    return this.records.get(id) ?? null;
  }

  async create(record: WorldRecord): Promise<boolean> {
    if (this.records.has(record.id)) return false;
    this.records.set(record.id, record);
    return true;
  }

  async update(id: string, patch: WorldPatch): Promise<WorldRecord | null> {
    const current = this.records.get(id);
    if (current === undefined) return null;
    const next = { ...current, ...patch } as WorldRecord;
    this.records.set(id, next);
    return next;
  }

  async stat(world: WorldRecord, name: string): Promise<{ size: number } | null> {
    const o = this.objects.get(bundleKey(world.id, name));
    return o === undefined ? null : { size: o.bytes.byteLength };
  }

  async read(world: WorldRecord, name: string, range?: ByteRange): Promise<Uint8Array | null> {
    const o = this.objects.get(bundleKey(world.id, name));
    if (o === undefined) return null;
    return range === undefined ? o.bytes : o.bytes.slice(range.start, range.end + 1);
  }

  async purge(id: string): Promise<void> {
    this.records.delete(id);
    this.playSessions.delete(id);
    for (const [key, o] of [...this.objects]) if (o.worldId === id) this.objects.delete(key);
  }

  async inventory(): Promise<StoredObject[]> {
    return [...this.objects].map(([key, o]) => ({ key, kind: o.kind, createdAt: o.createdAt, ...(o.worldId !== undefined ? { worldId: o.worldId } : {}) }));
  }

  async removeObjects(keys: readonly string[]): Promise<void> {
    for (const k of keys) this.objects.delete(k);
  }
}
