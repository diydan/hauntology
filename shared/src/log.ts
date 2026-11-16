/**
 * The logging policy (world-pipeline 8.2, Requirement 10.3; `.kiro/steering/security-and-cost.md`: "Logs: ids, counters, error codes only").
 * A log line is made here and nowhere else, from a closed list of events, and each event has a closed list of fields, each field of one
 * kind: an id, a lower-case word (a code, a state, a meter), a route pattern, an error class name, a whole number or a yes/no. A value that
 * is not of its field's kind, a field the event does not list and an event that is not on the list are **dropped**, and only how many were
 * dropped is written. Free text has no kind: nothing a visitor typed, no caption, prompt, chat line, image or request body, and no error
 * message (a message may quote its input), can reach a line, whatever a caller passes. Pure: the sink and the clock are the caller's.
 */

export type LogLevel = "info" | "warn" | "error";
const LEVELS: readonly LogLevel[] = ["info", "warn", "error"];

/** The events, and for each the fields it may carry and the kind of each. Add an event or a field here, with a reason, and nowhere else. */
export const LOG_SCHEMA = {
  /** A request that threw: the route pattern (never the address with its ids), the class name of the error (never its message) and the status given. */
  "request.error": { route: "route", errorName: "name", status: "int" },
  /** A world job moved: which world, its state, and the error code when it failed. */
  "job.step": { worldId: "id", status: "word", code: "word" },
  /** The cleanup run: how many objects and how many whole worlds it removed. */
  "cleanup.done": { deleted: "int", worlds: "int" },
  /** The operator opened or closed the voice window (`POST /admin/voice`): whether it is open now, for how many minutes and with how many lines. Never the token. */
  "admin.voice": { on: "bool", minutes: "int", cap: "int" },
  /** The operator closed or opened new world creation. */
  "admin.kill": { on: "bool" },
  /** A game began (ghost-engine 5): which world, and how the visitor reaches it (`owner`, `shared` or `public`). Never a word the visitor said. */
  "play.start": { worldId: "id", access: "word" },
  /** One turn was taken: what the ghost was told to do (`reveal`, `echo`, `tease`, `hint`, `ambient`, `ending` or `refuse`) and whether it spoke from the scripted lines. Never the input or the reply. */
  "play.turn": { directive: "word", revealed: "bool", scripted: "bool" },
  /** The model's part of a turn (ghost-engine 4): `model`, `invalid`, `refused`, `failed`, `capped` or `off`, and how many calls it took. Never a word of the prompt or the reply. */
  "play.narrate": { outcome: "word", attempts: "int" },
  /**
   * The real world was read once for a new game (conditions 3.7): where the weather came from (`live`, `memory` or `default`), why it was the Default when it was (`ok`, `disabled`,
   * `no_place`, `timeout`, `error` or `empty`) and whether the answer came from the 15 minute cache. Counters of one word each: never a place, a coordinate, a label, a date or a query.
   */
  "conditions.read": { source: "word", reason: "word", cache: "bool" },
  /** A game was finished or played again, with how many turns it took. */
  "play.end": { turns: "int" },
  "play.reset": { turns: "int" },
  /** A play call was refused, with its code (`rate_limited`, `session_expired`, `world_not_found`, ...). */
  "play.refused": { code: "word" },
  /**
   * One request to hear a line (ghost-voice 3.6 and 3.12): where the audio came from (`library`, `cache`, `flight`, `inworld`, `aura` or `none`; `flight` is a request that joined a
   * call already running), how it ended (`ok`, `off`, `bad_body`, `no_line`, `silent`, `not_ready`, `killed`, `denied` or `failed`), whether a paid call was charged for it, whether it
   * was a prefetch (which never pays), and how long it took in milliseconds. Counters of one word each: never the line's words, its id, the game's id or the audio.
   */
  "voice.speak": { via: "word", outcome: "word", paid: "bool", prefetch: "bool", ms: "int" },
} as const;

export type LogEvent = keyof typeof LOG_SCHEMA;
type Kind = "id" | "word" | "route" | "name" | "int" | "bool";
type KindValue = { id: string; word: string; route: string; name: string; int: number; bool: boolean };
/** The fields of one event, each optional and of the type of its kind. */
export type LogFields<E extends LogEvent> = { [K in keyof (typeof LOG_SCHEMA)[E]]?: KindValue[(typeof LOG_SCHEMA)[E][K] & Kind] };

const PATTERNS = {
  id: /^[A-Za-z0-9_-]{1,128}$/,
  word: /^[a-z][a-z0-9_.:-]{0,63}$/,
  route: /^\/[A-Za-z0-9_:.*/-]{0,127}$/,
  name: /^[A-Za-z][A-Za-z0-9_]{0,39}$/,
} as const;
const INT_MAX = 1_000_000_000_000;

function fits(kind: Kind, value: unknown): boolean {
  switch (kind) {
    case "bool":
      return typeof value === "boolean";
    case "int":
      return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= INT_MAX;
    default:
      return typeof value === "string" && PATTERNS[kind].test(value);
  }
}

/**
 * One log line, as one line of JSON: the time, the level, the event, the fields that passed, and `dropped` (a count, never a value) when any did not.
 * An event that is not on the list is written as `log.refused`: its name is not written either, because a name is text too.
 */
export function formatLog(level: LogLevel, event: string, fields: unknown, now: number): string {
  const schema: Record<string, Kind> | null = typeof event === "string" && Object.hasOwn(LOG_SCHEMA, event) ? (LOG_SCHEMA[event as LogEvent] as Record<string, Kind>) : null;
  const out: Record<string, unknown> = {
    t: Number.isFinite(now) ? Math.trunc(now) : 0,
    level: LEVELS.includes(level) ? level : "error",
    event: schema === null ? "log.refused" : event,
  };
  let dropped = 0;
  if (typeof fields === "object" && fields !== null && !Array.isArray(fields)) {
    let entries: [string, unknown][] = [];
    try {
      entries = Object.entries(fields);
    } catch {
      dropped++; // a getter that throws
    }
    for (const [key, value] of entries) {
      const kind = schema !== null && Object.hasOwn(schema, key) ? (schema[key] as Kind) : null;
      if (kind !== null && fits(kind, value)) out[key] = value;
      else dropped++;
    }
  } else if (fields !== undefined && fields !== null) {
    dropped++; // not an object: text, a number, an array, a function
  }
  if (dropped > 0) out.dropped = dropped;
  return JSON.stringify(out);
}
