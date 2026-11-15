import { retentionFromEnv } from "@hauntology/shared/world/retention";
import { createApp } from "./app";
import { WorldJob } from "./do/world-job";
import type { Bindings } from "./http/env";
import { cleanupExpired } from "./worlds/cleanup";
import { CloudflareWorldStore } from "./worlds/cloudflare-store";

/** The bindings of `wrangler.jsonc`: the one R2 bucket and the `WorldJob` Durable Object namespace, besides the vars and secrets. */
export type WorkerEnv = Bindings & { BUCKET: R2Bucket; WORLD_JOB: DurableObjectNamespace };

export const storeFor = (env: WorkerEnv): CloudflareWorldStore => new CloudflareWorldStore({ bucket: env.BUCKET, jobs: env.WORLD_JOB });

// `env` is the same object for the life of an isolate, so the app is built once per isolate.
const apps = new WeakMap<object, ReturnType<typeof createApp>>();

export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Response | Promise<Response> {
    let app = apps.get(env);
    if (app === undefined) {
      app = createApp({ worlds: { store: storeFor(env) } });
      apps.set(env, app);
    }
    return app.fetch(request, env, ctx);
  },

  /** The cron trigger: delete what is past its retention (world-pipeline 8.1). */
  async scheduled(controller: ScheduledController, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(cleanupExpired(storeFor(env), controller.scheduledTime, retentionFromEnv(env)));
  },
};

export { WorldJob };
