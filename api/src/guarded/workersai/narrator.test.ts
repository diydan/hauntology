import { afterEach, describe, expect, it, vi } from "vitest";
import type { SpendTicket } from "@hauntology/shared/world/spend";
import { NoTicketError } from "../ticket";
import type { AiBinding } from "./call";
import { WorkersAiClient } from "./client";
import {
  DEFAULT_NARRATOR_MODEL, HaikuNarrator, NARRATOR_PROMPT_MAX, NARRATOR_REPLY_MAX, NARRATOR_TIMEOUT_DEFAULT_MS, NARRATOR_TIMEOUT_MAX_MS, NARRATOR_TOKENS_MAX,
  gatewayIdFromEnv, generateNarration, narrationWasCharged, narratorModelFromEnv, type Narrator,
} from "./narrator";

const MODEL = DEFAULT_NARRATOR_MODEL;
const REQ = { system: "You are the ghost of a kitchen.", user: "The visitor says nothing.", maxTokens: 220 };
const TICKET: SpendTicket = { id: "t1", meter: "llm", sessionId: "s", issuedAt: 1 };

type Seen = { model: string; input: Record<string, any>; options: unknown };
const fakeAi = (answer: unknown | (() => unknown | Promise<unknown>)): AiBinding & { seen: Seen[] } => {
  const seen: Seen[] = [];
  return {
    seen,
    async run(model, input, options) {
      seen.push({ model, input, options });
      const a = typeof answer === "function" ? await (answer as () => unknown)() : answer;
      if (a instanceof Error) throw a;
      return a;
    },
  };
};
const message = (over: Record<string, unknown> = {}) => ({
  id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5", stop_reason: "end_turn",
  content: [{ type: "text", text: "The kettle is still warm." }],
  usage: { input_tokens: 612, output_tokens: 31 },
  ...over,
});
const narrator = (ai: AiBinding) => new HaikuNarrator(ai, MODEL, "default");

afterEach(() => vi.useRealTimers());

describe("HaikuNarrator: what it sends", () => {
  it("sends the model, a token cap, a system text and one user message, and names the gateway", async () => {
    const ai = fakeAi(message());
    await narrator(ai).narrate(REQ);
    expect(ai.seen).toHaveLength(1);
    expect(ai.seen[0]!.model).toBe(MODEL);
    expect(ai.seen[0]!.input).toEqual({ max_tokens: 220, system: REQ.system, messages: [{ role: "user", content: REQ.user }] });
    expect(ai.seen[0]!.options).toEqual({ gateway: { id: "default" } });
  });

  it("never sends a temperature, top_p or top_k, in any thinking mode (Haiku 5.5 refuses a non-default value)", async () => {
    for (const thinking of [undefined, "default", "off", "low"] as const) {
      const ai = fakeAi(message());
      await narrator(ai).narrate({ ...REQ, ...(thinking === undefined ? {} : { thinking }) });
      const keys = Object.keys(ai.seen[0]!.input);
      for (const k of ["temperature", "top_p", "top_k"]) expect(keys, `${thinking}`).not.toContain(k);
    }
  });

  it("asks for no thinking with thinking disabled, and for the lowest effort with effort low, and sends nothing about it by default", async () => {
    const send = async (thinking?: "default" | "off" | "low") => {
      const ai = fakeAi(message());
      await narrator(ai).narrate({ ...REQ, ...(thinking === undefined ? {} : { thinking }) });
      return ai.seen[0]!.input;
    };
    expect(await send()).not.toHaveProperty("thinking");
    expect(await send("default")).not.toHaveProperty("output_config");
    expect(await send("off")).toMatchObject({ thinking: { type: "disabled" } });
    expect(await send("off")).not.toHaveProperty("output_config");
    expect(await send("low")).toMatchObject({ output_config: { effort: "low" } });
    expect(await send("low")).not.toHaveProperty("thinking");
  });

  it("does not send a request that is out of bounds, and answers failed (not charged)", async () => {
    const bad: Array<[string, Record<string, unknown>]> = [
      ["empty user", { user: "  " }],
      ["no system text", { system: undefined }],
      ["no user text", { user: 7 }],
      ["too long", { user: "x".repeat(NARRATOR_PROMPT_MAX) }],
      ["no tokens", { maxTokens: 0 }],
      ["too many tokens", { maxTokens: NARRATOR_TOKENS_MAX + 1 }],
      ["half a token", { maxTokens: 10.5 }],
      ["unknown thinking mode", { thinking: "high" }],
    ];
    for (const [why, over] of bad) {
      const ai = fakeAi(message());
      const r = await narrator(ai).narrate({ ...REQ, ...over } as never);
      expect(r, why).toEqual({ ok: false, kind: "failed" });
      expect(ai.seen, why).toHaveLength(0);
    }
    const edge = fakeAi(message());
    expect((await narrator(edge).narrate({ ...REQ, user: "x".repeat(NARRATOR_PROMPT_MAX - REQ.system.length), maxTokens: NARRATOR_TOKENS_MAX })).ok).toBe(true);
  });

  it("waits 6 seconds by default and never more than 20", async () => {
    vi.useFakeTimers();
    const wait = (timeoutMs?: number) => {
      const ai = fakeAi(() => new Promise(() => undefined));
      return narrator(ai).narrate({ ...REQ, ...(timeoutMs === undefined ? {} : { timeoutMs }) });
    };
    let done: unknown = null;
    void wait().then((r) => { done = r; });
    await vi.advanceTimersByTimeAsync(5_999);
    expect(done).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toEqual({ ok: false, kind: "failed" });

    done = null;
    void wait(10 * 60_000).then((r) => { done = r; });
    await vi.advanceTimersByTimeAsync(19_999);
    expect(done).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toEqual({ ok: false, kind: "failed" });
  });
});

