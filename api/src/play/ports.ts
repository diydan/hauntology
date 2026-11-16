import type { PlayView } from "@hauntology/shared/app/api";
import type { PlaySession } from "@hauntology/shared/ghost/session";
import type { NarrationJob, Settle, WorldFacts } from "@hauntology/shared/ghost/play";

/**
 * What the play routes talk to (ghost-engine 3.1 and 5). Behind it sit one `PlaySession` Durable Object for each game and a `PlayIndex` object that
 * knows which games belong to which world; in tests an in-process twin. A game is found by its id AND its owner: the Session (cookie) that started it,
 * whoever owns the world. Someone else's game and a game that is not there are the same answer, `session_not_found`.
 */
export type PlayRefusal = { ok: false; code: "session_not_found" | "session_expired" | "rate_limited"; retryAfterMs?: number };
export type Peek = { ok: true; worldId: string; view: PlayView; turns: number; ended: boolean };
/**
 * A turn, played with scripted words and kept. `job` is what the narrator needs to word it with the model, or `null` when the engine's rules call for scripted
 * words; it never goes to the client. The reply is the scripted one until the route settles a better one.
 */
export type TurnDone = { ok: true; reply: { text: string; scripted: true }; view: PlayView; directive: string; revealed: boolean; ended: boolean; turns: number; job: NarrationJob | null };
/** Whether the model's words were put in the game: `false` when the answer is for another game (a reset made a new one). */
export type Settled = { ok: true; applied: boolean; /** The client view after the words were put in (the journal now holds the model's memory), when they were. */ view?: PlayView };

export interface PlaySessions {
  /** Keeps a new game. `false` when a game with that id is there already (nothing changes). */
  start(session: PlaySession): Promise<boolean>;
  turn(id: string, ownerSid: string, turn: { input: unknown; pose: unknown; world: Pick<WorldFacts, "bounds" | "brief"> }): Promise<TurnDone | PlayRefusal>;
  /** Puts the model's words where the scripted ones were (`settleNarration`): the memory in the journal, the last line of the history, the count of model turns. */
  settle(id: string, ownerSid: string, settle: Settle): Promise<Settled | PlayRefusal>;
  get(id: string, ownerSid: string): Promise<Peek | PlayRefusal>;
  /** "Haunt again": the same game id with a fresh seed, new anchors and an empty journal. */
  reset(id: string, ownerSid: string, args: { world: WorldFacts; seed: number }): Promise<Peek | PlayRefusal>;
}
