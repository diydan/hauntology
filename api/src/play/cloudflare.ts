import type { AnchorId } from "@hauntology/shared/app/events";
import type { PlaySession } from "@hauntology/shared/ghost/session";
import type { Settle, WorldFacts } from "@hauntology/shared/ghost/play";
import { VoiceLineSchema, type VoiceLine } from "@hauntology/shared/voice/line";
import type { LockAttemptDone, LockOpenDone, LockRefusal, LockSkipDone, Peek, PlayRefusal, PlaySessions, Settled, TurnDone } from "./ports";

type Stub = { fetch(input: string, init?: RequestInit): Promise<Response> };
type Namespace = { idFromName(name: string): unknown; get(id: unknown): Stub };

const post = (stub: Stub, host: string, path: string, body: unknown): Promise<Response> =>
  stub.fetch(`https://${host}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/**
 * The games over Durable Objects: one `PlaySession` for each game, named by the game's id (which is unguessable), and one `PlayIndex` that lists the games of
 * each world. It is also the `PlaySessionPurger` of the world store: deleting a world deletes its games.
 */
export class CloudflarePlaySessions implements PlaySessions {
  constructor(private readonly sessions: Namespace, private readonly index: Namespace) {}

  private game(id: string): Stub {
    return this.sessions.get(this.sessions.idFromName(id));
  }
  private idx(): Stub {
    return this.index.get(this.index.idFromName("index"));
  }

  async start(session: PlaySession): Promise<boolean> {
    // Listed first: a game that is not in the index could not be deleted with its world.
    await post(this.idx(), "play-index", "/add", { worldId: session.worldId, playId: session.id });
    const res = await post(this.game(session.id), "play-session", "/start", { game: session });
    return res.status === 200;
  }

  async turn(id: string, ownerSid: string, turn: { input: unknown; pose: unknown; world: Pick<WorldFacts, "bounds" | "brief"> }): Promise<TurnDone | PlayRefusal> {
    return (await (await post(this.game(id), "play-session", "/turn", { ownerSid, ...turn })).json()) as TurnDone | PlayRefusal;
  }
  async lockOpen(id: string, ownerSid: string, anchorId: AnchorId): Promise<LockOpenDone | LockRefusal> {
    return (await (await post(this.game(id), "play-session", "/lock/open", { ownerSid, anchorId })).json()) as LockOpenDone | LockRefusal;
  }
  async lockAttempt(id: string, ownerSid: string, args: { transcript: unknown; world: Pick<WorldFacts, "bounds" | "brief"> }): Promise<LockAttemptDone | LockRefusal> {
    return (await (await post(this.game(id), "play-session", "/lock/attempt", { ownerSid, ...args })).json()) as LockAttemptDone | LockRefusal;
  }
  async lockSkip(id: string, ownerSid: string, world: Pick<WorldFacts, "bounds" | "brief">): Promise<LockSkipDone | LockRefusal> {
    return (await (await post(this.game(id), "play-session", "/lock/skip", { ownerSid, world })).json()) as LockSkipDone | LockRefusal;
  }
  async settle(id: string, ownerSid: string, settle: Settle): Promise<Settled | PlayRefusal> {
    return (await (await post(this.game(id), "play-session", "/settle", { ownerSid, settle })).json()) as Settled | PlayRefusal;
  }
  async get(id: string, ownerSid: string): Promise<Peek | PlayRefusal> {
    return (await (await post(this.game(id), "play-session", "/get", { ownerSid })).json()) as Peek | PlayRefusal;
  }
  async reset(id: string, ownerSid: string, args: { world: WorldFacts; seed: number }): Promise<Peek | PlayRefusal> {
    return (await (await post(this.game(id), "play-session", "/reset", { ownerSid, ...args })).json()) as Peek | PlayRefusal;
  }
  /** The object's answer is checked against the line schema: anything else, and any failure to reach the game, is `null`. */
  async voiceLine(id: string, ownerSid: string, lineId: string): Promise<VoiceLine | null> {
    try {
      const res = await post(this.game(id), "play-session", "/voice-line", { ownerSid, lineId });
      const parsed = VoiceLineSchema.safeParse(((await res.json()) as { line?: unknown }).line);
      return parsed.success ? (parsed.data as VoiceLine) : null;
    } catch {
      return null;
    }
  }

  /** Every game of a world is gone. Safe for a world with none. */
  async deleteForWorld(worldId: string): Promise<void> {
    const taken = (await (await post(this.idx(), "play-index", "/take", { worldId })).json()) as { ids?: unknown };
    const ids = Array.isArray(taken.ids) ? taken.ids.filter((i): i is string => typeof i === "string") : [];
    await Promise.all(ids.map((id) => post(this.game(id), "play-session", "/delete", {})));
  }
}
