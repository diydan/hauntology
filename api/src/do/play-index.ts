const KEEP = 500;
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * The `PlayIndex` Durable Object, one for the app, named `index`: which games belong to which world, so that deleting a place can delete its games
 * at once (world-pipeline 8.1: "Delete my place" removes everything for that world). It holds ids and nothing else. Internal addresses, `POST` with JSON:
 *   /add {worldId, playId}   /remove {worldId, playId}   /take {worldId} -> {ids}, and forgets them
 * At most 500 games are listed for one world; past that the oldest are dropped from the list (they still run out by themselves after a day).
 */
export class PlayIndex {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ ok: false }, 404);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const worldId = typeof body["worldId"] === "string" && ID.test(body["worldId"]) ? body["worldId"] : null;
    if (worldId === null) return json({ ok: false }, 400);
    const key = `w:${worldId}`;
    const ids = (await this.state.storage.get<string[]>(key)) ?? [];
    switch (new URL(request.url).pathname) {
      case "/add": {
        const playId = typeof body["playId"] === "string" && ID.test(body["playId"]) ? body["playId"] : null;
        if (playId === null) return json({ ok: false }, 400);
        await this.state.storage.put(key, [...ids.filter((i) => i !== playId), playId].slice(-KEEP));
        return json({ ok: true });
      }
      case "/remove": {
        const next = ids.filter((i) => i !== body["playId"]);
        if (next.length === 0) await this.state.storage.delete(key);
        else await this.state.storage.put(key, next);
        return json({ ok: true });
      }
      case "/take":
        await this.state.storage.delete(key);
        return json({ ok: true, ids });
      default:
        return json({ ok: false }, 404);
    }
  }
}
