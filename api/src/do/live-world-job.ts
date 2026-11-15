import { worldLabsFromEnv, type WorldLabsEnv } from "../guarded/worldlabs-live";
import { createLogger } from "../log";
import { SpendGuardClient } from "../spend/client";
import { CloudflareImageStore } from "../worlds/cloudflare-images";
import type { JobNamespaceLike } from "../worlds/cloudflare-store";
import { WorldIngestor, type IngestBucket } from "../worlds/ingest";
import { WorldJob as BaseWorldJob, type JobDeps } from "./world-job";

/** What the live job reads from the Worker's environment: the world service's settings, the one bucket, and the `SpendGuard` namespace. */
export type LiveJobEnv = WorldLabsEnv & { BUCKET?: R2Bucket & IngestBucket; SPEND_GUARD?: JobNamespaceLike };

/**
 * The job's dependencies for the real Worker: the real world service, the real ingest into the bucket, the pictures in
 * the bucket, and the real `SpendGuard` (strict, so a commit or release that fails is tried again). `undefined` when
 * world making is not set up (no key, or a setting `worldLabsFromEnv` refuses, or a binding is missing), and then the
 * object answers `/start` with 503 and spends nothing.
 */
export function jobDepsFromEnv(env: LiveJobEnv | undefined): JobDeps | undefined {
  const upstream = worldLabsFromEnv(env);
  if (upstream === null || env?.BUCKET === undefined || env.SPEND_GUARD === undefined) return undefined;
  return {
    upstream,
    ingestor: new WorldIngestor(upstream, env.BUCKET),
    images: new CloudflareImageStore(env.BUCKET),
    guard: new SpendGuardClient(env.SPEND_GUARD, { strict: true }),
    log: createLogger(),
  };
}

/**
 * The `WorldJob` the real Worker exports under that name. It is the base object with its dependencies built from the
 * environment, so the Wrangler binding (`class_name: "WorldJob"`) and the stored data are the same as before.
 */
export class WorldJob extends BaseWorldJob {
  constructor(state: DurableObjectState, env: LiveJobEnv) {
    super(state, env, jobDepsFromEnv(env));
  }
}
