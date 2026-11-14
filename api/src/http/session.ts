import {
  SESSION_TTL_SEC, newSessionState, sessionIdFrom, signSession, touchSession, verifySession,
  withLastPlay, withLastWorld, withNoticeAcked, withoutWorld, type SessionState,
} from "@hauntology/shared/session-cookie";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "./env";

export const SESSION_COOKIE = "hw_session";

export type SessionOptions = {
  /** Epoch milliseconds. Default `Date.now`. */
  now?: () => number;
  /** Random bytes for a new session id. Default WebCrypto. */
  randomBytes?: (n: number) => Uint8Array;
};

/**
 * Reads the Session from the signed cookie, or makes a new one when the cookie is missing, forged,
 * from another secret or expired. After the route runs it writes the cookie if the Session is new,
 * changed, or past half its lifetime. Without `HMAC_SECRET` it throws (a deployment error).
 */
export const session = (options: SessionOptions = {}): MiddlewareHandler<AppEnv> => async (c, next) => {
  const secret = c.env?.HMAC_SECRET;
  if (secret === undefined || secret.length < 16) throw new Error("HMAC_SECRET is not set");
  const nowSec = Math.floor((options.now ?? Date.now)() / 1000);
  const random = options.randomBytes ?? ((n: number) => crypto.getRandomValues(new Uint8Array(n)));

  const raw = getCookie(c, SESSION_COOKIE);
  const existing = raw === undefined ? null : await verifySession(raw, secret, nowSec);
  c.set("session", existing ?? newSessionState(sessionIdFrom(random(16)), nowSec));
  c.set("sessionFresh", existing === null);
  c.set("sessionDirty", false);

  await next();

  const current = c.get("session");
  if (c.get("sessionFresh") || c.get("sessionDirty") || current.exp - nowSec < SESSION_TTL_SEC / 2) {
    setCookie(c, SESSION_COOKIE, await signSession(touchSession(current, nowSec), secret), {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_TTL_SEC,
      secure: new URL(c.req.url).protocol === "https:",
    });
  }
};

/** Answers `session_expired` when the request came without a valid Session. For routes that need earlier state. */
export const requireSession = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  if (c.get("sessionFresh")) return c.json({ ok: false, code: "session_expired" }, 401);
  return next();
};

function update(c: Context<AppEnv>, change: (s: SessionState) => SessionState): void {
  c.set("session", change(c.get("session")));
  c.set("sessionDirty", true);
}

/** Called by `POST /api/worlds` once a world is created. */
export const setLastWorld = (c: Context<AppEnv>, worldId: string): void => update(c, (s) => withLastWorld(s, worldId));
/** Called by `POST /api/play/start` once a play session is created. */
export const setLastPlay = (c: Context<AppEnv>, playId: string): void => update(c, (s) => withLastPlay(s, playId));
/** Called by `DELETE /api/worlds/:id`: forgets the world and its play session. */
export const forgetWorld = (c: Context<AppEnv>, worldId: string): void => update(c, (s) => withoutWorld(s, worldId));
export const acknowledgeNotice = (c: Context<AppEnv>): void => update(c, withNoticeAcked);
