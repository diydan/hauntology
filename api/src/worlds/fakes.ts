import { MapKv } from "@hauntology/shared/world/map-kv";
import type { Meter, Remaining, ReserveResult, SpendGuard, SpendTicket } from "@hauntology/shared/world/spend";
import { DEFAULT_CAPS, SpendLedger, type CapTable } from "@hauntology/shared/world/spend-ledger";
import type { ErrorCode } from "@hauntology/shared/errors";
import type { WorldManifest } from "@hauntology/shared/world/manifest";
import type { ImageInfo, ImageStore, Ingestor, TurnstileVerifier, UploadStore, UpstreamFailure, WorldLabsPort, WorldStarter } from "./ports";

/** Stand-ins for the parts of world creation that are not built yet (the job 7.1, uploads 5.1) and an in-process `SpendGuard`, for tests and the test-only dev worker. None of them is durable. */

export class MemoryImageStore implements ImageStore {
  readonly images = new Map<string, { info: ImageInfo; bytes: Uint8Array }>();
  put(info: ImageInfo, bytes: Uint8Array = Uint8Array.from([1, 2, 3])): this {
    this.images.set(info.id, { info, bytes });
    return this;
  }
  async find(imageId: string): Promise<ImageInfo | null> {
    return this.images.get(imageId)?.info ?? null;
  }
  async read(imageId: string): Promise<{ body: Uint8Array; size: number; contentType: string } | null> {
    const o = this.images.get(imageId);
    return o === undefined ? null : { body: o.bytes, size: o.bytes.byteLength, contentType: o.info.contentType };
  }
}

/** An `UploadStore` over a `MemoryImageStore`, so what an upload stores can be read back through `GET /api/images/:id` and quoted. */
export class MemoryUploads implements UploadStore {
  /** Every `put`, in order. */
  readonly puts: { imageId: string; bytes: Uint8Array; meta: Parameters<UploadStore["put"]>[2] }[] = [];
  /** Make the next `put` fail, this many times. */
  failures = 0;
  constructor(readonly images: MemoryImageStore = new MemoryImageStore()) {}
  async put(imageId: string, bytes: Uint8Array, meta: Parameters<UploadStore["put"]>[2]): Promise<void> {
    if (this.failures > 0) {
      this.failures--;
      throw new Error("storage down");
    }
    this.puts.push({ imageId, bytes, meta });
    // Like the real store: not yet checked (`pending`), an upload, no brief.
    this.images.put({ id: imageId, ownerSid: meta.ownerSid, sha256: meta.sha256, moderation: "pending", contentType: meta.contentType, source: "upload" }, bytes);
  }
}

export { DEFAULT_CAPS };

/**
 * `SpendGuard` for one process, for tests: the real `SpendLedger` over a `Map`, with a clock the test controls
 * (`commit`, `release` and `remaining` have no time of their own to pass). The Durable Object is `do/spend-guard.ts`.
 */
export class MemorySpendGuard implements SpendGuard {
  readonly kv = new MapKv();
  private readonly ledger: SpendLedger;
  /** Every `reserve`, as `meter:sessionId`, granted or not. */
  readonly reserveCalls: string[] = [];

  constructor(caps: CapTable = DEFAULT_CAPS, private readonly clock: () => number = Date.now) {
    this.ledger = new SpendLedger(this.kv, caps, () => crypto.getRandomValues(new Uint8Array(16)));
  }

  /** The kill switch for new worlds. */
  set killed(on: boolean) {
    this.kv.data.set("kill", on);
  }

  async reserve(req: { meter: Meter; sessionId: string; ipHash: string; now: number }): Promise<ReserveResult> {
    this.reserveCalls.push(`${req.meter}:${req.sessionId}`);
    return this.ledger.reserve(req);
  }
  commit(ticket: SpendTicket): Promise<void> {
    return this.ledger.commit(ticket, this.clock());
  }
  release(ticket: SpendTicket): Promise<void> {
    return this.ledger.release(ticket, this.clock());
  }
  remaining(sessionId: string, ipHash: string): Promise<Remaining> {
    return this.ledger.remaining(sessionId, ipHash, this.clock());
  }
  status() {
    return this.ledger.status(this.clock());
  }

