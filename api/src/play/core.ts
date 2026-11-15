import { playTurn, resetSession, viewOf } from "@hauntology/shared/ghost/play";
import { isExpired, parseSession, serializeSession, type PlaySession } from "@hauntology/shared/ghost/session";
import type { WorldFacts } from "@hauntology/shared/ghost/play";
import type { Peek, PlayRefusal, TurnDone } from "./ports";

/** Where one game is kept: a Durable Object's storage, or a variable in a test. A stored value that does not fit is treated as no game. */
export interface Slot {
  load(): Promise<string | null>;
  save(text: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * One game and the rules around it (ghost-engine 3.1): who may touch it, a day to live, one turn at a time, one turn per 1.5 seconds. The Durable
 * Object runs this over its storage and the in-process twin runs the same code over a variable, so a route test exercises the real rules. The game
 * itself is the pure `shared/src/ghost/play`; this only keeps it and checks the owner. The clock is a parameter.
 */
export class PlayCore {
  constructor(private readonly slot: Slot, private readonly now: () => number) {}

  private async load(ownerSid: string, now: number): Promise<PlaySession | PlayRefusal> {
    const session = parseSession(await this.slot.load());
    if (session === null || session.ownerSid !== ownerSid) return { ok: false, code: "session_not_found" };
    if (isExpired(session, now)) {
      await this.slot.clear();
      return { ok: false, code: "session_expired" };
    }
    return session;
  }

  /** `false` when a live game is here already. */
  async start(session: PlaySession): Promise<boolean> {
    const there = parseSession(await this.slot.load());
    if (there !== null && !isExpired(there, this.now())) return false;
    await this.slot.save(serializeSession(session));
    return true;
  }

  async turn(ownerSid: string, turn: { input: unknown; pose: unknown; world: Pick<WorldFacts, "bounds" | "brief"> }): Promise<TurnDone | PlayRefusal> {
    // One reading of the clock for the whole turn: the game that was found alive is the one that is played.
    const now = this.now();
    const session = await this.load(ownerSid, now);
    if ("ok" in session) return session;
    const r = playTurn(session, { input: turn.input, pose: turn.pose, world: turn.world, now });
    if (!r.ok) return r.code === "session_expired" ? { ok: false, code: "session_expired" } : { ok: false, code: "rate_limited", retryAfterMs: r.retryAfterMs };
    await this.slot.save(serializeSession(r.session));
    return { ok: true, reply: r.reply, view: r.view, directive: r.directive.kind, revealed: r.revealed, ended: r.session.state.ended, turns: r.session.state.turn };
  }

  async get(ownerSid: string): Promise<Peek | PlayRefusal> {
    const session = await this.load(ownerSid, this.now());
    if ("ok" in session) return session;
    return { ok: true, worldId: session.worldId, view: viewOf(session), turns: session.state.turn, ended: session.state.ended };
  }

  async reset(ownerSid: string, args: { world: WorldFacts; seed: number }): Promise<Peek | PlayRefusal> {
    const now = this.now();
    const session = await this.load(ownerSid, now);
    if ("ok" in session) return session;
    const again = resetSession(session, { world: args.world, seed: args.seed, now });
    await this.slot.save(serializeSession(again));
    return { ok: true, worldId: again.worldId, view: viewOf(again), turns: 0, ended: false };
  }

  /** The game's id and its world, for the index, or `null` when there is no game. */
  async ref(): Promise<{ id: string; worldId: string } | null> {
    const s = parseSession(await this.slot.load());
    return s === null ? null : { id: s.id, worldId: s.worldId };
  }

  async delete(): Promise<void> {
    await this.slot.clear();
  }

  /** When the game runs out, or `null` when there is none. */
  async expiresAt(): Promise<number | null> {
    return parseSession(await this.slot.load())?.expiresAt ?? null;
  }
}
