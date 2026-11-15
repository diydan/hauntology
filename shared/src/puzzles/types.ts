import { z } from "zod";

/** Every Kind of Puzzle: the ten of the spec plus the optional marble maze. */
export const KINDS = ["lockpick", "wires", "clock", "safe", "musicbox", "candles", "moved", "photo", "words", "board", "maze"] as const;
export type Kind = (typeof KINDS)[number];

/** The Kinds a Room uses by default: the ten, without the optional maze. */
export const DEFAULT_KINDS: readonly Kind[] = KINDS.filter((k) => k !== "maze");

/** Memory Kinds need a Sight from an earlier place. */
export const MEMORY_KINDS: readonly Kind[] = ["wires", "clock", "safe", "moved", "photo"];
export const isMemoryKind = (kind: Kind): boolean => MEMORY_KINDS.includes(kind);

export const LEVELS = ["easy", "medium", "hard"] as const;
export type Level = (typeof LEVELS)[number];
export const PUZZLE_SETTINGS = ["off", "easy", "medium", "hard"] as const;
export type PuzzleSetting = (typeof PUZZLE_SETTINGS)[number];

/** Three Attempts per Lock; a Transcript is at most 64 events and 4 KB. */
export const ATTEMPTS = 3;
export const MAX_EVENTS = 64;
export const MAX_BYTES = 4096;

// ---------------------------------------------------------------- what the phone draws (the view) and what only the server keeps (the secret)
/** A picture drawn from simple shapes; colours are hsl strings, x, y and s are fractions of the picture. */
export type PictureShape = Readonly<{ t: "circle" | "rect" | "tri"; x: number; y: number; s: number; c: string; a: number }>;
export type Picture = Readonly<{ top: string; bottom: string; shapes: readonly PictureShape[] }>;
export type WordLetter = Readonly<{ ch: string; x: number; y: number }>;

export type LockPickView = Readonly<{ kind: "lockpick"; pins: number; range: readonly [number, number]; windowDeg: number; dwellMs: number; centers: readonly number[] }>;
export type WiresView = Readonly<{ kind: "wires"; n: number; leftOrder: readonly number[] }>;
export type ClockView = Readonly<{ kind: "clock"; stepMin: 1 | 5 | 15 }>;
export type SafeView = Readonly<{ kind: "safe"; digits: number }>;
export type MusicboxView = Readonly<{ kind: "musicbox"; n: number; plays: number; tune: readonly number[] }>;
export type CandlesView = Readonly<{ kind: "candles"; n: number; shows: number; order: readonly number[] }>;
/** `after` is the shelf after the dark: an item id, or -1 for an empty spot. */
export type MovedView = Readonly<{ kind: "moved"; slots: number; darkMs: number; after: readonly number[] }>;
/** `turns0[piece]` is how many quarter turns the piece starts turned. */
export type PhotoView = Readonly<{ kind: "photo"; cols: number; rows: number; picture: Picture; turns0: readonly number[] }>;
export type WordsView = Readonly<{ kind: "words"; n: number; letters: readonly WordLetter[] }>;
export type BoardView = Readonly<{ kind: "board"; length: number; plays: number; dwellMs: number; clue: string }>;
export type MazeView = Readonly<{ kind: "maze"; grid: readonly string[] }>;
export type LockView = LockPickView | WiresView | ClockView | SafeView | MusicboxView | CandlesView | MovedView | PhotoView | WordsView | BoardView | MazeView;

export type LockPickSecret = Readonly<{ kind: "lockpick"; centers: readonly number[]; width: number }>;
/** `terminalOf[wire]` is the terminal (0 is the top one) the wire belongs on. */
export type WiresSecret = Readonly<{ kind: "wires"; terminalOf: Readonly<Record<number, number>> }>;
export type ClockSecret = Readonly<{ kind: "clock"; h: number; m: number }>;
export type SafeSecret = Readonly<{ kind: "safe"; code: readonly number[] }>;
export type MusicboxSecret = Readonly<{ kind: "musicbox"; tune: readonly number[] }>;
export type CandlesSecret = Readonly<{ kind: "candles"; order: readonly number[] }>;
export type MovedSecret = Readonly<{ kind: "moved"; changed: readonly number[] }>;
export type PhotoSecret = Readonly<{ kind: "photo"; turns0: readonly number[] }>;
/** `order` lists the letters' indexes in reading order (left to right). */
export type WordsSecret = Readonly<{ kind: "words"; order: readonly number[]; word: string }>;
export type BoardSecret = Readonly<{ kind: "board"; word: string }>;
export type MazeSecret = Readonly<{ kind: "maze" }>;
export type LockSecret = LockPickSecret | WiresSecret | ClockSecret | SafeSecret | MusicboxSecret | CandlesSecret | MovedSecret | PhotoSecret | WordsSecret | BoardSecret | MazeSecret;

