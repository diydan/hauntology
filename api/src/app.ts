import { Hono, type Context } from "hono";
import type { ShellFlags } from "@hauntology/shared/app/types";
import type { AppEnv } from "./http/env";
import { flagsFrom, type SpendStatus } from "./http/flags";
import { originGuard } from "./http/origin";
import { securityHeadersMiddleware } from "./http/security-headers";
import { session, type SessionOptions } from "./http/session";
import { sessionRoutes } from "./routes/session";
import { adminRoutes, type AdminDeps } from "./routes/admin";
import { placeRoutes } from "./routes/places";
import { sketchRoutes } from "./routes/sketch";
import { uploadRoutes, type UploadsDeps } from "./routes/uploads";
import { imageRoutes, worldCreateRoutes, type CreationDeps } from "./routes/world-create";
import { SILENT, type Logger } from "./log";
import { galleryRoutes } from "./routes/gallery";
import { worldRoutes, type WorldsDeps } from "./routes/worlds";

export type AppOptions = SessionOptions & {
  /**
   * Whether anything is set up to make a world (the Worker sets it from its key). When `false` the Home flags say worlds are
   * closed, whatever `WORLD_GEN_ENABLED` says, so the shell does not offer what the create call would refuse. Default `true`.
   */
  worldGenAvailable?: boolean;
  /** What `SpendGuard` knows, once it exists. */
  spend?: (c: Context<AppEnv>) => Promise<SpendStatus> | SpendStatus;
  /** The operator's routes (`/admin/status`, `/admin/kill`). When given, they are served; otherwise there is no such route. */
  admin?: AdminDeps;
  /** Where log lines go (world-pipeline 8.2). Default: nowhere, so a test or a caller without one is silent. */
  log?: Logger;
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
  const log = options.log ?? SILENT;
  // An error that nothing handled: the answer is the same plain 500 as Hono's own, and one log line says where and what kind, never what it said
  // (an error message can quote its input, a body or a caption). Without this Hono writes the whole error, message and stack, to the console.
  app.onError((err, c) => {
    log.error("request.error", { route: c.req.routePath, errorName: err instanceof Error ? err.name : "NonError", status: 500 });
    return c.text("Internal Server Error", 500);
  });
  // Hono gives `onError` only an `Error`; anything else a handler throws (a string, an object) would go on to the runtime, which writes the value out.
  // It is turned into an error with no content before it gets there.
  app.use("*", async (_c, next) => {
    try {
      await next();
    } catch (thrown) {
      if (thrown instanceof Error) throw thrown;
      const plain = new Error("a value that is not an Error was thrown");
      plain.name = "NonError";
      throw plain;
    }
  });
  app.use("*", securityHeadersMiddleware());
  app.use("/api/*", originGuard());
  app.use("/api/*", session(options));
  // Outside `/api`: no Session, no cookie, no origin check (nothing here is reachable by a cookie); the token is the only credential.
  if (options.admin !== undefined) app.route("/admin", adminRoutes({ log, ...options.admin }));

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
    // The Gallery needs the store and nothing else: no key, no quota, no open switch (world-pipeline 9.2, Requirement 9.3).
    app.route("/api/gallery", galleryRoutes({ store: options.worlds.store }));
    const creation = options.worlds.creation;
    if (creation !== undefined) {
      app.route("/api/worlds", worldCreateRoutes({ store: options.worlds.store, ...creation, now: options.now ?? Date.now, worldGenEnabled: async (c) => (await flags(c)).worldGenEnabled }));
      app.route("/api/images", imageRoutes(creation.images, creation.candidates));
      app.route(
        "/api/sketch",
        sketchRoutes({
          ...(creation.candidates !== undefined ? { candidates: creation.candidates } : {}),
          ...(creation.imager !== undefined ? { imager: creation.imager } : {}),
          ...(creation.guard !== undefined ? { guard: creation.guard } : {}),
          worldGenEnabled: async (c) => (await flags(c)).worldGenEnabled,
          now: options.now ?? Date.now,
        }),
      );
      app.route(
        "/api/places",
        placeRoutes({
          images: creation.images,
          ...(creation.verdicts !== undefined ? { verdicts: creation.verdicts } : {}),
          ...(creation.briefer !== undefined ? { briefer: creation.briefer } : {}),
          ...(creation.guard !== undefined ? { guard: creation.guard } : {}),
          worldGenEnabled: async (c) => (await flags(c)).worldGenEnabled,
          now: options.now ?? Date.now,
        }),
      );
    }
  }
  return app;
}
