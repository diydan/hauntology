import { z } from "zod";

/** Every Kind of Puzzle: the ten of the spec plus the optional marble maze and the Secret knock (Requirement 24). */
export const KINDS = ["lockpick", "wires", "clock", "safe", "musicbox", "candles", "moved", "photo", "words", "board", "maze", "knock"] as const;
export type Kind = (typeof KINDS)[number];

/** The Kinds a Room uses by default: the ten, without the optional maze, and without the Secret knock until it has been tried on real tables (task 16.4). */
export const DEFAULT_KINDS: readonly Kind[] = KINDS.filter((k) => k !== "maze" && k !== "knock");

/** Memory Kinds need a Sight from an earlier place. */
export const MEMORY_KINDS: readonly Kind[] = ["wires", "clock", "safe", "moved", "photo", "knock"];
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
/** `turning` is false on easy: every piece starts the right way up and cannot be turned. */
export type PhotoView = Readonly<{ kind: "photo"; cols: number; rows: number; picture: Picture; turns0: readonly number[]; turning: boolean }>;
export type WordsView = Readonly<{ kind: "words"; n: number; letters: readonly WordLetter[] }>;
export type BoardView = Readonly<{ kind: "board"; length: number; plays: number; dwellMs: number; clue: string }>;
export type MazeView = Readonly<{ kind: "maze"; grid: readonly string[] }>;
/** The door shows how many groups the knock has and whether one pause is long, never the counts. */
export type KnockView = Readonly<{ kind: "knock"; groups: number; longPause: boolean }>;
export type LockView = LockPickView | WiresView | ClockView | SafeView | MusicboxView | CandlesView | MovedView | PhotoView | WordsView | BoardView | MazeView | KnockView;

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
export type KnockSecret = Readonly<{ kind: "knock"; groups: readonly number[]; long: number | null }>;
export type LockSecret = LockPickSecret | WiresSecret | ClockSecret | SafeSecret | MusicboxSecret | CandlesSecret | MovedSecret | PhotoSecret | WordsSecret | BoardSecret | MazeSecret | KnockSecret;

/** The clue a Memory Kind shows in an earlier place. */
export type WiresSight = Readonly<{ kind: "wires"; order: readonly number[] }>;
export type ClockSight = Readonly<{ kind: "clock"; h: number; m: number }>;
export type SafeSight = Readonly<{ kind: "safe"; code: readonly number[] }>;
export type MovedSight = Readonly<{ kind: "moved"; shelf: readonly number[] }>;
export type PhotoSight = Readonly<{ kind: "photo"; picture: Picture; cols: number; rows: number }>;
/** The ghost's knock, heard once. */
export type KnockSight = Readonly<{ kind: "knock"; groups: readonly number[]; long: number | null }>;
export type SightPayload = WiresSight | ClockSight | SafeSight | MovedSight | PhotoSight | KnockSight;

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
export type KnockLock = Made<"knock", KnockView, KnockSecret, KnockSight>;
/** A made Lock. `makeLock` takes only a Kind, a level and a seed, so it can never depend on a Solution, a Hand or a Residue position. */
export type Lock = LockPickLock | WiresLock | ClockLock | SafeLock | MusicboxLock | CandlesLock | MovedLock | PhotoLock | WordsLock | BoardLock | MazeLock | KnockLock;

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
  /** The times of the Player's knocks, in ms from the start of the try (motion, microphone or the Tap control alike). */
  z.object({ kind: z.literal("knock"), times: z.array(z.number().finite().nonnegative()).max(MAX_EVENTS), elapsedMs }).strict(),
]);
export type Transcript = z.infer<typeof TranscriptSchema>;

export type VerdictCode = "wrong" | "malformed" | "too_big" | "too_fast";
export type Verdict = Readonly<{ ok: true }> | Readonly<{ ok: false; code: VerdictCode }>;

