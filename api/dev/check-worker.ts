/**
 * A TEST-ONLY Worker for running the world routes on `wrangler dev` (`pnpm exec wrangler dev -c wrangler.check.jsonc`).
 * It is the real app over the real R2 and WorldJob bindings, plus what tests need and a product must never have:
 * `/dev/*` routes that plant worlds and pictures, and a stand-in for the world service and for ingest (the `WorldJob` below). The `SpendGuard` is the real Durable Object.
 * It is not deployed: `wrangler.jsonc`, the only config `wrangler deploy` picks up, points at `src/worker.ts`.
 */
import { createApp } from "../src/app";
import { SpendGuard } from "../src/do/spend-guard";
import { WorldJob as BaseWorldJob, type JobDeps } from "../src/do/world-job";
import realWorker, { storeFor, type WorkerEnv } from "../src/worker";
import { SpendGuardClient } from "../src/spend/client";
import { CloudflareImageStore } from "../src/worlds/cloudflare-images";
import { WorldJobStarter } from "../src/worlds/job-starter";
import type { Ingestor, WorldLabsPort } from "../src/worlds/ports";
import { CloudflareImageStore as Images } from "../src/worlds/cloudflare-images";
import { galleryKey, bundleKey, uploadKey } from "../src/worlds/keys";

export { SpendGuard };

const FILES: Record<string, Uint8Array> = {
  "splat-500k.spz": Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
  "collider.glb": Uint8Array.from([10, 11, 12, 13]),
  "thumb.jpg": Uint8Array.from([20, 21, 22]),
};

const manifest = (id: string) => ({
  id, title: "A planted place", createdAt: 1_800_000_000_000, source: "upload",
  assets: { splat: [{ path: "splat-500k.spz", bytes: 10, lod: "500k" }], collider: { path: "collider.glb", bytes: 4 }, thumb: { path: "thumb.jpg", bytes: 3 } },
  orientation: { upFix: [0, 0, 0, 1], scale: 1 }, spawn: { position: [0, 1.6, 0], yaw: 0 }, floorY: 0,
  bounds: { min: [-5, 0, -5], max: [5, 3, 5] }, brief: "A place planted by a test.",
});

/**
 * A stand-in for the world service, for this test-only Worker. The last byte of the picture picks what happens
 * (the `salt` of `/dev/seed-image`): 201 the service refuses it, 202 it is out of credits, 204 it never finishes,
 * anything else it makes the world after two polls. It also stands in for ingest, writing a small bundle.
 */
class StandInUpstream implements WorldLabsPort {
  private readonly polls = new Map<string, number>();
  private readonly salts = new Map<string, number>();
  async generate(req: { image: Uint8Array; name: string }) {
    const salt = req.image[req.image.length - 1] as number;
    if (salt === 201) return { ok: false as const, kind: "rejected" as const };
    if (salt === 202) return { ok: false as const, kind: "no_credits" as const };
    this.salts.set(`op-${req.name}`, salt);
    return { ok: true as const, operationId: `op-${req.name}` };
  }
  async poll(operationId: string) {
    const n = (this.polls.get(operationId) ?? 0) + 1;
    this.polls.set(operationId, n);
    return { ok: true as const, state: this.salts.get(operationId) === 204 || n <= 2 ? ("pending" as const) : ("done" as const) };
  }
}

/** The `WorldJob` with the stand-in service, quick timing and the real `SpendGuard`. */
export class WorldJob extends BaseWorldJob {
  constructor(state: DurableObjectState, env: WorkerEnv) {
    const upstream = new StandInUpstream();
    const ingestor: Ingestor = {
      async ingest(job) {
        for (const [name, bytes] of Object.entries(FILES)) await env.BUCKET.put(bundleKey(job.worldId, name), bytes);
        return { ok: true, manifest: manifest(job.worldId) as never };
      },
    };
    const deps: JobDeps = {
      upstream, ingestor, images: new Images(env.BUCKET),
      guard: new SpendGuardClient(env.SPEND_GUARD, { strict: true }),
      timing: { timeoutMs: 6000, pollMs: 300, backoffMaxMs: 1500 },
    };
    super(state, env, deps);
  }
}

const apps = new WeakMap<object, ReturnType<typeof createApp>>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function dev(request: Request, env: WorkerEnv): Promise<Response> {
  const { pathname } = new URL(request.url);
  const store = storeFor(env);
  if (request.method !== "POST") return json({ ok: false }, 405);
  if (pathname === "/dev/kill") {
    await new SpendGuardClient(env.SPEND_GUARD).setKill(((await request.json()) as { on: boolean }).on);
    return json({ ok: true });
  }
  const body = (await request.json()) as Record<string, string>;

  if (pathname === "/dev/seed-world") {
    const id = body.id as string;
    await store.create({ id, kind: "user", ownerSid: body.ownerSid as string, status: "ready", manifest: manifest(id) as never });
    for (const [name, bytes] of Object.entries(FILES)) await env.BUCKET.put(bundleKey(id, name), bytes);
    return json({ ok: true });
  }
  if (pathname === "/dev/seed-gallery") {
    const id = body.id as string;
    await env.BUCKET.put(galleryKey(id, "world.json"), JSON.stringify({ ...manifest(id), source: "gallery" }));
    for (const [name, bytes] of Object.entries(FILES)) await env.BUCKET.put(galleryKey(id, name), bytes);
    return json({ ok: true });
  }
  if (pathname === "/dev/seed-image") {
    const bytes = Uint8Array.from([1, 2, 3, 4, 5, Number(body.salt ?? 0)]);
    await env.BUCKET.put(uploadKey(body.imageId as string), bytes, {
      httpMetadata: { contentType: "image/png" },
      customMetadata: { ownerSid: body.ownerSid as string, sha256: await sha256Hex(bytes), moderation: body.moderation ?? "safe" },
    });
    return json({ ok: true });
  }
  if (pathname === "/dev/put" ) {
    await env.BUCKET.put(body.key as string, Uint8Array.from([1]));
    return json({ ok: true });
  }
  if (pathname === "/dev/exists") return json({ exists: (await env.BUCKET.head(body.key as string)) !== null });
  return json({ ok: false }, 404);
}

export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Response | Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/dev/")) return dev(request, env);
    let app = apps.get(env);
    if (app === undefined) {
      const guard = new SpendGuardClient(env.SPEND_GUARD);
      app = createApp({ spend: () => guard.status(), worlds: { store: storeFor(env), creation: { images: new CloudflareImageStore(env.BUCKET), guard, starter: new WorldJobStarter(env.WORLD_JOB) } } });
      apps.set(env, app);
    }
    return app.fetch(request, env, ctx);
  },
  /** The real cron handler, reachable with `--test-scheduled` at `/cdn-cgi/handler/scheduled`. */
  scheduled: realWorker.scheduled,
};
