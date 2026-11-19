import { whoIs } from "./auth";
import { createEngine, step, type EngineSettings, type EngineState, type Outbound } from "./engine";
import { handOver } from "./master";
import { PRESET_GHOST_IDS } from "./preset-ghosts";
import { parseClientMessage } from "./protocol";
import { createRoomState, isRoomExpired, newToken, parseRoom, serializeRoom, type RoomState, type Seat } from "./room";
import { humanCount, seatPlayer } from "./seats";
import { BOT_NAMES } from "./solo";
import type { LineKind, VoiceLine } from "../voice/line";
import type { LodgerVoice, Speaker } from "../voice/voices";
import type { PlayedStitch } from "../voice/stitch/play";
import {
  applyRoomSpeechToggle,
  applyStitchAnswer,
  applyStitchMasterSwitch,
  findRoomVoiceLine,
  initialRoomVoiceState,
  prepareRoomNarration,
  recordStitchPlayed,
  type RoomVoiceState,
} from "../voice/room-voice";

/**
 * The Room server's whole logic (integration Requirement 3), with no Cloudflare in it: the `PartyRoom` Durable Object
 * only plugs real sockets, storage and the alarm into these ports. It holds no game rule: the lobby rules come from
 * `room.ts`, `seats.ts`, `auth.ts` and `master.ts`, the game from the Engine. Every step is saved before anything is
 * sent, and the one alarm is always set to the next wake time.
 */
export type Ports = {
  load(): Promise<string | undefined>;
  save(text: string): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(atMs: number | null): Promise<void>;
  send(socketId: string, msg: unknown): void;
  close(socketId: string, code: number, reason: string): void;
  now(): number;
  randomBytes(n: number): Uint8Array;
  /** Told once when the Room ends (by the Master, the host or its time to live), so the directory can free its place. */
  ended?(code: string): Promise<void>;
  /** Deletes stored Stitch clips for specific seats or all seats on leave/withdraw/switch-off. */
  deleteStitchClips?(forSeats: number[] | "all"): Promise<void>;
};

/** At most this many messages per socket per second (party-mode 3.2: the Controller sends at most 30); the rest are refused unread. */
export const MAX_MESSAGES_PER_SECOND = 40;

export type SocketInfo = Readonly<{ role: "host" | "display" | "controller"; seat: Seat | null }>;
export type ServerState = Readonly<{
  room: RoomState;
  engine: EngineState | null;
  lobbySettings: EngineSettings;
  sockets: Readonly<Record<string, SocketInfo>>;
  voice: RoomVoiceState;
}>;

export const DEFAULT_SETTINGS: EngineSettings = { baseSeconds: 60, hauntMax: 10, nudges: "all", frames: true, sounds: true, puzzles: "medium", preset: "classic" };

const seedFrom = (b: Uint8Array): number => ((b[0] ?? 0) | ((b[1] ?? 0) << 8) | ((b[2] ?? 0) << 16) | ((b[3] ?? 0) << 24)) >>> 0;

export class RoomCore {
  private state: ServerState | null = null;
  /** Per socket: the start of its current one-second window and the messages in it. Memory only: an eviction resets it, which is harmless. */
  private readonly rate = new Map<string, { startMs: number; n: number }>();
  constructor(private readonly ports: Ports) {}

  private async loaded(): Promise<ServerState | null> {
    if (this.state !== null) return this.state;
    const text = await this.ports.load();
    if (text === undefined) return null;
    const raw = JSON.parse(text) as { room: string; engine: EngineState | null; lobbySettings: EngineSettings; sockets: Record<string, SocketInfo>; voice?: RoomVoiceState };
    const room = parseRoom(raw.room);
    if (room === null) return null;
    this.state = { room, engine: raw.engine, lobbySettings: raw.lobbySettings, sockets: raw.sockets, voice: raw.voice ?? initialRoomVoiceState() };
    return this.state;
  }

