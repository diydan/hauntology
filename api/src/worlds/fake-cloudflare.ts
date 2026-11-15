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
    const keys = [...this.objects.keys()].filter((k) => k.startsWith(options.prefix)).sort();
    const start = options.cursor === undefined ? 0 : Number(options.cursor);
    const size = Math.min(options.limit ?? this.pageSize, this.pageSize);
    const page = keys.slice(start, start + size);
    const truncated = start + size < keys.length;
    return {
      objects: page.map((key) => ({ key, size: (this.objects.get(key) as Held).bytes.byteLength, uploaded: (this.objects.get(key) as Held).uploaded })),
      truncated,
      ...(truncated ? { cursor: String(start + size) } : {}),
    };
  }

  async delete(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    this.deletes.push(list);
    for (const k of list) this.objects.delete(k);
  }
}

/** A Durable Object state with the three storage calls `WorldJob` uses. */
export function fakeState(): { state: DurableObjectState; data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  const storage = {
    get: async (key: string) => data.get(key),
    put: async (key: string, value: unknown) => void data.set(key, value),
    deleteAll: async () => void data.clear(),
  };
  return { state: { storage } as unknown as DurableObjectState, data };
}

export class FakeJobs implements JobNamespaceLike {
  readonly jobs = new Map<string, WorldJob>();
  readonly data = new Map<string, Map<string, unknown>>();
  /** Every world a stub was asked for, in order. */
  readonly asked: string[] = [];
  /** Every request sent to a `WorldJob`, as `METHOD name`, in order. */
  readonly calls: string[] = [];

  idFromName(name: string): string {
    return name;
  }

  get(id: unknown) {
    const name = String(id);
    this.asked.push(name);
    let job = this.jobs.get(name);
    if (job === undefined) {
      const { state, data } = fakeState();
      job = new WorldJob(state);
      this.jobs.set(name, job);
      this.data.set(name, data);
    }
    const target = job;
    return {
      fetch: (input: string, init?: RequestInit) => {
        this.calls.push(`${init?.method ?? "GET"} ${name}`);
        return target.fetch(new Request(input, init));
      },
    };
  }
}
