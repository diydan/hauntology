import { describe, expect, it, vi } from "vitest";
import type { AiBinding } from "./call";
import { ScoutTextMaker, TEXT_PROMPT_MAX, TEXT_TIMEOUT_DEFAULT_MS, TEXT_TIMEOUT_MAX_MS, TEXT_TOKENS_MAX, generateText, type TextMaker } from "./text";

const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const REQ = { system: "You are the ghost of a kitchen.", user: "Say one line.", maxTokens: 120 };

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

describe("ScoutTextMaker", () => {
  it("sends a system and a user message with the token cap and temperature, to the model it is given, and nothing else", async () => {
    const ai = fakeAi({ response: "The kettle is still warm.", usage: {} });
    const r = await new ScoutTextMaker(ai, MODEL).generate({ ...REQ, temperature: 0.4 });
    expect(r).toEqual({ ok: true, text: "The kettle is still warm." });
    expect(ai.seen).toHaveLength(1);
    expect(ai.seen[0]!.model).toBe(MODEL);
    expect(ai.seen[0]!.input).toEqual({ messages: [{ role: "system", content: REQ.system }, { role: "user", content: REQ.user }], max_tokens: 120, temperature: 0.4 });
  });

  it("uses 0.7 when no temperature is given, and keeps a given one within 0 to 1.5", async () => {
    const run = async (temperature?: number) => {
      const ai = fakeAi({ response: "ok" });
      await new ScoutTextMaker(ai, MODEL).generate({ ...REQ, ...(temperature === undefined ? {} : { temperature }) });
      return ai.seen[0]!.input.temperature;
    };
    expect(await run()).toBe(0.7);
    expect(await run(0)).toBe(0);
    expect(await run(1.5)).toBe(1.5);
    expect(await run(9)).toBe(1.5);
    expect(await run(-3)).toBe(0);
  });

  it("reads the shapes the platform may answer with", async () => {
    const cases: [unknown, string][] = [
      ["  plain text ", "plain text"],
      [{ response: "from response" }, "from response"],
      [{ choices: [{ message: { content: "from choices" } }] }, "from choices"],
    ];
    for (const [answer, text] of cases) expect(await new ScoutTextMaker(fakeAi(() => answer), MODEL).generate(REQ)).toEqual({ ok: true, text });
  });

  it("says unusable (charged) when the model answered with nothing readable", async () => {
    for (const answer of [null, undefined, {}, { response: "" }, { response: "   " }, { response: { json: true } }, { response: "x".repeat(4001) }, 5]) {
      const r = await new ScoutTextMaker(fakeAi(() => answer), MODEL).generate(REQ);
      expect(r, JSON.stringify(answer)?.slice(0, 40)).toEqual({ ok: false, kind: "unusable" });
    }
  });

  it("says failed or rate_limited (not charged) when the call throws, and failed on a timeout", async () => {
    expect(await new ScoutTextMaker(fakeAi(new Error("AiError: 3016")), MODEL).generate(REQ)).toEqual({ ok: false, kind: "failed" });
    expect(await new ScoutTextMaker(fakeAi(new Error("Too many requests")), MODEL).generate(REQ)).toEqual({ ok: false, kind: "rate_limited" });
    const slow = fakeAi(() => new Promise(() => undefined));
    expect(await new ScoutTextMaker(slow, MODEL).generate({ ...REQ, timeoutMs: 15 })).toEqual({ ok: false, kind: "failed" });
    expect(slow.seen).toHaveLength(1);
  });

  it("does not call the model for a request out of bounds, and says failed", async () => {
    const ai = fakeAi({ response: "ok" });
    const maker = new ScoutTextMaker(ai, MODEL);
    const bad = [
      { ...REQ, user: "" },
      { ...REQ, user: "  \n" },
      { ...REQ, system: undefined as unknown as string },
      { ...REQ, user: 4 as unknown as string },
      { ...REQ, maxTokens: 0 },
      { ...REQ, maxTokens: -1 },
      { ...REQ, maxTokens: 1.5 },
      { ...REQ, maxTokens: TEXT_TOKENS_MAX + 1 },
      { ...REQ, maxTokens: Number.NaN },
      { ...REQ, system: "s".repeat(TEXT_PROMPT_MAX), user: "u" },
      { ...REQ, system: "", user: "u".repeat(TEXT_PROMPT_MAX + 1) },
    ];
    for (const req of bad) expect(await maker.generate(req), JSON.stringify(req).slice(0, 50)).toEqual({ ok: false, kind: "failed" });
    expect(ai.seen).toHaveLength(0);
    expect(await maker.generate({ ...REQ, maxTokens: 1 })).toEqual({ ok: true, text: "ok" });
    expect(await maker.generate({ ...REQ, maxTokens: TEXT_TOKENS_MAX })).toEqual({ ok: true, text: "ok" });
    expect(await maker.generate({ ...REQ, system: "s".repeat(TEXT_PROMPT_MAX - 1), user: "u" })).toEqual({ ok: true, text: "ok" });
    expect(ai.seen).toHaveLength(3);
  });

  it("states its limits", () => {
    expect(TEXT_PROMPT_MAX).toBe(16_000);
    expect(TEXT_TOKENS_MAX).toBe(400);
  });

  it("waits 6 seconds by default, as long as asked, and never more than 20", async () => {
    const waited = async (timeoutMs?: number, probe = 0): Promise<unknown> => {
      vi.useFakeTimers();
      try {
        let outcome: unknown = "pending";
        const req = timeoutMs === undefined ? REQ : { ...REQ, timeoutMs };
        void new ScoutTextMaker(fakeAi(() => new Promise(() => undefined)), MODEL).generate(req).then((r) => { outcome = r; });
        await vi.advanceTimersByTimeAsync(probe);
        return outcome;
      } finally {
        vi.useRealTimers();
      }
    };
    expect(TEXT_TIMEOUT_DEFAULT_MS).toBe(6000);
    expect(TEXT_TIMEOUT_MAX_MS).toBe(20000);
    expect(await waited(undefined, 5999)).toBe("pending");
    expect(await waited(undefined, 6000)).toEqual({ ok: false, kind: "failed" });
    expect(await waited(2000, 1999)).toBe("pending");
    expect(await waited(2000, 2000)).toEqual({ ok: false, kind: "failed" });
    expect(await waited(60_000, 19_999)).toBe("pending");
    expect(await waited(60_000, 20_000)).toEqual({ ok: false, kind: "failed" });
  });
});

describe("generateText (the guarded door)", () => {
  it("writes text only with a Ticket for the llm meter", async () => {
    const asked: string[] = [];
    const maker: TextMaker = { async generate(req) { asked.push(req.user); return { ok: true, text: "hi" }; } };
    const ticket = { id: "t-1", meter: "llm" as const, sessionId: "s", issuedAt: 1 };
    expect(await generateText(maker, ticket, REQ)).toEqual({ ok: true, text: "hi" });
    for (const bad of [{ ...ticket, meter: "image" }, { ...ticket, meter: "world" }, { ...ticket, id: "" }, null, undefined, "t", {}]) {
      expect(() => generateText(maker, bad as never, REQ)).toThrow();
    }
    expect(asked).toEqual([REQ.user]);
  });
});
