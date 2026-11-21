import { makePng } from "@hauntology/shared/world/upload-kit";
import { describe, expect, it } from "vitest";
import { WorkersAiClient } from "../guarded/workersai/client";
import type { AiBinding } from "../guarded/workersai/call";
import { DEFAULT_CAPS, MemorySpendGuard } from "../worlds/fakes";
import { buildSpikeCases, renderSpikeReport, runAiSpike, type SpikeInputs } from "./ai-spike";

const PNG = makePng({ width: 512, height: 512 });
const b64 = (b: Uint8Array) => { let s = ""; for (const c of b) s += String.fromCharCode(c); return btoa(s); };

/** A stand-in for `env.AI` that answers in the shapes the pages document, by model, and can be told to fail for a model. */
function fakeAi(opts: { failModel?: RegExp; throwOnCall?: number; guardUnsafe?: RegExp } = {}): AiBinding & { models: string[] } {
  const models: string[] = [];
  return {
    models,
    async run(model, input) {
      models.push(model);
      if (opts.throwOnCall === models.length) throw new Error("boom");
      if (opts.failModel?.test(model)) throw new Error("model down");
      if (model.includes("llama-guard")) {
        const text = JSON.stringify(input);
        return { response: opts.guardUnsafe?.test(text) ? "unsafe\nS1" : "safe" };
      }
      if (model.includes("llama-4-scout")) {
        const text = JSON.stringify(input);
        return text.includes("response_format") || text.includes("image_url") ? { response: JSON.stringify({ brief: "A small kitchen with a blue door.", safe: true }) } : { response: "It is cold in here." };
      }
      return { image: b64(PNG) };
    },
  };
}

