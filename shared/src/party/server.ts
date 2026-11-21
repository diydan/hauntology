import { whoIs } from "./auth";
import { publicDoors, type DoorSetup } from "./doors";
import { createEngine, repairDoors, seatedHumans, step, type EngineSettings, type EngineState, type Outbound, type PublicSnapshot } from "./engine";
import { handOver } from "./master";
import { acceptMovement, maySend, sanitizeInput } from "./input";
import { addClockSample, applySwitches, type SkyPlace, chooseWorld, cleanPose, initialExtras, ORIGIN_POSE, poseDue, scheduleStrike, type RoomExtras, type Sky } from "./room-extras";
import { lightMessages, lightTriggers, strikeLine, strikeMessages } from "./room-time";
import { MIDNIGHT_LINE } from "./hour";
import { roomConditions } from "./conditions";
import type { Pose } from "../ghost/types";
import { applyPatch, emptyContrib, toContributions, type ContribPatch, type LobbyContrib } from "./lobby-contrib";
import { offerFor, skipFor, type PromptOffer } from "./photoPrompts";
import { buildPool } from "./pool";
import { PRESET_GHOST_IDS } from "./preset-ghosts";
import { NO_SPEND, type RoomSpend } from "./spend";
import { parseClientMessage } from "./protocol";
import { createRoomState, isRoomExpired, newToken, parseRoom, serializeRoom, type RoomState, type Seat } from "./room";
import { humanCount, seatPlayer } from "./seats";
import { BOT_NAMES } from "./solo";
import type { NameConsent, SongsSetting } from "../songs/lyrics";
import { initialSongPlan, songRequests, type SongPlanState, type SongRequest } from "../songs/plan";
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
  /** The doors the world brings, or none (knock-door 1.4). Checked with the Zones when the game starts; the Worker plugs a world's doors in here. */
  doors?(): DoorSetup | null;
  /** Deletes stored Stitch clips for specific seats or all seats on leave/withdraw/switch-off. */
  deleteStitchClips?(forSeats: number[] | "all"): Promise<void>;
  /** Deletes the Room's contributed photos and ghosts when it ends (party-mode 10.4). */
  deleteContributions?(code: string): Promise<void>;
  /** Deletes stored generated songs for this Room when it ends (`game-songs` 3.1). */
  deleteSongs?(code: string): Promise<void>;
  /** True when a game may start only after the Master chose a world (`world_not_set`, party-mode 4.11). The Worker says yes; a bare test Room does not. */
  requireWorld?(): boolean;
  /**
   * The real world at the start (party-mode 4.18): called once, with the Master's choice (and place), for the sky. It may take its time
   * and may fail; the Room keeps only the three cosmetic fields and falls back to the default sky on a `null`, a throw or a refusal.
   */
  conditions?(choice: "place" | "table", place: SkyPlace | null, hostHour: number): Promise<Sky | null>;
};

export type RoomSongsState = Readonly<{
  setting: SongsSetting;
  muted: boolean;
  consent: NameConsent;
  plan: SongPlanState;
}>;

export const initialRoomSongsState = (): RoomSongsState => ({
  setting: "off",
  muted: false,
  consent: {},
  plan: initialSongPlan("off"),
});

/** At most this many messages per socket per second (party-mode 3.2: the Controller sends at most 30); the rest are refused unread. */
export const MAX_MESSAGES_PER_SECOND = 40;

export type SocketInfo = Readonly<{ role: "host" | "display" | "controller"; seat: Seat | null }>;
export type ServerState = Readonly<{
  room: RoomState;
  engine: EngineState | null;
  lobbySettings: EngineSettings;
  lobbyErrandOptOut?: Readonly<Record<number, boolean>>;
  doors?: DoorSetup | null;
  sockets: Readonly<Record<string, SocketInfo>>;
  voice: RoomVoiceState;
  songs: RoomSongsState;
  /** What the lobby collected: Suspects, photos, Zone names, prompt skips and selfie yes answers (party-mode 4.2). */
  contrib?: LobbyContrib;
  /** What the Room has spent on paid calls, against its own caps (party-mode 10.1). */
  spend?: RoomSpend;
  /** The world, the Master's room switches, light consent, clock samples and the last hour strike (party-mode 4.11, 4.17 to 4.19). Optional, so a Room saved before it still loads. */
  extras?: RoomExtras;
}>;

