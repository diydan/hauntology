import { describe, expect, it, vi } from "vitest";
import { makeRealPng, makeSketchPng } from "@hauntology/shared/world/upload-kit";
import { CUTOUT_INPUT_MAX_BYTES, CUTOUT_RESULT_MAX_BYTES, ImagesForegroundCutter, cutOutForeground, type CutAnswer, type ForegroundCutter, type ImagesBinding } from "./cutout";

const PHOTO = Uint8Array.from([255, 216, 255, 224, 1, 2, 3, 4, 250, 251]);
const REQ = { image: PHOTO, contentType: "image/jpeg" };
const TICKET = { id: "t-1", meter: "image" as const, sessionId: "s", issuedAt: 1 };

type Step = { transforms: Record<string, unknown>[]; output?: { format: string }; input?: Uint8Array };
/** A stand-in of `env.IMAGES` that records what it is asked, and answers with `result` (or throws it). */
function fakeImages(result: Uint8Array | Error | (() => Promise<Uint8Array>)): ImagesBinding & { steps: Step[] } {
  const steps: Step[] = [];
  return {
    steps,
    input(stream) {
      const step: Step = { transforms: [] };
      steps.push(step);
      void new Response(stream).arrayBuffer().then((b) => { step.input = new Uint8Array(b); });
      const handle = {
        transform(t: Record<string, unknown>) { step.transforms.push(t); return handle; },
        async output(options: { format: string }) {
          step.output = options;
          const r = typeof result === "function" ? await result() : result;
          if (r instanceof Error) throw r;
          return { response: () => new Response(r as unknown as ArrayBuffer) };
        },
      };
      return handle;
    },
  };
}

