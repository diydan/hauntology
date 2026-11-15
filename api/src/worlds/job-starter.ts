import type { JobNamespaceLike } from "./cloudflare-store";
import type { WorldStarter } from "./ports";

/**
 * Starts a world's job by asking its `WorldJob` Durable Object to begin (`/start`). The object answers at once and
 * does the work on its own wakes, so the create request is not held up by the world service. The Ticket goes with
 * it: the job commits it when the world is ready and releases it when the job fails.
 */
export class WorldJobStarter implements WorldStarter {
  constructor(private readonly jobs: JobNamespaceLike) {}

  async start(job: Parameters<WorldStarter["start"]>[0]): ReturnType<WorldStarter["start"]> {
    try {
      const res = await this.jobs.get(this.jobs.idFromName(job.worldId)).fetch("https://world-job/start", {
        method: "POST",
        body: JSON.stringify({ ticket: job.ticket, imageId: job.imageId, ownerSid: job.ownerSid }),
      });
      if (res.status === 202 || res.status === 200) return { ok: true };
      if (res.status === 503) return { ok: false, code: "world_gen_disabled" };
      return { ok: false, code: "upstream_rejected" };
    } catch {
      return { ok: false, code: "upstream_rejected" };
    }
  }
}
