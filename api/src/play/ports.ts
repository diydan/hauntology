import type { PlayView } from "@hauntology/shared/app/api";
import type { PlaySession } from "@hauntology/shared/ghost/session";
import type { WorldFacts } from "@hauntology/shared/ghost/play";

/**
 * What the play routes talk to (ghost-engine 3.1 and 5). Behind it sit one `PlaySession` Durable Object for each game and a `PlayIndex` object that
 * knows which games belong to which world; in tests an in-process twin. A game is found by its id AND its owner: the Session (cookie) that started it,
 * whoever owns the world. Someone else's game and a game that is not there are the same answer, `session_not_found`.
 */
export type PlayRefusal = { ok: false; code: "session_not_found" | "session_expired" | "rate_limited"; retryAfterMs?: number };
export type Peek = { ok: true; worldId: string; view: PlayView; turns: number; ended: boolean };
export type TurnDone = { ok: true; reply: { text: string; scripted: true }; view: PlayView; directive: string; revealed: boolean; ended: boolean; turns: number };

export interface PlaySessions {
  /** Keeps a new game. `false` when a game with that id is there already (nothing changes). */
  start(session: PlaySession): Promise<boolean>;
  turn(id: string, ownerSid: string, turn: { input: unknown; pose: unknown; world: Pick<WorldFacts, "bounds" | "brief"> }): Promise<TurnDone | PlayRefusal>;
  get(id: string, ownerSid: string): Promise<Peek | PlayRefusal>;
  /** "Haunt again": the same game id with a fresh seed, new anchors and an empty journal. */
  reset(id: string, ownerSid: string, args: { world: WorldFacts; seed: number }): Promise<Peek | PlayRefusal>;
}
