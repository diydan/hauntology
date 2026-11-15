// @vitest-environment jsdom
import { makeStroke, type Stroke } from "@hauntology/shared/app/sketch-pad";
import { inkGate } from "@hauntology/shared/app/sketch-size";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canvasSurface } from "./surface";

afterEach(() => vi.restoreAllMocks());

/** A 2D context that only writes down what it is asked to do. */
function recordingContext() {
  const calls: string[] = [];
  const state = { lineWidth: 0, strokeStyle: "", fillStyle: "", lineCap: "", lineJoin: "" };
  const ctx = new Proxy(state, {
    get(target, key: string) {
      if (key in target) return target[key as keyof typeof target];
      return (...args: unknown[]) => {
        calls.push(`${key}(${args.map((a) => (typeof a === "number" ? Math.round(a * 10) / 10 : typeof a === "object" ? "[canvas]" : String(a))).join(",")}) ${state.strokeStyle}|${state.fillStyle}|${state.lineWidth}`);
      };
    },
    set(target, key: string, value) {
      (target as Record<string, unknown>)[key] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, state };
}

function fakeCanvas(width = 640, height = 480, context: CanvasRenderingContext2D | null = recordingContext().ctx) {
  return { width, height, getContext: vi.fn(() => context) } as unknown as HTMLCanvasElement;
}

const stroke = (tool: "brush" | "eraser", points: Array<[number, number]>): Stroke => makeStroke(tool, "medium", points);

describe("canvasSurface", () => {
  it("fills the page white when it is made, and again on every redraw", () => {
    const { ctx, calls } = recordingContext();
    const s = canvasSurface(fakeCanvas(640, 480, ctx));
    expect(calls).toEqual(["fillRect(0,0,640,480) |#ffffff|0"]);
    calls.length = 0;
    s.redraw([]);
    expect(calls).toEqual(["fillRect(0,0,640,480) |#ffffff|0"]);
  });

  it("paints a brush stroke black and an eraser stroke white, round, at the width of the stroke", () => {
    const { ctx, calls, state } = recordingContext();
    const s = canvasSurface(fakeCanvas(640, 480, ctx));
    calls.length = 0;
    s.redraw([stroke("brush", [[10, 10], [20, 30], [40, 50]])]);
    expect(calls).toEqual([
      "fillRect(0,0,640,480) |#ffffff|0",
      "beginPath() #000000|#000000|10",
      "moveTo(10,10) #000000|#000000|10",
      "lineTo(20,30) #000000|#000000|10",
      "lineTo(40,50) #000000|#000000|10",
      "stroke() #000000|#000000|10",
    ]);
    expect([state.lineCap, state.lineJoin]).toEqual(["round", "round"]);
    calls.length = 0;
    s.redraw([stroke("eraser", [[1, 2], [3, 4]])]);
    expect(calls.at(-1)).toBe("stroke() #ffffff|#ffffff|10");
  });

  it("paints a single point as a dot of the stroke's width", () => {
    const { ctx, calls } = recordingContext();
    const s = canvasSurface(fakeCanvas(640, 480, ctx));
    calls.length = 0;
    s.extend(stroke("brush", [[100, 100]]), 0);
    expect(calls).toEqual(["beginPath() #000000|#000000|10", "arc(100,100,5,0,6.3) #000000|#000000|10", "fill() #000000|#000000|10"]);
  });

  it("paints only the newest segment of a stroke being drawn", () => {
    const { ctx, calls } = recordingContext();
    const s = canvasSurface(fakeCanvas(640, 480, ctx));
    calls.length = 0;
    s.extend(stroke("brush", [[1, 1], [2, 2], [3, 3], [4, 4]]), 3);
    expect(calls.map((c) => c.split(" ")[0])).toEqual(["beginPath()", "moveTo(3,3)", "lineTo(4,4)", "stroke()"]);
    calls.length = 0;
    s.extend(stroke("brush", [[1, 1], [2, 2]]), 1);
    expect(calls.map((c) => c.split(" ")[0])).toEqual(["beginPath()", "moveTo(1,1)", "lineTo(2,2)", "stroke()"]);
  });

  it("paints nothing for a stroke with no points", () => {
    const { ctx, calls } = recordingContext();
    const s = canvasSurface(fakeCanvas(640, 480, ctx));
    calls.length = 0;
    s.extend({ tool: "brush", width: 10, points: [] }, 0);
    expect(calls).toEqual([]);
  });

  it("gives the pixels of the page, and a page with no canvas context has no ink", () => {
    const data = new Uint8ClampedArray(4 * 4 * 4).fill(255);
    const ctx = { fillStyle: "", fillRect: vi.fn(), getImageData: vi.fn(() => ({ width: 4, height: 4, data })) } as unknown as CanvasRenderingContext2D;
    const canvas = fakeCanvas(4, 4, ctx);
    const s = canvasSurface(canvas);
    expect(s.bitmap()).toEqual({ width: 4, height: 4, data });
    expect(ctx.getImageData).toHaveBeenCalledWith(0, 0, 4, 4);

    const none = canvasSurface(fakeCanvas(10, 10, null));
    const bitmap = none.bitmap();
    expect([bitmap.width, bitmap.height, bitmap.data.length]).toEqual([10, 10, 400]);
    expect(inkGate(bitmap).enabled).toBe(false);
    none.redraw([stroke("brush", [[1, 1], [5, 5]])]);
    none.extend(stroke("brush", [[1, 1]]), 0);
  });

  it("makes a PNG no longer than the limit on its longest side, on white, from the page", async () => {
    const out = recordingContext();
    const made: Array<{ width: number; height: number }> = [];
    const toBlob = vi.fn((cb: (b: Blob | null) => void, type?: string) => cb(new Blob(["x"], { type: type ?? "" })));
    const outCanvas = { width: 0, height: 0, getContext: vi.fn(() => out.ctx), toBlob };
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      expect(tag).toBe("canvas");
      return new Proxy(outCanvas, { set: (t, k, v) => { (t as Record<string, unknown>)[k as string] = v; if (k === "height") made.push({ width: t.width, height: v as number }); return true; } }) as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
    const page = fakeCanvas(640, 480);
    const s = canvasSurface(page);
    const blob = await s.png(512);
    expect(blob?.type).toBe("image/png");
    expect(made).toEqual([{ width: 512, height: 384 }]);
    expect(out.calls).toEqual(["fillRect(0,0,512,384) |#ffffff|0", "drawImage([canvas],0,0,512,384) |#ffffff|0"]);
    expect(toBlob.mock.calls[0]![1]).toBe("image/png");
  });

  it("does not enlarge a small page, and says it cannot when the browser cannot make a PNG", async () => {
    const out = recordingContext();
    const outCanvas = { width: 0, height: 0, getContext: vi.fn((): unknown => out.ctx), toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(null)) };
    vi.spyOn(document, "createElement").mockReturnValue(outCanvas as unknown as HTMLCanvasElement);
    const s = canvasSurface(fakeCanvas(300, 200));
    expect(await s.png(512)).toBeNull();
    expect([outCanvas.width, outCanvas.height]).toEqual([300, 200]);
    outCanvas.getContext = vi.fn(() => null);
    expect(await s.png(512)).toBeNull();
  });
});
