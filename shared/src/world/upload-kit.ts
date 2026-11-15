/**
 * Builders for test pictures: not whole images that decode, but files with the real container structure and headers, which is
 * all the upload code reads. Used by the tests of `upload.ts` here and by the route tests in `api`. Not used by any product code.
 */

export const bytesOf = (...parts: (number | number[] | Uint8Array | string)[]): Uint8Array => {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === "number") out.push(p);
    else if (typeof p === "string") for (const ch of p) out.push(ch.charCodeAt(0));
    else out.push(...p);
  }
  return Uint8Array.from(out);
};

export const join = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
};

const u16 = (n: number): number[] => [(n >>> 8) & 0xff, n & 0xff];
const u32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const le16 = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff];
const le24 = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff];
const le32 = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

// ---- JPEG ----

/** One JPEG segment: `FF marker`, a length that counts itself, and the payload. */
export const jpegSegment = (marker: number, payload: Uint8Array | number[] = []): Uint8Array => bytesOf(0xff, marker, u16(payload.length + 2), payload);

export const JFIF = (): Uint8Array => jpegSegment(0xe0, bytesOf("JFIF\0", 1, 1, 0, u16(1), u16(1), 0, 0));
export const EXIF = (text = "Exif\0\0GPS 51.5N 0.1W Canon EOS"): Uint8Array => jpegSegment(0xe1, bytesOf(text));
export const XMP = (text = "http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>"): Uint8Array => jpegSegment(0xe1, bytesOf(text));
export const IPTC = (): Uint8Array => jpegSegment(0xed, bytesOf("Photoshop 3.0\0 8BIM caption"));
export const COMMENT = (text = "taken at home"): Uint8Array => jpegSegment(0xfe, bytesOf(text));
export const ICC = (): Uint8Array => jpegSegment(0xe2, bytesOf("ICC_PROFILE\0", 1, 1, 9, 9, 9));
export const ADOBE = (): Uint8Array => jpegSegment(0xee, bytesOf("Adobe", 0, 100, 0, 0, 0, 0, 1)); // 12 bytes of payload

/** The frame header, tables and scan header every JPEG here has. */
const SOF0 = (width: number, height: number): Uint8Array => jpegSegment(0xc0, bytesOf(8, u16(height), u16(width), 1, 1, 0x11, 0));
const DQT = (): Uint8Array => jpegSegment(0xdb, bytesOf(0, new Array(64).fill(3)));
const DHT = (): Uint8Array => jpegSegment(0xc4, bytesOf(0, new Array(16).fill(0), 7));
const SOS = (): Uint8Array => jpegSegment(0xda, bytesOf(1, 1, 0, 0, 63, 0));

export type JpegOptions = {
  width: number;
  height: number;
  /** Segments placed right after the start of image. */
  head?: Uint8Array[];
  /** Segments placed between the tables and the frame header. */
  middle?: Uint8Array[];
  /** The entropy-coded data of each scan (default one scan). It must already be byte-stuffed. */
  scans?: Uint8Array[];
  /** Segments placed after scan number `n` (0-based), before the next scan or the end. */
  between?: Record<number, Uint8Array[]>;
  /** Bytes after the end-of-image marker. */
  trailing?: Uint8Array;
  /** Leave the end-of-image marker out. */
  noEnd?: boolean;
};

export function makeJpeg(o: JpegOptions): Uint8Array {
  const scans = o.scans ?? [bytesOf(1, 2, 3, 4, 0xff, 0x00, 5, 6)];
  const parts: Uint8Array[] = [bytesOf(0xff, 0xd8), ...(o.head ?? []), DQT(), ...(o.middle ?? []), SOF0(o.width, o.height), DHT()];
  scans.forEach((s, i) => {
    parts.push(SOS(), s, ...(o.between?.[i] ?? []));
  });
  if (o.noEnd !== true) parts.push(bytesOf(0xff, 0xd9));
  if (o.trailing !== undefined) parts.push(o.trailing);
  return join(...parts);
}

// ---- PNG ----