export const DEFAULT_SETTINGS: EngineSettings = { baseSeconds: 60, hauntMax: 10, nudges: "all", frames: true, sounds: true, puzzles: "medium", preset: "classic" };

const seedFrom = (b: Uint8Array): number => ((b[0] ?? 0) | ((b[1] ?? 0) << 8) | ((b[2] ?? 0) << 16) | ((b[3] ?? 0) << 24)) >>> 0;

export class RoomCore {
  private state: ServerState | null = null;
  /** Per socket: the start of its current one-second window and the messages in it. Memory only: an eviction resets it, which is harmless. */
  private readonly rate = new Map<string, { startMs: number; n: number }>();
  /** Per socket, memory only (input and pose are never stored): when its last input was taken and when the Host's last pose was relayed. */
  private readonly lastInputMs = new Map<string, number>();
  private lastPoseMs: number | null = null;
  private lastPose: Pose = ORIGIN_POSE;
  constructor(private readonly ports: Ports) {}

  private async loaded(): Promise<ServerState | null> {
    if (this.state !== null) return this.state;
    const text = await this.ports.load();
    if (text === undefined) return null;
    const raw = JSON.parse(text) as { room: string; engine: EngineState | null; lobbySettings: EngineSettings; lobbyErrandOptOut?: Record<number, boolean>; doors?: DoorSetup | null; sockets: Record<string, SocketInfo>; voice?: RoomVoiceState; songs?: RoomSongsState; contrib?: LobbyContrib; spend?: RoomSpend; extras?: RoomExtras };
    const room = parseRoom(raw.room);
    if (room === null) return null;
    // a saved door state that does not parse falls back to the start (knock-door 8.1)
    this.state = {
      room,
      engine: raw.engine === null ? null : repairDoors(raw.engine),
      lobbySettings: raw.lobbySettings,
      ...(raw.lobbyErrandOptOut ? { lobbyErrandOptOut: raw.lobbyErrandOptOut } : {}),
      ...(raw.doors !== undefined ? { doors: raw.doors } : {}),
      sockets: raw.sockets,
      voice: raw.voice ?? initialRoomVoiceState(),
      songs: raw.songs ?? initialRoomSongsState(),
      ...(raw.contrib !== undefined ? { contrib: raw.contrib } : {}),
      ...(raw.spend !== undefined ? { spend: raw.spend } : {}),
      ...(raw.extras !== undefined ? { extras: raw.extras } : {}),
    };
    return this.state;
  }

  /** Save first, then set the alarm, then send: a crash after a send never loses what was sent. */
  private async commit(next0: ServerState, out: readonly Outbound[] = [], wakeAtMs: number | null = null): Promise<void> {
    // the Engine may pass the Master role on (a Master away 60 s); the lobby's record follows it
    const merged = next0.engine !== null && next0.engine.masterSeat !== next0.room.masterSeat ? { ...next0, room: { ...next0.room, masterSeat: next0.engine.masterSeat as Seat } } : next0;
    const prevEngine = this.state?.engine ?? null;
    // the hour strike the alarm waits for next (party-mode 4.17): derived here, so every change keeps it right
    const x0 = merged.extras;
    const pending = x0 === undefined ? null : scheduleStrike(x0, merged.engine?.phase === "playing", this.ports.now());
    const next: ServerState = x0 === undefined || (x0.pendingStrike ?? null) === pending ? merged : { ...merged, extras: { ...x0, pendingStrike: pending } };
    this.state = next;
    await this.ports.save(JSON.stringify({
      room: serializeRoom(next.room),
      engine: next.engine,
      lobbySettings: next.lobbySettings,
      ...(next.lobbyErrandOptOut ? { lobbyErrandOptOut: next.lobbyErrandOptOut } : {}),
      ...(next.doors !== undefined ? { doors: next.doors } : {}),
      sockets: next.sockets,
      voice: next.voice,
      songs: next.songs,
      ...(next.contrib !== undefined ? { contrib: next.contrib } : {}),
      ...(next.spend !== undefined ? { spend: next.spend } : {}),
      ...(next.extras !== undefined ? { extras: next.extras } : {}),
    }));
    const ttlAt = next.room.lastActiveMs + next.room.ttlMs;
    const strikeAt = next.extras?.pendingStrike?.atMs ?? null;
    const wakes = [ttlAt, ...(wakeAtMs === null ? [] : [wakeAtMs]), ...(strikeAt === null ? [] : [strikeAt])];
    await this.ports.setAlarm(Math.min(...wakes));
    this.route(next, out);
    this.playLights(next, lightTriggers(prevEngine, next.engine));
  }

