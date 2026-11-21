import { reserve as reserveRoom, type Meter as RoomMeter, type RoomCaps, type RoomSpend } from "@hauntology/shared/party/spend";
import type { DenyReason, Meter, Remaining, ReserveResult, SpendGuard, SpendTicket } from "@hauntology/shared/world/spend";

/**
 * The Room's budget (party-mode 5.4, 10.1): `SpendGuard` as one Room sees it. A Room has caps of its own (12 images and 60
 * model calls by default) and the global caps still apply, so every paid call takes a unit from the Room first and then asks
 * the one `SpendGuard` with the Room as the scope. It implements `SpendGuard`, so the Ghost Creator and the narrator are
 * charged to the Room by being handed this object instead of the plain guard; nothing else about them changes.
 *
 * A refusal changes nothing and spends nothing upstream. A unit comes back to the Room when its work fails (`release`), as it
 * does in the guard. Only the `image` and `llm` meters are Room meters; any other meter goes straight to the guard.
 */
export interface RoomSpendStore {
  load(): Promise<RoomSpend>;
  save(spend: RoomSpend): Promise<void>;
}

const ROOM_METER: Partial<Record<Meter, RoomMeter>> = { image: "images", llm: "models" };
export type RoomDeny = DenyReason | "room";

export class RoomBudget implements SpendGuard {
  private readonly open = new Map<string, RoomMeter>();
  /** Rooms are single-threaded in their Durable Object, but a chain keeps two awaits of one budget in order. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly inner: SpendGuard,
    /** The scope: the Room, as a session of the guard. */
    private readonly scope: string,
    private readonly caps: RoomCaps,
    private readonly store: RoomSpendStore,
    private readonly options: { killed?: () => boolean } = {},
  ) {}

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.catch(() => undefined);
    return next;
  }

  /** Why the last refusal happened, for the caller that wants to tell a Room cap from a global one. */
  lastDeny: RoomDeny | null = null;

  async reserve(req: { meter: Meter; sessionId: string; ipHash: string; now: number }): Promise<ReserveResult> {
    return this.serial(async () => {
      const meter = ROOM_METER[req.meter];
      const scoped = { ...req, sessionId: this.scope };
      if (meter === undefined) return this.inner.reserve(scoped);
      if (this.options.killed?.() === true) { this.lastDeny = "killed"; return { ok: false, reason: "killed" }; }
      const spend = await this.store.load();
      const taken = reserveRoom(spend, this.caps, meter);
      if (!taken.ok) { this.lastDeny = "room"; return { ok: false, reason: "session" }; }
      const global = await this.inner.reserve(scoped);
      if (!global.ok) { this.lastDeny = global.reason; return global; }
      await this.store.save(taken.spend);
      this.open.set(global.ticket.id, meter);
      this.lastDeny = null;
      return global;
    });
  }

  async commit(ticket: SpendTicket): Promise<void> {
    await this.serial(async () => { this.open.delete(ticket.id); await this.inner.commit(ticket); });
  }

  async release(ticket: SpendTicket): Promise<void> {
    await this.serial(async () => {
      const meter = this.open.get(ticket.id);
      this.open.delete(ticket.id);
      if (meter !== undefined) {
        const spend = await this.store.load();
        await this.store.save({ ...spend, [meter]: Math.max(0, spend[meter] - 1) });
      }
      await this.inner.release(ticket);
    });
  }

  async remaining(_sessionId: string, ipHash: string): Promise<Remaining> {
    const spend = await this.store.load();
    const rest = await this.inner.remaining(this.scope, ipHash);
    return { ...rest, image: Math.max(0, Math.min(rest.image, this.caps.images - spend.images)), llm: Math.max(0, Math.min(rest.llm, this.caps.models - spend.models)) };
  }
}

/** A store for tests and for a Room that keeps its counters in memory. */
export class MemoryRoomSpendStore implements RoomSpendStore {
  constructor(public spend: RoomSpend = { images: 0, models: 0 }) {}
  async load(): Promise<RoomSpend> { return this.spend; }
  async save(spend: RoomSpend): Promise<void> { this.spend = spend; }
}