describe("the limits", () => {
  it("are the plan's: 6 s by default, 20 s at most, 1,024 tokens at most, 8,000 characters in, 4,000 out", () => {
    expect([NARRATOR_TIMEOUT_DEFAULT_MS, NARRATOR_TIMEOUT_MAX_MS, NARRATOR_TOKENS_MAX, NARRATOR_PROMPT_MAX, NARRATOR_REPLY_MAX]).toEqual([6_000, 20_000, 1_024, 8_000, 4_000]);
  });
});

describe("HaikuNarrator: what it reads", () => {
  it("reads the text, the stop reason, the tokens and the names of the answer's fields (nothing of what they hold)", async () => {
    const r = await narrator(fakeAi(message())).narrate(REQ);
    expect(r).toEqual({ ok: true, text: "The kettle is still warm.", stopReason: "end_turn", usage: { inputTokens: 612, outputTokens: 31 }, thinkingBlocks: 0, shape: ["content", "id", "model", "role", "stop_reason", "type", "usage"] });
  });

  it("joins the text blocks, leaves out the thinking blocks and counts them", async () => {
    const r = await narrator(fakeAi(message({ content: [{ type: "thinking", thinking: "", signature: "x" }, { type: "text", text: "One. " }, { type: "redacted_thinking", data: "x" }, { type: "text", text: "Two." }] }))).narrate(REQ);
    expect(r).toMatchObject({ ok: true, text: "One. Two.", thinkingBlocks: 2 });
  });

  it("reads an answer the platform wraps in `result`", async () => {
    const r = await narrator(fakeAi({ result: message(), success: true })).narrate(REQ);
    expect(r).toMatchObject({ ok: true, text: "The kettle is still warm.", usage: { inputTokens: 612, outputTokens: 31 }, shape: ["result", "success"] });
  });

  it("reads the chat shapes too, with no tokens known", async () => {
    for (const raw of [{ response: "A plain reply." }, { choices: [{ message: { content: "A plain reply." } }] }]) {
      expect(await narrator(fakeAi(raw)).narrate(REQ)).toMatchObject({ ok: true, text: "A plain reply.", stopReason: null, usage: { inputTokens: null, outputTokens: null } });
    }
  });

  it("hands back a reply cut short by the cap with its stop reason, so the caller can refuse it", async () => {
    expect(await narrator(fakeAi(message({ stop_reason: "max_tokens" }))).narrate(REQ)).toMatchObject({ ok: true, stopReason: "max_tokens" });
  });

  it("answers refused, with its tokens, when the model's safety check declines", async () => {
    const r = await narrator(fakeAi(message({ stop_reason: "refusal", content: [], usage: { input_tokens: 600, output_tokens: 0 } }))).narrate(REQ);
    expect(r).toEqual({ ok: false, kind: "refused", usage: { inputTokens: 600, outputTokens: 0 }, shape: expect.any(Array) });
    // a refusal wins over any text that came with it
    expect(await narrator(fakeAi(message({ stop_reason: "refusal" }))).narrate(REQ)).toMatchObject({ ok: false, kind: "refused" });
  });

  it("answers unusable when there is nothing readable: no text block, blank text, too much text, or no answer", async () => {
    const empty = [
      message({ content: [] }),
      message({ content: [{ type: "thinking", thinking: "" }] }),
      message({ content: [{ type: "text", text: "  \n " }] }),
      message({ content: [{ type: "text", text: "x".repeat(NARRATOR_REPLY_MAX + 1) }] }),
      message({ content: [{ type: "text" }, "nope", null] }),
      null, undefined, 42, [], {},
    ];
    for (const raw of empty) expect(await narrator(fakeAi(raw)).narrate(REQ), JSON.stringify(raw)?.slice(0, 60)).toMatchObject({ ok: false, kind: "unusable" });
    expect(await narrator(fakeAi(message({ content: [{ type: "text", text: "x".repeat(NARRATOR_REPLY_MAX) }] }))).narrate(REQ)).toMatchObject({ ok: true });
  });

  it("treats token counts it cannot trust as unknown", async () => {
    const r = await narrator(fakeAi(message({ usage: { input_tokens: "612", output_tokens: -1 } }))).narrate(REQ);
    expect(r).toMatchObject({ ok: true, usage: { inputTokens: null, outputTokens: null } });
    expect(await narrator(fakeAi(message({ usage: undefined }))).narrate(REQ)).toMatchObject({ ok: true, usage: { inputTokens: null, outputTokens: null } });
  });

  it("answers rate_limited when the service says it is busy, and failed for anything else, and charges neither", async () => {
    const busy = await narrator(fakeAi(new Error("429 Too Many Requests"))).narrate(REQ);
    expect(busy).toEqual({ ok: false, kind: "rate_limited" });
    const other = await narrator(fakeAi(new Error("402 payment required"))).narrate(REQ);
    expect(other).toEqual({ ok: false, kind: "failed" });
    expect(narrationWasCharged(busy)).toBe(false);
    expect(narrationWasCharged(other)).toBe(false);
  });

  it("charges what was answered, even unused or declined, and nothing else", () => {
    expect(narrationWasCharged({ ok: true, text: "x", stopReason: null, usage: { inputTokens: null, outputTokens: null }, thinkingBlocks: 0, shape: [] })).toBe(true);
    expect(narrationWasCharged({ ok: false, kind: "unusable" })).toBe(true);
    expect(narrationWasCharged({ ok: false, kind: "refused" })).toBe(true);
    expect(narrationWasCharged({ ok: false, kind: "failed" })).toBe(false);
    expect(narrationWasCharged({ ok: false, kind: "rate_limited" })).toBe(false);
  });
});

