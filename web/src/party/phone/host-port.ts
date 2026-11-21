import { applyHostMessage, EMPTY_HOST, type HostView } from "../host/host-view";
import type { PortDeps, SocketLike } from "./socket-port";
import { BACKOFF_MS } from "./socket-port";

/**
 * The Host page's side of a Room (party-mode 8.1): `POST /api/party` makes the Room (a code, the Host token and the Display token), the Host socket
 * says `hello` with the Host token only in its first message, and everything the Room sends is folded into a `HostView`. The Host token can only end
 * the Room, report the screen's pose and clock, and (in an all-Bot Room) choose the world and start; the Room refuses anything else. A dropped socket is
 * retried with the same back-off as the phones, and the page shows "reconnecting" in words.
 */
export type HostConnection = "idle" | "creating" | "connecting" | "online" | "reconnecting" | "ended" | "failed";
export type HostState = Readonly<{ connection: HostConnection; code: string | null; displayToken: string | null; /** The Host's own token, for the speech route only (it can do nothing else). */ hostToken: string | null; failure: string | null; view: HostView }>;
export const IDLE_HOST: HostState = { connection: "idle", code: null, displayToken: null, hostToken: null, failure: null, view: EMPTY_HOST };

type Stored = Readonly<{ code: string; hostToken: string; displayToken: string }>;
const KEY = "hauntology.party.host";

export class RoomHostPort {
  private state: HostState = IDLE_HOST;
  private readonly listeners = new Set<(s: HostState) => void>();
  private socket: SocketLike | null = null;
  private stored: Stored | null = null;
  private retries = 0;
  private retryTimer: unknown = null;
  private closing = false;
  private inputListeners = new Set<(m: unknown) => void>();

  constructor(private readonly deps: PortDeps, private readonly opts: { persist?: boolean; role?: "host" | "display" } = {}) {}

