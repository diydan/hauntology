const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** At most this many live Rooms at once, and one per host session (party-mode 10.6). */
export const ROOM_CAP = 20;
/** A safety net: an entry older than this is dropped even if its Room never said it ended (each Room ends itself at 6 hours idle). */
export const ENTRY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Join attempts per hashed IP per minute (party-mode 10.6). */
export const JOINS_PER_MINUTE = 20;

/**
 * The `PartyDirectory` Durable Object (party-mode design, integration 3.2): one for the whole app, named
 * `party-directory`, and the only place that knows which Rooms are live. Its single-threaded storage makes the cap
 * checks atomic. It keeps only code -> {createdMs, sessionId}; no sockets and no alarm.
 *   POST /create {code, sessionId} -> {ok:true} | {ok:false, code:"rooms_full" | "code_taken"} | {ok:false, code:"session_has_room", existing}
 *   POST /delete {code}            -> 204
 *   POST /has {code}               -> {live}
 *   POST /attempt {ipHash}         -> {ok} (a join attempt; false past the per-minute limit)
 */
export class PartyDirectory {
  /** Join attempts per hashed IP in the current minute. Memory only: an eviction resets the count, which only ever lets more through. */
  private readonly attempts = new Map<string, { startMs: number; n: number }>();

  constructor(private readonly state: DurableObjectState, _env: unknown = {}, private readonly clock: () => number = Date.now, private readonly cap = ROOM_CAP) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    const { pathname } = new URL(request.url);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (pathname === "/attempt") {
      if (typeof body?.ipHash !== "string") return json({ ok: false, code: "bad_request" }, 400);
      return json({ ok: this.attempt(body.ipHash) });
    }
    if (typeof body?.code !== "string") return json({ ok: false, code: "bad_request" }, 400);
    const key = `room:${body.code}`;
    if (pathname === "/create") {
      if (typeof body.sessionId !== "string") return json({ ok: false, code: "bad_request" }, 400);
      const all = await this.state.storage.list<{ createdMs: number; sessionId: string }>({ prefix: "room:" });
      const now = this.clock();
      const stale = [...all].filter(([, r]) => now - r.createdMs >= ENTRY_MAX_AGE_MS).map(([k]) => k);
      for (const k of stale) { await this.state.storage.delete(k); all.delete(k); }
      if (all.has(key)) return json({ ok: false, code: "code_taken" });
      const mine = [...all].find(([, r]) => r.sessionId === body.sessionId);
      if (mine) return json({ ok: false, code: "session_has_room", existing: mine[0].slice("room:".length) });
      if (all.size >= this.cap) return json({ ok: false, code: "rooms_full" });
      await this.state.storage.put(key, { createdMs: now, sessionId: body.sessionId });
      return json({ ok: true });
    }
    if (pathname === "/delete") { await this.state.storage.delete(key); return new Response(null, { status: 204 }); }
    if (pathname === "/has") {
      const r = await this.state.storage.get<{ createdMs: number }>(key);
      return json({ live: r !== undefined && this.clock() - r.createdMs < ENTRY_MAX_AGE_MS });
    }
    return json({ ok: false, code: "bad_request" }, 400);
  }

  private attempt(ipHash: string): boolean {
    const now = this.clock();
    if (this.attempts.size > 10_000) for (const [k, w] of this.attempts) if (now - w.startMs >= 60_000) this.attempts.delete(k);
    const w = this.attempts.get(ipHash);
    if (w === undefined || now - w.startMs >= 60_000) { this.attempts.set(ipHash, { startMs: now, n: 1 }); return true; }
    return ++w.n <= JOINS_PER_MINUTE;
  }
}
