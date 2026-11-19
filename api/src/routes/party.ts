import { Hono, type Context } from "hono";
import { sanitizeNickname } from "@hauntology/shared/party/nickname";
import { generateRoomCode, normalizeCode } from "@hauntology/shared/party/roomCode";

type Stub = { fetch(input: string, init?: RequestInit): Promise<Response> };
type Namespace = { idFromName(name: string): unknown; get(id: unknown): Stub };

export type PartyDeps = Readonly<{
  rooms: Namespace;
  directory: Namespace;
  /** The visitor's session id (one live Room per session). */
  sessionOf: (c: Context) => string;
  /** The visitor's IP, hashed (never the IP itself): join attempts are limited per hash. */
  ipHashOf: (c: Context) => Promise<string>;
  /** The kill switch (`PARTY_ENABLED`): when it says no, every party route answers `party_disabled`. */
  enabled: (c: Context) => boolean;
  random?: () => number;
}>;

const post = (stub: Stub, path: string, body: unknown): Promise<Response> =>
  stub.fetch(`https://party${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/**
 * The party routes (party-mode 1.1 to 1.3, integration 3.2), mounted at `/api/party`:
 *   POST / {replace?}      create a Room: {code, hostToken, displayToken} | {code: "rooms_full" | "session_has_room"};
 *                          with `replace: true` the session's own earlier Room is ended first
 *   POST /:code/join       {nickname} -> {seat, token} | refusal; an unknown or expired code is "room_unknown" and says nothing else
 *   GET  /:code/ws         the socket, handed to the Room; the token goes in the first message, never in the URL
 */
export function partyRoutes(deps: PartyDeps): Hono {
  const app = new Hono();
  const dir = (): Stub => deps.directory.get(deps.directory.idFromName("party-directory"));
  const roomOf = (code: string): Stub => deps.rooms.get(deps.rooms.idFromName(code));

  app.use("*", async (c, next) => {
    if (!deps.enabled(c)) return c.json({ ok: false, code: "party_disabled" }, 503);
    return next();
  });

  app.post("/", async (c) => {
    const sessionId = deps.sessionOf(c);
    const body = (await c.req.json().catch(() => ({}))) as { replace?: unknown; doors?: unknown };
    let replaced = false;
    for (let tries = 0; tries < 8; tries++) {
      const code = generateRoomCode(deps.random ?? Math.random);
      const claim = (await (await post(dir(), "/create", { code, sessionId })).json()) as { ok: boolean; code?: string; existing?: string };
      // `replace`: the visitor's own earlier Room (a reload, a closed tab) ends, and frees its place, once.
      if (!claim.ok && claim.code === "session_has_room" && body.replace === true && !replaced && typeof claim.existing === "string") {
        replaced = true;
        await post(roomOf(claim.existing), "/end", {});
        await post(dir(), "/delete", { code: claim.existing });
        continue;
      }
      if (claim.ok) {
        const createPayload = body.doors && typeof body.doors === "object" ? { code, doors: body.doors } : { code };
        const tokens = (await (await post(roomOf(code), "/create", createPayload)).json()) as { hostToken: string; displayToken: string };
        return c.json({ code, ...tokens });
      }
      if (claim.code !== "code_taken") return c.json({ code: claim.code ?? "rooms_full" }, 429);
    }
    return c.json({ code: "rooms_full" }, 429);
  });

  app.post("/:code/join", async (c) => {
    const code = normalizeCode(c.req.param("code"));
    // Counted before the code is even read, so guessing codes costs the same as joining one.
    const allowed = (await (await post(dir(), "/attempt", { ipHash: await deps.ipHashOf(c) })).json()) as { ok: boolean };
    if (!allowed.ok) return c.json({ ok: false, code: "rate_limited" }, 429);
    if (code === null) return c.json({ ok: false, code: "room_unknown" }, 404);
    const live = (await (await post(dir(), "/has", { code })).json()) as { live: boolean };
    if (!live.live) return c.json({ ok: false, code: "room_unknown" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { nickname?: unknown };
    const nickname = sanitizeNickname(typeof body.nickname === "string" ? body.nickname : "");
    const res = (await (await post(roomOf(code), "/join", { nickname })).json()) as { ok: boolean };
    return c.json(res, res.ok ? 200 : 409);
  });

  app.get("/:code/ws", async (c) => {
    const code = normalizeCode(c.req.param("code"));
    if (code === null) return c.json({ ok: false, code: "room_unknown" }, 404);
    if (c.req.header("Upgrade") !== "websocket") return c.json({ ok: false, code: "expected_websocket" }, 426);
    // Only the upgrade headers go on (never the cookie): the Room knows a socket by the token in its first message.
    const headers = new Headers({ Upgrade: "websocket" });
    for (const h of ["Sec-WebSocket-Key", "Sec-WebSocket-Version", "Sec-WebSocket-Extensions"]) { const v = c.req.header(h); if (v !== undefined) headers.set(h, v); }
    return roomOf(code).fetch("https://party/ws", { headers });
  });

  return app;
}