  /** Save first, then set the alarm, then send: a crash after a send never loses what was sent. */
  private async commit(next0: ServerState, out: readonly Outbound[] = [], wakeAtMs: number | null = null): Promise<void> {
    // the Engine may pass the Master role on (a Master away 60 s); the lobby's record follows it
    const next = next0.engine !== null && next0.engine.masterSeat !== next0.room.masterSeat ? { ...next0, room: { ...next0.room, masterSeat: next0.engine.masterSeat as Seat } } : next0;
    this.state = next;
    await this.ports.save(JSON.stringify({ room: serializeRoom(next.room), engine: next.engine, lobbySettings: next.lobbySettings, sockets: next.sockets, voice: next.voice }));
    const ttlAt = next.room.lastActiveMs + next.room.ttlMs;
    await this.ports.setAlarm(wakeAtMs === null ? ttlAt : Math.min(wakeAtMs, ttlAt));
    this.route(next, out);
  }

  private route(s: ServerState, out: readonly Outbound[]): void {
    for (const o of out) {
      for (const [sid, info] of Object.entries(s.sockets)) {
        if (o.to === "public" || (info.role === "controller" && info.seat === o.seat)) this.ports.send(sid, o.msg);
      }
    }
  }

  private lobbyView(s: ServerState) {
    return { t: "lobby" as const, code: s.room.code, masterSeat: s.room.masterSeat, started: s.room.started, settings: s.lobbySettings,
      seats: s.room.seats.map((x) => ({ seat: x.seat, nickname: x.nickname, bot: x.bot, connected: x.connected })) };
  }
  private broadcastLobby(s: ServerState): void { for (const sid of Object.keys(s.sockets)) this.ports.send(sid, this.lobbyView(s)); }