  /** Units a Session has reserved or committed on a meter, for tests. */
  usedOn(meter: Meter, sessionId: string): number {
    return (this.kv.data.get(`ses:${sessionId}`) as { n: Partial<Record<Meter, number>> } | undefined)?.n[meter] ?? 0;
  }
  stateOf(ticketId: string): string | undefined {
    return (this.kv.data.get(`tk:${ticketId}`) as { state: string } | undefined)?.state;
  }
}

export class FakeTurnstile implements TurnstileVerifier {
  readonly calls: { token: string; ip: string | null }[] = [];
  constructor(private readonly accepted: ReadonlySet<string> = new Set(["good-token"])) {}
  async verify(token: string, ip: string | null): Promise<boolean> {
    this.calls.push({ token, ip });
    return this.accepted.has(token);
  }
}

/** Remembers what it was asked to start and never calls anything. */
export class RecordingStarter implements WorldStarter {
  readonly started: { worldId: string; imageId: string; ownerSid: string; ticket: SpendTicket }[] = [];
  /** Set to make `start` say no, or throw. */
  fail: { code: ErrorCode } | "throw" | null = null;
  async start(job: { worldId: string; imageId: string; ownerSid: string; ticket: SpendTicket }) {
    if (this.fail === "throw") throw new Error("starter exploded");
    if (this.fail !== null) return { ok: false as const, code: this.fail.code };
    this.started.push(job);
    return { ok: true as const };
  }
}

type Scripted<T> = T | UpstreamFailure | (() => Promise<T | UpstreamFailure>);

/**
 * A scriptable world service. Each call takes the next scripted answer (the last one repeats); a function answer may
 * throw. It records every call and never leaves the process.
 */
export class FakeWorldLabs implements WorldLabsPort {
  readonly generated: { image: Uint8Array; contentType: string; name: string }[] = [];
  readonly polled: string[] = [];
  generateScript: Scripted<{ ok: true; operationId: string }>[] = [{ ok: true, operationId: "op-1" }];
  pollScript: Scripted<{ ok: true; state: "pending" | "done" | "failed" }>[] = [{ ok: true, state: "done" }];

  private next<T>(script: Scripted<T>[], calls: number): Promise<T | UpstreamFailure> {
    const a = script[Math.min(calls, script.length - 1)] as Scripted<T>;
    return typeof a === "function" ? (a as () => Promise<T | UpstreamFailure>)() : Promise.resolve(a);
  }
  generate(req: { image: Uint8Array; contentType: string; name: string }) {
    this.generated.push(req);
    return this.next(this.generateScript, this.generated.length - 1);
  }
  poll(operationId: string) {
    this.polled.push(operationId);
    return this.next(this.pollScript, this.polled.length - 1);
  }
}

/** A scriptable ingest step that makes a manifest, or says no. */
export class FakeIngestor implements Ingestor {
  readonly calls: Parameters<Ingestor["ingest"]>[0][] = [];
  script: Scripted<{ ok: true; manifest: WorldManifest }>[] | null = null;
  constructor(private readonly manifestFor: (worldId: string) => WorldManifest) {}
  async ingest(job: Parameters<Ingestor["ingest"]>[0]) {
    this.calls.push(job);
    if (this.script === null) return { ok: true as const, manifest: this.manifestFor(job.worldId) };
    const a = this.script[Math.min(this.calls.length - 1, this.script.length - 1)] as Scripted<{ ok: true; manifest: WorldManifest }>;
    const r = typeof a === "function" ? await (a as () => Promise<{ ok: true; manifest: WorldManifest } | UpstreamFailure>)() : a;
    return r as { ok: true; manifest: WorldManifest } | { ok: false; code: "ingest_failed" } | UpstreamFailure;
  }
}
