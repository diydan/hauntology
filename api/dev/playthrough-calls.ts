/**
 * The call recorder of the narrator play-through Worker (`playthrough-worker.ts`, `docs/spikes/4.2.md`), with no import at all, so a plain Node test can run it.
 * LOCAL ONLY, never deployed.
 *
 * WHY: the game asks the model through `env.AI.run(...)` and checks each reply; a reply that fails its check is thrown away and asked again once, so the runner,
 * which sees only the final reply of a turn, could not say WHAT the model wrote or WHICH check refused it (the paid run of 2026-11-16 lost six hints that way,
 * at two calls each). The Worker wraps its `AI` binding with this recorder (the real game code is untouched: it is handed the wrapped binding), and the runner reads
 * what was recorded with `GET /dev/calls?since=N` and runs the game's own checks over it.
 *
 * WHAT IS KEPT, for each call, in the order the calls finished: the reply's text (at most `REPLY_TEXT_MAX` characters), its stop reason, the token counts the service
 * reported, the size of what was sent (in characters, never the text of it), how long it took, and, if it threw, the name and the first words of the error. The calls are
 * kept in memory only, at most `CALLS_MAX` of them, for the life of the Worker: nothing is written anywhere, and the made-up inputs of the run hold no visitor data.
 *
 * THE RECORDER CHANGES NOTHING: the same arguments go in, the very same answer comes back (or the very same error is thrown), and every other member of the binding
 * is passed through as it is.
 */

export const CALLS_MAX = 500;
export const REPLY_TEXT_MAX = 2_000;
const ERROR_MAX = 120;

export type RecordedCall = {
  /** 1, 2, 3 ... in the order the calls finished, for the life of the Worker. */
  n: number;
  /** The service answered (a reply that fails the game's checks is still `ok` here: the runner decides that). */
  ok: boolean;
  /** The reply's text blocks joined and trimmed, cut at `REPLY_TEXT_MAX`, or `null` when there was no text. */
  text: string | null;
  /** The length of the whole text before it was cut. */
  textChars: number;
  truncated: boolean;
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  /** The size of the instructions and the message together; their text is never kept. */
  inputChars: number | null;
  ms: number;
  /** The name and the first words of what a failed call threw. */
  error: string | null;
};

export type CallsView = { epoch: string; next: number; lost: number; calls: RecordedCall[] };

export type AiLike = { run(model: string, input: Record<string, unknown>, options?: { gateway: { id: string } }): Promise<unknown> };

export type CallLog = {
  /** One value for the life of this Worker: when it changes, the Worker started again and the numbers began again. */
  epoch: string;
  record(call: Omit<RecordedCall, "n">): void;
  /** The calls after number `since`; `next` is the number of calls recorded so far (use it as the next `since`); `lost` counts calls after `since` that were dropped for room. */
  since(since: number): CallsView;
  /** The same binding, recording each `run`. */
  wrap<T extends AiLike>(ai: T): T;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** The text, stop reason and token counts of an answer in the Anthropic Messages shape (also when the platform wraps it in `result`). Any other shape gives no text and no counts. */
export function readReply(raw: unknown): { text: string | null; stopReason: string | null; inputTokens: number | null; outputTokens: number | null } {
  const message = isObject(raw) && !("content" in raw) && isObject(raw["result"]) ? raw["result"] : raw;
  if (!isObject(message) || !Array.isArray(message["content"])) return { text: null, stopReason: null, inputTokens: null, outputTokens: null };
  const text = message["content"]
    .filter((b): b is { type: "text"; text: string } => isObject(b) && b["type"] === "text" && typeof b["text"] === "string")
    .map((b) => b.text)
    .join("")
    .trim();
  const usage = isObject(message["usage"]) ? message["usage"] : null;
  return {
    text: text === "" ? null : text,
    stopReason: typeof message["stop_reason"] === "string" ? message["stop_reason"] : null,
    inputTokens: usage === null ? null : count(usage["input_tokens"]),
    outputTokens: usage === null ? null : count(usage["output_tokens"]),
  };
}

/** How many characters were sent: the instructions and the text of the messages. Their words are not read out. */
export function sizeOfInput(input: unknown): number | null {
  if (!isObject(input)) return null;
  let total = typeof input["system"] === "string" ? input["system"].length : 0;
  const messages = input["messages"];
  if (Array.isArray(messages)) for (const m of messages) if (isObject(m) && typeof m["content"] === "string") total += m["content"].length;
  return total;
}

export function createCallLog(options: { now?: () => number; max?: number; textMax?: number; epoch?: string } = {}): CallLog {
  const now = options.now ?? Date.now;
  const max = options.max ?? CALLS_MAX;
  const textMax = options.textMax ?? REPLY_TEXT_MAX;
  // Made on first use, not here: a Worker may not make random values in its global scope, where the log is created.
  let epochValue = options.epoch;
  const epochOf = (): string => (epochValue ??= crypto.randomUUID());
  const calls: RecordedCall[] = [];
  let total = 0;

  const record = (call: Omit<RecordedCall, "n">): void => {
    total += 1;
    calls.push({ ...call, n: total });
    while (calls.length > max) calls.shift();
  };

  const since = (from: number): CallsView => {
    const after = Number.isInteger(from) && from > 0 ? from : 0;
    const kept = calls.filter((c) => c.n > after);
    const oldest = calls[0]?.n ?? total + 1;
    const lost = Math.max(0, oldest - 1 - after);
    return { epoch: epochOf(), next: total, lost, calls: kept.map((c) => ({ ...c })) };
  };

  const wrap = <T extends AiLike>(ai: T): T =>
    new Proxy(ai, {
      get(target, prop) {
        if (prop === "run") {
          return async (...args: Parameters<AiLike["run"]>): Promise<unknown> => {
            const started = now();
            try {
              const answer = await Reflect.apply(target.run, target, args);
              const read = readReply(answer);
              const whole = read.text;
              record({
                ok: true,
                text: whole === null ? null : whole.slice(0, textMax),
                textChars: whole === null ? 0 : whole.length,
                truncated: whole !== null && whole.length > textMax,
                stopReason: read.stopReason,
                inputTokens: read.inputTokens,
                outputTokens: read.outputTokens,
                inputChars: sizeOfInput(args[1]),
                ms: Math.max(0, now() - started),
                error: null,
              });
              return answer;
            } catch (error) {
              const said = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
              record({ ok: false, text: null, textChars: 0, truncated: false, stopReason: null, inputTokens: null, outputTokens: null, inputChars: sizeOfInput(args[1]), ms: Math.max(0, now() - started), error: said.slice(0, ERROR_MAX) });
              throw error;
            }
          };
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

  return { get epoch() { return epochOf(); }, record, since, wrap };
}

/**
 * The environment the real Worker is given: the same, with the `AI` binding recorded. Without a binding (the rehearsal) the environment is returned as it is and nothing is recorded.
 * One derived object for each environment (`memo`), so the real Worker, which builds its app once for each environment object, builds it once. The original is never changed.
 */
export function recordEnv<E extends { AI?: AiLike }>(env: E, log: CallLog, memo: WeakMap<object, E>): E {
  if (env.AI === undefined) return env;
  let made = memo.get(env);
  if (made === undefined) {
    made = Object.create(env, { AI: { value: log.wrap(env.AI), enumerable: true } }) as E;
    memo.set(env, made);
  }
  return made;
}