const PictureShapeSchema = z.object({ t: z.enum(["circle", "rect", "tri"]), x: finite, y: finite, s: finite, c: z.string().max(40), a: finite });
const PictureSchema = z.object({ top: z.string().max(40), bottom: z.string().max(40), shapes: z.array(PictureShapeSchema).max(32) });
const WordLetterSchema = z.object({ ch: z.string().max(4), x: finite, y: finite });

export const LockViewSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lockpick"), pins: z.number().int().min(1).max(9), range: z.tuple([finite, finite]), windowDeg: finite, dwellMs: finite, centers: z.array(finite).max(9) }),
  z.object({ kind: z.literal("wires"), n: z.number().int().min(1).max(12), leftOrder: z.array(z.number().int()).max(12) }),
  z.object({ kind: z.literal("clock"), stepMin: z.union([z.literal(1), z.literal(5), z.literal(15)]) }),
  z.object({ kind: z.literal("safe"), digits: z.number().int().min(1).max(9) }),
  z.object({ kind: z.literal("musicbox"), n: z.number().int().min(1).max(12), plays: z.number().int().min(1), tune: z.array(z.number().int()).max(12) }),
  z.object({ kind: z.literal("candles"), n: z.number().int().min(1).max(12), shows: z.number().int().min(1), order: z.array(z.number().int()).max(12) }),
  z.object({ kind: z.literal("moved"), slots: z.number().int().min(1).max(16), darkMs: finite, after: z.array(z.number().int()).max(16) }),
  z.object({ kind: z.literal("photo"), cols: z.number().int().min(1).max(8), rows: z.number().int().min(1).max(8), picture: PictureSchema, turns0: z.array(z.number().int()).max(16), turning: z.boolean() }),
  z.object({ kind: z.literal("words"), n: z.number().int().min(1).max(12), letters: z.array(WordLetterSchema).max(16) }),
  z.object({ kind: z.literal("board"), length: z.number().int().min(1).max(12), plays: z.number().int().min(1), dwellMs: finite, clue: z.string().max(120) }),
  z.object({ kind: z.literal("maze"), grid: z.array(z.string().max(32)).max(32) }),
  z.object({ kind: z.literal("knock"), groups: z.number().int().min(1).max(8), longPause: z.boolean() }),
]);

export const SightPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("wires"), order: z.array(z.number().int()).max(12) }),
  z.object({ kind: z.literal("clock"), h: z.number().int(), m: z.number().int() }),
  z.object({ kind: z.literal("safe"), code: z.array(z.number().int()).max(12) }),
  z.object({ kind: z.literal("moved"), shelf: z.array(z.number().int()).max(16) }),
  z.object({ kind: z.literal("photo"), picture: PictureSchema, cols: z.number().int().min(1).max(8), rows: z.number().int().min(1).max(8) }),
  z.object({ kind: z.literal("knock"), groups: z.array(z.number().int()).max(12), long: z.number().int().nullable() }),
]);

export const SightSchema = z.object({
  kind: z.enum(KINDS),
  payload: SightPayloadSchema,
  showMs: finite,
});

export const WanderOpenSchema = z.object({
  anchorId: z.string().min(1).max(32),
  index: z.number().int().min(0).max(16),
  kind: z.enum(KINDS),
  level: z.enum(LEVELS),
  seed: z.number().int().nonnegative(),
  openedAt: finite,
  wrong: z.number().int().min(0),
  /** The one memory with a Wander door (knock-door 6): its Skip is there from the start. Kept in a saved game. */
  door: z.literal(true).optional(),
});

export const WanderLocksSchema = z.object({
  on: z.boolean(),
  /** The walk has a door (knock-door 6.1). Kept in a saved game. */
  doors: z.literal(true).optional(),
  revealed: z.array(z.string().min(1).max(32)).max(16),
  open: WanderOpenSchema.nullable(),
  seen: z.array(z.string().min(1).max(32)).max(16),
});
