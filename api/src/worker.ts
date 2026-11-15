import { retentionFromEnv } from "@hauntology/shared/world/retention";
import { createApp } from "./app";
import { SpendGuard } from "./do/spend-guard";
import { WorldJob } from "./do/live-world-job";
import { worldLabsFromEnv, type WorldLabsEnv } from "./guarded/worldlabs-live";
import type { Bindings } from "./http/env";
import { SpendGuardClient } from "./spend/client";
import { cleanupExpired } from "./worlds/cleanup";
import { CloudflareImageStore } from "./worlds/cloudflare-images";
import { CloudflareWorldStore } from "./worlds/cloudflare-store";
import { WorldJobStarter } from "./worlds/job-starter";
import { CloudflareTurnstile } from "./worlds/turnstile";

/** The bindings of `wrangler.jsonc`: the one R2 bucket and the `WorldJob` and `SpendGuard` Durable Object namespaces, besides the vars and secrets (and the world service's settings, `WorldLabsEnv`). */
export type WorkerEnv = Bindings & WorldLabsEnv & { BUCKET: R2Bucket; WORLD_JOB: DurableObjectNamespace; SPEND_GUARD: DurableObjectNamespace };

export const storeFor = (env: WorkerEnv): CloudflareWorldStore => new CloudflareWorldStore({ bucket: env.BUCKET, jobs: env.WORLD_JOB });

// `env` is the same object for the life of an isolate, so the app is built once per isolate.
const apps = new WeakMap<object, ReturnType<typeof createApp>>();

export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Response | Promise<Response> {
    let app = apps.get(env);
    if (app === undefined) {
      // A world is made only when the Worker has a key for the world service (a secret; `WorldLabsEnv`) and every setting
      // about it is acceptable (`worldLabsFromEnv`). Without one there is no job starter, the create call answers
      // `world_gen_disabled` and the Home flags say worlds are closed, as before. With one, a create call reserves a unit
      // from `SpendGuard` and starts the `WorldJob`, which makes the world through the guarded calls (world-pipeline 6.1, 7.1, 7.3).
      const live = worldLabsFromEnv(env) !== null;
      const guard = new SpendGuardClient(env.SPEND_GUARD);
      app = createApp({
        worldGenAvailable: live,
        spend: () => guard.status(),
        worlds: {
          store: storeFor(env),
          creation: {
            images: new CloudflareImageStore(env.BUCKET),
            guard,
            ...(live ? { starter: new WorldJobStarter(env.WORLD_JOB) } : {}),
            ...(typeof env.TURNSTILE_SECRET === "string" && env.TURNSTILE_SECRET !== "" ? { turnstile: new CloudflareTurnstile(env.TURNSTILE_SECRET) } : {}),
          },
        },
      });
      apps.set(env, app);
    }
    return app.fetch(request, env, ctx);
  },

  /** The cron trigger: delete what is past its retention (world-pipeline 8.1). */
  async scheduled(controller: ScheduledController, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(cleanupExpired(storeFor(env), controller.scheduledTime, retentionFromEnv(env)));
  },
};

export { SpendGuard, WorldJob };
