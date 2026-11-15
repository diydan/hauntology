import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { INK_FLOOR, inkCoverage, isBlankSketch } from "../sketch";
import { decodePng } from "./sketch-png";
import { bytesOf, join, makePng, makeRealPng, makeSketchPng, pngChunk, type PngColor } from "./upload-kit";

const px = (b: { data: Uint8ClampedArray; width: number }, x: number, y: number) => [...b.data.subarray((y * b.width + x) * 4, (y * b.width + x) * 4 + 4)];

describe("decodePng", () => {
  it("reads a sketch the way a canvas makes it: black ink on a white page", async () => {
    const png = await makeSketchPng(64, 48, (x, y) => x === y);
    const r = await decodePng(png);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.bitmap.width, r.bitmap.height]).toEqual([64, 48]);
    expect(px(r.bitmap, 3, 3)).toEqual([0, 0, 0, 255]);
    expect(px(r.bitmap, 4, 3)).toEqual([255, 255, 255, 255]);
    expect(inkCoverage(r.bitmap)).toBeCloseTo(48 / (64 * 48), 10);
  });

  it("reads ink on a transparent page", async () => {
    const r = await decodePng(await makeSketchPng(40, 40, (x) => x < 4, true));
    expect(r.ok && inkCoverage(r.bitmap)).toBeCloseTo(0.1, 10);
  });

  it("reads each colour type, with each row filter", async () => {
    const cases: [PngColor, (x: number, y: number) => number[], number[]][] = [
      ["gray", (x, y) => [(x * 37 + y * 11) % 256], [(2 * 37 + 1 * 11) % 256, (2 * 37 + 1 * 11) % 256, (2 * 37 + 1 * 11) % 256, 255]],
      ["graya", (x, y) => [(x * 37 + y * 11) % 256, (x * 5) % 256], [(2 * 37 + 1 * 11) % 256, (2 * 37 + 1 * 11) % 256, (2 * 37 + 1 * 11) % 256, 10]],
      ["rgb", (x, y) => [(x * 37) % 256, (y * 11) % 256, (x + y) % 256], [74, 11, 3, 255]],
      ["rgba", (x, y) => [(x * 37) % 256, (y * 11) % 256, (x + y) % 256, (x * 5 + y) % 256], [74, 11, 3, 11]],
    ];
    for (const [color, pixel, expected] of cases) {
      for (const filter of [0, 1, 2, 3, 4]) {
        const r = await decodePng(await makeRealPng({ width: 9, height: 7, color, filter, pixel }));
        expect(r.ok, `${color} filter ${filter}`).toBe(true);
        if (r.ok) expect(px(r.bitmap, 2, 1), `${color} filter ${filter}`).toEqual(expected);
      }
    }
  });

  it("reads a palette picture with and without transparency", async () => {
    const palette: [number, number, number][] = [[255, 255, 255], [0, 0, 0], [10, 20, 30]];
    const png = await makeRealPng({ width: 4, height: 2, color: "palette", palette, transparency: [255, 255, 0], pixel: (x) => [x % 3] });
    const r = await decodePng(png);
    expect(r.ok && [px(r.bitmap, 0, 0), px(r.bitmap, 1, 0), px(r.bitmap, 2, 0)]).toEqual([[255, 255, 255, 255], [0, 0, 0, 255], [10, 20, 30, 0]]);
    const opaque = await decodePng(await makeRealPng({ width: 2, height: 1, color: "palette", palette, pixel: (x) => [2 - x] }));
    expect(opaque.ok && [px(opaque.bitmap, 0, 0), px(opaque.bitmap, 1, 0)]).toEqual([[10, 20, 30, 255], [0, 0, 0, 255]]);
  });

  it("reads picture data split over several IDAT chunks, and ignores chunks it does not need", async () => {
    const png = await makeRealPng({ width: 30, height: 30, color: "rgb", pixel: (x, y) => [x * 8, y * 8, 100], idatChunks: 4 });
    const noisy = join(png.subarray(0, 33), pngChunk("tEXt", bytesOf("a\0b")), pngChunk("pHYs", new Array(9).fill(0)), png.subarray(33));
    const r = await decodePng(noisy);
    expect(r.ok && px(r.bitmap, 3, 2)).toEqual([24, 16, 100, 255]);
  });

  it("refuses what it does not read, with a code and without throwing: not a PNG, cut off, no end, no data", async () => {
    const good = await makeSketchPng(20, 20, (x) => x === 0);
    for (const bytes of [new Uint8Array(0), bytesOf("GIF89a"), good.subarray(0, 20), good.subarray(0, good.length - 12), good.subarray(0, good.length - 3), makePng({ width: 20, height: 20 }), makePng({ width: 20, height: 20, noEnd: true })]) {
      const r = await decodePng(bytes);
      expect(r.ok, `${bytes.length} bytes`).toBe(false);
    }
    expect(await decodePng(new Uint8Array(0))).toEqual({ ok: false, code: "upload_bad_magic" });
  });

  it("refuses 16-bit, packed and interlaced pictures, a palette picture with no palette, and a size that is too big", async () => {
    const ihdr = (w: number, h: number, depth: number, color: number, interlace = 0) => pngChunk("IHDR", bytesOf([0, 0, (w >> 8) & 255, w & 255], [0, 0, (h >> 8) & 255, h & 255], depth, color, 0, 0, interlace));
    const sig = bytesOf(0x89, "PNG\r\n", 0x1a, "\n");
    const withIdat = (head: Uint8Array) => join(sig, head, pngChunk("IDAT", [0x78, 0x9c, 3, 0, 0, 0, 0, 1]), pngChunk("IEND"));
    for (const [name, head] of [["16-bit", ihdr(4, 4, 16, 2)], ["packed", ihdr(4, 4, 1, 0)], ["interlaced", ihdr(4, 4, 8, 2, 1)]] as const) {
      expect(await decodePng(withIdat(head)), name).toEqual({ ok: false, code: "upload_rejected" });
    }
    expect((await decodePng(withIdat(ihdr(4, 4, 8, 3)))).ok).toBe(false); // palette type, no palette
    expect((await decodePng(withIdat(ihdr(4, 4, 8, 5)))).ok).toBe(false); // not a colour type
    const big = await makeSketchPng(64, 64, () => false);
    expect(await decodePng(big, 64 * 64 - 1)).toEqual({ ok: false, code: "upload_too_large" });
    expect((await decodePng(big, 64 * 64)).ok).toBe(true);
  });

  it("does not unpack more than the header says: a small file that inflates to far more is refused", async () => {
    // A valid zlib stream of 1 MiB of zeros, under a header that says 8 x 8.
    const big = await makeRealPng({ width: 1024, height: 1024, color: "gray", pixel: () => [0] });
    const idat = big.subarray(big.length - 12 - (big.length - 12 - 33 - 12 - 8), big.length - 12);
    expect(idat.length).toBeLessThan(5000);
    const liar = join(bytesOf(0x89, "PNG\r\n", 0x1a, "\n"), pngChunk("IHDR", bytesOf([0, 0, 0, 8], [0, 0, 0, 8], 8, 0, 0, 0, 0)), idat, pngChunk("IEND"));
    expect(await decodePng(liar)).toEqual({ ok: false, code: "upload_bad_magic" });
  });

  it("refuses a picture whose data is too short for its header, or is not zlib", async () => {
    const small = await makeRealPng({ width: 4, height: 4, color: "gray", pixel: () => [0] });
    const liar = small.slice();
    liar[19] = 8; // the header now says 4 x 8 (the width bytes are 16..19, the height 20..23): wider than its data
    liar[23] = 9;
    expect((await decodePng(liar)).ok).toBe(false);
    const junk = join(bytesOf(0x89, "PNG\r\n", 0x1a, "\n"), pngChunk("IHDR", bytesOf([0, 0, 0, 4], [0, 0, 0, 4], 8, 0, 0, 0, 0)), pngChunk("IDAT", [1, 2, 3, 4, 5, 6, 7, 8]), pngChunk("IEND"));
    expect(await decodePng(junk)).toEqual({ ok: false, code: "upload_bad_magic" });
  });

  it("refuses a header that is not a header of a picture it reads: a length other than 13, a method other than 0, a bad signature", async () => {
    const sig = bytesOf(0x89, "PNG\r\n", 0x1a, "\n");
    const body = pngChunk("IDAT", [0x78, 0x9c, 3, 0, 0, 0, 0, 1]);
    const wrongLength = join(sig, pngChunk("IHDR", bytesOf([0, 0, 0, 4], [0, 0, 0, 4], 8, 0, 0, 0)), body, pngChunk("IEND"));
    expect((await decodePng(wrongLength)).ok).toBe(false);
    const badFilterMethod = join(sig, pngChunk("IHDR", bytesOf([0, 0, 0, 4], [0, 0, 0, 4], 8, 0, 0, 1, 0)), body, pngChunk("IEND"));
    expect((await decodePng(badFilterMethod)).ok).toBe(false);
    const badCompression = join(sig, pngChunk("IHDR", bytesOf([0, 0, 0, 4], [0, 0, 0, 4], 8, 0, 1, 0, 0)), body, pngChunk("IEND"));
    expect((await decodePng(badCompression)).ok).toBe(false);
    const good = await makeSketchPng(20, 20, (x) => x === 0);
    expect((await decodePng(good)).ok).toBe(true);
    for (let i = 0; i < 8; i++) {
      const broken = good.slice();
      broken[i] = (broken[i] as number) ^ 0x40;
      expect((await decodePng(broken)).ok, `signature byte ${i}`).toBe(false);
    }
  });

  it("refuses a picture whose header is not exactly what it reads, even when the picture data is good", async () => {
    const real = await makeRealPng({ width: 4, height: 4, color: "gray", pixel: (x, y) => [(x + y) * 20], filter: 0 });
    expect((await decodePng(real)).ok).toBe(true);
    for (const [name, at] of [["compression method", 26], ["filter method", 27]] as const) {
      const broken = real.slice();
      broken[at] = 1;
      expect((await decodePng(broken)).ok, name).toBe(false);
    }
    // A header of 14 bytes (one more than a header has), with the same good data after it.
    const longer = join(real.subarray(0, 8), pngChunk("IHDR", join(real.subarray(16, 29), bytesOf(0))), real.subarray(33));
    expect((await decodePng(longer)).ok).toBe(false);
    const shorter = join(real.subarray(0, 8), pngChunk("IHDR", real.subarray(16, 28)), real.subarray(33));
    expect((await decodePng(shorter)).ok).toBe(false);
    // The same, rebuilt exactly, is read.
    expect((await decodePng(join(real.subarray(0, 8), pngChunk("IHDR", real.subarray(16, 29)), real.subarray(33)))).ok).toBe(true);
  });

  it("refuses a palette picture whose palette is empty, not a whole number of colours, or too small for an index it uses", async () => {
    const sig = bytesOf(0x89, "PNG\r\n", 0x1a, "\n");
    const ok = await makeRealPng({ width: 2, height: 2, color: "palette", palette: [[0, 0, 0], [255, 255, 255]], pixel: (x, y) => [(x + y) % 2] });
    expect((await decodePng(ok)).ok).toBe(true);
    const withPalette = (plte: number[]) => {
      // Swap the PLTE chunk of a good palette picture for another.
      const parts: Uint8Array[] = [];
      for (let i = 8; i < ok.length; ) {
        const len = (ok[i + 3] as number) | ((ok[i + 2] as number) << 8);
        const type = String.fromCharCode(...ok.subarray(i + 4, i + 8));
        parts.push(type === "PLTE" ? pngChunk("PLTE", plte) : ok.subarray(i, i + 12 + len));
        i += 12 + len;
      }
      return join(sig, ...parts);
    };
    expect((await decodePng(withPalette([0, 0, 0, 255, 255, 255]))).ok).toBe(true);
    expect((await decodePng(withPalette([]))).ok).toBe(false);
    expect((await decodePng(withPalette([0, 0, 0, 255]))).ok).toBe(false);
    expect((await decodePng(withPalette([0, 0, 0, 255, 255, 255, 1]))).ok).toBe(false);
    expect((await decodePng(withPalette([0, 0, 0]))).ok).toBe(false); // index 1 is not in a palette of one colour
  });

  it("refuses an unknown row filter", async () => {
    const png = await makeRealPng({ width: 4, height: 4, color: "gray", pixel: () => [7], filter: 4 });
    // Rebuild with a filter byte of 9: the data is the same but the first row's filter is not one of the five.
    const fake = await makeRealPng({ width: 4, height: 4, color: "gray", pixel: () => [7], filter: (y) => (y === 0 ? 9 : 0) });
    expect((await decodePng(png)).ok).toBe(true);
    expect(await decodePng(fake)).toEqual({ ok: false, code: "upload_bad_magic" });
  });
});