  /** The light bar for the Haunt Events and House Cues the last step logged (party-mode 4.19). */
  private playLights(s: ServerState, triggers: ReturnType<typeof lightTriggers>): void {
    if (triggers.length === 0 || s.extras === undefined) return;
    const humans = s.room.seats.filter((x) => !x.bot).map((x) => x.seat as number);
    for (const t of triggers) for (const { seat, msg } of lightMessages(t, this.ports.now(), humans, s.extras)) {
      for (const [sid, info] of Object.entries(s.sockets)) if (info.role === "controller" && info.seat === seat) this.ports.send(sid, msg);
    }
  }

  private route(s: ServerState, out: readonly Outbound[]): void {
    const sky = roomConditions(s.extras?.sky);
    for (const o of out) {
      // only the three cosmetic fields of the frozen sky ride on the Public View (party-mode 4.18)
      const msg = o.to === "public" && o.msg.t === "public" && sky !== undefined ? { ...o.msg, view: { ...o.msg.view, atmosphere: sky } } : o.msg;
      for (const [sid, info] of Object.entries(s.sockets)) {
        if (o.to === "public" || (o.to === "host" && info.role === "host") || (o.to === "seat" && info.role === "controller" && info.seat === o.seat)) this.ports.send(sid, msg);
      }
    }
  }

  /** The real world, once, at the start: the Master's choice, or nothing. Never blocks and never throws (party-mode 4.18). */
  private async skyAtStart(s: ServerState): Promise<ServerState> {
    const x = s.extras ?? initialExtras();
    if (x.switches.conditions === "off" || this.ports.conditions === undefined) return s;
    let sky: Sky | null = null;
    const hostHour = Math.floor((((this.ports.now() + (x.hostOffsetMin ?? 0) * 60_000) % 86_400_000) + 86_400_000) % 86_400_000 / 3_600_000);
    try { sky = await this.ports.conditions(x.switches.conditions, x.switches.place, hostHour); } catch { sky = null; }
    const clean = sky !== null && [sky.weather, sky.timeOfDay, sky.moon].every((v) => typeof v === "string" && v.length > 0 && v.length <= 32) ? { weather: sky.weather, timeOfDay: sky.timeOfDay, moon: sky.moon } : null;
    // the position is dropped the moment it has been used: the Room keeps only the three cosmetic fields
    return { ...s, extras: { ...x, sky: clean, switches: { ...x.switches, place: null } } };
  }
  private sendSky(s: ServerState): void {
    const sky = roomConditions(s.extras?.sky);
    if (sky === undefined) return;
    for (const [sid, info] of Object.entries(s.sockets)) if (info.role === "host") this.ports.send(sid, { t: "setAtmosphere", ...sky });
  }

