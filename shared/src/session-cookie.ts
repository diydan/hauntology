import { z } from "zod";
import type { SessionRecord, ShellFlags } from "./app/types";

/**
 * The anonymous Session as a signed cookie. There are no accounts: the cookie holds a random
 * session id, the last world and play ids (so a reload can resume), and whether the content notice
 * was acknowledged. It never holds a photo, a sketch, a caption or chat text.
 *
 * Format: `v1.<base64url(JSON)>.<base64url(HMAC-SHA-256 over "v1.<payload>")>`.
 * A cookie that is malformed, forged, from another secret or past its expiry is not a Session.
 * Pure: the clock and the random bytes come from the caller, and WebCrypto does the HMAC.
 */

export const SESSION_TTL_SEC = 7 * 24 * 60 * 60;
const MIN_SECRET_LENGTH = 16;

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const SessionStateSchema = z
  .object({
    sid: z.string().regex(/^[A-Za-z0-9_-]{22,64}$/),
    /** Expiry, epoch seconds. */
    exp: z.number().int().positive(),
    lastWorldId: z.string().regex(ID).optional(),
    lastPlayId: z.string().regex(ID).optional(),
    ackNotice: z.boolean(),
  })
  .strict();
export type SessionState = z.infer<typeof SessionStateSchema>;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** `null` for anything that is not canonical base64url (extra characters, padding, stray bits). */
export function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  let bin: string;
  try {
    bin = atob(padded);
  } catch {
    return null;
  }
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return toBase64Url(bytes) === text ? bytes : null;
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  if (secret.length < MIN_SECRET_LENGTH) throw new RangeError("session secret is too short");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

/** A random session id from 16 random bytes: 22 URL-safe characters (128 bits). */
export const sessionIdFrom = (randomBytes: Uint8Array): string => toBase64Url(randomBytes);

export function newSessionState(sid: string, nowSec: number): SessionState {
  return { sid, exp: nowSec + SESSION_TTL_SEC, ackNotice: false };
}

export async function signSession(state: SessionState, secret: string): Promise<string> {
  const payload = toBase64Url(enc.encode(JSON.stringify(state)));
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(`v1.${payload}`));
  return `v1.${payload}.${toBase64Url(new Uint8Array(mac))}`;
}

export async function verifySession(cookie: string, secret: string, nowSec: number): Promise<SessionState | null> {
  if (secret.length < MIN_SECRET_LENGTH) return null;
  const parts = cookie.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const [, payload, mac] = parts as [string, string, string];
  const macBytes = fromBase64Url(mac);
  if (macBytes === null) return null;
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), macBytes, enc.encode(`v1.${payload}`));
  if (!valid) return null;
  const json = fromBase64Url(payload);
  if (json === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(dec.decode(json));
  } catch {
    return null;
  }
  const state = SessionStateSchema.safeParse(parsed);
  return state.success && state.data.exp > nowSec ? state.data : null;
}

/** The same Session with its expiry moved to a full lifetime from now. */
export const touchSession = (s: SessionState, nowSec: number): SessionState => ({ ...s, exp: nowSec + SESSION_TTL_SEC });

const checkId = (id: string, what: string): string => {
  if (!ID.test(id)) throw new RangeError(`${what} is not a valid id`);
  return id;
};

export const withLastWorld = (s: SessionState, worldId: string): SessionState => ({ ...s, lastWorldId: checkId(worldId, "worldId") });
export const withLastPlay = (s: SessionState, playId: string): SessionState => ({ ...s, lastPlayId: checkId(playId, "playId") });
export const withNoticeAcked = (s: SessionState): SessionState => ({ ...s, ackNotice: true });

/** Forget a deleted world, and its play session with it. Another world's ids stay. */
export function withoutWorld(s: SessionState, worldId: string): SessionState {
  if (s.lastWorldId !== worldId) return s;
  const { lastWorldId: _w, lastPlayId: _p, ...rest } = s;
  return rest;
}

/** The `GET /api/session` payload: ids and flags only, with absent ids left out. */
export function toSessionRecord(s: SessionState, flags: ShellFlags): SessionRecord {
  const record: SessionRecord = { ackNotice: s.ackNotice, flags: { ...flags } };
  if (s.lastWorldId !== undefined) record.lastWorldId = s.lastWorldId;
  if (s.lastPlayId !== undefined) record.lastPlayId = s.lastPlayId;
  return record;
}