describe("ImagesForegroundCutter", () => {
  it("passes the picture as a stream, removes the background, and asks for a PNG", async () => {
    const out = Uint8Array.from([137, 80, 78, 71, 9, 9]);
    const images = fakeImages(out);
    const r = await new ImagesForegroundCutter(images).cut(REQ);
    expect(r).toEqual({ ok: true, image: out });
    expect(images.steps).toHaveLength(1);
    expect(images.steps[0]!.transforms).toEqual([{ segment: "foreground" }]);
    expect(images.steps[0]!.output).toEqual({ format: "image/png" });
    expect(images.steps[0]!.input).toEqual(PHOTO);
  });

  it("shrinks first when told a height, so the cut is made on the smaller picture", async () => {
    const images = fakeImages(Uint8Array.from([1]));
    await new ImagesForegroundCutter(images).cut({ ...REQ, maxHeight: 768 });
    expect(images.steps[0]!.transforms).toEqual([{ height: 768, fit: "scale-down" }, { segment: "foreground" }]);
  });

  it("states its limits", () => {
    expect(CUTOUT_INPUT_MAX_BYTES).toBe(20 * 1024 * 1024);
    expect(CUTOUT_RESULT_MAX_BYTES).toBe(16 * 1024 * 1024);
  });

  it("takes JPEG, PNG and WebP, and nothing else", async () => {
    for (const contentType of ["image/jpeg", "image/png", "image/webp"]) expect((await new ImagesForegroundCutter(fakeImages(Uint8Array.from([1]))).cut({ ...REQ, contentType })).ok, contentType).toBe(true);
    const images = fakeImages(Uint8Array.from([1]));
    for (const contentType of ["image/gif", "image/svg+xml", "application/octet-stream", "", "IMAGE/PNG"]) {
      expect(await new ImagesForegroundCutter(images).cut({ ...REQ, contentType }), contentType).toEqual({ ok: false, kind: "failed" });
    }
    expect(images.steps).toHaveLength(0);
  });

  it("does not call for an empty picture, one over 20 MB, or a height outside 64 to 2048 pixels", async () => {
    const images = fakeImages(Uint8Array.from([1]));
    const cutter = new ImagesForegroundCutter(images);
    expect(await cutter.cut({ ...REQ, image: new Uint8Array(0) })).toEqual({ ok: false, kind: "failed" });
    expect(await cutter.cut({ ...REQ, image: new Uint8Array(CUTOUT_INPUT_MAX_BYTES + 1) })).toEqual({ ok: false, kind: "failed" });
    for (const maxHeight of [63, 2049, 0, -5, 100.5, Number.NaN]) expect(await cutter.cut({ ...REQ, maxHeight }), String(maxHeight)).toEqual({ ok: false, kind: "failed" });
    expect(images.steps).toHaveLength(0);
    for (const maxHeight of [64, 2048]) expect((await cutter.cut({ ...REQ, maxHeight })).ok, String(maxHeight)).toBe(true);
    expect((await cutter.cut({ ...REQ, image: new Uint8Array(CUTOUT_INPUT_MAX_BYTES) })).ok).toBe(true);
  });

  it("says failed when the binding throws or answers with nothing, rate_limited when it says it is busy, and failed on a timeout", async () => {
    expect(await new ImagesForegroundCutter(fakeImages(new Error("ImagesError 9422: usage limit reached"))).cut(REQ)).toEqual({ ok: false, kind: "failed" });
    expect(await new ImagesForegroundCutter(fakeImages(new Error("429 too many requests"))).cut(REQ)).toEqual({ ok: false, kind: "rate_limited" });
    expect(await new ImagesForegroundCutter(fakeImages(new Uint8Array(0))).cut(REQ)).toEqual({ ok: false, kind: "failed" });
    const slow = fakeImages(() => new Promise(() => undefined));
    expect(await new ImagesForegroundCutter(slow, { timeoutMs: 15 }).cut(REQ)).toEqual({ ok: false, kind: "failed" });
    expect(slow.steps).toHaveLength(1);
  });

  it("waits 30 seconds by default", async () => {
    vi.useFakeTimers();
    try {
      let outcome: unknown = "pending";
      void new ImagesForegroundCutter(fakeImages(() => new Promise(() => undefined))).cut(REQ).then((r) => { outcome = r; });
      await vi.advanceTimersByTimeAsync(29_999);
      expect(outcome).toBe("pending");
      await vi.advanceTimersByTimeAsync(1);
      expect(outcome).toEqual({ ok: false, kind: "failed" });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("cutOutForeground (the guarded door)", () => {
  const cutterOf = (answer: CutAnswer): ForegroundCutter & { asked: number } => ({ asked: 0, async cut() { this.asked++; return answer; } });

  it("gives a cut-out that was read: its size and how much of the picture it keeps", async () => {
    const png = await makeSketchPng(40, 50, (x) => x >= 10 && x < 30, true);
    const cutter = cutterOf({ ok: true, image: png });
    const r = await cutOutForeground(cutter, TICKET, REQ);
    expect(r).toEqual({ ok: true, image: png, width: 40, height: 50, coverage: 0.5 });
  });

  it("calls only with a Ticket for the image meter", async () => {
    const png = await makeSketchPng(20, 20, (x) => x > 4, true);
    const cutter = cutterOf({ ok: true, image: png });
    for (const bad of [{ ...TICKET, meter: "llm" }, { ...TICKET, meter: "world" }, { ...TICKET, id: "" }, null, undefined, "t", {}]) {
      await expect(cutOutForeground(cutter, bad as never, REQ)).rejects.toThrow();
    }
    expect(cutter.asked).toBe(0);
    expect((await cutOutForeground(cutter, TICKET, REQ)).ok).toBe(true);
    expect(cutter.asked).toBe(1);
  });

  it("passes a failure through: failed and rate_limited are not charged", async () => {
    expect(await cutOutForeground(cutterOf({ ok: false, kind: "failed" }), TICKET, REQ)).toEqual({ ok: false, kind: "failed" });
    expect(await cutOutForeground(cutterOf({ ok: false, kind: "rate_limited" }), TICKET, REQ)).toEqual({ ok: false, kind: "rate_limited" });
  });

  it("calls a picture that is no sprite unusable, with the reason, because the service answered", async () => {
    const opaque = await makeRealPng({ width: 12, height: 12, color: "rgb", pixel: () => [5, 5, 5] });
    const empty = await makeRealPng({ width: 12, height: 12, color: "rgba", pixel: () => [0, 0, 0, 0] });
    expect(await cutOutForeground(cutterOf({ ok: true, image: opaque }), TICKET, REQ)).toEqual({ ok: false, kind: "unusable", reason: "nothing_removed" });
    expect(await cutOutForeground(cutterOf({ ok: true, image: empty }), TICKET, REQ)).toEqual({ ok: false, kind: "unusable", reason: "nothing_kept" });
    expect(await cutOutForeground(cutterOf({ ok: true, image: Uint8Array.from([1, 2, 3]) }), TICKET, REQ)).toEqual({ ok: false, kind: "unusable", reason: "unreadable" });
    expect(await cutOutForeground(cutterOf({ ok: true, image: PHOTO }), TICKET, REQ)).toEqual({ ok: false, kind: "unusable", reason: "unreadable" });
  });

  it("refuses a picture over 16 MiB without reading it, and takes one of exactly that size to the reader", async () => {
    expect(await cutOutForeground(cutterOf({ ok: true, image: new Uint8Array(CUTOUT_RESULT_MAX_BYTES + 1) }), TICKET, REQ)).toEqual({ ok: false, kind: "unusable", reason: "too_big" });
    expect(await cutOutForeground(cutterOf({ ok: true, image: new Uint8Array(CUTOUT_RESULT_MAX_BYTES) }), TICKET, REQ)).toEqual({ ok: false, kind: "unusable", reason: "unreadable" });
  });
});
