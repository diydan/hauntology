import { METERS, type Meter, type Remaining, type ReserveResult, type SpendGuard, type SpendTicket } from "@hauntology/shared/world/spend";
import type { ErrorCode } from "@hauntology/shared/errors";
import type { ImageInfo, ImageStore, TurnstileVerifier, WorldStarter } from "./ports";

/** Stand-ins for the parts of world creation that are not built yet (SpendGuard 4.1, the job 7.1, uploads 5.1), for tests and the test-only dev worker. None of them is durable. */

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

export type Caps = { session: number; day: number; total?: number };
export const DEFAULT_CAPS: Record<Meter, Caps> = {
  world: { session: 2, day: 10, total: 30 },
  image: { session: 8, day: 150 },
  llm: { session: 40, day: 1500 },
  tts: { session: 40, day: 1500 },
  stt: { session: 20, day: 750 },
  live: { session: 30, day: 180 },
};

/**
 * A counter that follows the `SpendGuard` interface for one process: a session cap, a day cap and, for
 * `world`, a total cap, each counting reserved plus committed units; a ticket can be committed or released
 * once and further calls change nothing. It ignores `ipHash` and the 30-minute expiry. The real one is a
 * Durable Object (world-pipeline 4.1).
 */
export class MemorySpendGuard implements SpendGuard {
  killed = false;
  private next = 0;
  private readonly tickets = new Map<string, { ticket: SpendTicket; state: "reserved" | "committed" | "released" }>();
  readonly reserveCalls: string[] = [];
  constructor(private readonly caps: Record<Meter, Caps> = DEFAULT_CAPS) {}

  private used(meter: Meter, sessionId?: string): number {
    let n = 0;
    for (const { ticket, state } of this.tickets.values()) {
      if (state === "released" || ticket.meter !== meter) continue;
      if (sessionId === undefined || ticket.sessionId === sessionId) n++;
    }
    return n;
  }

  async reserve(req: { meter: Meter; sessionId: string; ipHash: string; now: number }): Promise<ReserveResult> {
    this.reserveCalls.push(`${req.meter}:${req.sessionId}`);
    const caps = this.caps[req.meter];
    if (this.killed) return { ok: false, reason: "killed" };
    if (this.used(req.meter, req.sessionId) >= caps.session) return { ok: false, reason: "session" };
    if (this.used(req.meter) >= caps.day) return { ok: false, reason: "day" };
    if (caps.total !== undefined && this.used(req.meter) >= caps.total) return { ok: false, reason: "total" };
    const ticket: SpendTicket = { id: `t-${++this.next}`, meter: req.meter, sessionId: req.sessionId, issuedAt: req.now };
    this.tickets.set(ticket.id, { ticket, state: "reserved" });
    return { ok: true, ticket };
  }

  async commit(ticket: SpendTicket): Promise<void> {
    const t = this.tickets.get(ticket.id);
    if (t?.state === "reserved") t.state = "committed";
  }

  async release(ticket: SpendTicket): Promise<void> {
    const t = this.tickets.get(ticket.id);
    if (t?.state === "reserved") t.state = "released";
  }

  async remaining(sessionId: string): Promise<Remaining> {
    const out = {} as Remaining;
    for (const m of METERS) {
      const c = this.caps[m];
      out[m] = Math.max(0, Math.min(c.session - this.used(m, sessionId), c.day - this.used(m), (c.total ?? Infinity) - this.used(m)));
    }
    return out;
  }

  /** Units used (reserved or committed) on a meter, for tests. */
  usedOn(meter: Meter, sessionId?: string): number {
    return this.used(meter, sessionId);
  }
  stateOf(ticketId: string): string | undefined {
    return this.tickets.get(ticketId)?.state;
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
