import { verifySession } from "@hauntology/shared/session-cookie";
import type { WorldManifest } from "@hauntology/shared/world/manifest";
import { createApp } from "../app";
import { MemoryWorldStore } from "./memory-store";
import type { WorldRecord, WorldStore } from "./store";

/** Helpers for tests of the world routes: an app over a `MemoryWorldStore`, visitors with a Session, and a ready world. */
export const ORIGIN = "http://app.test";
export const SECRET = "test-secret-0123456789abcdef-test";
export const NOW = 1_800_000_000_000;

export type Visitor = { headers: Record<string, string>; sid: string };
export type Sent = { status: number; headers: Headers; text: string; json: unknown };

export const sampleManifest = (id: string): WorldManifest => ({
  id,
  title: "The kitchen",
  createdAt: NOW - 60_000,
  source: "upload",
  assets: {
    splat: [{ path: "splat-500k.spz", bytes: 10, lod: "500k" }],
    collider: { path: "collider.glb", bytes: 4 },
    thumb: { path: "thumb.jpg", bytes: 3 },
  },
  orientation: { upFix: [0, 0, 0, 1], scale: 1 },
  spawn: { position: [0, 1.6, 0], yaw: 0 },
  floorY: 0,
  bounds: { min: [-5, 0, -5], max: [5, 3, 5] },
  brief: "A narrow kitchen with a window over the sink.",
});

export const BYTES = {
  "splat-500k.spz": Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
  "collider.glb": Uint8Array.from([10, 11, 12, 13]),
  "thumb.jpg": Uint8Array.from([20, 21, 22]),
} as const;

/** An app over any `WorldStore`, with visitors that have a Session. */
export function appKit(store: WorldStore, now: () => number = () => NOW) {
  const app = createApp({ worlds: { store }, now });

  const send = async (path: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}): Promise<Sent> => {
    const headers = { ...(init.headers ?? {}), ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) };
    const res = await app.request(`${ORIGIN}${path}`, { method: init.method ?? "GET", headers, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) }, { HMAC_SECRET: SECRET });
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, text, json };
  };

  /** A visitor with a Session of their own. */
  const visitor = async (): Promise<Visitor> => {
    const res = await send("/api/session");
    const cookie = (res.headers.get("Set-Cookie") as string).split(";")[0] as string;
    const session = await verifySession(cookie.slice(cookie.indexOf("=") + 1), SECRET, Math.floor(now() / 1000));
    return { headers: { Cookie: cookie, Origin: ORIGIN }, sid: (session as { sid: string }).sid };
  };

  /** A request with no cookie at all. */
  const anonymous = (): Record<string, string> => ({ Origin: ORIGIN });

  return { app, send, visitor, anonymous };
}

/** The same over a `MemoryWorldStore`, with a way to make a ready world. */
export function worldsKit(now: () => number = () => NOW) {
  const store = new MemoryWorldStore();
  const kit = appKit(store, now);

  /** A ready user world with its files, owned by `owner`. */
  const readyWorld = (id: string, owner: Visitor | null, extra: Partial<WorldRecord> = {}): WorldRecord => {
    const record: WorldRecord = { id, kind: "user", ...(owner !== null ? { ownerSid: owner.sid } : {}), status: "ready", manifest: sampleManifest(id), ...extra };
    store.putWorld(record);
    for (const [name, bytes] of Object.entries(BYTES)) store.putBundleFile(id, name, bytes, now());
    return record;
  };

  return { ...kit, store, readyWorld };
}
