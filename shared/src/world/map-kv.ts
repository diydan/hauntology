import type { Kv } from "./spend-ledger";

/** A `Kv` over a `Map`, for tests and for fakes of `SpendGuard`. Values are copied in and out, like the real storage. */
export class MapKv implements Kv {
  readonly data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    const v = this.data.get(key);
    return v === undefined ? undefined : (structuredClone(v) as T);
  }

  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, structuredClone(value));
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async list<T>(options: { prefix: string }): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    for (const [k, v] of [...this.data].sort(([a], [b]) => (a < b ? -1 : 1))) if (k.startsWith(options.prefix)) out.set(k, structuredClone(v) as T);
    return out;
  }
}
