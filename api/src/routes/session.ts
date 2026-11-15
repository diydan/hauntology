import type { ShellFlags } from "@hauntology/shared/app/types";
import { toSessionRecord } from "@hauntology/shared/session-cookie";
import { Hono, type Context } from "hono";
import type { AppEnv } from "../http/env";
import { acknowledgeNotice } from "../http/session";

export type SessionDeps = {
  /** The switches to report. Wired to `flagsFrom` and `SpendGuard` in the app. */
  flags: (c: Context<AppEnv>) => Promise<ShellFlags> | ShellFlags;
};

/**
 * `GET /api/session` and `POST /api/session/ack-notice`. They read and write only the Session
 * record (ids, notice flag) and the flags; the cookie and origin checks come from the middleware.
 */
export function sessionRoutes(deps: SessionDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/", async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(toSessionRecord(c.get("session"), await deps.flags(c)));
  });

  routes.post("/ack-notice", (c) => {
    acknowledgeNotice(c);
    c.header("Cache-Control", "no-store");
    return c.body(null, 204);
  });

  return routes;
}
