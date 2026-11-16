import { describe, expect, it, vi } from "vitest";
import { DEFAULT_IMAGE_MODEL, FluxImageMaker, renderCandidate } from "./image";
import { catalogModelFromEnv } from "./model";
import type { AiBinding } from "./scout";
import { FakeImager } from "../../worlds/fakes";

const SKETCH = Uint8Array.from([137, 80, 78, 71, 1, 2, 3, 250, 251]);
const REQ = { sketch: SKETCH, prompt: "Turn the sketch into a photograph.", seed: 424242, width: 1024, height: 768 };
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

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

describe("FluxImageMaker", () => {
  it("sends the form the model page documents: prompt, the sketch as input_image_0, width, height and seed, and nothing else", async () => {
    const picture = Uint8Array.from([255, 216, 255, 9, 9, 9]);
    const ai = fakeAi({ image: b64(picture) });
    const r = await new FluxImageMaker(ai).render(REQ);
    expect(r).toEqual({ ok: true, image: picture });
    expect(ai.seen).toHaveLength(1);
    const { model, input } = ai.seen[0]!;
    expect(model).toBe("@cf/black-forest-labs/flux-2-klein-9b");
    expect(model).toBe(DEFAULT_IMAGE_MODEL);
    expect(Object.keys(input)).toEqual(["multipart"]);
    expect(input.multipart.contentType).toMatch(/^multipart\/form-data; boundary=/);
    // Read the stream back as the service would.
    const form = await new Response(input.multipart.body, { headers: { "Content-Type": input.multipart.contentType } }).formData();
    expect([...form.keys()].sort()).toEqual(["height", "input_image_0", "prompt", "seed", "width"]);
    expect(form.get("prompt")).toBe(REQ.prompt);
    expect(form.get("width")).toBe("1024");
    expect(form.get("height")).toBe("768");
    expect(form.get("seed")).toBe("424242");
    const file = form.get("input_image_0") as unknown as File;
    expect(file.type).toBe("image/png");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(SKETCH);
  });

  it("uses the model it is given", async () => {
    const ai = fakeAi({ image: b64(Uint8Array.from([1])) });
    await new FluxImageMaker(ai, "@cf/black-forest-labs/flux-2-dev").render(REQ);
    expect(ai.seen[0]!.model).toBe("@cf/black-forest-labs/flux-2-dev");
  });

  it("is a failure, not a picture, for an answer with no usable image", async () => {
    for (const answer of [{}, { image: "" }, { image: 5 }, { image: "not base64 !!" }, { image: "QUJD=" }, null, undefined, "image", [], { picture: b64(Uint8Array.from([1])) }]) {
      expect(await new FluxImageMaker(fakeAi(() => answer)).render(REQ), JSON.stringify(answer)).toEqual({ ok: false, kind: "failed" });
    }
  });

  it("tells a busy or limited service from any other failure, by what the error says", async () => {
    for (const message of ["AiError: 429 Too Many Requests", "3040: Capacity temporarily exceeded, please try again", "Rate limit reached", "the service is busy", "overloaded", "Rate-limited"]) {
      expect(await new FluxImageMaker(fakeAi(new Error(message))).render(REQ), message).toEqual({ ok: false, kind: "rate_limited" });
    }
    for (const message of ["5006: input image too large", "boom", "", "timeout"]) {
      expect(await new FluxImageMaker(fakeAi(new Error(message))).render(REQ), message).toEqual({ ok: false, kind: "failed" });
    }
    expect(await new FluxImageMaker(fakeAi(() => Promise.reject("a string"))).render(REQ)).toEqual({ ok: false, kind: "failed" });
  });

  it("gives up on a call that takes more than a minute, and not before", async () => {
    vi.useFakeTimers();
    try {
      const ai = fakeAi(() => new Promise(() => undefined));
      let result: unknown = "pending";
      void new FluxImageMaker(ai).render(REQ).then((r) => (result = r));
      await vi.advanceTimersByTimeAsync(59_999);
      expect(result).toBe("pending");
      await vi.advanceTimersByTimeAsync(2);
      expect(result).toEqual({ ok: false, kind: "failed" });
      const quick = new FluxImageMaker(fakeAi(() => new Promise(() => undefined)), DEFAULT_IMAGE_MODEL, { timeoutMs: 50 });
      let r2: unknown = "pending";
      void quick.render(REQ).then((r) => (r2 = r));
      await vi.advanceTimersByTimeAsync(51);
      expect(r2).toEqual({ ok: false, kind: "failed" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("puts neither the sketch, the prompt nor the error in what it returns", async () => {
    const r = await new FluxImageMaker(fakeAi(new Error(`failed on ${b64(SKETCH)} and the prompt ${REQ.prompt}`))).render(REQ);
    expect(JSON.stringify(r)).not.toContain(REQ.prompt);
    expect(JSON.stringify(r)).not.toContain(b64(SKETCH));
  });
});

describe("renderCandidate (the guarded door)", () => {
  it("calls the model only with a Ticket for the image meter", async () => {
    const imager = new FakeImager();
    imager.fallback = () => ({ ok: true, image: Uint8Array.from([1]) });
    const ticket = { id: "t-1", meter: "image" as const, sessionId: "s", issuedAt: 1 };
    expect(await renderCandidate(imager, ticket, REQ)).toEqual({ ok: true, image: Uint8Array.from([1]) });
    for (const bad of [{ ...ticket, meter: "world" }, { ...ticket, meter: "llm" }, { ...ticket, id: "" }, null, undefined, "t", {}]) {
      expect(() => renderCandidate(imager, bad as never, REQ)).toThrow();
    }
    expect(imager.asked).toHaveLength(1);
  });
});

describe("catalogModelFromEnv", () => {
  it("is the fallback when blank, a catalog id when it is one, and null for anything else", () => {
    for (const v of [undefined, "", "  "]) expect(catalogModelFromEnv(v, DEFAULT_IMAGE_MODEL)).toBe(DEFAULT_IMAGE_MODEL);
    expect(catalogModelFromEnv(" @cf/black-forest-labs/flux-2-dev ", DEFAULT_IMAGE_MODEL)).toBe("@cf/black-forest-labs/flux-2-dev");
    for (const v of ["flux", "black-forest-labs/flux", "@cf/black-forest-labs", "@cf/a/b/c", "https://x.example/@cf/a/b", "@cf/a/b c", "@cf//x"]) expect(catalogModelFromEnv(v, DEFAULT_IMAGE_MODEL), v).toBeNull();
  });
});