/** Property 4: Blank sketches are rejected. */
describe("Property 4: Blank sketches are rejected", () => {
  const bitmap = fc.record({ w: fc.integer({ min: 1, max: 40 }), h: fc.integer({ min: 1, max: 40 }), seed: fc.integer({ min: 0, max: 1_000_000 }), density: fc.constantFrom(0, 0.001, 0.004, 0.005, 0.006, 0.02, 0.5, 1) }).map(({ w, h, seed, density }) => {
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    let ink = 0;
    for (let i = 0; i < w * h; i++) {
      // A pseudo-random choice of pixels, with the share that density says on average.
      const r = ((i * 2654435761 + seed * 40503) >>> 0) / 2 ** 32;
      if (r < density) {
        data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 0;
        ink++;
      }
    }
    return { bitmap: { width: w, height: h, data }, ink, total: w * h };
  });

  it("measures the share of ink exactly, and rejects a sketch if and only if that share is below one half of one percent", () => {
    fc.assert(
      fc.property(bitmap, ({ bitmap: b, ink, total }) => {
        expect(inkCoverage(b)).toBeCloseTo(ink / total, 12);
        expect(isBlankSketch(b)).toBe(ink / total < INK_FLOOR);
      }),
      propParams(),
    );
  });

  it("is decided the same after a trip through a PNG as before it", async () => {
    for (const [ink, blank] of [[0, true], [1, true], [4, true], [5, false], [200, false]] as const) {
      // 1000 pixels: 5 is exactly 0.5%, which is not blank.
      const png = await makeSketchPng(40, 25, (x, y) => y * 40 + x < ink);
      const r = await decodePng(png);
      expect(r.ok && isBlankSketch(r.bitmap), `${ink} ink pixels`).toBe(blank);
    }
  });
});

