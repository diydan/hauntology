/**
 * Upload validation and metadata stripping (world-pipeline tasks 3.2 to 3.4, Requirements 1.1 to 1.3). Pure: bytes in, an
 * answer out, no decoder. It reads the headers of a JPEG, PNG or WebP to know the type and the size in pixels, and strips
 * metadata by removing whole segments or chunks, never touching the picture data, so the pixels are exactly the ones sent.
 *
 * `validateUpload` accepts a file if and only if: it is at most 10 MB, the declared type is one of `image/jpeg`, `image/png`
 * and `image/webp`, the magic bytes are of that same type, the header can be read, the shorter side is at least 512 px and
 * the longer side at most 8192 px. Otherwise it says why, with a stable code, checking in that order.
 *
 * `stripMetadata` keeps only what is needed to show the picture (and its colour) and drops everything that can describe the
 * photographer or the place: EXIF, XMP, IPTC, comments, thumbnails, text chunks, time stamps, vendor and maker chunks, and
 * anything after the end of the image. See each function for what is kept.
 */

export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MIN_SHORT_SIDE = 512;
export const MAX_LONG_SIDE = 8192;

export type UploadCode = "upload_too_large" | "upload_too_small" | "upload_bad_type" | "upload_bad_magic" | "upload_rejected";
export type Dimensions = { width: number; height: number };
export type Validated = { ok: true; type: UploadType; width: number; height: number } | { ok: false; code: UploadCode };

/** The declared type, normalised (lower case, any `; parameter` dropped), or `null` when it is not one of the three. */
export function declaredType(declared: unknown): UploadType | null {
  if (typeof declared !== "string") return null;
  const t = (declared.split(";")[0] ?? "").trim().toLowerCase();
  return (UPLOAD_TYPES as readonly string[]).includes(t) ? (t as UploadType) : null;
}

/** The type the first bytes say, or `null`. */
export function sniffType(b: Uint8Array): UploadType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp";
  return null;
}

const ascii = (b: Uint8Array, at: number, n: number): string => {
  let s = "";
  for (let i = at; i < at + n && i < b.length; i++) s += String.fromCharCode(b[i] as number);
  return s;
};
const be16 = (b: Uint8Array, i: number): number => ((b[i] as number) << 8) | (b[i + 1] as number);
const be32 = (b: Uint8Array, i: number): number => ((b[i] as number) * 0x1000000) + (((b[i + 1] as number) << 16) | ((b[i + 2] as number) << 8) | (b[i + 3] as number));
const le24 = (b: Uint8Array, i: number): number => (b[i] as number) | ((b[i + 1] as number) << 8) | ((b[i + 2] as number) << 16);
const le32 = (b: Uint8Array, i: number): number => ((b[i] as number) | ((b[i + 1] as number) << 8) | ((b[i + 2] as number) << 16)) + (b[i + 3] as number) * 0x1000000;

const isSof = (m: number): boolean => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
const isStandalone = (m: number): boolean => m === 0x01 || (m >= 0xd0 && m <= 0xd8);

