import { describe, expect, it } from "vitest";
import { makeSketchPng } from "@hauntology/shared/world/upload-kit";
import type { AiBinding } from "./call";
import { WorkersAiClient } from "./client";
import type { ImagesBinding } from "./cutout";

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
type Seen = { model: string; input: Record<string, any> };
const fakeAi = (answer: unknown): AiBinding & { seen: Seen[] } => {
  const seen: Seen[] = [];
  return { seen, async run(model, input) { seen.push({ model, input }); return answer; } };
};
const images: ImagesBinding = { input: () => { throw new Error("not called"); } };

describe("WorkersAiClient", () => {
  it("has nothing without its bindings: no adapter, so no feature", () => {
    const c = new WorkersAiClient({});
    expect([c.briefer, c.text, c.guard, c.imager, c.cutter]).toEqual([null, null, null, null, null]);
  });

  it("builds the four model adapters from the AI binding alone, and the cut-out from the Images binding alone", () => {
    const withAi = new WorkersAiClient({ AI: fakeAi(null) });
    expect([withAi.briefer, withAi.text, withAi.guard, withAi.imager].every((a) => a !== null)).toBe(true);
    expect(withAi.cutter).toBeNull();
    const withImages = new WorkersAiClient({ IMAGES: images });
    expect([withImages.briefer, withImages.text, withImages.guard, withImages.imager]).toEqual([null, null, null, null]);
    expect(withImages.cutter).not.toBeNull();
  });

  it("sends each call to the model its own variable names, and the default when blank", async () => {
    const ai = fakeAi({ response: "safe" });
    const c = new WorkersAiClient({ AI: ai });
    await c.guard!.check("hello");
    await c.text!.generate({ system: "s", user: "u", maxTokens: 10 });
    await c.briefer!.brief({ image: Uint8Array.from([1, 2, 3]), contentType: "image/png" });
    ai.seen.length = 0;
    const ai2 = fakeAi({ image: b64(Uint8Array.from([1])) });
    await new WorkersAiClient({ AI: ai2 }).imager!.render({ sketch: Uint8Array.from([1]), prompt: "p", seed: 1, width: 64, height: 64 });
    expect(ai2.seen.map((s) => s.model)).toEqual(["@cf/black-forest-labs/flux-2-klein-9b"]);

    const ai3 = fakeAi({ response: "safe" });
    const set = new WorkersAiClient({ AI: ai3, GHOST_MODEL_ID: "@cf/meta/ghost-x", GUARD_MODEL_ID: "@cf/meta/guard-x", IMAGE_MODEL_ID: "@cf/acme/image-x" });
    await set.guard!.check("hello");
    await set.text!.generate({ system: "s", user: "u", maxTokens: 10 });
    await set.briefer!.brief({ image: Uint8Array.from([1, 2, 3]), contentType: "image/png" });
    await set.imager!.render({ sketch: Uint8Array.from([1]), prompt: "p", seed: 1, width: 64, height: 64 });
    expect(ai3.seen.map((s) => s.model)).toEqual(["@cf/meta/guard-x", "@cf/meta/ghost-x", "@cf/meta/ghost-x", "@cf/acme/image-x"]);

    const ai4 = fakeAi({ response: "safe" });
    const blank = new WorkersAiClient({ AI: ai4, GHOST_MODEL_ID: " ", GUARD_MODEL_ID: "", IMAGE_MODEL_ID: undefined as unknown as string });
    await blank.guard!.check("hello");
    await blank.text!.generate({ system: "s", user: "u", maxTokens: 10 });
    expect(ai4.seen.map((s) => s.model)).toEqual(["@cf/meta/llama-guard-3-8b", "@cf/meta/llama-4-scout-17b-16e-instruct"]);
  });

  it("turns off just the adapters whose model id it does not accept", () => {
    const ai = fakeAi(null);
    const badGhost = new WorkersAiClient({ AI: ai, GHOST_MODEL_ID: "scout" });
    expect([badGhost.briefer, badGhost.text]).toEqual([null, null]);
    expect(badGhost.guard).not.toBeNull();
    expect(badGhost.imager).not.toBeNull();
    const badGuard = new WorkersAiClient({ AI: ai, GUARD_MODEL_ID: "https://x.example/guard" });
    expect(badGuard.guard).toBeNull();
    expect([badGuard.briefer, badGuard.text, badGuard.imager].every((a) => a !== null)).toBe(true);
    const badImage = new WorkersAiClient({ AI: ai, IMAGE_MODEL_ID: "flux" });
    expect(badImage.imager).toBeNull();
    expect([badImage.briefer, badImage.text, badImage.guard].every((a) => a !== null)).toBe(true);
  });

  it("makes a cut-out adapter that calls the binding it is given", async () => {
    const png = await makeSketchPng(8, 8, () => true, true);
    const seen: string[] = [];
    const binding: ImagesBinding = {
      input() {
        const h = { transform: (t: Record<string, unknown>) => { seen.push(Object.keys(t)[0]!); return h; }, output: async () => ({ response: () => new Response(png as unknown as ArrayBuffer) }) };
        return h;
      },
    };
    const r = await new WorkersAiClient({ IMAGES: binding }).cutter!.cut({ image: Uint8Array.from([1, 2]), contentType: "image/png" });
    expect(r).toEqual({ ok: true, image: png });
    expect(seen).toEqual(["segment"]);
  });
});
