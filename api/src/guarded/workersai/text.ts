import { readChatText } from "@hauntology/shared/world/ai-answers";
import type { SpendTicket } from "@hauntology/shared/world/spend";
import { assertTicket } from "../ticket";
import { failureKind, withTimeout, type AiBinding, type CallFailure } from "./call";

/** What one text call is asked: the instructions, the one message, and the bounds the caller wants. */
export type TextRequest = {
  system: string;
  user: string;
  /** The most tokens the model may write (1 to `TEXT_TOKENS_MAX`). */
  maxTokens: number;
  /** 0 to 1.5; default 0.7. */
  temperature?: number;
  /** How long to wait, in milliseconds, at most `TEXT_TIMEOUT_MAX_MS`; default 6000 (the ghost engine's turn deadline). */
  timeoutMs?: number;
};

/** The text, or why there is none: `rate_limited` and `failed` are not charged; `unusable` (the model answered with nothing readable) is. */
export type TextAnswer = { ok: true; text: string } | { ok: false; kind: CallFailure | "unusable" };

/** Writes text for the ghost (narration, a place brief for a ghost, a line). The ghost engine validates what comes back; this only bounds it. */
export interface TextMaker {
  generate(req: TextRequest): Promise<TextAnswer>;
}

/** The most text in one call (instructions and message together), in characters. A bigger request is not sent. */
export const TEXT_PROMPT_MAX = 16_000;
export const TEXT_TOKENS_MAX = 400;
export const TEXT_TIMEOUT_MAX_MS = 20_000;
export const TEXT_TIMEOUT_DEFAULT_MS = 6_000;

/**
 * The only door to the text model (`.kiro/steering/security-and-cost.md`: a Workers AI call is made only from
 * `api/src/guarded/`). It needs a Ticket for the `llm` meter and refuses to call without one.
 */
export function generateText(maker: TextMaker, ticket: SpendTicket, req: TextRequest): Promise<TextAnswer> {
  assertTicket(ticket, "llm");
  return maker.generate(req);
}

/**
 * Llama 4 Scout on Workers AI (`GHOST_MODEL_ID`) as a text model: the chat shape the model page documents, a system message
 * and a user message. A request that is out of bounds is not sent and answers `failed` (not charged): empty text, more than
 * `TEXT_PROMPT_MAX` characters, `maxTokens` not a whole number from 1 to `TEXT_TOKENS_MAX`. The answer is read by
 * `readChatText`, which takes the shapes the platform may give and refuses the rest. **The answer's real shape is not
 * confirmed by a call** (Spike 1.2). Nothing sent or received is logged.
 */
export class ScoutTextMaker implements TextMaker {
  constructor(
    private readonly ai: AiBinding,
    private readonly modelId: string,
  ) {}

  async generate(req: TextRequest): Promise<TextAnswer> {
    const { system, user, maxTokens } = req;
    if (typeof system !== "string" || typeof user !== "string" || user.trim() === "" || system.length + user.length > TEXT_PROMPT_MAX) return { ok: false, kind: "failed" };
    if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > TEXT_TOKENS_MAX) return { ok: false, kind: "failed" };
    const temperature = Math.min(1.5, Math.max(0, req.temperature ?? 0.7));
    const timeoutMs = Math.min(TEXT_TIMEOUT_MAX_MS, Math.max(1, req.timeoutMs ?? TEXT_TIMEOUT_DEFAULT_MS));
    let answer: unknown;
    try {
      answer = await withTimeout(this.ai.run(this.modelId, { messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: maxTokens, temperature }), timeoutMs);
    } catch (e) {
      return { ok: false, kind: failureKind(e) };
    }
    const text = readChatText(answer);
    return text.ok ? { ok: true, text: text.text } : { ok: false, kind: "unusable" };
  }
}
