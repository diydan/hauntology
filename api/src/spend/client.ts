import { METERS } from "@hauntology/shared/world/spend";
import type { DenyReason, Meter, Remaining, ReserveResult, SpendGuard, SpendTicket } from "@hauntology/shared/world/spend";
import type { SpendStatus } from "@hauntology/shared/world/spend-ledger";
import type { JobNamespaceLike } from "../worlds/cloudflare-store";

const URL_ = "https://spend-guard";
const REASONS: readonly DenyReason[] = ["session", "day", "total", "killed"];
const NO_PLACES = Object.fromEntries(METERS.map((m) => [m, 0])) as Remaining;

/**
 * `SpendGuard` as the Worker sees it: calls to the one `SpendGuard` Durable Object. It fails closed. When the
 * object cannot be reached or answers with anything unexpected, a reserve is refused (as the kill switch would),
 * the places left read as none, and the status reads as killed. A commit or release that cannot be delivered is
 * dropped: the reservation runs out by itself after 30 minutes and the unit comes back.
 */
export class SpendGuardClient implements SpendGuard {
  /** With `strict`, a commit or release that cannot be delivered throws, so a job can try again; the default drops it. */
  constructor(private readonly namespace: JobNamespaceLike, private readonly options: { strict?: boolean } = {}) {}

  private call(path: string, init?: { body?: unknown; method?: string }): Promise<Response> {
    const stub = this.namespace.get(this.namespace.idFromName("global"));
    return stub.fetch(`${URL_}${path}`, { method: init?.method ?? "POST", ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}) });
  }

  async reserve(req: { meter: Meter; sessionId: string; ipHash: string; now: number }): Promise<ReserveResult> {
    try {
      // `now` is not sent: the object keeps its own clock.
      const res = await this.call("/reserve", { body: { meter: req.meter, sessionId: req.sessionId, ipHash: req.ipHash } });
      if (!res.ok) return { ok: false, reason: "killed" };
      const body = (await res.json()) as { ok?: unknown; reason?: unknown; ticket?: Partial<SpendTicket> };
      if (body.ok === true && body.ticket !== undefined && typeof body.ticket.id === "string" && METERS.includes(body.ticket.meter as Meter) && typeof body.ticket.sessionId === "string" && typeof body.ticket.issuedAt === "number") {
        return { ok: true, ticket: { id: body.ticket.id, meter: body.ticket.meter as Meter, sessionId: body.ticket.sessionId, issuedAt: body.ticket.issuedAt } };
      }
      if (body.ok === false && REASONS.includes(body.reason as DenyReason)) return { ok: false, reason: body.reason as DenyReason };
      return { ok: false, reason: "killed" };
    } catch {
      return { ok: false, reason: "killed" };
    }
  }

  async commit(ticket: SpendTicket): Promise<void> {
    await this.settle("/commit", ticket);
  }

  async release(ticket: SpendTicket): Promise<void> {
    await this.settle("/release", ticket);
  }

  private async settle(path: "/commit" | "/release", ticket: SpendTicket): Promise<void> {
    try {
      const res = await this.call(path, { body: { id: ticket.id } });
      if (!res.ok && this.options.strict === true) throw new Error(`SpendGuard refused ${path} (${res.status})`);
    } catch (e) {
      if (this.options.strict === true) throw e;
      // The reservation runs out by itself after 30 minutes.
    }
  }

  async remaining(sessionId: string, ipHash: string): Promise<Remaining> {
    try {
      const res = await this.call("/remaining", { body: { sessionId, ipHash } });
      if (!res.ok) return { ...NO_PLACES };
      const body = (await res.json()) as Record<string, unknown>;
      const out = { ...NO_PLACES };
      for (const m of METERS) {
        const v = body[m];
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 1_000_000) return { ...NO_PLACES };
        out[m] = v;
      }
      return out;
    } catch {
      return { ...NO_PLACES };
    }
  }

  /** What Home shows about worlds. Unknown reads as closed. */
  async status(): Promise<SpendStatus> {
    const closed: SpendStatus = { dayCapReached: true, totalCapReached: true, killed: true };
    try {
      const res = await this.call("/status", { method: "GET" });
      if (!res.ok) return closed;
      const b = (await res.json()) as Partial<Record<keyof SpendStatus, unknown>>;
      if (typeof b.dayCapReached !== "boolean" || typeof b.totalCapReached !== "boolean" || typeof b.killed !== "boolean") return closed;
      return { dayCapReached: b.dayCapReached, totalCapReached: b.totalCapReached, killed: b.killed };
    } catch {
      return closed;
    }
  }

  /** The same as `status`, but a failure throws instead of reading as closed, for the operator's view, where "closed" and "cannot tell" must not look alike. */
  async statusStrict(): Promise<SpendStatus> {
    const res = await this.call("/status", { method: "GET" });
    if (!res.ok) throw new Error(`SpendGuard refused the status (${res.status})`);
    const b = (await res.json()) as Partial<Record<keyof SpendStatus, unknown>>;
    if (typeof b.dayCapReached !== "boolean" || typeof b.totalCapReached !== "boolean" || typeof b.killed !== "boolean") throw new Error("SpendGuard answered a status that does not fit");
    return { dayCapReached: b.dayCapReached, totalCapReached: b.totalCapReached, killed: b.killed };
  }

  /** The kill switch, for new worlds. Reached only through the operator's route (`routes/admin.ts`, which needs `ADMIN_TOKEN`). */
  async setKill(on: boolean): Promise<void> {
    const res = await this.call("/kill", { body: { on } });
    if (!res.ok) throw new Error(`SpendGuard refused the kill switch (${res.status})`);
  }
}
