import { RoomCore, type Ports } from "@hauntology/shared/party/server";
import { R2PhotoStore } from "../party/photo-store";
import { roomScope } from "../party/contribute";
import { RoomSongStore, type SongBucket } from "../songs/store";
import { conditionsFromEnv, type ConditionsEnv } from "../conditions/snapshot-store";
import { SpendGuardClient } from "../spend/client";
import { sttModelFromEnv, WorkersAiTranscriber } from "../guarded/workersai/transcribe";
import type { AiBinding } from "../guarded/workersai/call";
import { runWordCheck } from "../voice/stitch";
import { RoomStitchClipStore, type RoomClipStorage } from "../voice/stitch-store";
import { WorkersAiClient } from "../guarded/workersai/client";
import { RoomBudget } from "../party/budget";
import { makeNarratePort } from "../party/narrate-port";
import { speakDepsForDo, speculateLine } from "../voice/room-speak";
import { SpendGuardVoiceWindow, windowedSpend } from "../voice/window";
import { DEFAULT_ROOM_CAPS } from "@hauntology/shared/party/spend";

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
 *   POST /end-as {token}        -> {result: "ended" | "forbidden" | "room_unknown"} (the Master or the host token only)
 *   POST /identify {token}      -> {role, seat, master, started} | {ok:false}   (the contribution and delete routes)
 *   POST /lobby {token}         -> {ok, seat, offer, selfies, selfieYes, selfieMade} | {ok:false, code}
 *   POST /record {token, patch} -> {ok} | {ok:false, code}   (one contribution of the token's own seat)
 *   POST /spend/load | /spend/save {spend}   -> the Room's own spend (images and model calls)
 *   POST /gate {token}         -> {ok} | {ok:false, code}   (the rate limit of one seat's contribution requests)
 *   POST /skip {token}          -> {ok, offer} | {ok:false, code}   (one Photo Prompt skip)
 *   GET  /ws (Upgrade: websocket) -> 101; the first message must be {t:"hello", token}
 */
export class PartyRoom {
  private readonly core: RoomCore;
  private readonly clips: RoomStitchClipStore;

  constructor(private readonly state: DurableObjectState, env: { PARTY_DIRECTORY?: DirectoryNamespace; BUCKET?: SongBucket; AI?: AiBinding; SPEND_GUARD?: ConstructorParameters<typeof SpendGuardClient>[0]; VOICE_STT_MODEL_ID?: string; VOICE_TTS_MODEL_ID?: string; VOICE_TTS_FALLBACK_MODEL_ID?: string; NARRATOR_MODEL_ID?: string; AI_GATEWAY_ID?: string; GHOST_MODEL_ID?: string; GHOST_NARRATION_ENABLED?: string } & ConditionsEnv = {}, clock: () => number = Date.now) {
    // The Room's own alarm belongs to `RoomCore` alone: the clip store keeps clips, and its alarm calls do nothing here.
    const st = this.state.storage as unknown as RoomClipStorage;
    this.clips = new RoomStitchClipStore({ get: (k) => st.get(k), put: (k, v) => st.put(k, v), delete: (k) => st.delete(k), list: (o) => st.list(o), setAlarm: async () => undefined, deleteAlarm: async () => undefined });
    const songs = env.BUCKET !== undefined ? new RoomSongStore(env.BUCKET) : null;
    const sockets = (): WebSocket[] => (this.state as unknown as { getWebSockets(): WebSocket[] }).getWebSockets();
    const byId = (id: string): WebSocket | undefined => sockets().find((ws) => (ws as unknown as { deserializeAttachment(): { id?: string } | null }).deserializeAttachment()?.id === id);
    // The narrator and the early voice (party-mode 6.1, ghost-voice 3.12): both need the `AI` binding and the one spend guard, and a Room is
    // a session of that guard, so the Room's own caps (`RoomBudget`) sit in front of the global ones. Without them the Room speaks its scripted lines.
    const guard = env.SPEND_GUARD !== undefined ? new SpendGuardClient(env.SPEND_GUARD) : null;
    const narrator = env.AI !== undefined ? new WorkersAiClient(env as ConstructorParameters<typeof WorkersAiClient>[0]).narrator : null;
    // A paid call takes a line of the operator's voice window first, exactly as the Worker's speak route does; a closed window means only the Library and the cache.
    const speakDeps = guard !== null && env.SPEND_GUARD !== undefined ? speakDepsForDo(env, windowedSpend(guard, new SpendGuardVoiceWindow(env.SPEND_GUARD as never))) : null;
    const roomBudget = (code: string): RoomBudget | null => guard === null ? null : new RoomBudget(guard, roomScope(code), DEFAULT_ROOM_CAPS, { load: () => this.core.loadSpend(), save: async (v) => { await this.core.saveSpend(v); } });
    const ports: Ports = {
      narrate: makeNarratePort((code) => {
        const budget = roomBudget(code);
        return budget === null ? null : { narrator, budget, enabled: env.GHOST_NARRATION_ENABLED !== "false", scope: roomScope(code), ipHash: "party-room" };
      }),
      spoke: (line, code) => { speculateLine(speakDeps, { sessionId: roomScope(code), ipHash: "party-room" }, line, { speaking: true, defer: (w) => this.state.waitUntil(w) }); },
      load: async () => (await this.state.storage.get<string>(STATE_KEY)) ?? undefined,
      save: async (text) => { await this.state.storage.put(STATE_KEY, text); },
      deleteAll: async () => { await this.state.storage.deleteAll(); },
      setAlarm: async (at) => { if (at === null) await this.state.storage.deleteAlarm(); else await this.state.storage.setAlarm(at); },
      send: (id, msg) => { try { byId(id)?.send(JSON.stringify(msg)); } catch { /* a socket that just closed */ } },
      close: (id, code, reason) => { try { byId(id)?.close(code, reason); } catch { /* already closed */ } },
      now: clock,
      // a game starts only on a world the Master chose (party-mode 4.11)
      requireWorld: () => true,
      // The sky is read once at the start, through the same service as a solo game; only its three cosmetic fields are kept (party-mode 4.18).
      conditions: async (_choice, place, hostHour) => {
        const snap = await conditionsFromEnv(env).read({ hostHour, ...(place === null ? {} : { place }) });
        return { weather: snap.weather, timeOfDay: snap.timeOfDay, moon: snap.moon };
      },
      randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
      // Stitch (party-mode 4.20): the word check needs the speech binding and the spend guard; without them the Player is told it is unavailable.
      ...(env.AI !== undefined && env.SPEND_GUARD !== undefined && sttModelFromEnv(env.VOICE_STT_MODEL_ID) !== null
        ? {
            wordCheck: async (i) => runWordCheck(
              { transcriber: new WorkersAiTranscriber(env.AI as AiBinding, { model: sttModelFromEnv(env.VOICE_STT_MODEL_ID) as string }), spend: new SpendGuardClient(env.SPEND_GUARD as never), clips: this.clips },
              i.state,
              { roomId: i.code, seat: i.seat, word: i.word, audio: i.audio, contentType: i.contentType, durationMs: i.durationMs, ipHash: "party-room" },
            ),
          }
        : {}),
      listStitchClips: () => this.clips.list(),
      purgeStitchClips: async (ctx, now) => (await this.clips.purge(ctx, now)).nextAlarmAt,
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
      const id = crypto.randomUUID();
      (server as unknown as { serializeAttachment(v: unknown): void }).serializeAttachment({ id });
      (this.state as unknown as { acceptWebSocket(ws: WebSocket): void }).acceptWebSocket(server);
      // five seconds to say hello with a token, or the alarm closes the socket (party-mode 4.1)
      await this.core.socketOpened(id);
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
      if (pathname === "/gate") return json(await this.core.contributionGate(body.token));
      if (pathname === "/record" && typeof body.patch === "object" && body.patch !== null) return json(await this.core.recordContribution(body.token, body.patch as Parameters<RoomCore["recordContribution"]>[1]));
    }
    if (pathname === "/end") { await this.core.endRoom(); return new Response(null, { status: 204 }); }
    if (pathname === "/end-as" && typeof body?.token === "string") return json({ result: await this.core.endAs(body.token) });
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
