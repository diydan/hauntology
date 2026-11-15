import { Hono, type Context } from "hono";
import type { SpendStatus } from "@hauntology/shared/world/spend-ledger";
import { flagsFrom } from "../http/flags";
import type { AppEnv } from "../http/env";

/** The part of `SpendGuard` the operator's routes use. `SpendGuardClient` fits it. */
export interface AdminSpend {
  statusStrict(): Promise<SpendStatus>;
  setKill(on: boolean): Promise<void>;
}

export type AdminDeps = {
  /** The operator's token, already checked by `adminTokenFrom`. */
  token: string;
  spend: AdminSpend;
  /** Whether anything is set up to make a world at all (a key for the world service). */
  worldGenAvailable: boolean;
};

export const ADMIN_TOKEN_MIN = 32;

/** The token from the Worker's secret, trimmed (a secret saved with a line break still works), or `null` when there is none that is long enough and printable. */
export function adminTokenFrom(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  return token.length >= ADMIN_TOKEN_MIN && /^[\x21-\x7e]+$/.test(token) ? token : null;
}

const sha256 = async (text: string): Promise<Uint8Array> => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));

/** Equal without the time depending on where they differ: both are hashed to the same length first, then compared whole. */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= (x[i] as number) ^ (y[i] as number);
  return diff === 0;
}

const MAX_BODY = 1024;

/**
 * The operator's routes (world-pipeline 4.4): look at the world switch and close or open it on a running Worker, without a
 * deploy. They are for one person with the `ADMIN_TOKEN` secret and are mounted only when that is set to something long enough;
 * otherwise they are not there at all (a plain 404). They sit outside `/api`, so they neither start a Session nor set a cookie,
 * and they take no cookie: the only credential is the token in the `Authorization: Bearer` header, which is compared in
 * constant time. A wrong or missing token is a 401 and changes nothing. Nothing here logs or returns the token.
 *
 *   GET  /admin/status          -> {worldGen: "open" | "closed", reasons: [...], killed, dayCapReached, totalCapReached}
 *   POST /admin/kill {on: bool} -> the same, after the change. `on: true` closes new worlds, `false` opens them again.
 *
 * Closing stops new worlds, uploads and picture checks (all look at the same switch) and leaves worlds already being made, the
 * Gallery and everything downstream of it as they are (Requirement 9.3). The switch is the one the world service's 402 also
 * closes: after topping up the credits, this is how it is opened again.
 */
export function adminRoutes(deps: AdminDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    const given = /^Bearer\s+(\S+)$/i.exec(c.req.header("Authorization") ?? "")?.[1];
    if (given === undefined || !(await constantTimeEqual(given, deps.token))) {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ ok: false, code: "unauthorized" }, 401);
    }
    return next();
  });

  const report = async (c: Context<AppEnv>) => {
    const status = await deps.spend.statusStrict();
    const env = c.env ?? {};
    const reasons: string[] = [];
    if (!flagsFrom(env).worldGenEnabled) reasons.push("WORLD_GEN_ENABLED");
    if (status.killed) reasons.push("kill_switch");
    if (!deps.worldGenAvailable) reasons.push("no_world_service_key");
    return { worldGen: reasons.length === 0 ? "open" : "closed", reasons, killed: status.killed, dayCapReached: status.dayCapReached, totalCapReached: status.totalCapReached };
  };
  const unavailable = (c: Context<AppEnv>) => c.json({ ok: false, code: "spend_guard_unavailable" }, 502);

  routes.get("/status", async (c) => {
    try {
      return c.json(await report(c));
    } catch {
      return unavailable(c);
    }
  });

  routes.post("/kill", async (c) => {
    const declared = Number(c.req.header("Content-Length") ?? 0);
    let body: unknown;
    try {
      const text = await c.req.text();
      if ((Number.isFinite(declared) && declared > MAX_BODY) || text.length > MAX_BODY) return c.json({ ok: false, code: "bad_request" }, 413);
      body = JSON.parse(text);
    } catch {
      return c.json({ ok: false, code: "bad_request" }, 400);
    }
    const on = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as { on?: unknown }).on : undefined;
    if (typeof on !== "boolean") return c.json({ ok: false, code: "bad_request" }, 400);
    try {
      await deps.spend.setKill(on);
      return c.json(await report(c));
    } catch {
      return unavailable(c);
    }
  });

  return routes;
}
