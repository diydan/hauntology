import { METERS, type Meter } from "@hauntology/shared/world/spend";
import { SpendLedger, capsFromEnv, type Kv } from "@hauntology/shared/world/spend-ledger";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Env = Record<string, string | undefined>;

/**
 * The `SpendGuard` Durable Object (world-pipeline 4.1): one for the whole app, addressed by the name `global`.
 * Its single-threaded storage is what makes reserve, commit and release atomic; the counting is `SpendLedger`.
 * It uses its own clock, not the caller's, so no caller can age or extend a reservation. An alarm wakes it when
 * the oldest reservation runs out, so the unit comes back even if nobody calls again.
 *
 * It answers one internal address each, to the Worker only (all `POST` with a JSON body but `status`):
 *   /reserve {meter, sessionId, ipHash} -> {ok:true, ticket} | {ok:false, reason}
 *   /commit {id}   /release {id}        -> 204
 *   /remaining {sessionId, ipHash}      -> {world, image, llm, tts, stt, live}
 *   GET /status                         -> {dayCapReached, totalCapReached, killed}
 *   /kill {on}                          -> 204
 * A body that does not fit is a 400; nothing changes.
 */
export class SpendGuard {
  private readonly ledger: SpendLedger;

  constructor(
    private readonly state: DurableObjectState,
    env: Env = {},
    private readonly clock: () => number = Date.now,
    randomBytes?: () => Uint8Array,
  ) {
    this.ledger = new SpendLedger(state.storage as unknown as Kv, capsFromEnv(env), randomBytes);
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    const now = this.clock();
    try {
      if (pathname === "/status" && request.method === "GET") return json(await this.ledger.status(now));
      if (request.method !== "POST") return new Response(null, { status: request.method === "GET" ? 404 : 405 });
      const body = (await readJson(request)) as Record<string, unknown> | null;
      if (body === null || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, code: "bad_request" }, 400);

      switch (pathname) {
        case "/reserve": {
          if (!METERS.includes(body.meter as Meter) || typeof body.sessionId !== "string" || typeof body.ipHash !== "string") return json({ ok: false, code: "bad_request" }, 400);
          const result = await this.ledger.reserve({ meter: body.meter as Meter, sessionId: body.sessionId, ipHash: body.ipHash, now });
          await this.arm();
          return json(result);
        }
        case "/commit":
        case "/release": {
          if (typeof body.id !== "string") return json({ ok: false, code: "bad_request" }, 400);
          if (pathname === "/commit") await this.ledger.commit({ id: body.id }, now);
          else await this.ledger.release({ id: body.id }, now);
          await this.arm();
          return new Response(null, { status: 204 });
        }
        case "/remaining": {
          if (typeof body.sessionId !== "string" || typeof body.ipHash !== "string") return json({ ok: false, code: "bad_request" }, 400);
          return json(await this.ledger.remaining(body.sessionId, body.ipHash, now));
        }
        case "/kill": {
          if (typeof body.on !== "boolean") return json({ ok: false, code: "bad_request" }, 400);
          await this.ledger.setKill(body.on);
          return new Response(null, { status: 204 });
        }
        default:
          return new Response(null, { status: 404 });
      }
    } catch (e) {
      // A well-formed request the ledger refuses (a bad id or name).
      if (e instanceof RangeError) return json({ ok: false, code: "bad_request" }, 400);
      throw e;
    }
  }

  /** Releases every reservation that has run out, and sets the alarm for the next one. */
  async alarm(): Promise<void> {
    await this.ledger.sweep(this.clock());
    await this.arm();
  }

  private async arm(): Promise<void> {
    const next = await this.ledger.nextExpiry();
    if (next === null) return;
    const current = await this.state.storage.getAlarm();
    if (current === null || current > next) await this.state.storage.setAlarm(next);
  }
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