const inputs = (): SpikeInputs => ({
  photos: [{ id: "photo-1", bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" }, { id: "photo-2", bytes: new Uint8Array([4, 5, 6]), contentType: "image/jpeg" }],
  sketches: [{ id: "sketch-1", bytes: PNG, prompt: "SECRET-SKETCH-PROMPT" }],
  ghostPrompts: [{ id: "ghost-1", system: "SECRET-SYSTEM", user: "SECRET-USER" }],
  guardTexts: [{ id: "guard-1", text: "Mr. Whiskers", expect: "safe" }, { id: "guard-2", text: "BADWORD", expect: "unsafe" }],
  portraits: [{ id: "portrait-1", prompt: "SECRET-PORTRAIT", negativePrompt: "none" }],
});

const clock = () => { let t = 0; return () => (t += 10); };

describe("the Workers AI spike runner, over a fake binding (Spike 1.2 rehearsal)", () => {
  it("makes each planned call once through its guarded door, in order, and records outcomes without content", async () => {
    const ai = fakeAi({ guardUnsafe: /BADWORD/ });
    const guard = new MemorySpendGuard();
    const cases = buildSpikeCases(new WorkersAiClient({ AI: ai }), inputs());
    expect(cases.map((c) => c.kind)).toEqual(["brief", "brief", "text", "guard", "guard", "sketch", "portrait"]);
    const report = await runAiSpike({ cases, guard, now: () => Date.now(), clock: clock(), maxCalls: 20 });
    expect(report.stoppedBy).toBe("done");
    expect(report.calls).toBe(7);
    expect(ai.models).toHaveLength(7);
    expect(report.rows.every((r) => r.ok && r.charged)).toBe(true);
    expect(report.rows.find((r) => r.id === "guard-2")!.note).toBe("expected unsafe, got unsafe S1");
    expect(report.rows.find((r) => r.id === "guard-1")!.note).toBe("expected safe, got safe");
    const text = JSON.stringify(report) + renderSpikeReport(report);
    for (const secret of ["SECRET-SKETCH-PROMPT", "SECRET-SYSTEM", "SECRET-USER", "SECRET-PORTRAIT", "Whiskers", "BADWORD", "blue door", "cold in here"]) expect(text).not.toContain(secret);
    // Units used: llm calls 5 (2 briefs, 1 text, 2 guards), image calls 2.
    const left = await guard.remaining("ai-spike", "ai-spike");
    expect(DEFAULT_CAPS.llm.session - left.llm).toBe(5);
    expect(DEFAULT_CAPS.image.session - left.image).toBe(2);
  });

  it("marks a guard verdict that differs from the expectation", async () => {
    const report = await runAiSpike({ cases: buildSpikeCases(new WorkersAiClient({ AI: fakeAi({ guardUnsafe: /Whiskers/ }) }), inputs()), guard: new MemorySpendGuard(), now: () => Date.now(), clock: clock(), maxCalls: 20 });
    expect(report.rows.find((r) => r.id === "guard-1")!.note).toMatch(/differs/);
    expect(renderSpikeReport(report)).toMatch(/guard-1: expected safe, got unsafe S1  <-- differs/);
  });

  it("stops after three failures in a row, gives each unit back, and makes no further call", async () => {
    const ai = fakeAi({ failModel: /./ });
    const guard = new MemorySpendGuard();
    const report = await runAiSpike({ cases: buildSpikeCases(new WorkersAiClient({ AI: ai }), inputs()), guard, now: () => Date.now(), clock: clock(), maxCalls: 20 });
    expect(report.stoppedBy).toBe("failures");
    expect(report.calls).toBe(3);
    expect(ai.models).toHaveLength(3);
    expect(report.rows.every((r) => !r.ok && !r.charged)).toBe(true);
    expect((await guard.remaining("ai-spike", "ai-spike")).llm).toBe(DEFAULT_CAPS.llm.session);
  });

  it("stops at the call cap, and when the meter says no", async () => {
    const guardCapped = new MemorySpendGuard({ ...DEFAULT_CAPS, image: { session: 1, day: 150 } });
    const capped = await runAiSpike({ cases: buildSpikeCases(new WorkersAiClient({ AI: fakeAi() }), inputs()), guard: new MemorySpendGuard(), now: () => Date.now(), clock: clock(), maxCalls: 3 });
    expect(capped).toMatchObject({ stoppedBy: "cap", calls: 3 });
    const denied = await runAiSpike({ cases: buildSpikeCases(new WorkersAiClient({ AI: fakeAi() }), inputs()), guard: guardCapped, now: () => Date.now(), clock: clock(), maxCalls: 20 });
    expect(denied.stoppedBy).toBe("denied");
    expect(denied.rows.map((r) => r.kind)).toEqual(["brief", "brief", "text", "guard", "guard", "sketch"]);
  });

  it("an adapter that is missing is a failed row, not a call, and a case that throws stops the run and gives its unit back", async () => {
    const noAi = buildSpikeCases(new WorkersAiClient({}), inputs());
    const missing = await runAiSpike({ cases: noAi, guard: new MemorySpendGuard(), now: () => Date.now(), clock: clock(), maxCalls: 20 });
    expect(missing.rows.every((r) => r.failure === "adapter_missing")).toBe(true);
    expect(missing.stoppedBy).toBe("failures");
    const guard = new MemorySpendGuard();
    const cases = [{ id: "x", kind: "guard" as const, run: async () => { throw new TypeError("nope"); } }];
    const threw = await runAiSpike({ cases, guard, now: () => Date.now(), clock: clock(), maxCalls: 5 });
    expect(threw).toMatchObject({ stoppedBy: "threw", calls: 1 });
    expect(threw.rows[0]).toMatchObject({ ok: false, failure: "TypeError", charged: false });
    expect((await guard.remaining("ai-spike", "ai-spike")).llm).toBe(DEFAULT_CAPS.llm.session);
  });

  it("a call with no Ticket never reaches the model (the guarded door refuses it)", async () => {
    const ai = fakeAi();
    const [first] = buildSpikeCases(new WorkersAiClient({ AI: ai }), inputs());
    await expect(first!.run(null as never)).rejects.toThrow(/Ticket/);
    expect(ai.models).toHaveLength(0);
  });
});
