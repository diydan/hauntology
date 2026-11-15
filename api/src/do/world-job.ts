import { StoredWorldSchema } from "@hauntology/shared/world/record";

const KEY = "record";
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * The `WorldJob` Durable Object, one per world (world-pipeline design). This is its record side: it keeps
 * the world's owner, state, manifest and the ids of its pictures, and nothing else may keep them. The
 * generate-and-poll side (7.1 to 7.3: `start`, `alarm`, `jobReducer`) is added to this class later and
 * reads and writes the same record.
 *
 * It answers one internal address, `/record`, to the Worker only:
 *   GET     the record, or `null`
 *   PUT     create it (201); 409 if there is one, 400 if it does not fit
 *   PATCH   change `status`, `title`, `failure`, `manifest`, `imageId` or `candidateIds` (200);
 *           404 if there is none, 400 if the result does not fit. `id`, `kind` and `ownerSid` never change.
 *   DELETE  forget everything (204)
 */
export class WorldJob {
  constructor(private readonly state: DurableObjectState, _env?: unknown) {}

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== "/record") return new Response(null, { status: 404 });
    const stored = await this.state.storage.get<unknown>(KEY);

    switch (request.method) {
      case "GET":
        return json(stored ?? null);

      case "PUT": {
        if (stored !== undefined) return json({ ok: false, code: "exists" }, 409);
        const parsed = StoredWorldSchema.safeParse(await readJson(request));
        if (!parsed.success) return json({ ok: false, code: "bad_record" }, 400);
        await this.state.storage.put(KEY, parsed.data);
        return json(parsed.data, 201);
      }

      case "PATCH": {
        if (stored === undefined) return json({ ok: false, code: "missing" }, 404);
        const patch = await readJson(request);
        if (patch === null || typeof patch !== "object" || Array.isArray(patch)) return json({ ok: false, code: "bad_record" }, 400);
        const current = stored as Record<string, unknown>;
        // Whatever the patch says about who the record is, or who owns it, is ignored.
        const merged = { ...current, ...(patch as Record<string, unknown>), id: current.id, kind: current.kind, ownerSid: current.ownerSid };
        const parsed = StoredWorldSchema.safeParse(merged);
        if (!parsed.success) return json({ ok: false, code: "bad_record" }, 400);
        await this.state.storage.put(KEY, parsed.data);
        return json(parsed.data);
      }

      case "DELETE":
        await this.state.storage.deleteAll();
        return new Response(null, { status: 204 });

      default:
        return new Response(null, { status: 405 });
    }
  }
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
