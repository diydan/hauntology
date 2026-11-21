import type { Preset } from "@hauntology/shared/puzzles/settings";
import type { PuzzleSetting, Transcript } from "@hauntology/shared/puzzles/types";
import type { AttemptReply } from "../../puzzles/PuzzleHost";
import { NOT_SEATED, type ControllerPort, type JoinFailure, type JoinResult, type LockOffer, type RoomView } from "../controller/controller-port";
import { estimateOffset, type PingSample } from "@hauntology/shared/party/light";
import { applyRoomMessage, clearPrompt, EMPTY_GAME, type GameView } from "../controller/game-view";

/**
 * The real Controller port over the Room's socket (party-mode 9.1): `POST /api/party/:code/join` for a seat and a token, then the socket,
 * with the token only in its first message (never in an address). The token is kept in the tab's session storage under the Room Code, so a
 * reload or a dropped connection takes the same seat again. Every message of the Room goes through `applyRoomMessage`; this class adds the
 * connection, the Lock and the actions, and decides no rule. Everything outside it (fetch, the socket, storage, timers) comes in as a dependency.
 */
export type SocketLike = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
  onerror: (() => void) | null;
};
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type PortDeps = Readonly<{
  fetch: (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  openSocket: (code: string) => SocketLike;
  storage: StorageLike;
  now: () => number;
  setTimer: (f: () => void, ms: number) => unknown;
  clearTimer: (h: unknown) => void;
  /** The base of the party routes, `/api/party` by default. */
  base?: string;
}>;

type Stored = Readonly<{ code: string; token: string; seat: number; nickname: string }>;
const KEY = "hauntology.party.seat";
/** The pauses between reconnects, in ms; the last one repeats. */
export const BACKOFF_MS = [500, 1000, 2000, 4000, 8000] as const;
const ATTEMPT_TIMEOUT_MS = 8_000;
const JOIN_CODES: readonly JoinFailure[] = ["room_full", "game_started", "room_unknown"];

type Listener = (view: RoomView) => void;
type Pending = { resolve: (r: AttemptReply) => void; timer: unknown };

export class RoomSocketPort implements ControllerPort {
  private view: RoomView = NOT_SEATED;
  private game: GameView = EMPTY_GAME;
  private readonly listeners = new Set<Listener>();
  private socket: SocketLike | null = null;
  private stored: Stored | null = null;
  private retries = 0;
  private retryTimer: unknown = null;
  private closing = false;
  private readonly pending = new Map<string, Pending>();
  private lockOffer: LockOffer | null = null;
  private samples: PingSample[] = [];
  private pings = new Map<number, number>();
  private pingN = 0;
  private pingTimers: unknown[] = [];

  constructor(private readonly deps: PortDeps) {}

  getView(): RoomView { return this.view; }
  subscribe(l: Listener): () => void { this.listeners.add(l); return () => { this.listeners.delete(l); }; }

  private base(): string { return this.deps.base ?? "/api/party"; }
  private emit(patch: Partial<RoomView>): void {
    this.view = { ...this.view, ...patch, game: this.game };
    for (const l of [...this.listeners]) l(this.view);
  }

  private read(): Stored | null {
    try {
      const raw = this.deps.storage.getItem(KEY);
      if (raw === null) return null;
      const o = JSON.parse(raw) as Partial<Stored>;
      return typeof o.code === "string" && typeof o.token === "string" && /^[0-9a-f]{32}$/.test(o.token) && typeof o.seat === "number" && typeof o.nickname === "string" ? (o as Stored) : null;
    } catch { return null; }
  }
  private write(s: Stored | null): void {
    try { if (s === null) this.deps.storage.removeItem(KEY); else this.deps.storage.setItem(KEY, JSON.stringify(s)); } catch { /* storage off: the seat lasts this page only */ }
  }

  async join(code: string, nickname: string): Promise<JoinResult> {
    let res: { ok: boolean; status: number; json(): Promise<unknown> };
    try {
      res = await this.deps.fetch(`${this.base()}/${encodeURIComponent(code)}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname }) });
    } catch { return { ok: false, code: "unreachable" }; }
    const body = (await res.json().catch(() => null)) as { ok?: boolean; seat?: number; token?: string; code?: string } | null;
    if (body === null) return { ok: false, code: "unreachable" };
    if (body.ok !== true || typeof body.seat !== "number" || typeof body.token !== "string") {
      // the three answers of the Room say the same whatever is inside it; anything else is the phone's own "could not ask"
      const c = (JOIN_CODES as readonly string[]).includes(body.code ?? "") ? (body.code as JoinFailure) : res.status >= 500 || res.status === 0 ? "unreachable" : "room_unknown";
      return { ok: false, code: c };
    }
    this.stored = { code, token: body.token, seat: body.seat, nickname };
    this.write(this.stored);
    this.game = EMPTY_GAME;
    this.emit({ connection: "connecting", phase: "lobby", code, seat: body.seat, nickname, master: null, lock: null });
    this.connect();
    return { ok: true, seat: body.seat, nickname };
  }

  async restore(code?: string): Promise<JoinResult | null> {
    const s = this.read();
    if (s === null || (code !== undefined && s.code !== code)) return null;
    this.stored = s;
    this.game = EMPTY_GAME;
    this.emit({ connection: "connecting", phase: "lobby", code: s.code, seat: s.seat, nickname: s.nickname, master: null, lock: null });
    this.connect();
    return { ok: true, seat: s.seat, nickname: s.nickname };
  }

  private connect(): void {
    const s = this.stored;
    if (s === null) return;
    this.closing = false;
    const sock = this.deps.openSocket(s.code);
    this.socket = sock;
    sock.onopen = () => sock.send(JSON.stringify({ t: "hello", token: s.token }));
    sock.onmessage = (e) => this.onMessage(e.data);
    sock.onclose = (e) => this.onClose(sock, e.code);
    sock.onerror = () => undefined;
  }

  private onMessage(data: unknown): void {
    let msg: unknown;
    try { msg = typeof data === "string" ? JSON.parse(data) : null; } catch { return; }
    if (typeof msg !== "object" || msg === null) return;
    const m = msg as { t?: string } & Record<string, unknown>;
    if (m.t === "welcome") { this.retries = 0; this.emit({ connection: "online" }); this.measureClock(); return; }
    if (m.t === "pong") { this.onPong(m); return; }
    if (m.t === "lock") { this.onLock(m); return; }
    if (m.t === "lockResult") { this.onLockResult(m); return; }
    this.game = applyRoomMessage(this.game, msg, this.deps.now());
    this.emit(this.derived());
    if (m.t === "ended") this.dropSeat();
  }

  /** The view fields the existing screens read, from the game: the phase, and the Master's settings. */
  private derived(): Partial<RoomView> {
    const g = this.game;
    const seat = this.stored?.seat ?? null;
    const phase: RoomView["phase"] = g.pub === null ? (g.lobby?.started ? "playing" : "lobby") : g.pub.phase === "ended" ? "ended" : g.pub.phase === "lobby" ? "lobby" : g.pub.paused ? "paused" : "playing";
    const isMaster = seat !== null && (g.pub === null ? g.lobby?.masterSeat === seat : g.lobby?.masterSeat === seat);
    const st = (g.lobby?.settings ?? {}) as { puzzles?: PuzzleSetting; preset?: Preset; cluePlace?: "phone" | "world"; errands?: boolean };
    return {
      phase,
      master: isMaster ? { puzzles: st.puzzles ?? "off", preset: st.preset ?? "classic", ...(st.cluePlace ? { cluePlace: st.cluePlace } : {}), ...(st.errands !== undefined ? { errands: st.errands } : {}) } : null,
      ...(g.priv ? { soundConsent: g.priv.soundConsent } : {}),
      ...(g.pub && g.pub.doors.length > 0 ? { doors: g.pub.doors } : {}),
    };
  }

  /** Three ping and pong exchanges a little apart, so the phone can read the Room's deadlines and start light and sound cues together (party-mode 17.3). */
  private measureClock(): void {
    for (const h of this.pingTimers) this.deps.clearTimer(h);
    this.pingTimers = [];
    for (let i = 0; i < 3; i++) {
      this.pingTimers.push(this.deps.setTimer(() => {
        if (this.view.connection !== "online") return;
        const id = ++this.pingN;
        const clientMs = this.deps.now();
        this.pings.set(id, clientMs);
        this.send({ t: "ping", id, clientMs });
      }, i * 300));
    }
  }

  private onPong(m: Record<string, unknown>): void {
    const id = typeof m.id === "number" ? m.id : -1;
    const sentMs = this.pings.get(id);
    if (sentMs === undefined || typeof m.serverMs !== "number") return;
    this.pings.delete(id);
    const sample: PingSample = { sentMs, serverMs: m.serverMs, receivedMs: this.deps.now() };
    this.samples = [...this.samples, sample].slice(-5);
    this.send({ t: "clockSample", sentMs: sample.sentMs, serverMs: sample.serverMs, receivedMs: sample.receivedMs });
    const est = estimateOffset(this.samples);
    if (est !== null) this.emit({ clock: est });
  }

  private onLock(m: Record<string, unknown>): void {
    const view = m.view as LockOffer["view"] | undefined;
    if (view === undefined || typeof m.lockId !== "string") return;
    const kind = (view as { kind: LockOffer["kind"] }).kind;
    const faded = (m.faded ?? null) as LockOffer["faded"];
    this.lockOffer = {
      id: m.lockId, kind, view, faded, clue: faded, attempts: typeof m.attempts === "number" ? m.attempts : 3,
      capMs: typeof m.deadlineAt === "number" ? Math.max(0, m.deadlineAt - this.deps.now()) : null,
      ...(typeof m.sign === "string" ? { sign: m.sign as never } : {}), ...(typeof m.prompt === "string" ? { prompt: m.prompt } : {}),
      ...(typeof m.canSeeAgain === "boolean" ? { canSeeAgain: m.canSeeAgain } : {}), ...(typeof m.assistText === "string" ? { assistText: m.assistText } : {}),
    };
    this.emit({ lock: this.lockOffer, phase: "playing" });
  }

  private onLockResult(m: Record<string, unknown>): void {
    const id = typeof m.lockId === "string" ? m.lockId : "";
    const p = this.pending.get(id);
    const reply: AttemptReply = m.outcome === "solved" ? { outcome: "solved" } : m.outcome === "wrong" ? { outcome: "wrong", attemptsLeft: typeof m.attemptsLeft === "number" ? m.attemptsLeft : 0 } : { outcome: "failed", reason: "failed" };
    if (p !== undefined) { this.deps.clearTimer(p.timer); this.pending.delete(id); p.resolve(reply); }
    if (m.outcome !== "wrong" && this.lockOffer?.id === id) { /* the Lock stays on screen until the Player taps Done: `closeLock` clears it */ }
  }

  private onClose(sock: SocketLike, code: number): void {
    if (this.socket !== sock) return;
    this.socket = null;
    // a token the Room does not know, or a Room that ended, is the end of this seat; anything else is a dropped line
    if (code === 4403 || code === 4004 || code === 4000) { this.dropSeat(); return; }
    if (this.closing || this.stored === null) return;
    this.emit({ connection: "reconnecting" });
    const wait = BACKOFF_MS[Math.min(this.retries, BACKOFF_MS.length - 1)] as number;
    this.retries += 1;
    this.retryTimer = this.deps.setTimer(() => { this.retryTimer = null; this.connect(); }, wait);
  }

  private dropSeat(): void {
    this.closing = true;
    if (this.retryTimer !== null) { this.deps.clearTimer(this.retryTimer); this.retryTimer = null; }
    for (const p of this.pending.values()) { this.deps.clearTimer(p.timer); p.resolve({ outcome: "failed", reason: "left" }); }
    this.pending.clear();
    this.stored = null;
    this.lockOffer = null;
    this.write(null);
    this.socket?.close();
    this.socket = null;
    this.game = EMPTY_GAME;
    for (const h of this.pingTimers) this.deps.clearTimer(h);
    this.pingTimers = [];
    this.samples = [];
    this.pings.clear();
    this.view = NOT_SEATED;
    for (const l of [...this.listeners]) l(this.view);
  }

  send(msg: Readonly<{ t: string } & Record<string, unknown>>): void {
    if (this.socket !== null && this.view.connection === "online") this.socket.send(JSON.stringify(msg));
  }

  attempt(lockId: string, transcript: Transcript): Promise<AttemptReply> {
    if (this.lockOffer?.id !== lockId) return Promise.resolve({ outcome: "failed", reason: "no_lock" });
    return new Promise((resolve) => {
      const timer = this.deps.setTimer(() => { this.pending.delete(lockId); resolve({ outcome: "failed", reason: "no_answer" }); }, ATTEMPT_TIMEOUT_MS);
      this.pending.set(lockId, { resolve, timer });
      this.send({ t: "attempt", lockId, transcript });
    });
  }

  closeLock(lockId: string, why: "finished" | "gave_up" | "time_up"): void {
    if (why === "gave_up") this.send({ t: "giveUp", lockId });
    if (this.lockOffer?.id !== lockId) return;
    this.lockOffer = null;
    this.emit({ lock: null });
  }

  dismissPrompt(): void { this.game = clearPrompt(this.game); this.emit({}); }

  setSound(consent: boolean): void { this.send({ t: "sound", consent }); }
  setAssist(on: boolean): void { this.send({ t: "assist", on }); }
  setPuzzles(setting: PuzzleSetting): void { this.send({ t: "settings", puzzles: setting }); }
  setCluePlace(place: "phone" | "world"): void { this.send({ t: "settings", cluePlace: place }); }
  setErrands(on: boolean): void { this.send({ t: "settings", errands: on }); }
  setErrandOptOut(on: boolean): void { this.send({ t: "errandOptOut", on }); }
  errandDone(): void { this.send({ t: "errandDone" }); }
  errandAnswer(yes: boolean): void { this.send({ t: "errandAnswer", yes }); }
  errandCaught(poltergeist: number, object: string): void { this.send({ t: "errandCaught", poltergeist, object } as never); }
  doorAct(doorId: string): void { this.send({ t: "doorAct", doorId } as never); }
  doorKnock(doorId: string, times: readonly number[]): void { this.send({ t: "doorKnock", doorId, times } as never); }

  async leave(): Promise<void> {
    this.send({ t: "stitchLeave" });
    this.dropSeat();
  }
}

/** The ports of a real page: the page's own fetch, a WebSocket on the same origin, the tab's session storage and the clock. */
export function browserDeps(loc: Pick<Location, "protocol" | "host">, g: { fetch: typeof fetch; WebSocket: new (url: string) => unknown; sessionStorage: StorageLike }): PortDeps {
  return {
    fetch: (url, init) => g.fetch(url, init),
    openSocket: (code) => new g.WebSocket(`${loc.protocol === "https:" ? "wss:" : "ws:"}//${loc.host}/api/party/${encodeURIComponent(code)}/ws`) as SocketLike,
    storage: g.sessionStorage,
    now: Date.now,
    setTimer: (f, ms) => setTimeout(f, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  };
}
