import { describe, expect, it } from "vitest";
import type { AiBinding } from "../guarded/workersai/call";
import { DEFAULT_CAPS, MemorySpendGuard } from "../worlds/fakes";
import { SPIKE_SESSION, narratorSpike } from "./narrator-spike";

const TOKEN = "0123456789abcdef-token";
const MODEL = "anthropic/claude-haiku-5.5";
const message = () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "The kettle is still warm." }], usage: { input_tokens: 600, output_tokens: 30 } });

type Seen = { model: string; input: Record<string, unknown>; options: unknown };
const setup = (over: { ai?: AiBinding | undefined; modelId?: string | null; gatewayId?: string | null; token?: string; cap?: number; answer?: () => unknown } = {}) => {
  const seen: Seen[] = [];
  const ai: AiBinding = { async run(model, input, options) { seen.push({ model, input, options }); const a = (over.answer ?? message)(); if (a instanceof Error) throw a; return a; } };
  // the guard and the Worker read the same fixed clock, as a reservation, its commit and its expiry must
  const guard = new MemorySpendGuard({ ...DEFAULT_CAPS, llm: { session: over.cap ?? 3, day: 100 } }, () => 1_000);
  const handle = narratorSpike({
    token: over.token ?? TOKEN,
    ai: "ai" in over ? over.ai : ai,
    modelId: "modelId" in over ? (over.modelId as string | null) : MODEL,
    gatewayId: "gatewayId" in over ? (over.gatewayId as string | null) : "default",
    guard,
    now: () => 1_000,
  });
  const call = (path: string, init: { method?: string; token?: string | null; body?: unknown; raw?: string } = {}) =>
    handle(new Request(`http://127.0.0.1:8799${path}`, {
      method: init.method ?? "POST",
      headers: { ...(init.token === null ? {} : { "x-spike-token": init.token ?? TOKEN }), "content-type": "application/json" },
      ...(init.raw !== undefined ? { body: init.raw } : init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    }));
  return { seen, guard, call };
};
const REQ = { system: "You are the ghost of a kitchen.", user: "The visitor says nothing.", maxTokens: 220 };

describe("the narrator spike Worker", () => {
  it("answers nothing without the token, and never calls the model or the guard", async () => {
    const { call, seen, guard } = setup();
    for (const token of [null, "", "wrong-token-wrong-token", TOKEN.slice(0, -1), `${TOKEN}x`]) {
      const r = await call("/narrate", { token, body: REQ });
      expect(r.status, `${token}`).toBe(401);
      expect((await call("/status", { method: "GET", token })).status).toBe(401);
    }
    expect(seen).toHaveLength(0);
    expect(guard.reserveCalls).toHaveLength(0);
  });

  it("refuses to run with a token shorter than 16 characters, even a matching one", async () => {
    const { call, seen } = setup({ token: "short" });
    expect((await call("/narrate", { token: "short", body: REQ })).status).toBe(500);
    expect(seen).toHaveLength(0);
  });

  it("reports whether it is ready and how many calls are left, spending nothing", async () => {
    const { call, seen, guard } = setup({ cap: 5 });
    const r = await call("/status", { method: "GET" });
    expect(await r.json()).toEqual({ ready: true, model: MODEL, gateway: "default", remaining: 5 });
    expect(seen).toHaveLength(0);
    expect(guard.reserveCalls).toHaveLength(0);
    for (const [over, ready] of [[{ ai: undefined }, false], [{ modelId: null }, false], [{ gatewayId: null }, false]] as const) {
      const s = await (await setup(over).call("/status", { method: "GET" })).json();
      expect((s as { ready: boolean }).ready, JSON.stringify(Object.keys(over))).toBe(ready);
    }
  });

  it("makes one narrator call through the gateway, gives back the answer, and keeps the unit as used", async () => {
    const { call, seen, guard } = setup();
    const r = await call("/narrate", { body: { ...REQ, thinking: "off" } });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { answer: { ok: boolean; text: string }; charged: boolean; ms: number };
    expect(body.answer).toMatchObject({ ok: true, text: "The kettle is still warm." });
    expect(body.charged).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.model).toBe(MODEL);
    expect(seen[0]!.options).toEqual({ gateway: { id: "default" } });
    expect(seen[0]!.input).toMatchObject({ max_tokens: 220, thinking: { type: "disabled" } });
    expect(guard.usedOn("llm", SPIKE_SESSION)).toBe(1);
  });

  it("gives the unit back when the call failed, and keeps it when the model answered with nothing usable or declined", async () => {
    const failed = setup({ answer: () => new Error("402 payment required") });
    const f = (await (await failed.call("/narrate", { body: REQ })).json()) as { answer: { kind: string }; charged: boolean };
    expect(f).toMatchObject({ answer: { ok: false, kind: "failed" }, charged: false });
    expect(failed.guard.usedOn("llm", SPIKE_SESSION)).toBe(0);

    const refused = setup({ answer: () => ({ stop_reason: "refusal", content: [], usage: { input_tokens: 600, output_tokens: 0 } }) });
    expect(await (await refused.call("/narrate", { body: REQ })).json()).toMatchObject({ answer: { kind: "refused" }, charged: true });
    expect(refused.guard.usedOn("llm", SPIKE_SESSION)).toBe(1);

    const blank = setup({ answer: () => ({ content: [] }) });
    expect(await (await blank.call("/narrate", { body: REQ })).json()).toMatchObject({ answer: { kind: "unusable" }, charged: true });
  });

  it("stops at the cap: the next call is refused with 429, and the model is not called", async () => {
    const { call, seen } = setup({ cap: 3 });
    for (let i = 0; i < 3; i += 1) expect((await call("/narrate", { body: REQ })).status).toBe(200);
    const over = await call("/narrate", { body: REQ });
    expect(over.status).toBe(429);
    expect(await over.json()).toEqual({ denied: "session" });
    expect(seen).toHaveLength(3);
  });

  it("takes only the five fields: a temperature, or anything else, is a 400 before any unit is taken", async () => {
    const { call, seen, guard } = setup();
    for (const extra of [{ temperature: 0.8 }, { top_p: 1 }, { model: "anthropic/claude-opus-5.5" }, { messages: [] }, { gateway: "x" }, { stream: true }]) {
      const r = await call("/narrate", { body: { ...REQ, ...extra } });
      expect(r.status, JSON.stringify(extra)).toBe(400);
    }
    expect(seen).toHaveLength(0);
    expect(guard.reserveCalls).toHaveLength(0);
  });

  it("refuses a body that does not fit, before any unit is taken", async () => {
    const { call, seen, guard } = setup();
    const bad: Array<{ raw?: string; body?: unknown }> = [
      { raw: "not json" }, { raw: "[]" }, { raw: "null" }, { body: {} },
      { body: { ...REQ, system: 1 } }, { body: { ...REQ, user: undefined } }, { body: { ...REQ, maxTokens: "220" } },
      { body: { ...REQ, thinking: "high" } }, { body: { ...REQ, timeoutMs: "6000" } },
    ];
    for (const b of bad) expect((await call("/narrate", b)).status, JSON.stringify(b)).toBe(400);
    expect(seen).toHaveLength(0);
    expect(guard.reserveCalls).toHaveLength(0);
  });

  it("is off, with a 503 and no unit taken, when the binding, the model or the gateway is missing", async () => {
    for (const over of [{ ai: undefined }, { modelId: null }, { gatewayId: null }]) {
      const { call, seen, guard } = setup(over);
      expect((await call("/narrate", { body: REQ })).status, JSON.stringify(Object.keys(over))).toBe(503);
      expect(seen).toHaveLength(0);
      expect(guard.reserveCalls).toHaveLength(0);
    }
  });

  it("knows only two addresses, and the right method for each", async () => {
    const { call } = setup();
    expect((await call("/other", { method: "GET" })).status).toBe(404);
    expect((await call("/narrate", { method: "GET" })).status).toBe(405);
    expect((await call("/status", { method: "POST", body: {} })).status).toBe(405);
  });
});
