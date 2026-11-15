import { MapKv } from "@hauntology/shared/world/map-kv";
import type { Meter, Remaining, ReserveResult, SpendGuard, SpendTicket } from "@hauntology/shared/world/spend";
import { DEFAULT_CAPS, SpendLedger, type CapTable } from "@hauntology/shared/world/spend-ledger";
import type { ErrorCode } from "@hauntology/shared/errors";
import type { ImageInfo, ImageStore, TurnstileVerifier, WorldStarter } from "./ports";

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
