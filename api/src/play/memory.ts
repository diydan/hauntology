import type { PlaySession } from "@hauntology/shared/ghost/session";
import type { VoiceLine } from "@hauntology/shared/voice/line";
import { PlayCore } from "./core";
import type { Peek, PlayRefusal, PlaySessions, Settled, TurnDone } from "./ports";
import type { Settle, WorldFacts } from "@hauntology/shared/ghost/play";

/** The games in one process, for tests and the test-only dev Worker: one `PlayCore` over a variable for each game, the same rules as the Durable Object. */
export class MemoryPlaySessions implements PlaySessions {
  private readonly games = new Map<string, { core: PlayCore; text: string | null; worldId: string }>();
  /** Every game id the routes asked about, in order: a test reads this to see that an id that cannot be one never gets as far as the games. */
  readonly asked: string[] = [];
  /** `newId` makes the ids of lines for speech: random by default, fixed or counted by a test that needs to know them. */
  constructor(private readonly now: () => number = Date.now, private readonly newId?: () => string) {}

  private slotFor(id: string): { core: PlayCore; text: string | null; worldId: string } {
    this.asked.push(id);
    let g = this.games.get(id);
    if (g === undefined) {
      const holder = { text: null as string | null, worldId: "" };
      const core = new PlayCore({ load: async () => holder.text, save: async (t) => void (holder.text = t), clear: async () => void (holder.text = null) }, this.now, this.newId);
      g = Object.assign(holder, { core }) as { core: PlayCore; text: string | null; worldId: string };
      this.games.set(id, g);
    }
    return g;
  }

  async start(session: PlaySession): Promise<boolean> {
    const g = this.slotFor(session.id);
    const ok = await g.core.start(session);
    if (ok) g.worldId = session.worldId;
    return ok;
  }
  turn(id: string, ownerSid: string, turn: { input: unknown; pose: unknown; world: Pick<WorldFacts, "bounds" | "brief"> }): Promise<TurnDone | PlayRefusal> {
    return this.slotFor(id).core.turn(ownerSid, turn);
  }
  settle(id: string, ownerSid: string, settle: Settle): Promise<Settled | PlayRefusal> {
    return this.slotFor(id).core.settle(ownerSid, settle);
  }
  get(id: string, ownerSid: string): Promise<Peek | PlayRefusal> {
    return this.slotFor(id).core.get(ownerSid);
  }
  reset(id: string, ownerSid: string, args: { world: WorldFacts; seed: number }): Promise<Peek | PlayRefusal> {
    return this.slotFor(id).core.reset(ownerSid, args);
  }
  voiceLine(id: string, ownerSid: string, lineId: string): Promise<VoiceLine | null> {
    return this.slotFor(id).core.voiceLine(ownerSid, lineId);
  }

  /** The `PlaySessionPurger` of the world store: every game of a world is gone. */
  async deleteForWorld(worldId: string): Promise<void> {
    for (const [id, g] of this.games) if (g.worldId === worldId) {
      await g.core.delete();
      this.games.delete(id);
    }
  }
  /** How many games are kept (a test reads this). */
  get size(): number {
    return [...this.games.values()].filter((g) => g.text !== null).length;
  }
  /** Whether a game is kept, whoever it belongs to (a test reads this). */
  has(id: string): boolean {
    return this.games.get(id)?.text != null;
  }
}
