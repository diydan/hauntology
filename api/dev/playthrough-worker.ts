/**
 * A LOCAL-ONLY Worker for the narrator play-through (`docs/spikes/4.2.md`, ghost-engine checkpoint 8): run it with `wrangler dev -c wrangler.playthrough.rehearsal.jsonc`
 * (no `AI` binding, nothing can be spent) or, on the owner's go only, `-c wrangler.playthrough.jsonc` (the `AI` binding, which reaches the real, billed service).
 * It is not deployed: `wrangler.jsonc`, the only config `wrangler deploy` picks up, points at `src/worker.ts`, which does not import this.
 *
 * It is the real Worker, unchanged (`src/worker.ts`: the same routes, the same `PlaySession`, the same narrator wiring and the same `SpendGuard`), plus the `/dev/` routes of
 * `playthrough-dev.ts` that a product must never have, and that exist only to drive and measure the run. Nothing here calls the model: the model is called, if at all, by the real game routes.
 * The one thing added to the game's path is a RECORDER around the `AI` binding (`playthrough-calls.ts`), which passes every call through unchanged and keeps what the model said, so the
 * runner can tell which replies the game's checks refused and why. With no binding (the rehearsal) there is nothing to wrap and it records nothing.
 */
import { PlayIndex } from "../src/do/play-index";
import { PlaySession } from "../src/do/play-session";
import { SpendGuard } from "../src/do/spend-guard";
import { WorkersAiClient } from "../src/guarded/workersai/client";
import { SpendGuardClient } from "../src/spend/client";
import { galleryKey } from "../src/worlds/keys";
import realWorker, { PartyDirectory, PartyRoom, WorldJob, type WorkerEnv } from "../src/worker";
import { createCallLog, recordEnv } from "./playthrough-calls";
import { dev } from "./playthrough-dev";

export { PartyDirectory, PartyRoom, PlayIndex, PlaySession, SpendGuard, WorldJob };

type DevEnv = WorkerEnv & { RUN_TOKEN?: string; LLM_DAY_CAP?: string; LLM_SESSION_CAP?: string };

/** What the model said, for the life of this Worker. */
const log = createCallLog();

/** One recorded environment for each environment (`recordEnv`). */
const recorded = new WeakMap<object, DevEnv>();

export default {
  fetch(request: Request, env: DevEnv, ctx: ExecutionContext): Response | Promise<Response> {
    if (!new URL(request.url).pathname.startsWith("/dev/")) return realWorker.fetch(request, recordEnv(env, log, recorded), ctx);
    return dev(request, {
      token: env.RUN_TOKEN ?? "",
      bucket: env.BUCKET,
      galleryKey,
      llmRemaining: async () => (await new SpendGuardClient(env.SPEND_GUARD).remaining("units-probe", "units-probe")).llm,
      caps: { day: env.LLM_DAY_CAP, session: env.LLM_SESSION_CAP },
      narrator: new WorkersAiClient(env).narrator !== null && env.GHOST_NARRATION_ENABLED !== "false",
      aiBinding: env.AI !== undefined,
      calls: log,
    });
  },
};
