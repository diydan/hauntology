import { RoomCore, type Ports } from "@hauntology/shared/party/server";
import { R2PhotoStore } from "../party/photo-store";
import { roomScope } from "../party/contribute";
import { RoomSongStore, type SongBucket } from "../songs/store";
import { RoomStitchClipStore, type RoomClipStorage } from "../voice/stitch-store";

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const STATE_KEY = "room";
type DirectoryNamespace = { idFromName(name: string): unknown; get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> } };

/**
 * The `PartyRoom` Durable Object (party-mode 4.1, integration 3.1): one per Room, addressed by its Room Code. It holds
 * no rule: every message goes to `RoomCore` (`shared/src/party/server.ts`), which saves before it sends and keeps the
 * one alarm. Sockets use the Hibernation API, so an idle Room costs nothing; each socket carries its own id.
 *
 * Internal addresses, from the Worker's `/api/party` & `/api/voice` routes only:
 *   POST /create {code}         -> {hostToken, displayToken}
 *   POST /join {nickname}       -> {ok, seat, token} | {ok:false, code}
 *   POST /voice-line {lineId, token} -> {line} | {line: null}
 *   POST /end                   -> 204 (the same session made a new Room: this one ends)
 *   POST /identify {token}      -> {role, seat, master, started} | {ok:false}   (the contribution and delete routes)
 *   POST /lobby {token}         -> {ok, seat, offer, selfies, selfieYes, selfieMade} | {ok:false, code}
 *   POST /record {token, patch} -> {ok} | {ok:false, code}   (one contribution of the token's own seat)
 *   POST /spend/load | /spend/save {spend}   -> the Room's own spend (images and model calls)
 *   POST /skip {token}          -> {ok, offer} | {ok:false, code}   (one Photo Prompt skip)
 *   GET  /ws (Upgrade: websocket) -> 101; the first message must be {t:"hello", token}
 */
export class PartyRoom {
  private readonly core: RoomCore;
  private readonly clips: RoomStitchClipStore;

  constructor(private readonly state: DurableObjectState, env: { PARTY_DIRECTORY?: DirectoryNamespace; BUCKET?: SongBucket } = {}, clock: () => number = Date.now) {
    this.clips = new RoomStitchClipStore(this.state.storage as unknown as RoomClipStorage);
    const songs = env.BUCKET !== undefined ? new RoomSongStore(env.BUCKET) : null;
    const sockets = (): WebSocket[] => (this.state as unknown as { getWebSockets(): WebSocket[] }).getWebSockets();
    const byId = (id: string): WebSocket | undefined => sockets().find((ws) => (ws as unknown as { deserializeAttachment(): { id?: string } | null }).deserializeAttachment()?.id === id);
    const ports: Ports = {
      load: async () => (await this.state.storage.get<string>(STATE_KEY)) ?? undefined,
      save: async (text) => { await this.state.storage.put(STATE_KEY, text); },
      deleteAll: async () => { await this.state.storage.deleteAll(); },
      setAlarm: async (at) => { if (at === null) await this.state.storage.deleteAlarm(); else await this.state.storage.setAlarm(at); },
      send: (id, msg) => { try { byId(id)?.send(JSON.stringify(msg)); } catch { /* a socket that just closed */ } },
      close: (id, code, reason) => { try { byId(id)?.close(code, reason); } catch { /* already closed */ } },
      now: clock,
      randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
      deleteStitchClips: async (forSeats) => {
        if (forSeats === "all") await this.clips.deleteAll();
        else for (const seat of forSeats) await this.clips.deleteForSeat(seat);
      },
      deleteSongs: async (code) => {
        await songs?.deleteRoomSongs(code);
      },
      // Photos and ghosts the lobby collected go with the Room (party-mode 10.4).
      deleteContributions: async (code) => {
        if (env.BUCKET !== undefined) await new R2PhotoStore(env.BUCKET).deleteRoom(roomScope(code));
      },
      // Free the Room's place in the directory, so the cap counts only live Rooms.
      ended: async (code) => {
        const dir = env.PARTY_DIRECTORY;
        if (dir === undefined) return;
        await dir.get(dir.idFromName("party-directory")).fetch("https://party/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      },
    };
    this.core = new RoomCore(ports);
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("expected a websocket", { status: 426 });
      const pair = new (globalThis as unknown as { WebSocketPair: new () => Record<0 | 1, WebSocket> }).WebSocketPair();
      const server = pair[1];
      (server as unknown as { serializeAttachment(v: unknown): void }).serializeAttachment({ id: crypto.randomUUID() });
      (this.state as unknown as { acceptWebSocket(ws: WebSocket): void }).acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
    }
    if (request.method !== "POST") return new Response(null, { status: 405 });
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (pathname === "/create" && typeof body?.code === "string") {
      const doors = body.doors && typeof body.doors === "object" ? (body.doors as Parameters<RoomCore["create"]>[1] extends infer T ? T extends { doors?: infer D } ? D : never : never) : undefined;
      return json(await this.core.create(body.code, doors !== undefined ? { doors } : undefined));
    }
    if (pathname === "/join" && typeof body?.nickname === "string") return json(await this.core.join(body.nickname));
    if (pathname === "/voice-line" && typeof body?.lineId === "string" && typeof body?.token === "string") {
      return json({ line: await this.core.findVoiceLineForHost(body.lineId, body.token) });
    }
    if (pathname === "/spend/load") return json(await this.core.loadSpend());
    if (pathname === "/spend/save" && typeof body?.spend === "object" && body.spend !== null) return json({ ok: await this.core.saveSpend(body.spend as Parameters<RoomCore["saveSpend"]>[0]) });
    if (typeof body?.token === "string") {
      if (pathname === "/identify") return json((await this.core.identify(body.token)) ?? { ok: false, code: "bad_token" });
      if (pathname === "/lobby") return json(await this.core.lobbyContext(body.token));
      if (pathname === "/skip") return json(await this.core.skipPrompt(body.token));
      if (pathname === "/record" && typeof body.patch === "object" && body.patch !== null) return json(await this.core.recordContribution(body.token, body.patch as Parameters<RoomCore["recordContribution"]>[1]));
    }
    if (pathname === "/end") { await this.core.endRoom(); return new Response(null, { status: 204 }); }
    return json({ ok: false, code: "bad_request" }, 400);
  }

  private idOf(ws: WebSocket): string {
    return (ws as unknown as { deserializeAttachment(): { id: string } }).deserializeAttachment().id;
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") { ws.close(4400, "bad_message"); return; }
    await this.core.message(this.idOf(ws), message);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.core.socketClosed(this.idOf(ws));
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.core.socketClosed(this.idOf(ws));
  }

  async alarm(): Promise<void> {
    await this.core.alarm();
  }
}