/** The size in pixels from the header, or `null` when the header cannot be read (cut off, wrong shape, a zero side). */
export function readDimensions(b: Uint8Array, type: UploadType): Dimensions | null {
  const out = (width: number, height: number): Dimensions | null => (width > 0 && height > 0 ? { width, height } : null);
  if (type === "image/png") {
    if (b.length < 24 || ascii(b, 12, 4) !== "IHDR" || be32(b, 8) !== 13) return null;
    return out(be32(b, 16), be32(b, 20));
  }
  if (type === "image/jpeg") {
    let i = 2;
    while (i + 4 <= b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1] as number;
      if (m === 0xff) { i++; continue; }
      if (isStandalone(m)) { i += 2; continue; }
      if (m === 0xda || m === 0xd9) return null; // the scan or the end, and no frame header before it
      const len = be16(b, i + 2);
      if (len < 2) return null;
      if (isSof(m)) return i + 9 <= b.length && len >= 8 ? out(be16(b, i + 7), be16(b, i + 5)) : null;
      i += 2 + len;
    }
    return null;
  }
  // WebP: the first chunk after the RIFF header says.
  if (b.length < 21) return null;
  const kind = ascii(b, 12, 4);
  if (kind === "VP8X") return b.length >= 30 ? out(le24(b, 24) + 1, le24(b, 27) + 1) : null;
  if (kind === "VP8L") {
    if (b.length < 25 || b[20] !== 0x2f) return null;
    const bits = le32(b, 21);
    return out((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (kind === "VP8 ") {
    if (b.length < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return out((b[26] as number) | (((b[27] as number) & 0x3f) << 8), (b[28] as number) | (((b[29] as number) & 0x3f) << 8));
  }
  return null;
}

/** Requirement 1.1 and 1.2. See the top of the file for the order of the checks. */
export function validateUpload(bytes: Uint8Array, declared: unknown): Validated {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return { ok: false, code: "upload_too_large" };
  const type = declaredType(declared);
  if (type === null) return { ok: false, code: "upload_bad_type" };
  if (sniffType(bytes) !== type) return { ok: false, code: "upload_bad_magic" };
  const dims = readDimensions(bytes, type);
  if (dims === null) return { ok: false, code: "upload_bad_magic" };
  if (Math.min(dims.width, dims.height) < MIN_SHORT_SIDE) return { ok: false, code: "upload_too_small" };
  if (Math.max(dims.width, dims.height) > MAX_LONG_SIDE) return { ok: false, code: "upload_too_large" };
  return { ok: true, type, ...dims };
}

function concat(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.byteLength;
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/**
 * JPEG: keeps every segment except those that carry metadata, and the scan data byte for byte.
 * Dropped: every APPn except three tiny ones that the picture needs or that carry no thumbnail (a JFIF header with no thumbnail,
 * an ICC colour profile in APP2, an Adobe colour-transform marker in APP14), so EXIF, XMP, IPTC, MPF and maker data go; and
 * COM comments. Anything after the end of the image goes too. Segments are also dropped between scans, not only before the
 * first. Returns `null` for a file that is not a whole JPEG (a cut-off segment, no end marker).
 */
export function stripJpegMetadata(b: Uint8Array): Uint8Array | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  const n = b.length;
  let i = 2;
  while (i < n) {
    // A segment header. Fill bytes (a run of 0xFF) may come before the marker.
    if (b[i] !== 0xff) return null;
    let m = b[i + 1];
    if (m === undefined) return null;
    if (m === 0xff) { i++; continue; }
    if (m === 0xd9) {
      parts.push(b.subarray(i, i + 2)); // the end: whatever follows is dropped
      return concat(parts);
    }
    if (m === 0xd8) return null;
    if (isStandalone(m)) {
      parts.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > n) return null;
    const len = be16(b, i + 2);
    if (len < 2 || i + 2 + len > n) return null;
    const seg = b.subarray(i, i + 2 + len);
    if (keepJpegSegment(m, seg)) parts.push(seg);
    i += 2 + len;
    if (m !== 0xda) continue;

    // The scan data after a start-of-scan header: copied as it is, up to the next real marker.
    let j = i;
    for (;;) {
      if (j >= n) return null;
      if (b[j] !== 0xff) { j++; continue; }
      m = b[j + 1];
      if (m === undefined) return null;
      if (m === 0x00 || (m >= 0xd0 && m <= 0xd7)) { j += 2; continue; } // a stuffed byte, or a restart marker
      if (m === 0xff) { j++; continue; } // fill
      break;
    }
    parts.push(b.subarray(i, j));
    i = j;
  }
  return null;
}

function keepJpegSegment(marker: number, seg: Uint8Array): boolean {
  if (marker === 0xfe) return false; // COM
  if (marker >= 0xe0 && marker <= 0xef) {
    if (marker === 0xe0) return seg.length === 18 && ascii(seg, 4, 5) === "JFIF\0" && seg[16] === 0 && seg[17] === 0; // JFIF with no thumbnail
    if (marker === 0xe2) return ascii(seg, 4, 12) === "ICC_PROFILE\0";
    if (marker === 0xee) return seg.length === 16 && ascii(seg, 4, 5) === "Adobe";
    return false;
  }
  return true;
}

const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "bKGD"]);

/**
 * PNG: keeps only the chunks the picture and its colour need (IHDR, PLTE, IDAT, IEND, tRNS, gAMA, cHRM, sRGB, iCCP, sBIT, bKGD),
 * unchanged and in order. Text chunks (tEXt, zTXt, iTXt), eXIf, tIME, pHYs, animation chunks, content-credential and every
 * other chunk go, and so does anything after IEND. Returns `null` for a file that is not a whole PNG.
 */
export function stripPngMetadata(b: Uint8Array): Uint8Array | null {
  if (sniffType(b) !== "image/png") return null;
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  let first = true;
  let idat = 0;
  while (i + 12 <= b.length) {
    const len = be32(b, i);
    const end = i + 12 + len;
    if (end > b.length) return null;
    const type = ascii(b, i + 4, 4);
    if (first && (type !== "IHDR" || len !== 13)) return null;
    first = false;
    if (PNG_KEEP.has(type)) {
      parts.push(b.subarray(i, end));
      if (type === "IDAT") idat++;
    }
    i = end;
    if (type === "IEND") return idat > 0 ? concat(parts) : null;
  }
  return null;
}

/**
 * WebP: keeps the image chunks (VP8, VP8L, ALPH), the colour profile (ICCP) and the extended header (VP8X) with its EXIF and
 * XMP flags cleared; drops EXIF, XMP and every other chunk; writes the RIFF size again. An animated WebP is refused
 * (`upload_rejected`): a world is made from one picture. Returns `null` for a file that is not a whole WebP.
 */
export function stripWebpMetadata(b: Uint8Array): Uint8Array | { rejected: "animated" } | null {
  if (sniffType(b) !== "image/webp") return null;
  const total = le32(b, 4) + 8;
  if (total > b.length || total < 12) return null;
  const chunks: Uint8Array[] = [];
  let image = 0;
  let i = 12;
  while (i + 8 <= total) {
    const kind = ascii(b, i, 4);
    const size = le32(b, i + 4);
    const end = i + 8 + size + (size % 2);
    if (end > total) return null;
    const whole = b.subarray(i, end);
    if (kind === "ANIM" || kind === "ANMF") return { rejected: "animated" };
    if (kind === "VP8X") {
      if (size < 10) return null;
      const flags = b[i + 8] as number;
      if ((flags & 0x02) !== 0) return { rejected: "animated" };
      const copy = whole.slice();
      copy[8] = flags & ~0x0c; // no EXIF (0x08), no XMP (0x04)
      chunks.push(copy);
    } else if (kind === "VP8 " || kind === "VP8L") {
      image++;
      chunks.push(whole);
    } else if (kind === "ALPH" || kind === "ICCP") {
      chunks.push(whole);
    }
    i = end;
  }
  if (image !== 1) return null;
  const body = concat(chunks);
  const head = new Uint8Array(12);
  head.set([0x52, 0x49, 0x46, 0x46], 0);
  const size = body.byteLength + 4;
  head[4] = size & 0xff;
  head[5] = (size >>> 8) & 0xff;
  head[6] = (size >>> 16) & 0xff;
  head[7] = (size >>> 24) & 0xff;
  head.set([0x57, 0x45, 0x42, 0x50], 8);
  return concat([head, body]);
}

export type Stripped = { ok: true; bytes: Uint8Array } | { ok: false; code: Extract<UploadCode, "upload_bad_magic" | "upload_rejected"> };

/** Strips the metadata of a file of a known type. A file that is not whole is `upload_bad_magic`; an animated WebP is `upload_rejected`. */
export function stripMetadata(bytes: Uint8Array, type: UploadType): Stripped {
  if (type === "image/webp") {
    const out = stripWebpMetadata(bytes);
    if (out === null) return { ok: false, code: "upload_bad_magic" };
    return out instanceof Uint8Array ? { ok: true, bytes: out } : { ok: false, code: "upload_rejected" };
  }
  const out = type === "image/jpeg" ? stripJpegMetadata(bytes) : stripPngMetadata(bytes);
  return out === null ? { ok: false, code: "upload_bad_magic" } : { ok: true, bytes: out };
}

/**
 * The whole of one upload as the route needs it: validate, strip, and check the stripped file is still a valid upload of the
 * same type and size in pixels, so a stripper that damaged the header cannot let a broken file through.
 */
export function prepareUpload(bytes: Uint8Array, declared: unknown): { ok: true; type: UploadType; width: number; height: number; bytes: Uint8Array } | { ok: false; code: UploadCode } {
  const v = validateUpload(bytes, declared);
  if (!v.ok) return v;
  const s = stripMetadata(bytes, v.type);
  if (!s.ok) return s;
  const again = validateUpload(s.bytes, v.type);
  if (!again.ok || again.type !== v.type || again.width !== v.width || again.height !== v.height) return { ok: false, code: "upload_bad_magic" };
  return { ok: true, type: v.type, width: v.width, height: v.height, bytes: s.bytes };
}
