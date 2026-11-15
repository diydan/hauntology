const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** At most this many live Rooms at once, and one per host session (party-mode 10.6). */
export const ROOM_CAP = 20;

/**
 * The `PartyDirectory` Durable Object (party-mode design, integration 3.2): one for the whole app, named
 * `party-directory`, and the only place that knows which Rooms are live. Its single-threaded storage makes the cap
 * checks atomic. It keeps only code -> {createdMs, sessionId}; no sockets and no alarm.
 *   POST /create {code, sessionId} -> {ok:true} | {ok:false, code:"rooms_full" | "session_has_room" | "code_taken"}
 *   POST /delete {code}            -> 204
 *   POST /has {code}               -> {live}
 */
export class PartyDirectory {
  constructor(private readonly state: DurableObjectState, _env: unknown = {}, private readonly clock: () => number = Date.now, private readonly cap = ROOM_CAP) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    const { pathname } = new URL(request.url);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (typeof body?.code !== "string") return json({ ok: false, code: "bad_request" }, 400);
    const key = `room:${body.code}`;
    if (pathname === "/create") {
      if (typeof body.sessionId !== "string") return json({ ok: false, code: "bad_request" }, 400);
      const all = await this.state.storage.list<{ createdMs: number; sessionId: string }>({ prefix: "room:" });
      if (all.has(key)) return json({ ok: false, code: "code_taken" });
      if ([...all.values()].some((r) => r.sessionId === body.sessionId)) return json({ ok: false, code: "session_has_room" });
      if (all.size >= this.cap) return json({ ok: false, code: "rooms_full" });
      await this.state.storage.put(key, { createdMs: this.clock(), sessionId: body.sessionId });
      return json({ ok: true });
    }
    if (pathname === "/delete") { await this.state.storage.delete(key); return new Response(null, { status: 204 }); }
    if (pathname === "/has") return json({ live: (await this.state.storage.get(key)) !== undefined });
    return json({ ok: false, code: "bad_request" }, 400);
  }
}
