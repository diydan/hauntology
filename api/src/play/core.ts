import {
  attemptWanderLock, openWanderLock, playTurn, resetSession, settleNarration, skipWanderLockForSession, viewOf,
  type Settle, type TurnResult, type WorldFacts,
} from "@hauntology/shared/ghost/play";
import { isExpired, parseSession, serializeSession, type PlaySession } from "@hauntology/shared/ghost/session";
import type { AnchorId } from "@hauntology/shared/app/events";
import { ANCHOR_IDS } from "@hauntology/shared/ghost/types";
import { toBase64Url } from "@hauntology/shared/session-cookie";
import { findLine, type VoiceLine } from "@hauntology/shared/voice/line";
import type { LockAttemptDone, LockOpenDone, LockRefusal, LockSkipDone, Peek, PlayRefusal, Settled, TurnDone, VoiceRef } from "./ports";

/** A line's id: 128 random bits, so it cannot be guessed (and a line is found by it only through its own game and owner as well). */
const randomLineId = (): string => toBase64Url(crypto.getRandomValues(new Uint8Array(16)));

/** The reference a client gets for a line: its id, or nothing when the line has nothing to say aloud. */
const refOf = (line: VoiceLine | undefined | null): VoiceRef => (line === undefined || line === null || line.spoken === "" ? null : { lineId: line.id });

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
  /** `newId` makes the id of a line for speech; the default is random and tests may give a fixed one. */
  constructor(private readonly slot: Slot, private readonly now: () => number, private readonly newId: () => string = randomLineId) {}

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

  private toTurnDone(r: Extract<TurnResult, { ok: true }>): TurnDone {
    return {
      ok: true,
      reply: r.reply,
      view: r.view,
      directive: r.directive.kind,
      revealed: r.revealed,
      ended: r.session.state.ended,
      turns: r.session.state.turn,
      job: r.job,
      voice: refOf(r.voiceLine),
      ...(r.lock !== undefined ? { lock: r.lock } : {}),
      ...(r.sight !== undefined ? { sight: r.sight } : {}),
    };
  }

  async turn(ownerSid: string, turn: { input: unknown; pose: unknown; world: Pick<WorldFacts, "bounds" | "brief"> }): Promise<TurnDone | PlayRefusal> {
    // One reading of the clock for the whole turn: the game that was found alive is the one that is played.
    const now = this.now();
    const session = await this.load(ownerSid, now);
    if ("ok" in session) return session;
    const r = playTurn(session, { input: turn.input, pose: turn.pose, world: turn.world, now, voiceLineId: this.newId() });
    if (!r.ok) return r.code === "session_expired" ? { ok: false, code: "session_expired" } : { ok: false, code: "rate_limited", retryAfterMs: r.retryAfterMs };
    await this.slot.save(serializeSession(r.session));
    return this.toTurnDone(r);
  }

  async lockOpen(ownerSid: string, anchorId: AnchorId): Promise<LockOpenDone | LockRefusal> {
    const now = this.now();
    const session = await this.load(ownerSid, now);
    if ("ok" in session) return session;
    const r = openWanderLock(session, { anchorId, now });
    if (!r.ok) {
      if (r.code === "session_expired") await this.slot.clear();
      return r;
    }
    await this.slot.save(serializeSession(r.session));
    return { ok: true, view: r.view, lock: r.lock };
  }

  async lockAttempt(ownerSid: string, args: { transcript: unknown; world: Pick<WorldFacts, "bounds" | "brief"> }): Promise<LockAttemptDone | LockRefusal> {
    const now = this.now();
    const session = await this.load(ownerSid, now);
    if ("ok" in session) return session;
    const r = attemptWanderLock(session, { transcript: args.transcript, now, world: args.world, voiceLineId: this.newId() });
    if (!r.ok) {
      if (r.code === "session_expired") await this.slot.clear();
      return r;
    }
    await this.slot.save(serializeSession(r.session));
    if (r.outcome === "wrong") return { ok: true, outcome: "wrong", skipAvailable: r.skipAvailable, view: r.view };
    return { ...this.toTurnDone(r), outcome: "solved" };
  }

  async lockSkip(ownerSid: string, world: Pick<WorldFacts, "bounds" | "brief">): Promise<LockSkipDone | LockRefusal> {
    const now = this.now();
    const session = await this.load(ownerSid, now);
    if ("ok" in session) return session;
    const r = skipWanderLockForSession(session, { now, world, voiceLineId: this.newId() });
    if (!r.ok) {
      if (r.code === "session_expired") await this.slot.clear();
      return r;
    }
    await this.slot.save(serializeSession(r.session));
    return this.toTurnDone(r);
  }

  /**
   * The model's words for a turn that was played (ghost-engine 4.2): put in place if they are for this game, with the same owner check and the same expiry as a turn,
   * and no rate limit (it is not a turn). Anything that is not a well-formed settle is refused as no game, and changes nothing.
   */
  async settle(ownerSid: string, settle: unknown): Promise<Settled | PlayRefusal> {
    const s = readSettle(settle);
    const session = await this.load(ownerSid, this.now());
    if ("ok" in session) return session;
    if (s === null) return { ok: true, applied: false };
    const now = this.now();
    const lineId = this.newId();
    const next = settleNarration(session, s, { lineId, now });
    if (next === null) return { ok: true, applied: false };
    await this.slot.save(serializeSession(next));
    return { ok: true, applied: true, view: viewOf(next), voice: refOf(next.voiceLines?.find((l) => l.id === lineId)) };
  }

  /**
   * A line this game holds for speech, for the speech route: the same owner check and the same expiry as a turn, and a line that is older than ten minutes is gone.
   * A game that is not there, someone else's game, an expired game and an unknown or expired line are all `null`.
   */
  async voiceLine(ownerSid: string, lineId: string): Promise<VoiceLine | null> {
    const now = this.now();
    const session = await this.load(ownerSid, now);
    if ("ok" in session) return null;
    return findLine(session.voiceLines, lineId, now);
  }

  async get(ownerSid: string): Promise<Peek | PlayRefusal> {
    const now = this.now();
    const session = await this.load(ownerSid, now);
    if ("ok" in session) return session;
    return { ok: true, worldId: session.worldId, view: viewOf(session, now), turns: session.state.turn, ended: session.state.ended };
  }

  async reset(ownerSid: string, args: { world: WorldFacts; seed: number }): Promise<Peek | PlayRefusal> {
    const now = this.now();
    const session = await this.load(ownerSid, now);
    if ("ok" in session) return session;
    const again = resetSession(session, { world: args.world, seed: args.seed, now });
    await this.slot.save(serializeSession(again));
    return { ok: true, worldId: again.worldId, view: viewOf(again, now), turns: 0, ended: false };
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

const TEXT_MAX = 2000;
/** A settle as it may be trusted: the shape and the limits, or `null`. */
export function readSettle(v: unknown): Settle | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const text = (t: unknown): t is string => typeof t === "string" && t.trim() !== "" && t.length <= TEXT_MAX;
  if (!Number.isFinite(o["stamp"]) || !Number.isInteger(o["turn"]) || (o["turn"] as number) < 0 || !text(o["text"])) return null;
  // What the visitor typed that turn, when the route says so: kept out of what is spoken. A value of the wrong kind is no settle at all, like any other bad field.
  if (o["typed"] !== undefined && !text(o["typed"])) return null;
  const base = { stamp: o["stamp"] as number, turn: o["turn"] as number, text: o["text"], ...(o["typed"] !== undefined ? { typed: o["typed"] as string } : {}) };
  if (o["memory"] === undefined) return base;
  const m = o["memory"];
  if (typeof m !== "object" || m === null) return null;
  const mem = m as Record<string, unknown>;
  if (!(ANCHOR_IDS as readonly unknown[]).includes(mem["anchorId"]) || !text(mem["text"])) return null;
  return { ...base, memory: { anchorId: mem["anchorId"] as (typeof ANCHOR_IDS)[number], text: mem["text"] } };
}