  /** The Engine as it would start now, from the seats and the lobby settings. */
  /** A Bot's name: the next unused one of `BOT_NAMES`, then "Bot n". */
  private botName(room: RoomState): string {
    const used = new Set(room.seats.map((x) => x.nickname));
    return BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${room.seats.length + 1}`;
  }

  private draftEngine(s: ServerState): EngineState {
    const botLevel = s.lobbySettings.preset === "gentle" ? ("gentle" as const) : ("standard" as const);
    return createEngine({ seed: s.room.seed, seats: s.room.seats.map((x) => ({ seat: x.seat, nickname: x.nickname, bot: x.bot, botLevel })), settings: s.lobbySettings, presetIds: PRESET_GHOST_IDS });
  }

  // ------------------------------------------------------------ HTTP-side calls (from the routes)
  async create(code: string): Promise<{ hostToken: string; displayToken: string }> {
    const fill = (b: Uint8Array): Uint8Array => { b.set(this.ports.randomBytes(b.length)); return b; };
    const hostToken = newToken(fill);
    const displayToken = newToken(fill);
    const room = createRoomState(code, seedFrom(this.ports.randomBytes(4)), this.ports.now(), hostToken, displayToken);
    await this.commit({ room, engine: null, lobbySettings: DEFAULT_SETTINGS, sockets: {}, voice: initialRoomVoiceState() });
    return { hostToken, displayToken };
  }

  async join(nickname: string): Promise<{ ok: true; seat: number; token: string } | { ok: false; code: string }> {
    const s = await this.loaded();
    if (s === null || isRoomExpired(s.room, this.ports.now())) return { ok: false, code: "room_unknown" };
    const token = newToken((b) => { b.set(this.ports.randomBytes(b.length)); return b; });
    const res = seatPlayer(s.room, nickname, token, this.ports.now());
    if (!res.ok) return { ok: false, code: res.code };
    const next = { ...s, room: res.state };
    await this.commit(next);
    this.broadcastLobby(next);
    return { ok: true, seat: res.seat, token };
  }

  // ------------------------------------------------------------ sockets
  async message(socketId: string, raw: string): Promise<void> {
    const s = await this.loaded();
    if (s === null) { this.ports.close(socketId, 4004, "room_unknown"); return; }
    const t = this.ports.now();
    const w = this.rate.get(socketId);
    if (w === undefined || t - w.startMs >= 1000) this.rate.set(socketId, { startMs: t, n: 1 });
    else if (++w.n > MAX_MESSAGES_PER_SECOND) { this.ports.send(socketId, { t: "refused", code: "rate_limited" }); return; }
    const parsed = parseClientMessage(raw);
    if (parsed.kind === "bad") { this.ports.close(socketId, 4400, "bad_message"); return; }
    const me = s.sockets[socketId];
    if (parsed.kind === "room" && parsed.msg.t === "hello") return this.hello(s, socketId, parsed.msg.token);
    if (me === undefined) { this.ports.close(socketId, 4401, "hello_first"); return; }
    const now = this.ports.now();
    const refuse = (code: string): void => this.ports.send(socketId, { t: "refused", code });

    if (parsed.kind === "room") {
      const m = parsed.msg;
      const isMaster = me.role === "controller" && me.seat === s.room.masterSeat;
      if (m.t === "end") {
        if (!isMaster && me.role !== "host") return refuse("not_master");
        return this.end(s);
      }
      if (m.t === "addBot") {
        if (!isMaster) return refuse("not_master");
        const res = seatPlayer(s.room, this.botName(s.room), null, now);
        if (!res.ok) return refuse(res.code);
        const next = { ...s, room: res.state };
        await this.commit(next);
        return this.broadcastLobby(next);
      }
      if (m.t === "playAgain") {
        if (!isMaster && !(me.role === "host" && s.room.seats.every((x) => x.bot))) return refuse("not_master");
        if (s.engine === null || s.engine.phase !== "ended") return refuse("not_ended");
        const room = { ...s.room, seed: seedFrom(this.ports.randomBytes(4)), lastActiveMs: now };
        const fresh = this.draftEngine({ ...s, room });
        const master = s.engine.masterSeat;
        let r = step({ ...fresh, masterSeat: master }, { kind: "client", seat: master, msg: { t: "start" } }, now);
        if (r.refused) return refuse(r.refused);
        let engine = r.state;
        let out = [...r.out];
        // everyone still on a socket is here in the new game too
        for (const info of Object.values(s.sockets)) if (info.role === "controller" && info.seat !== null) { r = step(engine, { kind: "connect", seat: info.seat }, now); engine = r.state; out = [...out, ...r.out]; }
        return this.commit({ ...s, room, engine }, out, r.wakeAtMs);
      }
      if (m.t === "startBots") {
        if (me.role !== "host") return refuse("not_host");
        if (s.engine !== null) return refuse("already_started");
        if (humanCount(s.room) > 0) return refuse("players_seated");
        let room = s.room;
        while (room.seats.length < (m.bots ?? 4)) {
          const res = seatPlayer(room, this.botName(room), null, now);
          if (!res.ok) return refuse(res.code);
          room = res.state;
        }
        const draft = this.draftEngine({ ...s, room });
        const r = step(draft, { kind: "client", seat: draft.masterSeat, msg: { t: "start" } }, now);
        if (r.refused) return refuse(r.refused);
        return this.commit({ ...s, room: { ...room, lastActiveMs: now, started: true }, engine: r.state }, r.out, r.wakeAtMs);
      }
      if (m.t === "handOver") {
        const token = s.room.seats.find((x) => x.seat === me.seat)?.token ?? "";
        const room = handOver(s.room, token, m.seat as Seat);
        if (room === null) return refuse("not_master");
        const engine = s.engine === null ? null : { ...s.engine, masterSeat: m.seat };
        const next = { ...s, room, engine };
        await this.commit(next);
        return this.broadcastLobby(next);
      }
      if (m.t === "speech") {
        const toggled = applyRoomSpeechToggle(s.voice, isMaster, m.action === "on");
        if (!toggled.ok) return refuse(toggled.code);
        const next = { ...s, voice: toggled.state };
        await this.commit(next);
        for (const [sid, info] of Object.entries(next.sockets)) {
          if (info.role === "host") this.ports.send(sid, { t: "speech", on: next.voice.speechOn });
        }
        return;
      }
      if (m.t === "stitchSetting") {
        const toggled = applyStitchMasterSwitch(s.voice, isMaster, m.on);
        if (toggled.refused) return refuse("not_master");
        if (toggled.deleteClipsFor === "all" || toggled.deleteClipsFor.length > 0) {
          await this.ports.deleteStitchClips?.(toggled.deleteClipsFor);
        }
        await this.commit({ ...s, voice: toggled.state });
        return;
      }
      if (m.t === "stitchAnswer") {
        if (me.role !== "controller" || me.seat === null) return refuse("not_a_player");
        const seatRec = s.room.seats.find((x) => x.seat === me.seat);
        const targetSeat = m.seat ?? me.seat;
        const answered = applyStitchAnswer(s.voice, {
          actorSeat: me.seat,
          seat: targetSeat,
          isBot: seatRec?.bot === true,
          yes: m.yes,
          tick: m.tick,
        });
        if (answered.refused) return refuse("bad_token");
        if (answered.deleteClipsFor === "all" || answered.deleteClipsFor.length > 0) {
          await this.ports.deleteStitchClips?.(answered.deleteClipsFor);
        }
        await this.commit({ ...s, voice: answered.state });
        return;
      }
      return;
    }

    if (me.role !== "controller" || me.seat === null) return refuse("not_a_player");
    let engine = s.engine;
    let lobbySettings = s.lobbySettings;
    if (engine === null) {
      // The lobby: settings and start, by the Master only. The Engine is made at the start, from the seats then.
      if (parsed.msg.t !== "settings" && parsed.msg.t !== "start" && parsed.msg.t !== "sound") return refuse("not_started");
      const draft = this.draftEngine(s);
      if (parsed.msg.t === "settings") {
        const r = step(draft, { kind: "client", seat: me.seat, msg: parsed.msg }, now);
        if (r.refused) return refuse(r.refused);
        lobbySettings = r.state.settings;
        const next = { ...s, lobbySettings };
        await this.commit(next);
        return this.broadcastLobby(next);
      }
      if (parsed.msg.t === "sound") return refuse("not_started");
      if (s.room.seats.length < 2) return refuse("too_few_players");
      engine = draft;
    }
    const r = step(engine, { kind: "client", seat: me.seat, msg: parsed.msg }, now);
    if (r.refused) return refuse(r.refused);
    let next: ServerState = { ...s, engine: r.state, lobbySettings, room: { ...s.room, lastActiveMs: now, started: true } };
    // connect every seat that is on a socket now, so the Engine knows who is here
    if (s.engine === null) for (const info of Object.values(next.sockets)) if (info.role === "controller" && info.seat !== null) next = { ...next, engine: step(next.engine as EngineState, { kind: "connect", seat: info.seat }, now).state };
    await this.commit(next, r.out, r.wakeAtMs);
  }

  private async hello(s: ServerState, socketId: string, token: string): Promise<void> {
    const who = whoIs(s.room, token);
    if (who === null) { this.ports.close(socketId, 4403, "bad_token"); return; }
    const now = this.ports.now();
    let next: ServerState = { ...s, sockets: { ...s.sockets, [socketId]: { role: who.role, seat: who.seat } } };
    let out: readonly Outbound[] = [];
    let wake: number | null = null;
    if (who.role === "controller" && who.seat !== null) {
      next = { ...next, room: { ...next.room, seats: next.room.seats.map((x) => (x.seat === who.seat ? { ...x, connected: true, awaySinceMs: null } : x)) } };
      if (next.engine !== null) { const r = step(next.engine, { kind: "connect", seat: who.seat }, now); next = { ...next, engine: r.state }; out = r.out; wake = r.wakeAtMs; }
    }
    await this.commit(next, out, wake);
    this.ports.send(socketId, { t: "welcome", role: who.role, seat: who.seat });
    this.ports.send(socketId, this.lobbyView(next));
  }

  async socketClosed(socketId: string): Promise<void> {
    const s = await this.loaded();
    if (s === null) return;
    this.rate.delete(socketId);
    const me = s.sockets[socketId];
    const sockets = { ...s.sockets };
    delete sockets[socketId];
    let next: ServerState = { ...s, sockets };
    let out: readonly Outbound[] = [];
    let wake: number | null = null;
    const stillHere = me?.seat != null && Object.values(sockets).some((x) => x.seat === me.seat);
    if (me?.role === "controller" && me.seat !== null && !stillHere) {
      next = { ...next, room: { ...next.room, seats: next.room.seats.map((x) => (x.seat === me.seat ? { ...x, connected: false, awaySinceMs: this.ports.now() } : x)) } };
      if (next.engine !== null) { const r = step(next.engine, { kind: "disconnect", seat: me.seat }, this.ports.now()); next = { ...next, engine: r.state }; out = r.out; wake = r.wakeAtMs; }
    }
    await this.commit(next, out, wake);
  }

  async alarm(): Promise<void> {
    const s = await this.loaded();
    if (s === null) return;
    const now = this.ports.now();
    if (isRoomExpired(s.room, now)) return this.end(s);
    if (s.engine === null) { await this.ports.setAlarm(s.room.lastActiveMs + s.room.ttlMs); return; }
    const r = step(s.engine, { kind: "alarm" }, now);
    await this.commit({ ...s, engine: r.state }, r.out, r.wakeAtMs);
  }

  /** Sends a validated voice cue to Host sockets only, respecting `decideSpeak` and keeping the line for `speakLine` (ghost-voice 3.9). */
  async speakRoomEvent(input: {
    id: string;
    kind: LineKind;
    speaker: Speaker;
    lodgerVoice?: LodgerVoice;
    text: string;
    playerText?: readonly string[];
  }): Promise<{ spoke: boolean; lineId: string | null }> {
    const s = await this.loaded();
    if (s === null) return { spoke: false, lineId: null };
    const now = this.ports.now();
    const prepared = prepareRoomNarration(s.voice, {
      id: input.id,
      kind: input.kind,
      speaker: input.speaker,
      ...(input.lodgerVoice !== undefined ? { lodgerVoice: input.lodgerVoice } : {}),
      text: input.text,
      playerText: input.playerText ?? s.room.seats.map((x) => x.nickname),
      now,
    });
    if (prepared.hostMsg === null) return { spoke: false, lineId: null };
    await this.commit({ ...s, voice: prepared.state });
    for (const [sid, info] of Object.entries(s.sockets)) {
      if (info.role === "host") this.ports.send(sid, prepared.hostMsg);
    }
    return { spoke: true, lineId: prepared.hostMsg.lineId };
  }

  /** Looks up a live room VoiceLine by id for Host playback (`ghost-voice` 3.9). */
  async findVoiceLine(lineId: string): Promise<VoiceLine | null> {
    const s = await this.loaded();
    if (s === null) return null;
    return findRoomVoiceLine(s.voice, lineId, this.ports.now());
  }

  /** Records and broadcasts a played Stitch event without changing any Engine rule state (`ghost-voice` 5.12). */
  async whisperStitch(event: PlayedStitch, clips: readonly unknown[]): Promise<{ reveals: PlayedStitch[] }> {
    const s = await this.loaded();
    if (s === null) return { reveals: [] };
    const rec = recordStitchPlayed(s.voice, event, clips);
    await this.commit({ ...s, voice: rec.state });
    for (const [sid, info] of Object.entries(s.sockets)) {
      if (info.role === "host") this.ports.send(sid, rec.hostMsg);
      this.ports.send(sid, rec.publicLog);
    }
    return { reveals: rec.reveals };
  }

  /** Ends the Room from outside (its maker started a new one). Nothing to do when it is already gone. */
  async endRoom(): Promise<void> {
    const s = await this.loaded();
    if (s !== null) await this.end(s);
  }

  /** End the Room: tell every socket, close them, and delete everything at once (party-mode 1.5). */
  private async end(s: ServerState): Promise<void> {
    for (const sid of Object.keys(s.sockets)) { this.ports.send(sid, { t: "ended" }); this.ports.close(sid, 4000, "room_ended"); }
    await this.ports.deleteAll();
    await this.ports.setAlarm(null);
    this.state = null;
    this.rate.clear();
    await this.ports.ended?.(s.room.code);
  }
}
