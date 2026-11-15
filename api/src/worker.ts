import { retentionFromEnv } from "@hauntology/shared/world/retention";
import { createApp } from "./app";
import { SpendGuard } from "./do/spend-guard";
import { WorldJob } from "./do/world-job";
import type { Bindings } from "./http/env";
import { SpendGuardClient } from "./spend/client";
import { cleanupExpired } from "./worlds/cleanup";
import { CloudflareImageStore } from "./worlds/cloudflare-images";
import { CloudflareWorldStore } from "./worlds/cloudflare-store";
import { CloudflareTurnstile } from "./worlds/turnstile";

/** The bindings of `wrangler.jsonc`: the one R2 bucket and the `WorldJob` and `SpendGuard` Durable Object namespaces, besides the vars and secrets. */
export type WorkerEnv = Bindings & { BUCKET: R2Bucket; WORLD_JOB: DurableObjectNamespace; SPEND_GUARD: DurableObjectNamespace };

export const storeFor = (env: WorkerEnv): CloudflareWorldStore => new CloudflareWorldStore({ bucket: env.BUCKET, jobs: env.WORLD_JOB });

// `env` is the same object for the life of an isolate, so the app is built once per isolate.
const apps = new WeakMap<object, ReturnType<typeof createApp>>();

export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Response | Promise<Response> {
    let app = apps.get(env);
    if (app === undefined) {
      // No job starter is passed, so a world cannot be made yet (`world_gen_disabled`), and the Quote shows the real places left.
      // `WorldJobStarter` and the job in `do/world-job.ts` exist (7.1); what is missing is the real adapter for the world
      // service (Spike 1.1 has to record its answers first) and ingest (7.3). Passing the starter before then would only
      // reserve a unit and fail it.
      const guard = new SpendGuardClient(env.SPEND_GUARD);
      app = createApp({
        spend: () => guard.status(),
        worlds: {
          store: storeFor(env),
          creation: {
            images: new CloudflareImageStore(env.BUCKET),
            guard,
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
