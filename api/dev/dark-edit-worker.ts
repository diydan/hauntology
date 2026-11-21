/**
 * A LOCAL-ONLY Worker for the dark edit (world-pipeline Spike 1.3, arm C; `tools/worldlabs-spike/dark-first.mjs`). Never deployed: `wrangler deploy` reads wrangler.jsonc,
 * which does not point here. It has one route and no game:
 *
 *   POST /dev/dark-edit   body = one photo (JPEG, PNG or WebP). Answers the dark picture as the body, or `{ error }` with a status.
 *   GET  /dev/status      { ready, aiBinding, remaining }   what is left for the `image` meter (spends nothing)
 *
 * Every call needs a loopback host and `RUN_TOKEN` (16+ characters) in `x-run-token`. Each photo is stripped of EXIF/GPS/XMP AGAIN here with the app's own `prepareUpload`
 * (the runner strips it first; a photo whose metadata cannot be removed is refused, never sent). The paid call goes through `DarkEditMaker`, which needs a Ticket,
 * and the Ticket comes from the real `SpendGuard` for the `image` meter, so the caps in the config are the hard stop. A call that fails or is refused releases its unit; an
 * answer that was charged commits it. With no `AI` binding (the rehearsal config) nothing can be called and nothing can be spent.
 */
import { prepareUpload } from "@hauntology/shared/world/upload";
import { SpendGuard } from "../src/do/spend-guard";
import { DEFAULT_DARK_EDIT_MODEL, DarkEditMaker } from "../src/guarded/workersai/dark-edit";
import type { AiBinding } from "../src/guarded/workersai/call";
import { wasCharged } from "../src/guarded/workersai/call";
import { SpendGuardClient } from "../src/spend/client";
import { isLoopbackHost, sameToken } from "./playthrough-dev";

export { SpendGuard };

type DarkEnv = {
  AI?: AiBinding;
  SPEND_GUARD: DurableObjectNamespace;
  RUN_TOKEN?: string;
  AI_GATEWAY_ID?: string;
  DARK_EDIT_MODEL_ID?: string;
  IMAGE_SESSION_CAP?: string;
  IMAGE_DAY_CAP?: string;
};

const json = (body: unknown, status = 200): Response => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const SESSION = "dark-edit";
const IP = "dark-edit";

export default {
  async fetch(request: Request, env: DarkEnv): Promise<Response> {
    const url = new URL(request.url);
    if (!isLoopbackHost(url.hostname)) return json({ error: "this machine only" }, 403);
    if ((env.RUN_TOKEN ?? "").length < 16) return json({ error: "RUN_TOKEN is not set (16+ characters)" }, 500);
    if (!sameToken(request.headers.get("x-run-token") ?? "", env.RUN_TOKEN ?? "")) return json({ error: "bad token" }, 401);
    const guard = new SpendGuardClient(env.SPEND_GUARD as never);

    if (url.pathname === "/dev/status") {
      if (request.method !== "GET") return json({ error: "GET only" }, 405);
      return json({ ready: true, aiBinding: env.AI !== undefined, remaining: (await guard.remaining(SESSION, IP)).image });
    }
    if (url.pathname !== "/dev/dark-edit") return json({ error: "not found" }, 404);
    if (request.method !== "POST") return json({ error: "POST only" }, 405);
    if (env.AI === undefined || (env.AI_GATEWAY_ID ?? "") === "") return json({ error: "no AI binding or AI_GATEWAY_ID: nothing can be called" }, 503);

    const prepared = prepareUpload(new Uint8Array(await request.arrayBuffer()), request.headers.get("content-type"));
    if (!prepared.ok) return json({ error: prepared.code }, 400);

    const reserved = await guard.reserve({ meter: "image", sessionId: SESSION, ipHash: IP, now: Date.now() });
    if (!reserved.ok) return json({ error: "spend_cap", reason: reserved.reason }, 429);
    const ticket = reserved.ticket;

    let answer;
    try {
      answer = await new DarkEditMaker(env.AI, env.AI_GATEWAY_ID as string, env.DARK_EDIT_MODEL_ID ?? DEFAULT_DARK_EDIT_MODEL).edit(ticket, prepared.bytes);
    } catch {
      await guard.release(ticket);
      return json({ error: "failed" }, 502);
    }
    if (wasCharged(answer)) await guard.commit(ticket);
    else await guard.release(ticket);
    if (!answer.ok) return json({ error: answer.kind, ...("keys" in answer && answer.keys ? { keys: answer.keys } : {}), charged: wasCharged(answer) }, answer.kind === "rate_limited" ? 429 : 502);
    return new Response(answer.image as unknown as BodyInit, { status: 200, headers: { "content-type": answer.type, "cache-control": "no-store" } });
  },
};
