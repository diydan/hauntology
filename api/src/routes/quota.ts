import type { SpendGuard } from "@hauntology/shared/world/spend";
import { Hono } from "hono";
import type { AppEnv } from "../http/env";
import { asQuota, ipHashOf, NO_PLACES } from "./world-create";

/**
 * `GET /api/quota` (world-pipeline 5.7): what the visitor has left on each meter (`world`, `image`, `llm`, `tts`, `stt`, `live`), and nothing
 * about anyone else. The shell asks for it, with the Session, the moment it opens, so the app cannot start without it. The numbers are the
 * smaller of what this Session, this address (hashed, never kept) and the day and total caps leave, as `SpendGuard` counts them.
 * - With no guard, or a guard that cannot answer, every meter reads none (the same fail-closed reading the Quote uses).
 * - It never makes a Session: the Session request that goes with it does, and two first requests at once would otherwise each write a cookie.
 *   A visitor with no cookie yet is told what a new Session would have, which is what they have.
 * - It is never cached: the numbers change with every reservation.
 */
export function quotaRoutes(deps: { guard?: Pick<SpendGuard, "remaining"> }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.get("/", async (c) => {
    c.set("sessionNoCookie", true);
    c.header("Cache-Control", "no-store");
    if (deps.guard === undefined) return c.json(NO_PLACES);
    return c.json(asQuota(await deps.guard.remaining(c.get("session").sid, await ipHashOf(c, c.env.HMAC_SECRET as string))));
  });
  return routes;
}
