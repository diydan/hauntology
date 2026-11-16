import { atmosphereForGame, toPromptFields } from "../conditions/snapshot";
import type { Atmosphere, ConditionsSnapshot, PromptFields } from "../conditions/types";
import type { PlayView } from "../app/api";
import { placeAnchors, ringAnchors, validateAnchors, walkRadiusOf } from "./anchors";
import { initialState, step, withHistory, withMemory } from "./engine";
import { parseAction } from "./parse";
import { sanitizePose } from "./pose";
import { acceptTurn, retryAfterMs } from "./rate";
import { makeRng, stepRng } from "./rng";
import { narrationMode, skyOf, visitorWords, type NarrationInput } from "./narration";
import { memoryText, narrate, voiceOfPreset } from "./scripted";
import { makeSeeds } from "./seeds";
import { SESSION_TTL_MS, isExpired, type PlaySession } from "./session";
import { clientView } from "./view";
import type { Anchor, AnchorId, Bounds, Directive, Memory, Seed, Vec3 } from "./types";

/**
 * One whole game, from the first call to the last (ghost-engine tasks 3.1 and 3.2, over the pure parts of task 2): start a Session, take a turn,
 * start again. Pure: the clock, the seed and where the world is are all parameters, so the Durable Object that keeps a Session, and the
 * in-memory stand-in the route tests use, run the very same rules. A turn is played with scripted words first, and stored; when the model is to word
 * it, `playTurn` also hands back a `NarrationJob`, and what the model says is applied afterwards by `settleNarration`, which touches the words (a
 * memory's text, a line of history) and the count of model turns and nothing else, so the engine's decisions never depend on them (Requirement 6.3).
 */
export type WorldFacts = {
  spawn: Vec3;
  /** The heading the world's spawn faces; the first pose until the client reports one. */
  yaw: number;
  bounds: Bounds;
  floorY: number;
  brief: string;
  /** Anchors the world supplies itself (a Gallery World); used instead of placing new ones (Requirement 1.3). */
  authoredAnchors?: readonly Anchor[] | undefined;
};

export type StartInput = {
  id: string;
  worldId: string;
  ownerSid: string;
  world: WorldFacts;
  ghostPreset?: string | undefined;
  /** Anchors the client placed on the floor it can see; checked, and replaced by the ring when they fail (Requirements 1.5 and 3.2). */
  clientAnchors?: unknown;
  /** A fresh 32-bit number from the caller: anchors and seeds come from it. */
  seed: number;
  now: number;
  atmosphere?: Atmosphere | null;
  /**
   * The frozen conditions snapshot read once for this game (conditions 2.14, ghost-engine 3.1), or none. It is kept with the game (only when it holds a Place or a Memory
   * Day: the pure Default carries nothing), the Atmosphere the client sees is taken from it unless one is given, and the narrator's sky words come from it. Never an input to a rule.
   */
  conditions?: ConditionsSnapshot | null | undefined;
};

/** Where the anchors come from: the world's own, else the client's if they pass, else placed from the seed, else the ring. */
export function chooseAnchors(world: WorldFacts, clientAnchors: unknown, seed: number): Anchor[] {
  if (world.authoredAnchors !== undefined && world.authoredAnchors.length === 3) return world.authoredAnchors.map((a) => ({ id: a.id, pos: [a.pos[0], a.pos[1], a.pos[2]], radius: a.radius }));
  const walkRadius = walkRadiusOf(world.bounds);
  const sampler = (): number => world.floorY;
  if (clientAnchors !== undefined) {
    const checked = validateAnchors(clientAnchors, { spawn: world.spawn, bounds: world.bounds, walkRadius });
    if (checked.ok) return checked.anchors;
  }
  return placeAnchors({ sampler, spawn: world.spawn, bounds: world.bounds, walkRadius, rng: makeRng(seed) });
}

