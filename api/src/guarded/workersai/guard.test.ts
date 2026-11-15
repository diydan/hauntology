import { describe, expect, it, vi } from "vitest";
import { GUARD_TEXT_MAX } from "@hauntology/shared/world/ai-answers";
import type { AiBinding } from "./call";
import { DEFAULT_GUARD_MODEL, LlamaGuardTextGuard, guardModelFromEnv, moderateText, type TextGuard } from "./guard";

type Seen = { model: string; input: Record<string, any> };
const fakeAi = (answer: unknown | (() => unknown | Promise<unknown>)): AiBinding & { seen: Seen[] } => {
  const seen: Seen[] = [];
  return {
    seen,
    async run(model, input) {
      seen.push({ model, input });
      const a = typeof answer === "function" ? await (answer as () => unknown)() : answer;
      if (a instanceof Error) throw a;
      return a;
    },
  };
};

describe("LlamaGuardTextGuard", () => {
  it("asks about the text as one message from a user, whole, with a short cold answer", async () => {
    const ai = fakeAi({ response: "safe", usage: { total_tokens: 30 } });
    const r = await new LlamaGuardTextGuard(ai).check("The Sparrow Inn");
    expect(r).toEqual({ ok: true, verdict: { kind: "safe" } });
    expect(ai.seen).toHaveLength(1);
    const { model, input } = ai.seen[0]!;
    expect(model).toBe("@cf/meta/llama-guard-3-8b");
    expect(model).toBe(DEFAULT_GUARD_MODEL);
    expect(input).toEqual({ messages: [{ role: "user", content: "The Sparrow Inn" }], max_tokens: 32, temperature: 0 });
  });

  it("sends the text exactly as given: nothing is trimmed, cut or added", async () => {
    const ai = fakeAi({ response: "safe" });
    const text = "  a line\nand another ​ ";
    await new LlamaGuardTextGuard(ai).check(text);
    expect(ai.seen[0]!.input.messages[0].content).toBe(text);
  });

  it("uses the model it is given", async () => {
    const ai = fakeAi({ response: "safe" });
    await new LlamaGuardTextGuard(ai, "@cf/meta/llama-guard-4-x").check("hi");
    expect(ai.seen[0]!.model).toBe("@cf/meta/llama-guard-4-x");
  });

  it("reads each kind of answer: safe, unsafe with its codes, and what it cannot read", async () => {
    const cases: [unknown, unknown][] = [
      [{ response: "unsafe\nS1,S10" }, { ok: true, verdict: { kind: "unsafe", categories: ["S1", "S10"] } }],
      [{ response: { safe: false, categories: ["S11"] } }, { ok: true, verdict: { kind: "unsafe", categories: ["S11"] } }],
      [{ response: { safe: true } }, { ok: true, verdict: { kind: "safe" } }],
      [{ response: "I cannot answer" }, { ok: true, verdict: { kind: "unusable" } }],
      [null, { ok: true, verdict: { kind: "unusable" } }],
      [undefined, { ok: true, verdict: { kind: "unusable" } }],
    ];
    for (const [answer, expected] of cases) expect(await new LlamaGuardTextGuard(fakeAi(() => answer)).check("hello"), JSON.stringify(answer)).toEqual(expected);
  });

  it("does not call the model for text that is empty or too long, and says failed (not charged)", async () => {
    const ai = fakeAi({ response: "safe" });
    const guard = new LlamaGuardTextGuard(ai);
    for (const text of ["", "   ", "\n\t", "x".repeat(GUARD_TEXT_MAX + 1), 5 as unknown as string, null as unknown as string]) {
      expect(await guard.check(text), String(text).slice(0, 12)).toEqual({ ok: false, kind: "failed" });
    }
    expect(ai.seen).toHaveLength(0);
    expect(await guard.check("x".repeat(GUARD_TEXT_MAX))).toEqual({ ok: true, verdict: { kind: "safe" } });
    expect(ai.seen).toHaveLength(1);
  });

  it("says failed when the binding throws, rate_limited when the service says it is busy, and failed on a timeout", async () => {
    expect(await new LlamaGuardTextGuard(fakeAi(new Error("AiError: 5006"))).check("hello")).toEqual({ ok: false, kind: "failed" });
    expect(await new LlamaGuardTextGuard(fakeAi(new Error("429 Too Many Requests"))).check("hello")).toEqual({ ok: false, kind: "rate_limited" });
    const slow = fakeAi(() => new Promise(() => undefined));
    expect(await new LlamaGuardTextGuard(slow, DEFAULT_GUARD_MODEL, { timeoutMs: 15 }).check("hello")).toEqual({ ok: false, kind: "failed" });
    expect(slow.seen).toHaveLength(1);
  });

  it("waits 8 seconds by default", async () => {
    vi.useFakeTimers();
    try {
      let outcome: unknown = "pending";
      void new LlamaGuardTextGuard(fakeAi(() => new Promise(() => undefined))).check("hello").then((r) => { outcome = r; });
      await vi.advanceTimersByTimeAsync(7999);
      expect(outcome).toBe("pending");
      await vi.advanceTimersByTimeAsync(1);
      expect(outcome).toEqual({ ok: false, kind: "failed" });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("moderateText (the guarded door)", () => {
  it("checks text only with a Ticket for the llm meter", async () => {
    const asked: string[] = [];
    const guard: TextGuard = { async check(text) { asked.push(text); return { ok: true, verdict: { kind: "safe" } }; } };
    const ticket = { id: "t-1", meter: "llm" as const, sessionId: "s", issuedAt: 1 };
    expect(await moderateText(guard, ticket, "hello")).toEqual({ ok: true, verdict: { kind: "safe" } });
    for (const bad of [{ ...ticket, meter: "image" }, { ...ticket, meter: "world" }, { ...ticket, id: "" }, null, undefined, "t", {}]) {
      expect(() => moderateText(guard, bad as never, "hello")).toThrow();
    }
    expect(asked).toEqual(["hello"]);
  });
});

describe("guardModelFromEnv", () => {
  it("is the default when blank, a catalog id when it is one, and null for anything else", () => {
    for (const v of [undefined, "", "  "]) expect(guardModelFromEnv(v)).toBe(DEFAULT_GUARD_MODEL);
    expect(guardModelFromEnv("@cf/meta/llama-guard-4")).toBe("@cf/meta/llama-guard-4");
    for (const v of ["llama-guard", "meta/llama-guard-3-8b", "https://x.example/@cf/a/b"]) expect(guardModelFromEnv(v), v).toBeNull();
  });
});
