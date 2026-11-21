import { readsOutRules, validateGhostReply } from "@hauntology/shared/ghost/narration";
import { DIRECTIVE_KINDS, partyScripted, speakerFor, SCRIPTED_ONLY_KINDS, type PartyDirective, type Speaker } from "@hauntology/shared/party/narrate";
import { buildPartyNarration, PARTY_TOKENS_MAX, PARTY_WORD_CAP } from "@hauntology/shared/party/narrate-prompt";
import type { PublicView } from "@hauntology/shared/party/views";
import type { Rng } from "@hauntology/shared/puzzles/rng";
import type { SpendGuard } from "@hauntology/shared/world/spend";
import { generateNarration, narrationWasCharged, type Narrator } from "../guarded/workersai/narrator";

/**
 * The party narrator (party-mode 6.1, 10.2): at most one guarded model call for one public event, for the whole Room. The
 * prompt is built from the Public View alone, the reply goes through the ghost engine's `validateGhostReply`, and on a cap,
 * the kill switch, a refusal, a failure or a reply that does not pass, a scripted line from the Speaker's bank stands in.
 * Nothing here reads or changes game state: it takes a view and returns words, so narration can never change a rule, a Haunt
 * level, an event choice or Resolve. `cue`, `nudge` and `phone-cue` lines are always scripted and never call a model.
 */
export type PartyNarrationDeps = Readonly<{
  /** `null` when there is no narrator (no `AI` binding or no `AI_GATEWAY_ID`). */
  narrator: Narrator | null;
  /** The Room's budget (`RoomBudget`), so the Room's caps and the global ones both apply. */
  budget: SpendGuard;
  /** The model kill switch: `false` and every line is scripted. */
  enabled: boolean;
  scope: string;
  ipHash?: string;
  now?: () => number;
}>;

export type NarrationMode = "model" | "scripted";
export type NarrationReason = "model" | "scripted_only" | "off" | "repeat" | "no_prompt" | "capped" | "refused" | "failed" | "invalid";
export type PartyLine = Readonly<{ text: string; speaker: Speaker; mode: NarrationMode; reason: NarrationReason; /** Model calls made (0 or 1). */ calls: number }>;

export const PARTY_CALL_TIMEOUT_MS = 6_000;

/**
 * One line for one public event. `narrated` is the set of event ids that already had their one model call (the Room keeps it;
 * pass the result's id on to it when `calls` is 1 or the call was tried), so the same event never costs two calls.
 */
export async function narratePartyEvent(deps: PartyNarrationDeps, view: PublicView, event: Readonly<{ id: number; kind: PartyDirective }>, rng: Rng, narrated: ReadonlySet<number> = new Set()): Promise<PartyLine> {
  const speaker = speakerFor(event.kind);
  const scripted = (reason: NarrationReason, calls = 0): PartyLine => ({ text: partyScripted(event.kind, speaker, rng), speaker, mode: "scripted", reason, calls });
  if ((SCRIPTED_ONLY_KINDS as readonly string[]).includes(event.kind)) return scripted("scripted_only");
  if (!deps.enabled || deps.narrator === null) return scripted("off");
  if (narrated.has(event.id)) return scripted("repeat");
  const prompt = buildPartyNarration(view, event.kind, speaker);
  if (prompt === null) return scripted("no_prompt");
  const now = deps.now ?? Date.now;
  let ticket;
  try {
    const reserved = await deps.budget.reserve({ meter: "llm", sessionId: deps.scope, ipHash: deps.ipHash ?? "party", now: now() });
    if (!reserved.ok) return scripted("capped");
    ticket = reserved.ticket;
  } catch {
    return scripted("capped");
  }
  let answer;
  try {
    answer = await generateNarration(deps.narrator, ticket, { system: prompt.system, user: prompt.user, maxTokens: PARTY_TOKENS_MAX, timeoutMs: PARTY_CALL_TIMEOUT_MS, thinking: "off" });
  } catch {
    await deps.budget.release(ticket).catch(() => undefined);
    return scripted("failed", 1);
  }
  await (narrationWasCharged(answer) ? deps.budget.commit(ticket) : deps.budget.release(ticket)).catch(() => undefined);
  if (!answer.ok) return scripted(answer.kind === "refused" ? "refused" : answer.kind === "unusable" ? "invalid" : "failed", 1);
  // A reply cut short by the token cap is not a whole thought.
  const checked = answer.stopReason === "max_tokens" ? null : validateGhostReply(answer.text, { forbidDigits: true, maxWords: PARTY_WORD_CAP, noPetName: true });
  if (checked === null || !checked.ok || readsOutRules(checked.text, prompt.system)) return scripted("invalid", 1);
  return { text: checked.text, speaker, mode: "model", reason: "model", calls: 1 };
}

/** Every kind, for tests that walk them all. */
export const PARTY_KINDS: readonly PartyDirective[] = DIRECTIVE_KINDS;