  private lobbyView(s: ServerState) {
    return { t: "lobby" as const, code: s.room.code, masterSeat: s.room.masterSeat, started: s.room.started, settings: s.lobbySettings,
      worldId: s.extras?.world?.id ?? null, switches: (s.extras ?? initialExtras()).switches,
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
    const botLevel = s.lobbySettings.botLevel ?? (s.lobbySettings.preset === "gentle" ? ("gentle" as const) : ("standard" as const));
    return createEngine({
      seed: s.room.seed,
      seats: s.room.seats.map((x) => ({ seat: x.seat, nickname: x.nickname, bot: x.bot, botLevel })),
      settings: s.lobbySettings,
      presetIds: PRESET_GHOST_IDS,
      pool: buildPool(toContributions(s.contrib ?? emptyContrib()), PRESET_GHOST_IDS, s.room.seed),
      doors: s.doors ?? this.ports.doors?.() ?? null,
      ...(s.lobbyErrandOptOut ? { errandOptOut: s.lobbyErrandOptOut } : {}),
    });
  }

  // ------------------------------------------------------------ HTTP-side calls (from the routes)
  async create(code: string, opts?: Readonly<{ doors?: DoorSetup | null }>): Promise<{ hostToken: string; displayToken: string }> {
    const fill = (b: Uint8Array): Uint8Array => { b.set(this.ports.randomBytes(b.length)); return b; };
    const hostToken = newToken(fill);
    const displayToken = newToken(fill);
    const room = createRoomState(code, seedFrom(this.ports.randomBytes(4)), this.ports.now(), hostToken, displayToken);
    await this.commit({
      room,
      engine: null,
      lobbySettings: DEFAULT_SETTINGS,
      ...(opts?.doors !== undefined ? { doors: opts.doors } : {}),
      sockets: {},
      voice: initialRoomVoiceState(),
      songs: initialRoomSongsState(),
    });
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

  // ------------------------------------------------------------ the lobby's contributions (party-mode 4.2, 5, 7)
  /** Which device holds this token, for the routes: its role, seat, whether it is the Master, and whether the game has started. `null` for a token this Room never gave. */
  async identify(token: string): Promise<{ role: "host" | "display" | "controller"; seat: number | null; master: boolean; started: boolean } | null> {
    const s = await this.loaded();
    if (s === null || isRoomExpired(s.room, this.ports.now())) return null;
    const who = whoIs(s.room, token);
    if (who === null) return null;
    return { role: who.role, seat: who.seat, master: who.seat !== null && who.seat === s.room.masterSeat, started: s.room.started || s.engine !== null };
  }

  /** What a seat needs to contribute: its prompt offer, the selfie switch and its own yes. Only a Player's own token, and only in the lobby. */
  async lobbyContext(token: string): Promise<{ ok: true; seat: number; offer: PromptOffer; selfies: boolean; selfieYes: boolean; selfieMade: boolean } | { ok: false; code: string }> {
    const s = await this.loaded();
    if (s === null || isRoomExpired(s.room, this.ports.now())) return { ok: false, code: "room_unknown" };
    const who = whoIs(s.room, token);
    if (who === null || who.role !== "controller" || who.seat === null) return { ok: false, code: "bad_token" };
    if (s.room.started || s.engine !== null) return { ok: false, code: "game_started" };
    const c = s.contrib ?? emptyContrib();
    const offer = offerFor(s.room.seed, who.seat, c.promptRound[who.seat] ?? 0) as PromptOffer;
    return { ok: true, seat: who.seat, offer, selfies: s.lobbySettings.selfies === true, selfieYes: c.selfieYes[who.seat] === true, selfieMade: c.selfieMade[who.seat] === true };
  }

  /** Records one contribution for the token's own seat. The Room keeps only ids and verdicts; the photo and the Ghost's files are stored elsewhere. */
  async recordContribution(token: string, patch: ContribPatch): Promise<{ ok: true } | { ok: false; code: string }> {
    const s = await this.loaded();
    if (s === null || isRoomExpired(s.room, this.ports.now())) return { ok: false, code: "room_unknown" };
    const who = whoIs(s.room, token);
    if (who === null || who.role !== "controller" || who.seat === null) return { ok: false, code: "bad_token" };
    if (s.room.started || s.engine !== null) return { ok: false, code: "game_started" };
    if (patch.kind === "promptRound" && (!Number.isInteger(patch.round) || patch.round < 0 || patch.round > 3)) return { ok: false, code: "bad_request" };
    const next = { ...s, contrib: applyPatch(s.contrib ?? emptyContrib(), who.seat, patch), room: { ...s.room, lastActiveMs: this.ports.now() } };
    await this.commit(next);
    return { ok: true };
  }

  /** One Photo Prompt skip for the token's own seat: the next three prompts, or `prompt_skips_used` after the third. */
  async skipPrompt(token: string): Promise<{ ok: true; offer: PromptOffer } | { ok: false; code: string }> {
    const ctx = await this.lobbyContext(token);
    if (!ctx.ok) return ctx;
    const s = (await this.loaded()) as ServerState;
    const next = skipFor(s.room.seed, ctx.seat, ctx.offer.round);
    if (next === null) return { ok: false, code: "prompt_skips_used" };
    const r = await this.recordContribution(token, { kind: "promptRound", round: next.round });
    return r.ok ? { ok: true, offer: next } : r;
  }

  /** What the Room has spent on paid calls. Zero for a Room that has spent nothing. */
  async loadSpend(): Promise<RoomSpend> {
    const s = await this.loaded();
    return s?.spend ?? NO_SPEND;
  }

  /** Saves the Room's spend. Whole non-negative numbers only; anything else is ignored. */
  async saveSpend(spend: RoomSpend): Promise<boolean> {
    const s = await this.loaded();
    const ok = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 1_000_000;
    if (s === null || !ok(spend?.images) || !ok(spend?.models)) return false;
    await this.commit({ ...s, spend: { images: spend.images, models: spend.models } });
    return true;
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
      if (m.t === "world") {
        // the Master chooses; in an all-Bot Room (no human seated) the Host does
        if (!isMaster && !(me.role === "host" && humanCount(s.room) === 0)) return refuse("not_master");
        if (s.engine !== null) return refuse("game_started");
        const w = chooseWorld(m);
        if (!w.ok) return refuse(w.code);
        const next = { ...s, extras: { ...(s.extras ?? initialExtras()), world: w.world } };
        await this.commit(next);
        return this.broadcastLobby(next);
      }
      if (m.t === "roomSettings") {
        if (!isMaster) return refuse("not_master");
        const x = s.extras ?? initialExtras();
        const switches = applySwitches(x.switches, m);
        // the Engine reads the Rattle switch from its settings; the lobby keeps it for the Engine made at the start
        const lobbySettings = { ...s.lobbySettings, rattle: switches.rattle };
        const next = { ...s, lobbySettings, ...(s.engine === null ? {} : { engine: { ...s.engine, settings: { ...s.engine.settings, rattle: switches.rattle } } }), extras: { ...x, switches } };
        await this.commit(next);
        return this.broadcastLobby(next);
      }
      if (m.t === "hostClock") {
        if (me.role !== "host") return refuse("not_host");
        await this.commit({ ...s, extras: { ...(s.extras ?? initialExtras()), hostOffsetMin: m.offsetMin } });
        return;
      }
      if (m.t === "ping") { this.ports.send(socketId, { t: "pong", id: m.id, serverMs: now }); return; }
      if (m.t === "clockSample") {
        if (me.role !== "controller" || me.seat === null) return refuse("not_a_player");
        const x = s.extras ?? initialExtras();
        const clock = addClockSample(x.clock, me.seat, m);
        if (clock !== x.clock) await this.commit({ ...s, extras: { ...x, clock } });
        return;
      }
      if (m.t === "light") {
        if (me.role !== "controller" || me.seat === null) return refuse("not_a_player");
        const x = s.extras ?? initialExtras();
        await this.commit({ ...s, extras: { ...x, light: { ...x.light, [me.seat]: { consent: m.consent, reducedMotion: m.reducedMotion === true } } } });
        return;
      }
      if (m.t === "input") {
        // Not stored and not answered: a phone's stick reaches the Host only while it is the active Detective's, at most 30 a second.
        if (me.role !== "controller" || me.seat === null || s.engine === null || s.engine.phase !== "playing" || s.engine.pausedSinceMs !== null) return;
        const last = this.lastInputMs.get(socketId) ?? null;
        if (!maySend(last, now)) return;
        const eng = s.engine;
        const ok = acceptMovement(sanitizeInput(m), me.seat, eng.turn?.seat ?? null, eng.players.filter((p) => p.poltergeist).map((p) => p.seat));
        if (ok === null) return;
        this.lastInputMs.set(socketId, now);
        for (const [sid, info] of Object.entries(s.sockets)) if (info.role === "host") this.ports.send(sid, { t: "input", seat: me.seat, input: ok });
        return;
      }
      if (m.t === "pose") {
        if (me.role !== "host") return refuse("not_host");
        if (!poseDue(this.lastPoseMs, now)) return;
        this.lastPoseMs = now;
        this.lastPose = cleanPose(m, s.extras?.world ?? null, this.lastPose);
        for (const [sid, info] of Object.entries(s.sockets)) if (info.role !== "host") this.ports.send(sid, { t: "pose", pos: this.lastPose.pos, yaw: this.lastPose.yaw });
        return;
      }
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
        if (this.ports.requireWorld?.() === true && s.extras?.world == null) return refuse("world_not_set");
        let room = s.room;
        while (room.seats.length < (m.bots ?? 4)) {
          const res = seatPlayer(room, this.botName(room), null, now);
          if (!res.ok) return refuse(res.code);
          room = res.state;
        }
        const draft = this.draftEngine({ ...s, room });
        const r = step(draft, { kind: "client", seat: draft.masterSeat, msg: { t: "start" } }, now);
        if (r.refused) return refuse(r.refused);
        const started = await this.skyAtStart({ ...s, room: { ...room, lastActiveMs: now, started: true }, engine: r.state });
        await this.commit(started, r.out, r.wakeAtMs);
        return this.sendSky(started);
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
      if (m.t === "songsSetting") {
        if (!isMaster) return refuse("not_master");
        const nextSongs: RoomSongsState = {
          ...s.songs,
          setting: m.setting,
          plan: { ...s.songs.plan, setting: m.setting },
        };
        await this.commit({ ...s, songs: nextSongs });
        for (const [sid, info] of Object.entries(s.sockets)) {
          if (info.role === "host" || info.seat === s.room.masterSeat) {
            this.ports.send(sid, { t: "songsState", setting: nextSongs.setting, muted: nextSongs.muted });
          }
        }
        return;
      }
      if (m.t === "songMute") {
        if (!isMaster) return refuse("not_master");
        const nextSongs: RoomSongsState = { ...s.songs, muted: m.muted };
        await this.commit({ ...s, songs: nextSongs });
        for (const [sid, info] of Object.entries(s.sockets)) {
          if (info.role === "host" || info.seat === s.room.masterSeat) {
            this.ports.send(sid, { t: "songsState", setting: nextSongs.setting, muted: nextSongs.muted });
          }
        }
        return;
      }
      if (m.t === "songSkip") {
        if (!isMaster) return refuse("not_master");
        for (const [sid, info] of Object.entries(s.sockets)) {
          if (info.role === "host") this.ports.send(sid, { t: "songSkip" });
        }
        return;
      }
      if (m.t === "singMyName") {
        if (me.role !== "controller" || me.seat === null) return refuse("not_a_player");
        if (m.seat !== undefined && m.seat !== me.seat) return refuse("bad_token");
        const nextSongs: RoomSongsState = {
          ...s.songs,
          consent: { ...s.songs.consent, [me.seat]: m.yes },
        };
        await this.commit({ ...s, songs: nextSongs });
        return;
      }
      return;
    }

    if (me.role !== "controller" || me.seat === null) return refuse("not_a_player");
    let engine = s.engine;
    let lobbySettings = s.lobbySettings;
    if (engine === null) {
      // The lobby: settings and start, by the Master only. The Engine is made at the start, from the seats then.
      if (parsed.msg.t !== "settings" && parsed.msg.t !== "start" && parsed.msg.t !== "sound" && parsed.msg.t !== "errandOptOut") return refuse("not_started");
      if (parsed.msg.t === "errandOptOut") {
        const lobbyErrandOptOut = { ...(s.lobbyErrandOptOut ?? {}), [me.seat]: parsed.msg.on };
        await this.commit({ ...s, lobbyErrandOptOut });
        return;
      }
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
      if (this.ports.requireWorld?.() === true && s.extras?.world == null) return refuse("world_not_set");
      engine = draft;
    }
    const r = step(engine, { kind: "client", seat: me.seat, msg: parsed.msg }, now);
    if (r.refused) return refuse(r.refused);
    let next: ServerState = { ...s, engine: r.state, lobbySettings, room: { ...s.room, lastActiveMs: now, started: true } };
    if (s.engine === null) next = await this.skyAtStart(next);
    // connect every seat that is on a socket now, so the Engine knows who is here
    if (s.engine === null) for (const info of Object.values(next.sockets)) if (info.role === "controller" && info.seat !== null) next = { ...next, engine: step(next.engine as EngineState, { kind: "connect", seat: info.seat }, now).state };
    await this.commit(next, r.out, r.wakeAtMs);
    if (s.engine === null) this.sendSky(next);
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
    // a phone or a TV that joins late is told the state of every door (knock-door 8.4); nothing is added when the world has none
    const doors = next.engine?.doors ? publicDoors(next.engine.doors, seatedHumans(next.engine), now) : null;
    this.ports.send(socketId, { t: "welcome", role: who.role, seat: who.seat, ...(doors ? { doors } : {}) });
    if (who.role === "host") this.sendSky(next);
    this.ports.send(socketId, this.lobbyView(next));
  }

  async socketClosed(socketId: string): Promise<void> {
    const s = await this.loaded();
    if (s === null) return;
    this.rate.delete(socketId);
    this.lastInputMs.delete(socketId);
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
    const struck = this.strikeIfDue({ ...s, engine: r.state }, now);
    await this.commit(struck.state, [...r.out, ...struck.out], r.wakeAtMs);
    for (const m of struck.direct) this.ports.send(m.sid, m.msg);
    if (struck.midnight !== null) await this.midnight(struck.midnight);
  }

  /**
   * The hour strike, when it is due (party-mode 4.17): the Host and every phone get it at the same server time (a phone with
   * no consent, no free sound slot or sounds off gets a flash or nothing), the strike counts toward each playing phone's
   * three sounds, and every screen reads one line. The strike changes no rule.
   */
  private strikeIfDue(s: ServerState, now: number): { state: ServerState; out: readonly Outbound[]; direct: readonly { sid: string; msg: unknown }[]; midnight: number | null } {
    const x = s.extras;
    const due = x?.pendingStrike;
    if (x === undefined || due == null || now < due.atMs || s.engine === null || s.engine.phase !== "playing") return { state: s, out: [], direct: [], midnight: null };
    const eng = s.engine;
    const phones = eng.players.map((p) => ({ seat: p.seat, bot: eng.seats.find((q) => q.seat === p.seat)?.bot ?? false, consent: p.soundConsent, hasAudio: p.hasAudio, soundsThisRound: p.soundsThisRound }));
    const msgs = strikeMessages(due, phones, eng.settings.sounds ?? true);
    const direct: { sid: string; msg: unknown }[] = [];
    for (const m of msgs) {
      for (const [sid, info] of Object.entries(s.sockets)) {
        if (m.target === "host" ? info.role === "host" : info.role === "controller" && info.seat === m.target) direct.push({ sid, msg: m.msg });
      }
    }
    const played = new Set(msgs.filter((m) => m.target !== "host" && m.msg.plan === "play").map((m) => m.target as number));
    const engine: EngineState = { ...eng, players: eng.players.map((p) => (played.has(p.seat) ? { ...p, soundsThisRound: p.soundsThisRound + 1 } : p)) };
    for (const [sid, info] of Object.entries(s.sockets)) direct.push({ sid, msg: { t: "scripted", kind: due.midnight ? "midnight" : "strike", line: strikeLine(due, MIDNIGHT_LINE) } });
    const next: ServerState = { ...s, engine, extras: { ...x, lastStrike: due, pendingStrike: null } };
    // the light bar: a strike plays the failing bulb to every phone that agreed
    const humans = s.room.seats.filter((q) => !q.bot).map((q) => q.seat as number);
    for (const { seat, msg } of lightMessages({ kind: "failing-bulb", seats: null }, now, humans, x)) {
      for (const [sid, info] of Object.entries(s.sockets)) if (info.role === "controller" && info.seat === seat) direct.push({ sid, msg });
    }
    return { state: next, out: [], direct, midnight: due.midnight ? due.atMs : null };
  }

  /** The ghost's one scripted midnight line, spoken through the ghost voice when it is on (the Host asks for the audio with its token). */
  private async midnight(atMs: number): Promise<void> {
    await this.speakRoomEvent({ id: `midnight-${atMs}`, kind: "midnight", speaker: "whisper", text: MIDNIGHT_LINE });
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

  /** Looks up a live room VoiceLine by id only if `hostToken` matches this Room's Host token. */
  async findVoiceLineForHost(lineId: string, hostToken: string): Promise<VoiceLine | null> {
    const s = await this.loaded();
    if (s === null || hostToken === "" || s.room.hostToken !== hostToken) return null;
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

  /** Evaluates pending song requests for the current public snapshot and persists plan state (`game-songs` 3.2). */
  async planRoomSongs(
    view: PublicSnapshot,
    options: { lastRound?: number } = {},
  ): Promise<{ requests: readonly SongRequest[]; consent: NameConsent; setting: SongsSetting; muted: boolean }> {
    const s = await this.loaded();
    if (s === null) return { requests: [], consent: {}, setting: "off", muted: false };
    const planned = songRequests(view, s.songs.plan, options);
    await this.commit({ ...s, songs: { ...s.songs, plan: planned.state } });
    return {
      requests: planned.requests,
      consent: s.songs.consent,
      setting: s.songs.setting,
      muted: s.songs.muted,
    };
  }

  /** Sends a ready song or Stock fallback cue to Host sockets (and optional Clue hint log to all) without changing Engine state. */
  async sendRoomSong(input: { key: string; title: string; captions: string; hintLogLine?: string }): Promise<boolean> {
    const s = await this.loaded();
    if (s === null || s.songs.setting === "off") return false;
    for (const [sid, info] of Object.entries(s.sockets)) {
      if (info.role === "host") this.ports.send(sid, { t: "song", key: input.key, title: input.title, captions: input.captions, ...(input.hintLogLine ? { hintLogLine: input.hintLogLine } : {}) });
      if (input.hintLogLine !== undefined) this.ports.send(sid, { t: "songHint", line: input.hintLogLine });
    }
    return true;
  }

  /** Ends the Room from outside (its maker started a new one). Nothing to do when it is already gone. */
  async endRoom(): Promise<void> {
    const s = await this.loaded();
    if (s !== null) await this.end(s);
  }

  /**
   * Ends the Room for its Master (the controller in the Master's seat) or its host token, and nobody else (party-mode 7,
   * `DELETE /api/party/:code`). A display token, another Player or a wrong token is refused and the Room stays.
   */
  async endAs(token: string): Promise<"ended" | "forbidden" | "room_unknown"> {
    const s = await this.loaded();
    if (s === null) return "room_unknown";
    const who = token === "" ? null : whoIs(s.room, token);
    const allowed = who !== null && (who.role === "host" || (who.role === "controller" && who.seat === s.room.masterSeat));
    if (!allowed) return "forbidden";
    await this.end(s);
    return "ended";
  }

  /** End the Room: tell every socket, close them, and delete everything at once (party-mode 1.5). */
  private async end(s: ServerState): Promise<void> {
    for (const sid of Object.keys(s.sockets)) { this.ports.send(sid, { t: "ended" }); this.ports.close(sid, 4000, "room_ended"); }
    await this.ports.deleteSongs?.(s.room.code);
    await this.ports.deleteContributions?.(s.room.code);
    await this.ports.deleteAll();
    await this.ports.setAlarm(null);
    this.state = null;
    this.rate.clear();
    await this.ports.ended?.(s.room.code);
  }
}