/** The sky words for the narrator: three closed words from the stored snapshot, none for the Default; a game with no snapshot kept falls back to its Atmosphere. */
export function skyFor(session: Pick<PlaySession, "conditions" | "atmosphere">): PromptFields | undefined {
  return session.conditions === undefined || session.conditions === null ? skyOf(session.atmosphere) : toPromptFields(session.conditions);
}

export function startSession(input: StartInput): PlaySession {
  const { world, seed, now } = input;
  const anchors = chooseAnchors(world, input.clientAnchors, seed);
  const conditions = input.conditions ?? null;
  // The pure Default (nothing chosen, or conditions off) has nothing to keep.
  const kept = conditions !== null && (conditions.place !== undefined || conditions.memoryDay !== undefined) ? conditions : null;
  return {
    v: 1,
    id: input.id,
    worldId: input.worldId,
    ownerSid: input.ownerSid,
    voice: voiceOfPreset(input.ghostPreset),
    anchors,
    seeds: makeSeeds(makeRng((seed ^ 0x9e3779b9) >>> 0)),
    state: initialState(now, (seed ^ 0xa5a5a5a5) >>> 0),
    pose: { pos: [world.spawn[0], world.spawn[1], world.spawn[2]], yaw: world.yaw },
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    atmosphere: input.atmosphere ?? atmosphereForGame(kept),
    ...(kept === null ? {} : { conditions: kept }),
  };
}

/** "Haunt again" (Requirement 8.3): the same Session id, owner and voice, a fresh seed, new anchors and seeds, an empty journal. */
export function resetSession(session: PlaySession, input: { world: WorldFacts; seed: number; now: number }): PlaySession {
  const fresh = startSession({ id: session.id, worldId: session.worldId, ownerSid: session.ownerSid, world: input.world, seed: input.seed, now: input.now, atmosphere: session.atmosphere, conditions: session.conditions ?? null });
  return { ...fresh, voice: session.voice };
}

export type TurnInput = { input: unknown; pose: unknown; now: number; world: Pick<WorldFacts, "bounds" | "brief"> };

/**
 * What the narrator needs to word one turn, kept off the wire to the client: the prompt's inputs (built from what the visitor has been told and the
 * one memory being told now, and nothing else), which game and turn it is for, the memory the turn told and what is said after it. `null` in a result
 * when the engine's own rules call for scripted words (the game is over, the visitor tried to change the rules, or the game is at its model-turn cap).
 */
export type NarrationJob = {
  /** The game's `createdAt`: "Haunt again" starts a new game, and a late answer for the old one must not reach it. */
  stamp: number;
  /** `state.turn` after this turn. */
  turn: number;
  input: NarrationInput;
  /** The memory this turn told, and the scripted farewell that follows it when it was the last. */
  memoryAnchor: AnchorId | null;
  farewell: string | null;
};
export type TurnResult =
  | { ok: false; code: "rate_limited"; retryAfterMs: number }
  | { ok: false; code: "session_expired" }
  | { ok: true; session: PlaySession; reply: { text: string; scripted: true }; view: PlayView; directive: Directive; revealed: boolean; job: NarrationJob | null };

const seedOf = (seeds: readonly Seed[], id: string): Seed | undefined => seeds.find((s) => s.anchorId === id);

