import { z } from "zod";

/** Every Kind of Puzzle. Only `BUILT_KINDS` can be made so far; the rest join as their tasks land. */
export const KINDS = ["lockpick", "wires", "clock", "safe", "musicbox", "candles", "moved", "photo", "words", "board", "maze"] as const;
export type Kind = (typeof KINDS)[number];

export const BUILT_KINDS = ["lockpick", "wires", "clock"] as const;
export type BuiltKind = (typeof BUILT_KINDS)[number];

/** Memory Kinds need a Sight from an earlier place. */
export const MEMORY_KINDS: readonly Kind[] = ["wires", "clock", "safe", "moved", "photo"];
export const isMemoryKind = (kind: Kind): boolean => MEMORY_KINDS.includes(kind);

export const LEVELS = ["easy", "normal"] as const;
export type Level = (typeof LEVELS)[number];
export const PUZZLE_SETTINGS = ["off", "easy", "normal"] as const;
export type PuzzleSetting = (typeof PUZZLE_SETTINGS)[number];

/** Three Attempts per Lock; a Transcript is at most 64 events and 4 KB. */
export const ATTEMPTS = 3;
export const MAX_EVENTS = 64;
export const MAX_BYTES = 4096;

// ---------------------------------------------------------------- what the phone draws (the view) and what only the server keeps (the secret)
export type LockPickView = Readonly<{ kind: "lockpick"; pins: number; range: readonly [number, number]; windowDeg: number; dwellMs: number; centers: readonly number[] }>;
export type WiresView = Readonly<{ kind: "wires"; n: number; leftOrder: readonly number[] }>;
export type ClockView = Readonly<{ kind: "clock"; stepMin: 5 }>;
export type LockView = LockPickView | WiresView | ClockView;

export type LockPickSecret = Readonly<{ kind: "lockpick"; centers: readonly number[]; width: number }>;
/** `terminalOf[wire]` is the terminal (0 is the top one) the wire belongs on. */
export type WiresSecret = Readonly<{ kind: "wires"; terminalOf: Readonly<Record<number, number>> }>;
export type ClockSecret = Readonly<{ kind: "clock"; h: number; m: number }>;
export type LockSecret = LockPickSecret | WiresSecret | ClockSecret;

/** The clue a Memory Kind shows in an earlier place. */
export type WiresSight = Readonly<{ kind: "wires"; order: readonly number[] }>;
export type ClockSight = Readonly<{ kind: "clock"; h: number; m: number }>;
export type SightPayload = WiresSight | ClockSight;

type LockBase = Readonly<{ level: Level; seed: number }>;
export type LockPickLock = LockBase & Readonly<{ kind: "lockpick"; view: LockPickView; secret: LockPickSecret; sight: null }>;
export type WiresLock = LockBase & Readonly<{ kind: "wires"; view: WiresView; secret: WiresSecret; sight: WiresSight }>;
export type ClockLock = LockBase & Readonly<{ kind: "clock"; view: ClockView; secret: ClockSecret; sight: ClockSight }>;
/** A made Lock. `makeLock` takes only a Kind, a level and a seed, so it can never depend on a Solution, a Hand or a Residue position. */
export type Lock = LockPickLock | WiresLock | ClockLock;

export type Sight = Readonly<{ kind: Kind; payload: SightPayload; showMs: number }>;

// ---------------------------------------------------------------- the Transcript: a Player's moves for one Attempt
const elapsedMs = z.number().finite().nonnegative();
const finite = z.number().finite();

export const TranscriptSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("lockpick"),
    sets: z.array(z.object({ pin: z.number().int().min(0).max(9), atDeg: finite, atMs: finite }).strict()).max(MAX_EVENTS),
    elapsedMs,
  }).strict(),
  z.object({
    kind: z.literal("wires"),
    pairs: z.array(z.tuple([z.number().int(), z.number().int()])).max(MAX_EVENTS),
    elapsedMs,
  }).strict(),
  z.object({ kind: z.literal("clock"), h: z.number().int(), m: z.number().int(), elapsedMs }).strict(),
]);
export type Transcript = z.infer<typeof TranscriptSchema>;

export type VerdictCode = "wrong" | "malformed" | "too_big" | "too_fast";
export type Verdict = Readonly<{ ok: true }> | Readonly<{ ok: false; code: VerdictCode }>;
