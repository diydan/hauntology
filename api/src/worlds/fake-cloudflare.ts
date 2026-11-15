import { WorldJob } from "../do/world-job";
import type { JobNamespaceLike, R2BucketLike } from "./cloudflare-store";

/** Fakes of R2 and a Durable Object namespace, for tests of `CloudflareWorldStore` and the Worker. They follow the documented behaviour; they are not the real services. */

type Held = { bytes: Uint8Array; uploaded: Date; customMetadata?: Record<string, string>; contentType?: string };

export class FakeR2 implements R2BucketLike {
  readonly objects = new Map<string, Held>();
  /** Every `delete` call, in order, so a test can see batches. */
  readonly deletes: string[][] = [];
  /** Every `list` call's prefix, in order. */
  readonly lists: string[] = [];
  /** The largest page this fake returns, whatever `limit` says (R2 caps at 1000). */
  pageSize = 1000;

  put(key: string, bytes: Uint8Array | string, uploaded: Date = new Date(), extra: { customMetadata?: Record<string, string>; contentType?: string } = {}): this {
    this.objects.set(key, { bytes: typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes, uploaded, ...extra });
    return this;
  }

  async head(key: string) {
    const o = this.objects.get(key);
    return o === undefined ? null : { size: o.bytes.byteLength, ...(o.customMetadata ? { customMetadata: o.customMetadata } : {}) };
  }

  async get(key: string, options?: { range?: { offset: number; length: number } }) {
    const o = this.objects.get(key);
    if (o === undefined) return null;
    const r = options?.range;
    const bytes = r === undefined ? o.bytes : o.bytes.slice(r.offset, r.offset + r.length);
    return {
      key,
      size: o.bytes.byteLength,
      uploaded: o.uploaded,
      ...(o.contentType ? { httpMetadata: { contentType: o.contentType } } : {}),
      body: new Response(bytes).body as ReadableStream<Uint8Array>,
      text: async () => new TextDecoder().decode(bytes),
    };
  }

  async list(options: { prefix: string; cursor?: string; limit?: number }) {
    this.lists.push(options.prefix);
    // The cursor is the last key of the page before, as in R2, so deleting while listing skips nothing.
    const keys = [...this.objects.keys()].filter((k) => k.startsWith(options.prefix) && (options.cursor === undefined || k > options.cursor)).sort();
    const size = Math.min(options.limit ?? this.pageSize, this.pageSize);
    const page = keys.slice(0, size);
    const truncated = keys.length > size;
    return {
      objects: page.map((key) => ({ key, size: (this.objects.get(key) as Held).bytes.byteLength, uploaded: (this.objects.get(key) as Held).uploaded })),
      truncated,
      ...(truncated ? { cursor: page[page.length - 1] as string } : {}),
    };
  }

  async delete(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    this.deletes.push(list);
    for (const k of list) this.objects.delete(k);
  }
}

/** A Durable Object state with the storage calls `WorldJob` and `SpendGuard` use, and an alarm. */
export function fakeState(): { state: DurableObjectState; data: Map<string, unknown>; alarm: { at: number | null; sets: number[] } } {
  const data = new Map<string, unknown>();
  const alarm: { at: number | null; sets: number[] } = { at: null, sets: [] };
  const storage = {
    get: async (key: string) => (data.has(key) ? structuredClone(data.get(key)) : undefined),
    put: async (key: string, value: unknown) => void data.set(key, structuredClone(value)),
    delete: async (key: string) => data.delete(key),
    deleteAll: async () => void data.clear(),
    list: async (options: { prefix?: string } = {}) => {
      const out = new Map<string, unknown>();
      for (const [k, v] of [...data].sort(([a], [b]) => (a < b ? -1 : 1))) if (k.startsWith(options.prefix ?? "")) out.set(k, structuredClone(v));
      return out;
    },
    getAlarm: async () => alarm.at,
    setAlarm: async (at: number) => { alarm.at = at; alarm.sets.push(at); },
    deleteAlarm: async () => { alarm.at = null; },
  };
  return { state: { storage } as unknown as DurableObjectState, data, alarm };
}

type Fetching = { fetch(request: Request): Promise<Response> };

/** A Durable Object namespace made of objects built by `make`, one per name. */
export class FakeNamespace<T extends Fetching> implements JobNamespaceLike {
  readonly objects = new Map<string, T>();
  readonly data = new Map<string, Map<string, unknown>>();
  readonly alarms = new Map<string, { at: number | null; sets: number[] }>();
  /** Every name a stub was asked for, in order. */
  readonly asked: string[] = [];
  /** Every request sent, as `METHOD name`, in order. */
  readonly calls: string[] = [];

  constructor(private readonly make: (state: DurableObjectState) => T) {}

  idFromName(name: string): string {
    return name;
  }

  get(id: unknown) {
    const name = String(id);
    this.asked.push(name);
    let object = this.objects.get(name);
    if (object === undefined) {
      const { state, data, alarm } = fakeState();
      object = this.make(state);
      this.objects.set(name, object);
      this.data.set(name, data);
      this.alarms.set(name, alarm);
    }
    const target = object;
    return {
      fetch: (input: string, init?: RequestInit) => {
        this.calls.push(`${init?.method ?? "GET"} ${name}`);
        return target.fetch(new Request(input, init));
      },
    };
  }
}

export class FakeJobs extends FakeNamespace<WorldJob> {
  constructor() {
    super((state) => new WorldJob(state));
  }
  /** The `WorldJob` objects by world id. */
  get jobs(): Map<string, WorldJob> {
    return this.objects;
  }
}
