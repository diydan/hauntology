import type { Anchor, AnchorId, Vec3 } from "../app/events";

/**
 * The ghost engine's words (ghost-engine design, "Components and interfaces"). The engine decides, the narrator only words
 * what it decides: nothing here depends on how a line is made. Pure: no clock, no `Math.random`.
 */
export type { Anchor, AnchorId, Vec3 };

export const ANCHOR_IDS = ["a1", "a2", "a3"] as const satisfies readonly AnchorId[];
/** How close a visitor must be to an anchor to engage it, in world units (metres). */
export const ANCHOR_RADIUS = 2.5;

export const ARCHETYPES = ["sound", "person", "promise"] as const;
export type Archetype = (typeof ARCHETYPES)[number];

/** A hidden, generic prompt for one memory. Never sent to the client. */
export type Seed = { anchorId: AnchorId; archetype: Archetype; hook: string };
/** A seed that has been revealed, with its text. */
export type Memory = { anchorId: AnchorId; archetype: Archetype; text: string };

export const ACTION_KINDS = ["look", "listen", "touch", "ask", "say", "hint"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];
/** One visitor input after parsing. `refuse` marks text that tries to change the ghost's rules or leave the fiction. */
export type Action = { kind: ActionKind; text?: string; refuse?: boolean };

export const BEARINGS = ["ahead", "ahead-right", "right", "behind-right", "behind", "behind-left", "left", "ahead-left"] as const;
export type Bearing = (typeof BEARINGS)[number];
export const BANDS = ["very close", "nearer", "far"] as const;
export type Band = (typeof BANDS)[number];

export type Directive =
  | { kind: "reveal"; anchorId: AnchorId }
  | { kind: "echo"; anchorId: AnchorId }
  | { kind: "tease"; band: Band }
  | { kind: "hint"; bearing: Bearing; band: Band }
  | { kind: "ambient" }
  | { kind: "ending" }
  | { kind: "refuse" };

export type HistoryLine = { role: "visitor" | "ghost"; text: string };

export type GameState = {
  turn: number;
  found: AnchorId[];
  ended: boolean;
  /** Turns in a row without a memory found. */
  idleTurns: number;
  memories: Memory[];
  /** The last turns, for a restore after a reload. Kept in the Session only; never logged. */
  history: HistoryLine[];
  llmTurns: number;
  lastTurnAt: number | null;
  lastProgressAt: number;
  /** The state of the seeded generator that picks scripted lines, so a restored game continues the same way. */
  seedState: number;
};

export type Bounds = { min: Vec3; max: Vec3 };
export type Pose = { pos: Vec3; yaw: number };
export type Voice = "wistful" | "stern";
export const VOICES = ["wistful", "stern"] as const satisfies readonly Voice[];
