import { readChatText } from "@hauntology/shared/world/ai-answers";
import type { SpendTicket } from "@hauntology/shared/world/spend";
import { assertTicket } from "../ticket";
import { failureKind, withTimeout, type AiBinding, type CallFailure } from "./call";

/**
 * The ghost's narrator (ghost-engine 4.1): Haiku 5.5 through the AI Gateway, proposed in `steering/tech.md` and not yet run against the
 * real service (`docs/spikes/4.1.md`). It is a third-party model in the Anthropic Messages shape, which `ScoutTextMaker` does not speak:
 * it sends a system text and one user message, a token cap, and **never** a `temperature`, `top_p` or `top_k` (Haiku 5.5 refuses a
 * non-default value with a 400). The call names the gateway, which bills it from prepaid credits.
 */

export const DEFAULT_NARRATOR_MODEL = "anthropic/claude-haiku-5.5";
/** The most text in one call (instructions and message together), in characters. A bigger request is not sent. */
export const NARRATOR_PROMPT_MAX = 8_000;
export const NARRATOR_TOKENS_MAX = 1_024;
export const NARRATOR_TIMEOUT_MAX_MS = 20_000;
export const NARRATOR_TIMEOUT_DEFAULT_MS = 6_000;
/** The longest reply that is read; a longer one is unusable. */
export const NARRATOR_REPLY_MAX = 4_000;

/** How much the model thinks before it writes: its own default, none (`thinking` disabled), or the lowest effort. Thinking is billed as output. */
export const THINKING_MODES = ["default", "off", "low"] as const;
export type ThinkingMode = (typeof THINKING_MODES)[number];

export type NarrationRequest = {
  system: string;
  user: string;
  /** The most tokens the model may write, thinking included (1 to `NARRATOR_TOKENS_MAX`). */
  maxTokens: number;
  /** In milliseconds, at most `NARRATOR_TIMEOUT_MAX_MS`; default 6000 (the ghost engine's turn deadline). */
  timeoutMs?: number;
  /** How much it thinks first (default `default`: nothing about thinking is sent, and the model does what it does by default). */
  thinking?: ThinkingMode;
};

export type NarrationUsage = { inputTokens: number | null; outputTokens: number | null };

/**
 * The text and what the call cost in tokens, or why there is none. `rate_limited` and `failed` are not charged; `unusable` (the model answered
 * with nothing readable) and `refused` (its safety check declined) are charged. `shape` is the names of the answer's top-level fields and
 * nothing of what they hold, so the real shape can be learned without keeping anyone's words.
 */
export type NarrationAnswer =
  | { ok: true; text: string; stopReason: string | null; usage: NarrationUsage; thinkingBlocks: number; shape: string[] }
  | { ok: false; kind: CallFailure | "unusable" | "refused"; usage?: NarrationUsage; shape?: string[] };

export interface Narrator {
  narrate(req: NarrationRequest): Promise<NarrationAnswer>;
}

/** Whether a call is charged: it was made and the service answered, even if the answer cannot be used or was declined. */
export const narrationWasCharged = (a: NarrationAnswer): boolean => a.ok || a.kind === "unusable" || a.kind === "refused";

/** The only door to the narrator: it needs a Ticket for the `llm` meter and refuses to call without one. */
export function generateNarration(maker: Narrator, ticket: SpendTicket, req: NarrationRequest): Promise<NarrationAnswer> {
  assertTicket(ticket, "llm");
  return maker.narrate(req);
}

/** `NARRATOR_MODEL_ID`: blank is the default; only an Anthropic Haiku id is used; anything else is `null` and the narrator is off (a model is also a price). */
export function narratorModelFromEnv(value: string | undefined): string | null {
  const id = typeof value === "string" ? value.trim() : "";
  if (id === "") return DEFAULT_NARRATOR_MODEL;
  return /^anthropic\/claude-haiku-\d+(?:\.\d+)*$/.test(id) ? id : null;
}

