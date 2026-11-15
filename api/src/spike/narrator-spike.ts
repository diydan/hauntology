import type { SpendGuard } from "@hauntology/shared/world/spend";
import type { AiBinding } from "../guarded/workersai/call";
import { HaikuNarrator, THINKING_MODES, generateNarration, narrationWasCharged, type NarrationRequest, type ThinkingMode } from "../guarded/workersai/narrator";

/**
 * The local Worker behind `tools/ghost-spike.mjs` (ghost-engine spike 1, `docs/spikes/4.1.md`). NEVER deployed: `src/worker.ts` does not import it, and
 * its own `wrangler.narrator.jsonc` is the only config that declares the `AI` binding for it. It turns one validated request into one narrator call
 * through the guarded door, with a Ticket from `SpendGuard` for the `llm` meter, and it is a spend limit as much as a tool: a token the Node tool
 * generates for each run, only the five fields below (so no `temperature` or anything else can be passed), the narrator's own bounds, and a cap of
 * `LLM_SESSION_CAP` calls for the one session called `spike`, kept in the real Durable Object so a restart does not reset it.
 *
 *   GET  /status   -> { ready, model, gateway, remaining }   (spends nothing)
 *   POST /narrate  { system, user, maxTokens, thinking?, timeoutMs? } -> { answer, charged, ms }
 */
export const SPIKE_SESSION = "spike";
const FIELDS = ["system", "user", "maxTokens", "thinking", "timeoutMs"] as const;

export type SpikeDeps = {
  /** The run's token, at least 16 characters; the Worker answers nothing without it. */
  token: string;
  ai: AiBinding | undefined;
  /** `null` when `NARRATOR_MODEL_ID` is not accepted. */
  modelId: string | null;
  /** `null` when `AI_GATEWAY_ID` is not set or not a plain name. */
  gatewayId: string | null;
  guard: SpendGuard;
  now: () => number;
};

const json = (body: unknown, status = 200): Response => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** Equal strings, compared in time that does not depend on where they differ. */
function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function narratorSpike(deps: SpikeDeps): (request: Request) => Promise<Response> {
  return async (request) => {
    if (deps.token.length < 16) return json({ error: "RUN_TOKEN is not set (16+ characters)" }, 500);
    if (!sameToken(request.headers.get("x-spike-token") ?? "", deps.token)) return json({ error: "bad token" }, 401);
    const { pathname } = new URL(request.url);
    const ready = deps.ai !== undefined && deps.modelId !== null && deps.gatewayId !== null;

    if (pathname === "/status") {
      if (request.method !== "GET") return json({ error: "GET only" }, 405);
      const left = await deps.guard.remaining(SPIKE_SESSION, SPIKE_SESSION);
      return json({ ready, model: deps.modelId, gateway: deps.gatewayId, remaining: left.llm });
    }
    if (pathname !== "/narrate") return json({ error: "not found" }, 404);
    if (request.method !== "POST") return json({ error: "POST only" }, 405);
    if (!ready) return json({ error: "the narrator is off: it needs the AI binding, an accepted NARRATOR_MODEL_ID and an AI_GATEWAY_ID" }, 503);

    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: "the body is not JSON" }, 400); }
    if (typeof body !== "object" || body === null || Array.isArray(body)) return json({ error: "the body is not an object" }, 400);
    const b = body as Record<string, unknown>;
    const extra = Object.keys(b).filter((k) => !(FIELDS as readonly string[]).includes(k));
    if (extra.length > 0) return json({ error: `fields that are not allowed: ${extra.join(", ")}` }, 400);
    if (typeof b.system !== "string" || typeof b.user !== "string" || typeof b.maxTokens !== "number") return json({ error: "system, user and maxTokens are required" }, 400);
    if (b.thinking !== undefined && !(THINKING_MODES as readonly unknown[]).includes(b.thinking)) return json({ error: "thinking is default, off or low" }, 400);
    if (b.timeoutMs !== undefined && typeof b.timeoutMs !== "number") return json({ error: "timeoutMs is a number" }, 400);
    const req: NarrationRequest = {
      system: b.system, user: b.user, maxTokens: b.maxTokens,
      ...(b.thinking !== undefined ? { thinking: b.thinking as ThinkingMode } : {}),
      ...(b.timeoutMs !== undefined ? { timeoutMs: b.timeoutMs } : {}),
    };

    const reserved = await deps.guard.reserve({ meter: "llm", sessionId: SPIKE_SESSION, ipHash: SPIKE_SESSION, now: deps.now() });
    if (!reserved.ok) return json({ denied: reserved.reason }, 429);
    const narrator = new HaikuNarrator(deps.ai as AiBinding, deps.modelId as string, deps.gatewayId as string);
    const started = deps.now();
    try {
      const answer = await generateNarration(narrator, reserved.ticket, req);
      const charged = narrationWasCharged(answer);
      await (charged ? deps.guard.commit(reserved.ticket) : deps.guard.release(reserved.ticket));
      return json({ answer, charged, ms: deps.now() - started });
    } catch (e) {
      await deps.guard.release(reserved.ticket);
      throw e;
    }
  };
}
