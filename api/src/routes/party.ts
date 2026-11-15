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
  random?: () => number;
}>;

const post = (stub: Stub, path: string, body: unknown): Promise<Response> =>
  stub.fetch(`https://party${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/**
 * The party routes (party-mode 1.1 to 1.3, integration 3.2), mounted at `/api/party`:
 *   POST /                 create a Room: {code, hostToken, displayToken} | {code: "rooms_full" | "session_has_room"}
 *   POST /:code/join       {nickname} -> {seat, token} | refusal; an unknown or expired code is "room_unknown" and says nothing else
 *   GET  /:code/ws         the socket, handed to the Room; the token goes in the first message, never in the URL
 */
export function partyRoutes(deps: PartyDeps): Hono {
  const app = new Hono();
  const dir = (): Stub => deps.directory.get(deps.directory.idFromName("party-directory"));
  const roomOf = (code: string): Stub => deps.rooms.get(deps.rooms.idFromName(code));

  app.post("/", async (c) => {
    const sessionId = deps.sessionOf(c);
    for (let tries = 0; tries < 8; tries++) {
      const code = generateRoomCode(deps.random ?? Math.random);
      const claim = (await (await post(dir(), "/create", { code, sessionId })).json()) as { ok: boolean; code?: string };
      if (claim.ok) {
        const tokens = (await (await post(roomOf(code), "/create", { code })).json()) as { hostToken: string; displayToken: string };
        return c.json({ code, ...tokens });
      }
      if (claim.code !== "code_taken") return c.json({ code: claim.code ?? "rooms_full" }, 429);
    }
    return c.json({ code: "rooms_full" }, 429);
  });

  app.post("/:code/join", async (c) => {
    const code = normalizeCode(c.req.param("code"));
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
    return roomOf(code).fetch("https://party/ws", { headers: { Upgrade: "websocket" } });
  });

  return app;
}
