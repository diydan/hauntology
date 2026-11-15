import type { Bitmap } from "../sketch";
import type { UploadCode } from "./upload";

/**
 * Reads a PNG into pixels, so the server can judge a sketch the way the shell does (`inkCoverage`, world-pipeline 5.3,
 * Requirement 2.2) and does not take the client's word that it has ink. It is for the PNG a canvas makes: 8 bits a channel,
 * not interlaced, grey, grey with alpha, RGB, RGBA or palette. Anything else is refused, not guessed at. The picture data is
 * inflated with the standard `DecompressionStream`, stopping as soon as it is longer than the header says it can be, so a small
 * file cannot unpack into a large one. Checksums are not verified (the inflater checks its own).
 */

export const MAX_SKETCH_PIXELS = 4 * 1024 * 1024;

export type DecodedPng = { ok: true; bitmap: Bitmap } | { ok: false; code: Extract<UploadCode, "upload_bad_magic" | "upload_rejected" | "upload_too_large"> };

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const be32 = (b: Uint8Array, i: number): number => (b[i] as number) * 0x1000000 + (((b[i + 1] as number) << 16) | ((b[i + 2] as number) << 8) | (b[i + 3] as number));
const tag = (b: Uint8Array, i: number): string => String.fromCharCode(b[i] as number, b[i + 1] as number, b[i + 2] as number, b[i + 3] as number);

/** The inflated bytes, exactly `expected` of them, or `null` for a stream that is invalid, too short, or longer. */
async function inflate(data: Uint8Array, expected: number): Promise<Uint8Array | null> {
  try {
    const stream = new DecompressionStream("deflate");
    const writer = stream.writable.getWriter();
    void writer.write(data as unknown as Uint8Array<ArrayBuffer>).then(() => writer.close()).catch(() => undefined);
    const reader = stream.readable.getReader();
    const out = new Uint8Array(expected);
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.byteLength > expected) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      out.set(value, total);
      total += value.byteLength;
    }
    return total === expected ? out : null;
  } catch {
    return null;
  }
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Undoes the row filters in place of a fresh buffer; `null` for a filter type that is not one of the five. */
function unfilter(raw: Uint8Array, width: number, height: number, bpp: number): Uint8Array | null {
  const stride = width * bpp;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] as number;
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x] as number;
      const a = x >= bpp ? (out[row + x - bpp] as number) : 0;
      const b = y > 0 ? (out[prev + x] as number) : 0;
      const c = x >= bpp && y > 0 ? (out[prev + x - bpp] as number) : 0;
      let add: number;
      switch (filter) {
        case 0: add = 0; break;
        case 1: add = a; break;
        case 2: add = b; break;
        case 3: add = (a + b) >> 1; break;
        case 4: add = paeth(a, b, c); break;
        default: return null;
      }
      out[row + x] = (v + add) & 0xff;
    }
  }
  return out;
}

export async function decodePng(bytes: Uint8Array, maxPixels: number = MAX_SKETCH_PIXELS): Promise<DecodedPng> {
  const bad = { ok: false, code: "upload_bad_magic" } as const;
  if (bytes.length < 33 || SIGNATURE.some((v, i) => bytes[i] !== v)) return bad;

  let width = 0;
  let height = 0;
  let colorType = -1;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  let sawHeader = false;
  let sawEnd = false;
  for (let i = 8; i + 12 <= bytes.length && !sawEnd; ) {
    const len = be32(bytes, i);
    const end = i + 12 + len;
    if (end > bytes.length) return bad;
    const type = tag(bytes, i + 4);
    const data = bytes.subarray(i + 8, i + 8 + len);
    if (!sawHeader) {
      if (type !== "IHDR" || len !== 13) return bad;
      width = be32(data, 0);
      height = be32(data, 4);
      const depth = data[8] as number;
      colorType = data[9] as number;
      if (width < 1 || height < 1) return bad;
      if (!Object.hasOwn(CHANNELS, colorType) || data[10] !== 0 || data[11] !== 0) return bad;
      if (depth !== 8 || data[12] !== 0) return { ok: false, code: "upload_rejected" }; // 16-bit, packed or interlaced
      if (width * height > maxPixels) return { ok: false, code: "upload_too_large" };
      sawHeader = true;
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") transparency = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") sawEnd = true;
    i = end;
  }
  if (!sawHeader || !sawEnd || idat.length === 0) return bad;
  if (colorType === 3 && (palette === null || palette.length === 0 || palette.length % 3 !== 0)) return bad;

  const bpp = CHANNELS[colorType] as number;
  const joined = new Uint8Array(idat.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of idat) {
    joined.set(p, at);
    at += p.length;
  }
  const raw = await inflate(joined, height * (1 + width * bpp));
  if (raw === null) return bad;
  const pixels = unfilter(raw, width, height, bpp);
  if (pixels === null) return bad;

  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0, q = 0; p < width * height; p++, q += 4) {
    const s = p * bpp;
    switch (colorType) {
      case 0: data[q] = data[q + 1] = data[q + 2] = pixels[s] as number; data[q + 3] = 255; break;
      case 2: data[q] = pixels[s] as number; data[q + 1] = pixels[s + 1] as number; data[q + 2] = pixels[s + 2] as number; data[q + 3] = 255; break;
      case 3: {
        const index = pixels[s] as number;
        const base = index * 3;
        if (palette === null || base + 2 >= palette.length) return bad;
        data[q] = palette[base] as number;
        data[q + 1] = palette[base + 1] as number;
        data[q + 2] = palette[base + 2] as number;
        data[q + 3] = transparency !== null && index < transparency.length ? (transparency[index] as number) : 255;
        break;
      }
      case 4: data[q] = data[q + 1] = data[q + 2] = pixels[s] as number; data[q + 3] = pixels[s + 1] as number; break;
      default: data[q] = pixels[s] as number; data[q + 1] = pixels[s + 1] as number; data[q + 2] = pixels[s + 2] as number; data[q + 3] = pixels[s + 3] as number;
    }
  }
  return { ok: true, bitmap: { width, height, data } };
}
