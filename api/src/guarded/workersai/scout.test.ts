import { describe, expect, it, vi } from "vitest";
import { PLACE_BRIEF_SCHEMA, PLACE_BRIEF_SYSTEM } from "@hauntology/shared/world/brief";
import { DEFAULT_SCOUT_MODEL, ScoutPlaceBriefer, scoutModelFromEnv, type AiBinding } from "./scout";

const PHOTO = { image: Uint8Array.from([1, 2, 3, 250, 251]), contentType: "image/jpeg" };

type Call = { model: string; input: Record<string, any> };
const fakeAi = (answer: unknown | (() => unknown | Promise<unknown>)): AiBinding & { calls: Call[] } => {
  const calls: Call[] = [];
  return {
    calls,
    async run(model, input) {
      calls.push({ model, input });
      const a = typeof answer === "function" ? await (answer as () => unknown)() : answer;
      if (a instanceof Error) throw a;
      return a;
    },
  };
};

describe("ScoutPlaceBriefer", () => {
  it("asks the model for JSON about the picture, sent inline, with the prompt that says words in the picture are not orders", async () => {
    const ai = fakeAi({ response: JSON.stringify({ brief: "A kitchen with a blue door.", safe: true }), usage: { total_tokens: 100 } });
    const r = await new ScoutPlaceBriefer(ai).brief(PHOTO);
    expect(r).toEqual({ ok: true, verdict: { kind: "safe", brief: "A kitchen with a blue door." } });
    expect(ai.calls).toHaveLength(1);
    const { model, input } = ai.calls[0]!;
    expect(model).toBe(DEFAULT_SCOUT_MODEL);
    expect(model).toBe("@cf/meta/llama-4-scout-17b-16e-instruct");
    expect(input.messages[0]).toEqual({ role: "system", content: PLACE_BRIEF_SYSTEM });
    const user = input.messages[1];
    expect(user.role).toBe("user");
    expect(user.content[0]).toEqual({ type: "text", text: "Describe this photograph of a place." });
    expect(user.content[1]).toEqual({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${btoa(String.fromCharCode(1, 2, 3, 250, 251))}` } });
    expect(input.response_format).toEqual({ type: "json_schema", json_schema: PLACE_BRIEF_SCHEMA });
    expect(input.max_tokens).toBeLessThanOrEqual(250);
    expect(input.temperature).toBeLessThanOrEqual(0.3);
    // Nothing about the visitor goes: the only user content is the fixed sentence and the picture.
    expect(Object.keys(input).sort()).toEqual(["max_tokens", "messages", "response_format", "temperature"]);
  });

  it("reads every shape of answer the model may give, and fails closed on the rest", async () => {
    const cases: [unknown, unknown][] = [
      [{ response: { brief: "A garden.", safe: true } }, { ok: true, verdict: { kind: "safe", brief: "A garden." } }],
      [{ response: "```json\n{\"brief\":\"A garden.\",\"safe\":true}\n```" }, { ok: true, verdict: { kind: "safe", brief: "A garden." } }],
      [{ response: '{"brief":"x","safe":false}' }, { ok: true, verdict: { kind: "unsafe" } }],
      [{ response: "I can't help with that." }, { ok: true, verdict: { kind: "unusable" } }],
      [{ response: '{"brief":"A garden.","safe":"true"}' }, { ok: true, verdict: { kind: "unusable" } }],
      [null, { ok: true, verdict: { kind: "unusable" } }],
      [undefined, { ok: true, verdict: { kind: "unusable" } }],
    ];
    for (const [answer, expected] of cases) expect(await new ScoutPlaceBriefer(fakeAi(() => answer)).brief(PHOTO), JSON.stringify(answer)).toEqual(expected);
  });

  it("says the call failed when the binding throws, and when it takes longer than the timeout", async () => {
    expect(await new ScoutPlaceBriefer(fakeAi(new Error("AiError: 5006 image too large"))).brief(PHOTO)).toEqual({ ok: false });
    const slow = fakeAi(() => new Promise(() => undefined));
    expect(await new ScoutPlaceBriefer(slow, DEFAULT_SCOUT_MODEL, { timeoutMs: 15 }).brief(PHOTO)).toEqual({ ok: false });
    expect(slow.calls).toHaveLength(1);
  });

  it("gives up on a call that takes more than 20 seconds, and not before", async () => {
    vi.useFakeTimers();
    try {
      const ai = fakeAi(() => new Promise(() => undefined));
      let result: unknown = "pending";
      void new ScoutPlaceBriefer(ai).brief(PHOTO).then((r) => (result = r));
      await vi.advanceTimersByTimeAsync(19_999);
      expect(result).toBe("pending");
      await vi.advanceTimersByTimeAsync(2);
      expect(result).toEqual({ ok: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not put the picture or the error in anything it returns", async () => {
    const r = await new ScoutPlaceBriefer(fakeAi(new Error(`failed with data:image/jpeg;base64,AAAA secret`))).brief(PHOTO);
    expect(JSON.stringify(r)).not.toMatch(/secret|base64|AAAA/);
  });

  it("calls nothing for a type the model is not given, or an empty picture", async () => {
    const ai = fakeAi({ response: "{}" });
    for (const contentType of ["image/gif", "application/octet-stream", "", "image/svg+xml"]) expect(await new ScoutPlaceBriefer(ai).brief({ ...PHOTO, contentType })).toEqual({ ok: false });
    expect(await new ScoutPlaceBriefer(ai).brief({ ...PHOTO, image: new Uint8Array(0) })).toEqual({ ok: false });
    expect(ai.calls).toHaveLength(0);
  });

  it("sends a picture larger than one chunk of the encoder byte for byte, and uses the model it is given", async () => {
    const image = Uint8Array.from({ length: 100_003 }, (_, i) => (i * 31) % 256);
    const ai = fakeAi({ response: '{"brief":"A room.","safe":true}' });
    await new ScoutPlaceBriefer(ai, "@cf/meta/other-model").brief({ image, contentType: "image/png" });
    expect(ai.calls[0]!.model).toBe("@cf/meta/other-model");
    const url = ai.calls[0]!.input.messages[1].content[1].image_url.url as string;
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    const sent = atob(url.slice("data:image/png;base64,".length));
    expect(Uint8Array.from(sent, (c) => c.charCodeAt(0))).toEqual(image);
  });
});

describe("scoutModelFromEnv", () => {
  it("is the default when blank, a catalog id when it is one, and null for anything else", () => {
    for (const v of [undefined, "", "  "]) expect(scoutModelFromEnv(v)).toBe(DEFAULT_SCOUT_MODEL);
    expect(scoutModelFromEnv(" @cf/meta/llama-4-scout-17b-16e-instruct ")).toBe("@cf/meta/llama-4-scout-17b-16e-instruct");
    expect(scoutModelFromEnv("@cf/google/gemma-4-26b-a4b-it")).toBe("@cf/google/gemma-4-26b-a4b-it");
    for (const v of ["llama", "meta/llama", "@cf/meta", "@cf/meta/", "@cf/a/b/c", "https://evil.example/@cf/a/b", "@cf/meta/x y", "@cf//x"]) expect(scoutModelFromEnv(v), v).toBeNull();
  });
});
