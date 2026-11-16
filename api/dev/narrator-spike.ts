/**
 * A LOCAL-ONLY Worker for the narrator spike (`docs/spikes/4.1.md`): run it with `wrangler dev -c wrangler.narrator.jsonc` (see that file). It is not
 * deployed: `wrangler.jsonc`, the only config `wrangler deploy` picks up, points at `src/worker.ts`, which does not import this. The `AI` binding in
 * `wrangler.narrator.jsonc` reaches the real, billed service, so every call is charged to the logged-in account and to the gateway's credits.
 */
import { SpendGuard } from "../src/do/spend-guard";
import type { AiBinding } from "../src/guarded/workersai/call";
import { gatewayIdFromEnv, narratorModelFromEnv } from "../src/guarded/workersai/narrator";
import { SpendGuardClient } from "../src/spend/client";
import { narratorSpike } from "../src/spike/narrator-spike";

export { SpendGuard };

type Env = { AI?: AiBinding; SPEND_GUARD: DurableObjectNamespace; RUN_TOKEN?: string; AI_GATEWAY_ID?: string; NARRATOR_MODEL_ID?: string };

export default {
  fetch: (request: Request, env: Env): Promise<Response> =>
    narratorSpike({
      token: env.RUN_TOKEN ?? "",
      ai: env.AI,
      modelId: narratorModelFromEnv(env.NARRATOR_MODEL_ID),
      gatewayId: gatewayIdFromEnv(env.AI_GATEWAY_ID),
      guard: new SpendGuardClient(env.SPEND_GUARD),
      now: Date.now,
    })(request),
};
