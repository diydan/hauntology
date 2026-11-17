import { parseSession } from "@hauntology/shared/ghost/session";
import { PlayCore, type Slot } from "../play/core";

const SESSION = "session";
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type IndexLike = { idFromName(name: string): unknown; get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> } };

/**
 * The `PlaySession` Durable Object, one for each game (ghost-engine 3.1). It keeps one stored game and runs it through `PlayCore`, the rules shared
 * with the in-process twin: the owner check, a day to live, one turn at a time (a Durable Object runs one call at a time) and one turn per 1.5 seconds.
 * An alarm at the game's end of life deletes it, and tells the world's index. Internal addresses, to the Worker only, each a `POST` with a JSON body:
 *   /start {game}  keep a new game (200, or 409 when a live one is there)    /turn {ownerSid, input, pose, world}   /get {ownerSid}
 *   /settle {ownerSid, settle}  put the model's words where the scripted ones were (ghost-engine 4.2)
 *   /voice-line {ownerSid, lineId}  `{line}`: a line kept for speech, or `null` (ghost-voice 3.5)
 *   /reset {ownerSid, world, seed}                                            /delete  forget the game (204)
 * Every answer but `/start` and `/delete` is the core's answer as it is: `{ok: true, ...}` or `{ok: false, code}`.
 */
export class PlaySession {
  private readonly core: PlayCore;
  constructor(private readonly state: DurableObjectState, private readonly env?: { PLAY_INDEX?: IndexLike }, clock: () => number = Date.now) {
    const slot: Slot = {
      load: async () => (await state.storage.get<string>(SESSION)) ?? null,
      save: async (text) => void (await state.storage.put(SESSION, text)),
      clear: async () => void (await state.storage.deleteAll()),
    };
    this.core = new PlayCore(slot, clock);
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method !== "POST") return json({ ok: false, code: "session_not_found" }, 404);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const owner = typeof body["ownerSid"] === "string" ? body["ownerSid"] : "";
    switch (path) {
      case "/start": {
        const game = parseSession(JSON.stringify(body["game"]));
        if (game === null) return json({ ok: false }, 400);
        if (!(await this.core.start(game))) return json({ ok: false }, 409);
        await this.state.storage.setAlarm(game.expiresAt);
        return json({ ok: true });
      }
      case "/turn":
        return json(await this.core.turn(owner, { input: body["input"], pose: body["pose"], world: body["world"] as never }));
      case "/settle":
        return json(await this.core.settle(owner, body["settle"]));
      case "/get":
        return json(await this.core.get(owner));
      case "/voice-line":
        // `{ line }`: the line, or `null` for anything that is not this owner's live line (the speech route; ghost-voice 3.5).
        return json({ line: await this.core.voiceLine(owner, typeof body["lineId"] === "string" ? body["lineId"] : "") });
      case "/reset": {
        const r = await this.core.reset(owner, { world: body["world"] as never, seed: typeof body["seed"] === "number" ? body["seed"] : 0 });
        if (r.ok) {
          const at = await this.core.expiresAt();
          if (at !== null) await this.state.storage.setAlarm(at);
        }
        return json(r);
      }
      case "/delete": {
        await this.core.delete();
        await this.state.storage.deleteAlarm();
        return new Response(null, { status: 204 });
      }
      default:
        return json({ ok: false, code: "session_not_found" }, 404);
    }
  }

  /** The game ran out: it is deleted, and the world's index forgets it. */
  async alarm(): Promise<void> {
    const ref = await this.core.ref();
    await this.core.delete();
    const index = this.env?.PLAY_INDEX;
    if (ref !== null && index !== undefined) {
      await index.get(index.idFromName("index")).fetch("https://play-index/remove", { method: "POST", body: JSON.stringify({ worldId: ref.worldId, playId: ref.id }) }).catch(() => undefined);
    }
  }
}
