import type { PrivateSnapshot, PublicSnapshot } from "@hauntology/shared/party/engine";
import type { CaseSetup } from "@hauntology/shared/app/case-setup";
import { walkRadiusOf } from "@hauntology/shared/ghost/anchors";
import type { Bounds } from "@hauntology/shared/ghost/types";
import { soloSetup } from "@hauntology/shared/party/solo";

/**
 * The browser's side of a party Room (integration 4.1), with no React in it: it makes the Room, takes seat 1 as the
 * Master, opens the socket and keeps the latest views. The screen reads `getSnapshot()` and sends with `send()`.
 * It holds no game rule: the Room refuses what is not allowed, and the refusal is shown.
 */
export type RoomSnapshot = Readonly<{
  status: "connecting" | "lobby" | "playing" | "ended" | "closed";
  code: string | null;
  seat: number | null;
  public: PublicSnapshot | null;
  private: PrivateSnapshot | null;
  /** The last thing the Room refused, for one line on screen. */
  refused: string | null;
}>;

export type SocketLike = {
  send(text: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
};

export type RoomDeps = {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  openSocket: (url: string) => SocketLike;
  /** `ws://host` or `wss://host`, the start of the socket address. */
  socketOrigin: string;
};

export type RoomClient = {
  getSnapshot(): RoomSnapshot;
  subscribe(listener: () => void): () => void;
  send(msg: Readonly<{ t: string }> & Record<string, unknown>): void;
  /** Ends the Room (the Master's End) and closes the socket. Safe to call twice. */
  close(): void;
};

const json = async (res: Response): Promise<Record<string, unknown>> => {
  try { return (await res.json()) as Record<string, unknown>; } catch { return {}; }
};

export class RoomError extends Error {
  constructor(readonly code: string) { super(code); this.name = "RoomError"; }
}

/**
 * Whether a case fits this world (integration 4.3, party-mode 4.5): it reads the world's bounds and asks `soloSetup`.
 * A Gallery World is public to read; a world that cannot be read cannot be checked, so no case starts on it.
 */
export async function checkWorld(deps: RoomDeps, worldId: string, setup: CaseSetup): Promise<void> {
  const res = await deps.fetch(`/api/worlds/${encodeURIComponent(worldId)}`, { credentials: "same-origin" });
  const body = await json(res);
  const bounds = (body.manifest as { bounds?: Bounds } | undefined)?.bounds;
  if (!res.ok || bounds === undefined) throw new RoomError("case_failed");
  const walkRadius = walkRadiusOf(bounds);
  const ok = soloSetup({ world: { id: worldId, walkRadius, authoredZones: false }, preset: setup.preset, bots: setup.bots });
  if (!ok.ok) throw new RoomError(ok.code);
}

/**
 * The solo case (party-mode 8.15): make a Room, sit as the Master, set the preset, add the Bots and start.
 * Puzzles stay off here until Locks open on the shared screen (integration 5.3): every Inspect is the plain one.
 */
export async function startSolo(deps: RoomDeps, setup: CaseSetup, nickname = "You"): Promise<RoomClient> {
  const post = (path: string, body?: unknown) => deps.fetch(`/api/party${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  // `replace`: a case this visitor left open (a reload, a closed tab) is ended first, so one Room per visitor never blocks a new case.
  const made = await post("", { replace: true });
  const room = await json(made);
  if (!made.ok || typeof room.code !== "string") throw new RoomError(typeof room.code === "string" ? room.code : "case_failed");
  const joined = await json(await post(`/${room.code}/join`, { nickname }));
  if (joined.ok !== true || typeof joined.token !== "string") throw new RoomError(typeof joined.code === "string" ? joined.code : "case_failed");
  const client = openRoom(deps, room.code, joined.token);
  client.send({ t: "settings", preset: setup.preset });
  client.send({ t: "settings", puzzles: "off" });
  for (let i = 0; i < setup.bots; i++) client.send({ t: "addBot" });
  client.send({ t: "start" });
  return client;
}

/** Opens the socket for `code` with `token`. Messages sent before it opens wait, in order. */
export function openRoom(deps: RoomDeps, code: string, token: string): RoomClient {
  let snap: RoomSnapshot = { status: "connecting", code, seat: null, public: null, private: null, refused: null };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<RoomSnapshot>): void => {
    snap = { ...snap, ...patch };
    for (const l of [...listeners]) l();
  };
  const waiting: string[] = [];
  let open = false;
  let closed = false;
  const ws = deps.openSocket(`${deps.socketOrigin}/api/party/${code}/ws`);
  ws.onopen = () => {
    open = true;
    ws.send(JSON.stringify({ t: "hello", token }));
    for (const m of waiting.splice(0)) ws.send(m);
  };
  ws.onmessage = (ev) => {
    if (typeof ev.data !== "string") return;
    let m: Record<string, unknown>;
    try { m = JSON.parse(ev.data) as Record<string, unknown>; } catch { return; }
    switch (m.t) {
      case "welcome": set({ seat: typeof m.seat === "number" ? m.seat : null }); return;
      case "lobby": if (snap.status === "connecting") set({ status: "lobby" }); return;
      case "public": {
        const view = m.view as PublicSnapshot;
        set({ public: view, status: view.phase === "ended" ? "ended" : view.phase === "playing" ? "playing" : snap.status, refused: null });
        return;
      }
      case "private": set({ private: m.view as PrivateSnapshot }); return;
      case "refused": set({ refused: typeof m.code === "string" ? m.code : "refused" }); return;
      case "ended": set({ status: "closed" }); return;
    }
  };
  ws.onclose = () => { closed = true; if (snap.status !== "closed") set({ status: "closed" }); };

  const send = (msg: Readonly<{ t: string }> & Record<string, unknown>): void => {
    if (closed) return;
    const text = JSON.stringify(msg);
    if (open) ws.send(text);
    else waiting.push(text);
  };
  return {
    getSnapshot: () => snap,
    subscribe(l) { listeners.add(l); return () => void listeners.delete(l); },
    send,
    close() {
      if (closed) return;
      closed = true;
      const finish = (): void => {
        try { ws.send(JSON.stringify({ t: "end" })); ws.close(1000, "left"); } catch { /* already gone */ }
      };
      // Not open yet: say hello and end as soon as it opens, so the Room never outlives the screen.
      if (open) finish();
      else ws.onopen = () => { try { ws.send(JSON.stringify({ t: "hello", token })); } catch { /* gone */ } finish(); };
      if (snap.status !== "closed") set({ status: "closed" });
    },
  };
}

/** The browser's real dependencies. */
export const browserRoomDeps = (): RoomDeps => ({
  fetch: (url, init) => fetch(url, init),
  openSocket: (url) => new WebSocket(url) as unknown as SocketLike,
  socketOrigin: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`,
});