/** `AI_GATEWAY_ID`: blank or anything that is not a plain gateway name is `null`, and the narrator is off until the owner names a gateway. */
export function gatewayIdFromEnv(value: string | undefined): string | null {
  const id = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/.test(id) ? id : null;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

type Read = { text: string | null; refused: boolean; stopReason: string | null; usage: NarrationUsage; thinkingBlocks: number; shape: string[] };

/** The answer in the Anthropic Messages shape (`content` blocks, `stop_reason`, `usage`), also when the platform wraps it in `result`, else any chat shape `readChatText` knows. */
function readAnswer(raw: unknown): Read {
  const message = isObject(raw) && !("content" in raw) && isObject(raw.result) ? raw.result : raw;
  const shape = isObject(raw) ? Object.keys(raw).sort() : [];
  if (isObject(message) && Array.isArray(message.content)) {
    const blocks = message.content.filter(isObject);
    const stopReason = typeof message.stop_reason === "string" ? message.stop_reason : null;
    const usage = isObject(message.usage) ? { inputTokens: count(message.usage.input_tokens), outputTokens: count(message.usage.output_tokens) } : { inputTokens: null, outputTokens: null };
    const thinkingBlocks = blocks.filter((b) => b.type === "thinking" || b.type === "redacted_thinking").length;
    const text = blocks.filter((b): b is { type: "text"; text: string } => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("").trim();
    return { text: text === "" || text.length > NARRATOR_REPLY_MAX ? null : text, refused: stopReason === "refusal", stopReason, usage, thinkingBlocks, shape };
  }
  const chat = readChatText(raw, NARRATOR_REPLY_MAX);
  return { text: chat.ok ? chat.text : null, refused: false, stopReason: null, usage: { inputTokens: null, outputTokens: null }, thinkingBlocks: 0, shape };
}

/**
 * Haiku 5.5 as the ghost's narrator. A request that is out of bounds is not sent and answers `failed` (not charged): empty text, more than
 * `NARRATOR_PROMPT_MAX` characters, `maxTokens` not a whole number from 1 to `NARRATOR_TOKENS_MAX`, an unknown thinking mode. Nothing sent or received is logged.
 */
export class HaikuNarrator implements Narrator {
  constructor(
    private readonly ai: AiBinding,
    private readonly modelId: string,
    private readonly gatewayId: string,
  ) {}

  async narrate(req: NarrationRequest): Promise<NarrationAnswer> {
    const { system, user, maxTokens } = req;
    const thinking = req.thinking ?? "default";
    if (typeof system !== "string" || typeof user !== "string" || user.trim() === "" || system.length + user.length > NARRATOR_PROMPT_MAX) return { ok: false, kind: "failed" };
    if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > NARRATOR_TOKENS_MAX) return { ok: false, kind: "failed" };
    if (!(THINKING_MODES as readonly string[]).includes(thinking)) return { ok: false, kind: "failed" };
    const timeoutMs = Math.min(NARRATOR_TIMEOUT_MAX_MS, Math.max(1, req.timeoutMs ?? NARRATOR_TIMEOUT_DEFAULT_MS));
    const input: Record<string, unknown> = {
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
      ...(thinking === "off" ? { thinking: { type: "disabled" } } : {}),
      ...(thinking === "low" ? { output_config: { effort: "low" } } : {}),
    };
    let answer: unknown;
    try {
      answer = await withTimeout(this.ai.run(this.modelId, input, { gateway: { id: this.gatewayId } }), timeoutMs);
    } catch (e) {
      return { ok: false, kind: failureKind(e) };
    }
    const read = readAnswer(answer);
    if (read.refused) return { ok: false, kind: "refused", usage: read.usage, shape: read.shape };
    if (read.text === null) return { ok: false, kind: "unusable", usage: read.usage, shape: read.shape };
    return { ok: true, text: read.text, stopReason: read.stopReason, usage: read.usage, thinkingBlocks: read.thinkingBlocks, shape: read.shape };
  }
}
