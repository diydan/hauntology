import { GUARD_TEXT_MAX, parseGuardAnswer, type GuardVerdict } from "@hauntology/shared/world/ai-answers";
import type { SpendTicket } from "@hauntology/shared/world/spend";
import { assertTicket } from "../ticket";
import { failureKind, withTimeout, type AiBinding, type CallFailure } from "./call";
import { catalogModelFromEnv } from "./model";

export const DEFAULT_GUARD_MODEL = "@cf/meta/llama-guard-3-8b";
/** `GUARD_MODEL_ID`: blank is the default, a Workers AI catalog id (`@cf/<author>/<model>`) is used, and anything else is `null` (no text is checked, so none passes). */
export const guardModelFromEnv = (value: string | undefined): string | null => catalogModelFromEnv(value, DEFAULT_GUARD_MODEL);

/** A verdict on the text (`unusable` is an answer that could not be read: the caller fails closed), or why the call gave none (not charged). */
export type GuardAnswer = { ok: true; verdict: GuardVerdict } | { ok: false; kind: CallFailure };

/** Checks one piece of free text a visitor wrote (a ghost's detail, a nickname, a Zone name) against Llama Guard's hazard list. */
export interface TextGuard {
  check(text: string): Promise<GuardAnswer>;
}

/**
 * The only door to the text check (`.kiro/steering/security-and-cost.md`: a Workers AI call is made only from
 * `api/src/guarded/`). It needs a Ticket for the `llm` meter and refuses to call without one. The caller reserves, calls, then
 * commits when the answer was `ok: true` and releases when it was `ok: false`; and it fails closed on anything but `safe`.
 */
export function moderateText(guard: TextGuard, ticket: SpendTicket, text: string): Promise<GuardAnswer> {
  assertTicket(ticket, "llm");
  return guard.check(text);
}

/**
 * Llama Guard 3 8B on Workers AI (`GUARD_MODEL_ID`), asked about the text as a message from a user, the form that
 * classifies a prompt. The text is sent whole or not at all: empty text and text longer than `GUARD_TEXT_MAX` are not sent
 * (a cut would let the tail through unchecked) and answer `failed`, which is not charged. The answer is read by `parseGuardAnswer`.
 * **The answer's real shape, its accuracy on short text such as nicknames, and how it treats languages it does not list are not
 * confirmed by a call** (Spike 1.2). The text is not logged and goes nowhere else.
 */
export class LlamaGuardTextGuard implements TextGuard {
  constructor(
    private readonly ai: AiBinding,
    private readonly modelId: string = DEFAULT_GUARD_MODEL,
    private readonly options: { timeoutMs?: number } = {},
  ) {}

  async check(text: string): Promise<GuardAnswer> {
    if (typeof text !== "string" || text.trim() === "" || text.length > GUARD_TEXT_MAX) return { ok: false, kind: "failed" };
    let answer: unknown;
    try {
      answer = await withTimeout(this.ai.run(this.modelId, { messages: [{ role: "user", content: text }], max_tokens: 32, temperature: 0 }), this.options.timeoutMs ?? 8_000);
    } catch (e) {
      return { ok: false, kind: failureKind(e) };
    }
    return { ok: true, verdict: parseGuardAnswer(answer) };
  }
}