describe("generateNarration: the only door", () => {
  const maker = (): Narrator & { calls: number } => ({ calls: 0, async narrate() { this.calls += 1; return { ok: false, kind: "failed" }; } });

  it("calls the narrator with a Ticket for the llm meter", async () => {
    const m = maker();
    await generateNarration(m, TICKET, REQ);
    expect(m.calls).toBe(1);
  });

  it("does not call without a Ticket, or with one for another meter or one that is not a Ticket", () => {
    for (const ticket of [null, undefined, { ...TICKET, meter: "world" }, { ...TICKET, meter: "image" }, { ...TICKET, id: "" }, "t1"]) {
      const m = maker();
      expect(() => generateNarration(m, ticket as never, REQ)).toThrow(NoTicketError);
      expect(m.calls).toBe(0);
    }
  });
});

describe("the settings", () => {
  it("takes a blank model as the default and only an Anthropic Haiku id otherwise", () => {
    expect(narratorModelFromEnv(undefined)).toBe("anthropic/claude-haiku-5.5");
    expect(narratorModelFromEnv("  ")).toBe(DEFAULT_NARRATOR_MODEL);
    expect(narratorModelFromEnv(" anthropic/claude-haiku-4.5 ")).toBe("anthropic/claude-haiku-4.5");
    expect(narratorModelFromEnv("anthropic/claude-haiku-5")).toBe("anthropic/claude-haiku-5");
    for (const v of ["anthropic/claude-opus-5.5", "anthropic/claude-fable-5", "openai/gpt-5.5", "@cf/meta/llama-4-scout-17b-16e-instruct", "claude-haiku-5.5", "anthropic/claude-haiku-", "anthropic/claude-haiku-5.5/../x", "https://x.example/anthropic/claude-haiku-5.5"]) {
      expect(narratorModelFromEnv(v), v).toBeNull();
    }
  });

  it("has no default gateway: blank, or anything that is not a plain name, is null", () => {
    expect(gatewayIdFromEnv(undefined)).toBeNull();
    expect(gatewayIdFromEnv("")).toBeNull();
    expect(gatewayIdFromEnv("   ")).toBeNull();
    expect(gatewayIdFromEnv(" default ")).toBe("default");
    expect(gatewayIdFromEnv("my-gateway_2")).toBe("my-gateway_2");
    expect(gatewayIdFromEnv("a".repeat(63))).toBe("a".repeat(63));
    for (const v of ["a".repeat(64), "-lead", "has space", "slash/name", "https://x.example", "na\nme", "é"]) expect(gatewayIdFromEnv(v), v).toBeNull();
  });
});

