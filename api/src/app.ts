import { Hono, type Context } from "hono";
import type { ShellFlags } from "@hauntology/shared/app/types";
import type { AppEnv } from "./http/env";
import { flagsFrom, type SpendStatus } from "./http/flags";
import { originGuard } from "./http/origin";
import { securityHeadersMiddleware } from "./http/security-headers";
import { session, type SessionOptions } from "./http/session";
import { sessionRoutes } from "./routes/session";
import { worldRoutes, type WorldsDeps } from "./routes/worlds";

export type AppOptions = SessionOptions & {
  /** What `SpendGuard` knows, once it exists. */
  spend?: (c: Context<AppEnv>) => Promise<SpendStatus> | SpendStatus;
  /** Where worlds are kept. When given, `/api/worlds/:id`, its assets and `DELETE` are served. */
  worlds?: WorldsDeps;
};

/**
 * The API app. Every response carries the security headers. Every `/api/*` request passes the origin guard and then the Session middleware.
 * More route modules are mounted here as they are built.
 */
export function createApp(options: AppOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("*", securityHeadersMiddleware());
  app.use("/api/*", originGuard());
  app.use("/api/*", session(options));

  const flags = async (c: Context<AppEnv>): Promise<ShellFlags> =>
    flagsFrom(c.env, options.spend ? await options.spend(c) : undefined);
  app.route("/api/session", sessionRoutes({ flags }));
  if (options.worlds !== undefined) app.route("/api/worlds", worldRoutes(options.worlds));
  return app;
}
