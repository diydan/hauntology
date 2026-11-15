// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserPhotoKit } from "./photo-kit";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const bitmap = (width: number, height: number) => ({ width, height, close: vi.fn() });

describe("browserPhotoKit.head", () => {
  it("reads only the first bytes of a file", async () => {
    const file = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])]);
    expect([...(await browserPhotoKit.head(file, 4))]).toEqual([1, 2, 3, 4]);
    expect([...(await browserPhotoKit.head(file, 100))]).toHaveLength(10);
    expect([...(await browserPhotoKit.head(new Blob([]), 4))]).toEqual([]);
  });
});

describe("browserPhotoKit.inspect", () => {
  it("gives the size the browser draws, and lets the bitmap go", async () => {
    const b = bitmap(4000, 3000);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => b));
    expect(await browserPhotoKit.inspect(new Blob(["x"]))).toEqual({ width: 4000, height: 3000 });
    expect(b.close).toHaveBeenCalledTimes(1);
  });

  it("is null when the browser cannot read it as a picture", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("bad"); }));
    expect(await browserPhotoKit.inspect(new Blob(["x"]))).toBeNull();
  });
});

describe("browserPhotoKit.reencode", () => {
  function fakeCanvas(ctx: unknown, blob: Blob | null) {
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ctx), toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(blob)) };
    vi.spyOn(document, "createElement").mockReturnValue(canvas as unknown as HTMLCanvasElement);
    return canvas;
  }

  it("makes a JPEG of the same size from the pixels alone, on white, at the quality asked for", async () => {
    const b = bitmap(4000, 3000);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => b));
    const ctx = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
    const out = new Blob(["jpeg"], { type: "image/jpeg" });
    const canvas = fakeCanvas(ctx, out);
    const file = new Blob(["original with exif"]);
    const result = await browserPhotoKit.reencode(file, 0.8);
    expect(result).toBe(out);
    expect([canvas.width, canvas.height]).toEqual([4000, 3000]);
    expect(ctx.fillStyle).toBe("#ffffff");
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 4000, 3000);
    expect(ctx.drawImage).toHaveBeenCalledWith(b, 0, 0);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.8);
    expect(b.close).toHaveBeenCalledTimes(1);
    // The result is the canvas's own blob, never the file that was read.
    expect(result).not.toBe(file);
  });

  it("is null when there is no canvas context, when the canvas cannot make a blob, and when the file cannot be read", async () => {
    const b = bitmap(10, 10);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => b));
    fakeCanvas(null, null);
    expect(await browserPhotoKit.reencode(new Blob(["x"]), 0.9)).toBeNull();
    expect(b.close).toHaveBeenCalledTimes(1);

    fakeCanvas({ fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() }, null);
    expect(await browserPhotoKit.reencode(new Blob(["x"]), 0.9)).toBeNull();

    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("bad"); }));
    expect(await browserPhotoKit.reencode(new Blob(["x"]), 0.9)).toBeNull();
  });
});

describe("browserPhotoKit previews", () => {
  it("makes a blob address and lets it go", () => {
    const create = vi.fn(() => "blob:abc");
    const revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const file = new Blob(["x"]);
    expect(browserPhotoKit.previewUrl(file)).toBe("blob:abc");
    expect(create).toHaveBeenCalledWith(file);
    browserPhotoKit.revokePreview("blob:abc");
    expect(revoke).toHaveBeenCalledWith("blob:abc");
  });
});