export function playTurn(session: PlaySession, turn: TurnInput): TurnResult {
  if (isExpired(session, turn.now)) return { ok: false, code: "session_expired" };
  if (!acceptTurn(session.state.lastTurnAt, turn.now)) return { ok: false, code: "rate_limited", retryAfterMs: retryAfterMs(session.state.lastTurnAt, turn.now) };

  const pose = sanitizePose(turn.pose, turn.world.bounds, session.pose);
  const action = parseAction(turn.input);
  const stepped = step(session.state, action, { anchors: session.anchors, pos: pose.pos, yaw: pose.yaw, now: turn.now });

  // Two numbers from the saved generator, so the words of a restored game go on as they would have.
  const [r0, s1] = stepRng(stepped.state.seedState);
  const [r1, s2] = stepRng(s1);
  let state = { ...stepped.state, seedState: s2 };

  let text: string;
  let farewell: string | null = null;
  let toldSeed: Seed | undefined;
  if (stepped.revealed !== null) {
    const seed = seedOf(session.seeds, stepped.revealed) as Seed;
    toldSeed = seed;
    const memory: Memory = { anchorId: seed.anchorId, archetype: seed.archetype, text: memoryText(seed, turn.world.brief, r0) };
    state = withMemory(state, memory);
    if (stepped.directive.kind === "ending") farewell = narrate({ directive: stepped.directive, voice: session.voice, brief: turn.world.brief, seeds: session.seeds, r: [r0, r1] });
    text = farewell === null ? memory.text : `${memory.text} ${farewell}`;
  } else {
    text = narrate({ directive: stepped.directive, voice: session.voice, brief: turn.world.brief, seeds: session.seeds, r: [r0, r1] });
  }
  state = withHistory(state, action.text ?? action.kind, text);

  // The model's part, if the engine's rules allow one: the last memory is told by the model and the farewell stays scripted, so a Directive of `ending` is worded as the `reveal` it comes with.
  const job: NarrationJob | null =
    narrationMode({ directive: stepped.directive, endedBefore: session.state.ended, llmTurns: session.state.llmTurns, enabled: true }) === "scripted"
      ? null
      : {
          stamp: session.createdAt,
          turn: state.turn,
          memoryAnchor: toldSeed === undefined ? null : toldSeed.anchorId,
          farewell,
          input: {
            voice: session.voice,
            directive: toldSeed !== undefined ? { kind: "reveal", anchorId: toldSeed.anchorId } : stepped.directive,
            brief: turn.world.brief,
            memories: session.state.memories,
            ...(toldSeed !== undefined ? { seed: toldSeed } : {}),
            history: session.state.history,
            player: visitorWords(action),
            ...(skyFor(session) !== undefined ? { sky: skyFor(session) as PromptFields } : {}),
          },
        };

  const next: PlaySession = { ...session, state, pose };
  return { ok: true, session: next, reply: { text, scripted: true }, view: clientView({ state, anchors: next.anchors, atmosphere: next.atmosphere }), directive: stepped.directive, revealed: stepped.revealed !== null, job };
}

/** What the model said for a turn, to be put where the scripted words were. */
export type Settle = {
  stamp: number;
  turn: number;
  /** The whole reply the visitor saw. */
  text: string;
  /** The memory the turn told, in the model's words. */
  memory?: { anchorId: AnchorId; text: string };
};

/**
 * Puts the model's words where the scripted ones were: the memory's text in the journal and the ghost's last line in the history, and counts the model turn.
 * It changes the words and the count of model turns and nothing the engine decides (Property 11). `null` when the answer is for another game (a reset made
 * a new one); the memory is still found by its anchor if other turns have come since, and the history line is only replaced while it is still the last turn's.
 */
export function settleNarration(session: PlaySession, settle: Settle): PlaySession | null {
  if (settle.stamp !== session.createdAt) return null;
  let state = { ...session.state, llmTurns: session.state.llmTurns + 1 };
  const told = settle.memory;
  if (told !== undefined) state = { ...state, memories: state.memories.map((m) => (m.anchorId === told.anchorId ? { ...m, text: told.text } : m)) };
  const last = state.history[state.history.length - 1];
  if (settle.turn === state.turn && last !== undefined && last.role === "ghost") state = { ...state, history: [...state.history.slice(0, -1), { role: "ghost", text: settle.text }] };
  return { ...session, state };
}

export const viewOf = (session: PlaySession): PlayView => clientView({ state: session.state, anchors: session.anchors, atmosphere: session.atmosphere });