describe("WorkersAiClient.narrator", () => {
  const ai = fakeAi(message());

  it("is off without a gateway, without the AI binding, or with a model it does not accept", () => {
    expect(new WorkersAiClient({ AI: ai }).narrator).toBeNull();
    expect(new WorkersAiClient({ AI: ai, AI_GATEWAY_ID: "" }).narrator).toBeNull();
    expect(new WorkersAiClient({ AI_GATEWAY_ID: "default" }).narrator).toBeNull();
    expect(new WorkersAiClient({ AI: ai, AI_GATEWAY_ID: "default", NARRATOR_MODEL_ID: "anthropic/claude-opus-5.5" }).narrator).toBeNull();
  });

  it("is on with the binding and a gateway, and leaves the other adapters as they were", async () => {
    const client = new WorkersAiClient({ AI: ai, AI_GATEWAY_ID: "default" });
    expect(client.narrator).not.toBeNull();
    expect([client.briefer, client.text, client.guard, client.imager].every((a) => a !== null)).toBe(true);
    await client.narrator!.narrate(REQ);
    expect(ai.seen.at(-1)!.model).toBe("anthropic/claude-haiku-5.5");
    expect(ai.seen.at(-1)!.options).toEqual({ gateway: { id: "default" } });
  });

  it("uses the model and the gateway it is given", async () => {
    const ai2 = fakeAi(message());
    await new WorkersAiClient({ AI: ai2, AI_GATEWAY_ID: "narrators", NARRATOR_MODEL_ID: "anthropic/claude-haiku-4.5" }).narrator!.narrate(REQ);
    expect(ai2.seen[0]!.model).toBe("anthropic/claude-haiku-4.5");
    expect(ai2.seen[0]!.options).toEqual({ gateway: { id: "narrators" } });
  });
});
