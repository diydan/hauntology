import { Hono, type Context } from "hono";
import type { ShellFlags } from "@hauntology/shared/app/types";
import type { AppEnv } from "./http/env";
import { flagsFrom, type SpendStatus } from "./http/flags";
import { originGuard } from "./http/origin";
import { securityHeadersMiddleware } from "./http/security-headers";
import { session, type SessionOptions } from "./http/session";
import { sessionRoutes } from "./routes/session";
import { uploadRoutes, type UploadsDeps } from "./routes/uploads";
import { imageRoutes, worldCreateRoutes, type CreationDeps } from "./routes/world-create";
import { worldRoutes, type WorldsDeps } from "./routes/worlds";

export type AppOptions = SessionOptions & {
  /**
   * Whether anything is set up to make a world (the Worker sets it from its key). When `false` the Home flags say worlds are
   * closed, whatever `WORLD_GEN_ENABLED` says, so the shell does not offer what the create call would refuse. Default `true`.
   */
  worldGenAvailable?: boolean;
  /** What `SpendGuard` knows, once it exists. */
  spend?: (c: Context<AppEnv>) => Promise<SpendStatus> | SpendStatus;
  /** Where accepted uploads are kept. When given, `POST /api/uploads` is served; it takes no upload while worlds are closed (the world switch). */
  uploads?: Omit<UploadsDeps, "enabled">;
  /** Where worlds are kept. When given, `/api/worlds/:id`, its assets and `DELETE` are served. */
  worlds?: WorldsDeps & {
    /** What the Quote and the create call need. Without it neither route exists. */
    creation?: Omit<CreationDeps, "store" | "now" | "worldGenEnabled">;
  };
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

  const flags = async (c: Context<AppEnv>): Promise<ShellFlags> => {
    const f = flagsFrom(c.env, options.spend ? await options.spend(c) : undefined);
    return options.worldGenAvailable === false ? { ...f, worldGenEnabled: false } : f;
  };
  app.route("/api/session", sessionRoutes({ flags }));
  if (options.uploads !== undefined) {
    app.route("/api/uploads", uploadRoutes({ ...options.uploads, enabled: async (c) => (await flags(c)).worldGenEnabled }));
  }
  if (options.worlds !== undefined) {
    app.route("/api/worlds", worldRoutes(options.worlds));
    const creation = options.worlds.creation;
    if (creation !== undefined) {
      app.route("/api/worlds", worldCreateRoutes({ store: options.worlds.store, ...creation, now: options.now ?? Date.now, worldGenEnabled: async (c) => (await flags(c)).worldGenEnabled }));
      app.route("/api/images", imageRoutes(creation.images));
    }
  }
  return app;
}