  getState(): HostState { return this.state; }
  subscribe(l: (s: HostState) => void): () => void { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  /** Called with every raw Room message (the page uses it for the pose and input hand-offs that need no view). */
  onMessage(l: (m: unknown) => void): () => void { this.inputListeners.add(l); return () => { this.inputListeners.delete(l); }; }
  private set(patch: Partial<HostState>): void { this.state = { ...this.state, ...patch }; for (const l of [...this.listeners]) l(this.state); }
  private base(): string { return this.deps.base ?? "/api/party"; }
  private write(s: Stored | null): void {
    if (this.opts.persist === false) return;
    try { if (s === null) this.deps.storage.removeItem(KEY); else this.deps.storage.setItem(KEY, JSON.stringify(s)); } catch { /* the Room then lasts this page only */ }
  }

  async create(replace = false): Promise<boolean> {
    this.set({ connection: "creating", failure: null });
    let res: { ok: boolean; status: number; json(): Promise<unknown> };
    try { res = await this.deps.fetch(this.base(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(replace ? { replace: true } : {}) }); }
    catch { this.set({ connection: "failed", failure: "unreachable" }); return false; }
    const body = (await res.json().catch(() => null)) as { code?: string; hostToken?: string; displayToken?: string } | null;
    const ok = body !== null && typeof body.code === "string" && /^[A-Z0-9]{4}$/.test(body.code) && typeof body.hostToken === "string" && /^[0-9a-f]{32}$/.test(body.hostToken) && typeof body.displayToken === "string";
    if (!ok) {
      // the Room's own refusals: party_disabled, rooms_full, session_has_room; anything else is the page's own "could not ask"
      const code = typeof body?.code === "string" && /^[a-z_]+$/.test(body.code) ? body.code : "unreachable";
      this.set({ connection: "failed", failure: code });
      return false;
    }
    this.stored = { code: body.code as string, hostToken: body.hostToken as string, displayToken: body.displayToken as string };
    this.write(this.stored);
    this.set({ connection: "connecting", code: this.stored.code, displayToken: this.stored.displayToken, hostToken: this.stored.hostToken, view: EMPTY_HOST });
    this.connect();
    return true;
  }

  /** A Display opens the Room it was handed (the Room Code and the Display token, from the Host page): same socket, a different token, and no key of its own in storage. */
  attach(code: string, token: string): boolean {
    if (!/^[A-Z0-9]{4}$/.test(code) || !/^[0-9a-f]{32}$/.test(token)) return false;
    this.stored = { code, hostToken: token, displayToken: token };
    this.set({ connection: "connecting", code, displayToken: token, hostToken: null, view: EMPTY_HOST });
    this.connect();
    return true;
  }

  /** After a reload: reattach to the Room this tab made, from its stored token. */
  restore(): boolean {
    let raw: string | null = null;
    try { raw = this.deps.storage.getItem(KEY); } catch { raw = null; }
    if (raw === null) return false;
    try {
      const o = JSON.parse(raw) as Partial<Stored>;
      if (typeof o.code !== "string" || typeof o.hostToken !== "string" || !/^[0-9a-f]{32}$/.test(o.hostToken) || typeof o.displayToken !== "string") return false;
      this.stored = { code: o.code, hostToken: o.hostToken, displayToken: o.displayToken };
    } catch { return false; }
    this.set({ connection: "connecting", code: this.stored.code, displayToken: this.stored.displayToken, hostToken: this.stored.hostToken, view: EMPTY_HOST });
    this.connect();
    return true;
  }

  private connect(): void {
    const s = this.stored;
    if (s === null) return;
    this.closing = false;
    const sock = this.deps.openSocket(s.code);
    this.socket = sock;
    sock.onopen = () => sock.send(JSON.stringify({ t: "hello", token: s.hostToken }));
    sock.onmessage = (e) => this.onData(e.data);
    sock.onclose = (e) => this.onClose(sock, e.code);
    sock.onerror = () => undefined;
  }

  private onData(data: unknown): void {
    let msg: unknown;
    try { msg = typeof data === "string" ? JSON.parse(data) : null; } catch { return; }
    if (typeof msg !== "object" || msg === null) return;
    const t = (msg as { t?: string }).t;
    if (t === "welcome") {
      this.retries = 0;
      this.set({ connection: "online" });
      // only the Host reports its offset (the hour strike is on the Host's clock); a Display is only a second picture
      if (this.opts.role !== "display") this.send({ t: "hostClock", offsetMin: -new Date(this.deps.now()).getTimezoneOffset() });
      return;
    }
    for (const l of [...this.inputListeners]) l(msg);
    this.set({ view: applyHostMessage(this.state.view, msg, this.deps.now()) });
    if (t === "ended") this.finish("ended");
  }

  private onClose(sock: SocketLike, code: number): void {
    if (this.socket !== sock) return;
    this.socket = null;
    if (code === 4403 || code === 4004 || code === 4000) { this.finish("ended"); return; }
    if (this.closing || this.stored === null) return;
    this.set({ connection: "reconnecting" });
    const wait = BACKOFF_MS[Math.min(this.retries, BACKOFF_MS.length - 1)] as number;
    this.retries += 1;
    this.retryTimer = this.deps.setTimer(() => { this.retryTimer = null; this.connect(); }, wait);
  }

  private finish(connection: "ended" | "failed"): void {
    this.closing = true;
    if (this.retryTimer !== null) { this.deps.clearTimer(this.retryTimer); this.retryTimer = null; }
    this.stored = null;
    this.write(null);
    this.socket?.close();
    this.socket = null;
    this.set({ connection });
  }

  send(msg: Readonly<{ t: string } & Record<string, unknown>>): void {
    if (this.socket !== null && this.state.connection === "online") this.socket.send(JSON.stringify(msg));
  }

  /** The screen's own pose, at most four a second (the Room limits it again). */
  reportPose(pos: readonly [number, number, number], yaw: number): void { this.send({ t: "pose", pos, yaw }); }

  /** The Host token ends the Room, and everything of it goes at once (party-mode 1.5). */
  async end(): Promise<void> {
    const s = this.stored;
    if (s !== null) { try { await this.deps.fetch(`${this.base()}/${encodeURIComponent(s.code)}`, { method: "DELETE", headers: { Authorization: `Bearer ${s.hostToken}` } }); } catch { this.send({ t: "end" }); } }
    this.finish("ended");
  }
}
