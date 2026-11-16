import { vi } from "vitest";
import { browserPhotoKit, type PhotoKit } from "../app/create/photo-kit";

/**
 * A photo kit for tests: the real way of reading a file's first bytes (a `FileReader` works in jsdom), and
 * everything that needs a browser decoder or a canvas faked and recorded. `sizes` maps a file name to the
 * pixel size the "decoder" finds; a name that is not in it cannot be read as a picture.
 */
export function fakePhotoKit(sizes: Record<string, { width: number; height: number }> = {}) {
  let n = 0;
  const encoded: Blob[] = [];
  const revoked: string[] = [];
  const reencodeSizes: number[] = [];
  const kit: PhotoKit = {
    head: vi.fn(browserPhotoKit.head),
    inspect: vi.fn(async (file: Blob) => sizes[(file as File).name] ?? null),
    reencode: vi.fn(async (_file: Blob, quality: number) => {
      const size = reencodeSizes.shift() ?? 1000;
      const b = new Blob([new Uint8Array(Math.min(size, 64))], { type: "image/jpeg" });
      // The test sets how large the encoded picture "is" without making 10 MB in memory.
      Object.defineProperty(b, "size", { value: size });
      Object.defineProperty(b, "quality", { value: quality });
      encoded.push(b);
      return b;
    }),
    previewUrl: vi.fn(() => `blob:fake-${++n}`),
    revokePreview: vi.fn((url: string) => void revoked.push(url)),
  };
  return { kit, encoded, revoked, reencodeSizes };
}