const CRC_TABLE = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();
export const crc32 = (b: Uint8Array): number => {
  let c = 0xffffffff;
  for (const x of b) c = (CRC_TABLE[(c ^ x) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** One PNG chunk with a correct CRC. */
export const pngChunk = (type: string, data: Uint8Array | number[] = []): Uint8Array => {
  const d = data instanceof Uint8Array ? data : Uint8Array.from(data);
  const body = bytesOf(type, d);
  return bytesOf(u32(d.length), body, u32(crc32(body)));
};

export type PngOptions = { width: number; height: number; before?: Uint8Array[]; between?: Uint8Array[]; after?: Uint8Array[]; idat?: Uint8Array[]; trailing?: Uint8Array; noEnd?: boolean };

export function makePng(o: PngOptions): Uint8Array {
  const ihdr = pngChunk("IHDR", bytesOf(u32(o.width), u32(o.height), 8, 2, 0, 0, 0));
  const idats = (o.idat ?? [bytesOf(1, 2, 3, 4, 5)]).map((d) => pngChunk("IDAT", d));
  return join(bytesOf(0x89, "PNG\r\n", 0x1a, "\n"), ihdr, ...(o.before ?? []), idats[0] as Uint8Array, ...(o.between ?? []), ...idats.slice(1), ...(o.after ?? []), ...(o.noEnd === true ? [] : [pngChunk("IEND")]), ...(o.trailing ? [o.trailing] : []));
}

// ---- WebP ----

/** One RIFF chunk, padded to an even size. */
export const riffChunk = (type: string, data: Uint8Array | number[] = []): Uint8Array => {
  const d = data instanceof Uint8Array ? data : Uint8Array.from(data);
  return bytesOf(type, le32(d.length), d, d.length % 2 ? [0] : []);
};

export type WebpKind = "lossy" | "lossless" | "extended";
export type WebpOptions = { width: number; height: number; kind?: WebpKind; extra?: Uint8Array[]; flags?: number; animated?: boolean; riffSizeDelta?: number; noImage?: boolean };

export function makeWebp(o: WebpOptions): Uint8Array {
  const kind = o.kind ?? "lossy";
  const lossy = riffChunk("VP8 ", bytesOf(0x10, 0, 0, 0x9d, 0x01, 0x2a, le16(o.width), le16(o.height), 0, 0, 0, 0));
  const bits = ((o.width - 1) & 0x3fff) | (((o.height - 1) & 0x3fff) << 14);
  const lossless = riffChunk("VP8L", bytesOf(0x2f, le32(bits >>> 0), 0, 0, 0));
  const image = o.noImage === true ? new Uint8Array(0) : kind === "lossless" ? lossless : lossy;
  const chunks: Uint8Array[] = [];
  if (kind === "extended" || o.flags !== undefined || o.animated === true) {
    const flags = (o.flags ?? 0) | (o.animated === true ? 0x02 : 0);
    chunks.push(riffChunk("VP8X", bytesOf(flags, 0, 0, 0, le24(o.width - 1), le24(o.height - 1))));
  }
  chunks.push(...(o.extra ?? []), image);
  const body = join(...chunks);
  return join(bytesOf("RIFF", le32(body.length + 4 + (o.riffSizeDelta ?? 0)), "WEBP"), body);
}

// ---- PNG that really decodes (for the sketch) ----

export type PngColor = "gray" | "graya" | "rgb" | "rgba" | "palette";
const COLOR_TYPE: Record<PngColor, number> = { gray: 0, rgb: 2, palette: 3, graya: 4, rgba: 6 };
const CHANNEL_COUNT: Record<PngColor, number> = { gray: 1, rgb: 3, palette: 1, graya: 2, rgba: 4 };

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream("deflate");
  const writer = stream.writable.getWriter();
  void writer.write(data as unknown as Uint8Array<ArrayBuffer>).then(() => writer.close());
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

const paethOf = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

export type RealPngOptions = {
  width: number;
  height: number;
  color?: PngColor;
  /** The samples of the pixel at x, y: as many numbers as the colour has channels (palette: one index). */
  pixel: (x: number, y: number) => number[];
  /** The filter of each row (0 to 4); default 0. A number is used for every row. */
  filter?: number | ((y: number) => number);
  /** Palette entries as `[r, g, b]`, for `palette`. */
  palette?: [number, number, number][];
  /** Palette alpha values. */
  transparency?: number[];
  /** Split the compressed data over this many IDAT chunks. */
  idatChunks?: number;
};

/** A PNG a decoder can read: real zlib data, real row filters, correct CRCs. */
export async function makeRealPng(o: RealPngOptions): Promise<Uint8Array> {
  const color = o.color ?? "rgba";
  const bpp = CHANNEL_COUNT[color];
  const stride = o.width * bpp;
  const rows: number[][] = [];
  for (let y = 0; y < o.height; y++) rows.push(Array.from({ length: o.width }, (_, x) => o.pixel(x, y)).flat());
  const raw = new Uint8Array((stride + 1) * o.height);
  for (let y = 0; y < o.height; y++) {
    const filter = typeof o.filter === "function" ? o.filter(y) : (o.filter ?? 0);
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const v = (rows[y] as number[])[x] as number;
      const a = x >= bpp ? ((rows[y] as number[])[x - bpp] as number) : 0;
      const b = y > 0 ? ((rows[y - 1] as number[])[x] as number) : 0;
      const c = x >= bpp && y > 0 ? ((rows[y - 1] as number[])[x - bpp] as number) : 0;
      const sub = filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? paethOf(a, b, c) : 0;
      raw[y * (stride + 1) + 1 + x] = (v - sub) & 0xff;
    }
  }
  const z = await deflate(raw);
  const parts = Math.max(1, o.idatChunks ?? 1);
  const size = Math.ceil(z.length / parts);
  const idats: Uint8Array[] = [];
  for (let i = 0; i < z.length; i += size) idats.push(pngChunk("IDAT", z.subarray(i, i + size)));
  return join(
    bytesOf(0x89, "PNG\r\n", 0x1a, "\n"),
    pngChunk("IHDR", bytesOf(u32(o.width), u32(o.height), 8, COLOR_TYPE[color], 0, 0, 0)),
    ...(color === "palette" ? [pngChunk("PLTE", (o.palette ?? [[0, 0, 0]]).flat()), ...(o.transparency ? [pngChunk("tRNS", o.transparency)] : [])] : []),
    ...idats,
    pngChunk("IEND"),
  );
}

/** A sketch as a canvas makes it: white page (or transparent), black ink where `ink(x, y)` is true. */
export const makeSketchPng = (width: number, height: number, ink: (x: number, y: number) => boolean, transparent = false): Promise<Uint8Array> =>
  makeRealPng({ width, height, color: "rgba", filter: 1, pixel: (x, y) => (ink(x, y) ? [0, 0, 0, 255] : transparent ? [0, 0, 0, 0] : [255, 255, 255, 255]) });