describe("round trip", () => {
  it("returns, for any picture of any colour type and filter, exactly the pixels that went in", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 12 }), fc.constantFrom<PngColor>("gray", "graya", "rgb", "rgba"), fc.integer({ min: 0, max: 4 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 1, max: 3 }),
        async (w, h, color, filter, seed, chunks) => {
          const channels = { gray: 1, graya: 2, rgb: 3, rgba: 4 }[color as "gray"];
          const pixel = (x: number, y: number) => Array.from({ length: channels }, (_, c) => (x * 31 + y * 17 + c * 59 + seed) % 256);
          const r = await decodePng(await makeRealPng({ width: w, height: h, color, filter, pixel, idatChunks: chunks }));
          expect(r.ok).toBe(true);
          if (!r.ok) return;
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const s = pixel(x, y);
            const expected = color === "gray" ? [s[0], s[0], s[0], 255] : color === "graya" ? [s[0], s[0], s[0], s[1]] : color === "rgb" ? [s[0], s[1], s[2], 255] : s;
            expect(px(r.bitmap, x, y)).toEqual(expected);
          }
        },
      ),
      { ...propParams(), numRuns: 60 },
    );
  });

  it("returns random bytes exactly through every row filter, the Paeth filter included, whatever the neighbours", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 48, maxLength: 48 }), fc.integer({ min: 0, max: 4 }), async (bytes, filter) => {
        const pixel = (x: number, y: number) => [bytes[(y * 8 + x) % 48] as number, bytes[(y * 8 + x + 7) % 48] as number, bytes[(y * 8 + x + 13) % 48] as number];
        const r = await decodePng(await makeRealPng({ width: 8, height: 6, color: "rgb", filter, pixel }));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) expect(px(r.bitmap, x, y)).toEqual([...pixel(x, y), 255]);
      }),
      { ...propParams(), numRuns: 80 },
    );
  });

  it("never throws on bytes that are not a picture", async () => {
    await fc.assert(fc.asyncProperty(fc.uint8Array({ maxLength: 100 }), async (b) => {
      const r = await decodePng(b);
      expect(typeof r.ok).toBe("boolean");
    }), propParams());
  });
});