/** The clue a Memory Kind shows in an earlier place. */
export type WiresSight = Readonly<{ kind: "wires"; order: readonly number[] }>;
export type ClockSight = Readonly<{ kind: "clock"; h: number; m: number }>;
export type SafeSight = Readonly<{ kind: "safe"; code: readonly number[] }>;
export type MovedSight = Readonly<{ kind: "moved"; shelf: readonly number[] }>;
export type PhotoSight = Readonly<{ kind: "photo"; picture: Picture; cols: number; rows: number }>;
export type SightPayload = WiresSight | ClockSight | SafeSight | MovedSight | PhotoSight;

type LockBase = Readonly<{ level: Level; seed: number }>;
type Made<K extends Kind, V, S, G> = LockBase & Readonly<{ kind: K; view: V; secret: S; sight: G }>;
export type LockPickLock = Made<"lockpick", LockPickView, LockPickSecret, null>;
export type WiresLock = Made<"wires", WiresView, WiresSecret, WiresSight>;
export type ClockLock = Made<"clock", ClockView, ClockSecret, ClockSight>;
export type SafeLock = Made<"safe", SafeView, SafeSecret, SafeSight>;
export type MusicboxLock = Made<"musicbox", MusicboxView, MusicboxSecret, null>;
export type CandlesLock = Made<"candles", CandlesView, CandlesSecret, null>;
export type MovedLock = Made<"moved", MovedView, MovedSecret, MovedSight>;
export type PhotoLock = Made<"photo", PhotoView, PhotoSecret, PhotoSight>;
export type WordsLock = Made<"words", WordsView, WordsSecret, null>;
export type BoardLock = Made<"board", BoardView, BoardSecret, null>;
export type MazeLock = Made<"maze", MazeView, MazeSecret, null>;
/** A made Lock. `makeLock` takes only a Kind, a level and a seed, so it can never depend on a Solution, a Hand or a Residue position. */
export type Lock = LockPickLock | WiresLock | ClockLock | SafeLock | MusicboxLock | CandlesLock | MovedLock | PhotoLock | WordsLock | BoardLock | MazeLock;

export type Sight = Readonly<{ kind: Kind; payload: SightPayload; showMs: number }>;

// ---------------------------------------------------------------- the Transcript: a Player's moves for one Attempt
const elapsedMs = z.number().finite().nonnegative();
const finite = z.number().finite();
const smallInts = (max: number) => z.array(z.number().int().min(-1).max(max)).max(MAX_EVENTS);

export const TranscriptSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("lockpick"),
    sets: z.array(z.object({ pin: z.number().int().min(0).max(9), atDeg: finite, atMs: finite }).strict()).max(MAX_EVENTS),
    elapsedMs,
  }).strict(),
  z.object({ kind: z.literal("wires"), pairs: z.array(z.tuple([z.number().int(), z.number().int()])).max(MAX_EVENTS), elapsedMs }).strict(),
  z.object({ kind: z.literal("clock"), h: z.number().int(), m: z.number().int(), elapsedMs }).strict(),
  z.object({ kind: z.literal("safe"), code: z.array(z.number().int().min(0).max(9)).max(MAX_EVENTS), elapsedMs }).strict(),
  z.object({ kind: z.literal("musicbox"), notes: z.array(z.number().int().min(0).max(4)).max(MAX_EVENTS), elapsedMs }).strict(),
  z.object({ kind: z.literal("candles"), order: smallInts(15), elapsedMs }).strict(),
  z.object({ kind: z.literal("moved"), changed: smallInts(15), elapsedMs }).strict(),
  z.object({
    kind: z.literal("photo"),
    placed: z.array(z.object({ piece: z.number().int().min(0).max(15), slot: z.number().int().min(0).max(15), turns: z.number().int().min(0).max(3) }).strict()).max(MAX_EVENTS),
    elapsedMs,
  }).strict(),
  z.object({ kind: z.literal("words"), letters: smallInts(15), elapsedMs }).strict(),
  z.object({ kind: z.literal("board"), letters: z.string().regex(/^[A-Z]{0,8}$/), elapsedMs }).strict(),
  z.object({ kind: z.literal("maze"), reachedAtMs: finite, hits: finite, elapsedMs }).strict(),
]);
export type Transcript = z.infer<typeof TranscriptSchema>;

export type VerdictCode = "wrong" | "malformed" | "too_big" | "too_fast";
export type Verdict = Readonly<{ ok: true }> | Readonly<{ ok: false; code: VerdictCode }>;
