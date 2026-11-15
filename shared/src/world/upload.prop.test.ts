import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { MAX_LONG_SIDE, MAX_UPLOAD_BYTES, MIN_SHORT_SIDE, readDimensions, stripJpegMetadata, stripPngMetadata, stripWebpMetadata, validateUpload, type UploadType } from "./upload";
import { ADOBE, ICC, JFIF, bytesOf, join, jpegSegment, makeJpeg, makePng, makeWebp, pngChunk, riffChunk, type WebpKind } from "./upload-kit";

const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const side = fc.oneof(fc.integer({ min: 1, max: 16383 }), fc.constantFrom(1, 511, 512, 513, 8191, 8192, 8193, 16383));

const build = (type: UploadType, width: number, height: number): Uint8Array =>
  type === "image/jpeg" ? makeJpeg({ width, height }) : type === "image/png" ? makePng({ width, height }) : makeWebp({ width, height, kind: "lossy" });

/** Property 1: Upload validation is exact. The oracle is written from the requirement, not from the code. */
describe("Property 1: Upload validation is exact", () => {
  it("accepts iff the declared type is allowed, the magic bytes agree, the size is at most 10 MB and the sides are in range; otherwise gives the specific code", () => {
    const declared = fc.constantFrom("same", "upper", "param", "other-a", "other-b", "gif", "none", "empty");
    const tweak = fc.constantFrom("none", "none", "none", "breakMagic", "truncate", "oversize");
    fc.assert(
      fc.property(fc.constantFrom(...TYPES), side, side, declared, tweak, (type, width, height, declaredKind, tweakKind) => {
        let bytes = build(type, width, height);
        if (tweakKind === "breakMagic") bytes = bytes.slice(), (bytes[type === "image/webp" ? 8 : 0] = 0x00);
        if (tweakKind === "truncate") bytes = bytes.slice(0, 10);
        if (tweakKind === "oversize") {
          const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
          big.set(bytes);
          bytes = big;
        }
        const others = TYPES.filter((t) => t !== type);
        const declaredType: string | undefined =
          declaredKind === "same" ? type : declaredKind === "upper" ? type.toUpperCase() : declaredKind === "param" ? `${type}; q=1` : declaredKind === "other-a" ? others[0] : declaredKind === "other-b" ? others[1] : declaredKind === "gif" ? "image/gif" : declaredKind === "empty" ? "" : undefined;
        const declaredAllowed = declaredKind !== "gif" && declaredKind !== "none" && declaredKind !== "empty";
        const declaredIsRight = declaredKind === "same" || declaredKind === "upper" || declaredKind === "param";

        let expected: string;
        if (tweakKind === "oversize") expected = "upload_too_large";
        else if (!declaredAllowed) expected = "upload_bad_type";
        else if (tweakKind === "breakMagic" || tweakKind === "truncate" || !declaredIsRight) expected = "upload_bad_magic";
        else if (Math.min(width, height) < MIN_SHORT_SIDE) expected = "upload_too_small";
        else if (Math.max(width, height) > MAX_LONG_SIDE) expected = "upload_too_large";
        else expected = "ok";

        const got = validateUpload(bytes, declaredType);
        expect(got.ok ? "ok" : got.code).toBe(expected);
        if (got.ok) expect(got).toEqual({ ok: true, type, width, height });
      }),
      propParams(),
    );
  });

  it("never throws, whatever the bytes and whatever is declared", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 80 }), fc.oneof(fc.constantFrom(...TYPES), fc.string(), fc.constant(undefined), fc.integer()), (bytes, declared) => {
        const got = validateUpload(bytes, declared);
        expect(typeof got.ok).toBe("boolean");
        if (got.ok) expect(got.width).toBeGreaterThanOrEqual(MIN_SHORT_SIDE);
      }),
      propParams(),
    );
  });
});

// ---- independent readers, written for the tests ----

type JpegParts = { segments: { marker: number; bytes: Uint8Array }[]; scans: Uint8Array[]; endsWithEoi: boolean };
function readJpeg(b: Uint8Array): JpegParts {
  const segments: JpegParts["segments"] = [];
  const scans: Uint8Array[] = [];
  let i = 2;
  let endsWithEoi = false;
  while (i < b.length) {
    const marker = b[i + 1] as number;
    if (marker === 0xd9) { endsWithEoi = i + 2 === b.length; break; }
    const len = ((b[i + 2] as number) << 8) | (b[i + 3] as number);
    segments.push({ marker, bytes: b.slice(i, i + 2 + len) });
    i += 2 + len;
    if (marker !== 0xda) continue;
    let j = i;
    while (!(b[j] === 0xff && b[j + 1] !== 0x00 && !((b[j + 1] as number) >= 0xd0 && (b[j + 1] as number) <= 0xd7))) j += b[j] === 0xff ? 2 : 1;
    scans.push(b.slice(i, j));
    i = j;
  }
  return { segments, scans, endsWithEoi };
}

const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
const GOOD_JPEG = [JFIF(), ICC(), ADOBE()];

/** Property 2: Metadata stripping preserves pixels and removes metadata. */
describe("Property 2: Metadata stripping preserves pixels and removes metadata", () => {
  const payload = fc.uint8Array({ maxLength: 24 });
  const junkMarker = fc.constantFrom(0xe1, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0xec, 0xed, 0xef, 0xfe);
  const junk = fc.tuple(junkMarker, payload).map(([m, p]) => jpegSegment(m, p));
  // A JFIF with a thumbnail, and an APP2 that is not a colour profile, are also metadata.
  const thumbJfif = fc.uint8Array({ minLength: 1, maxLength: 8 }).map((p) => jpegSegment(0xe0, bytesOf("JFIF\0", 1, 1, 0, 0, 1, 0, 1, 1, 1, p)));
  const otherApp2 = payload.map((p) => jpegSegment(0xe2, bytesOf("MPF\0", p)));
  const segment = fc.oneof({ weight: 3, arbitrary: junk }, { weight: 1, arbitrary: thumbJfif }, { weight: 1, arbitrary: otherApp2 }, { weight: 2, arbitrary: fc.constantFrom(...GOOD_JPEG) });
  const segments = fc.array(segment, { maxLength: 4 });
  const scan = fc.array(fc.integer({ min: 0, max: 263 }), { minLength: 1, maxLength: 30 }).map((tokens) =>
    Uint8Array.from(tokens.flatMap((t) => (t === 255 ? [0xff, 0x00] : t > 255 ? [0xff, 0xd0 + (t - 256)] : [t]))),
  );
  const picture = fc.record({
    width: fc.integer({ min: 1, max: 4000 }),
    height: fc.integer({ min: 1, max: 4000 }),
    head: segments,
    middle: segments,
    scans: fc.array(scan, { minLength: 1, maxLength: 3 }),
    between: fc.array(segments, { minLength: 3, maxLength: 3 }),
    trailing: fc.option(fc.uint8Array({ maxLength: 20 }), { nil: undefined }),
  });

  it("JPEG: removes every metadata segment wherever it is, keeps the others in order, keeps every scan byte for byte, and drops what follows the end", () => {
    fc.assert(
      fc.property(picture, (p) => {
        const input = makeJpeg({ width: p.width, height: p.height, head: p.head, middle: p.middle, scans: p.scans, between: Object.fromEntries(p.between.map((s, i) => [i, s])), ...(p.trailing !== undefined ? { trailing: p.trailing } : {}) });
        const out = stripJpegMetadata(input);
        expect(out).not.toBeNull();
        const before = readJpeg(input);
        const after = readJpeg(out as Uint8Array);
        // Nothing but the three kept kinds of marker segment is left, and no comment.
        for (const s of after.segments) {
          if (s.marker >= 0xe0 && s.marker <= 0xef) expect(GOOD_JPEG.some((g) => same(g, s.bytes))).toBe(true);
          expect(s.marker).not.toBe(0xfe);
        }
        // Every other segment is kept, unchanged and in order.
        const wanted = before.segments.filter((s) => !(s.marker >= 0xe0 && s.marker <= 0xef) && s.marker !== 0xfe || GOOD_JPEG.some((g) => same(g, s.bytes)));
        expect(after.segments.length).toBe(wanted.length);
        after.segments.forEach((s, i) => expect(same(s.bytes, (wanted[i] as { bytes: Uint8Array }).bytes)).toBe(true));
        // The pixels: every scan is the same bytes.
        expect(after.scans.length).toBe(before.scans.length);
        after.scans.forEach((s, i) => expect(same(s, before.scans[i] as Uint8Array)).toBe(true));
        expect(after.endsWithEoi).toBe(true);
        expect((out as Uint8Array).length).toBeLessThanOrEqual(input.length);
        expect(readDimensions(out as Uint8Array, "image/jpeg")).toEqual({ width: p.width, height: p.height });
        // Stripping twice is the same as once.
        expect(same(stripJpegMetadata(out as Uint8Array) as Uint8Array, out as Uint8Array)).toBe(true);
      }),
      propParams(),
    );
  });

  const KEEP_PNG = ["gAMA", "cHRM", "sRGB", "sBIT", "bKGD", "tRNS", "PLTE", "iCCP"];
  const JUNK_PNG = ["tEXt", "zTXt", "iTXt", "eXIf", "tIME", "pHYs", "acTL", "fcTL", "fdAT", "caBX", "prVW", "abCD"];

  it("PNG: keeps only the chunks the picture needs, unchanged and in order, every IDAT byte for byte, and drops what follows IEND", () => {
    const chunk = fc.tuple(fc.constantFrom(...KEEP_PNG, ...JUNK_PNG, ...JUNK_PNG), fc.uint8Array({ maxLength: 12 })).map(([t, d]) => ({ type: t, data: d }));
    const chunks = fc.array(chunk, { maxLength: 4 });
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4000 }), fc.integer({ min: 1, max: 4000 }), chunks, chunks, chunks, fc.array(fc.uint8Array({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 3 }), fc.option(fc.uint8Array({ maxLength: 20 }), { nil: undefined }), (width, height, before, between, after, idat, trailing) => {
        const wrap = (cs: { type: string; data: Uint8Array }[]) => cs.map((c) => pngChunk(c.type, c.data));
        const input = makePng({ width, height, before: wrap(before), between: wrap(between), after: wrap(after), idat, ...(trailing !== undefined ? { trailing } : {}) });
        const out = stripPngMetadata(input) as Uint8Array;
        expect(out).not.toBeNull();
        const read = (b: Uint8Array) => {
          const list: { type: string; bytes: Uint8Array }[] = [];
          for (let i = 8; i < b.length; ) {
            const len = (b[i] as number) * 0x1000000 + ((b[i + 1] as number) << 16) + ((b[i + 2] as number) << 8) + (b[i + 3] as number);
            list.push({ type: String.fromCharCode(...b.subarray(i + 4, i + 8)), bytes: b.slice(i, i + 12 + len) });
            i += 12 + len;
            if (list[list.length - 1]!.type === "IEND") break;
          }
          return list;
        };
        const before0 = read(input);
        const after0 = read(out);
        const keepSet = new Set(["IHDR", "IDAT", "IEND", ...KEEP_PNG]);
        const wanted = before0.filter((c) => keepSet.has(c.type));
        expect(after0.map((c) => c.type)).toEqual(wanted.map((c) => c.type));
        after0.forEach((c, i) => expect(same(c.bytes, (wanted[i] as { bytes: Uint8Array }).bytes)).toBe(true));
        expect(after0[after0.length - 1]!.type).toBe("IEND");
        expect(out.length).toBe(after0.reduce((n, c) => n + c.bytes.length, 8)); // nothing follows the end
        expect(out.length).toBeLessThanOrEqual(input.length);
        expect(readDimensions(out, "image/png")).toEqual({ width, height });
        expect(same(stripPngMetadata(out) as Uint8Array, out)).toBe(true);
      }),
      propParams(),
    );
  });

  it("WebP: drops EXIF, XMP and unknown chunks, clears their flags and keeps the others, the image chunk byte for byte, with the RIFF size right", () => {
    const junk = fc.tuple(fc.constantFrom("EXIF", "XMP ", "UNKN", "JUNK"), fc.uint8Array({ maxLength: 15 })).map(([t, d]) => riffChunk(t, d));
    const kept = fc.tuple(fc.constantFrom("ICCP", "ALPH"), fc.uint8Array({ maxLength: 15 })).map(([t, d]) => riffChunk(t, d));
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 16383 }), fc.integer({ min: 1, max: 16383 }), fc.constantFrom<WebpKind>("lossy", "lossless", "extended"), fc.integer({ min: 0, max: 0x3d }).map((f) => f & ~0x02), fc.array(fc.oneof(junk, kept), { maxLength: 5 }), (width, height, kind, flags, extra) => {
        const input = makeWebp({ width, height, kind, flags, extra });
        const out = stripWebpMetadata(input) as Uint8Array;
        expect(out).not.toBeNull();
        const read = (b: Uint8Array) => {
          const list: { type: string; bytes: Uint8Array }[] = [];
          for (let i = 12; i + 8 <= b.length; ) {
            const size = (b[i + 4] as number) | ((b[i + 5] as number) << 8) | ((b[i + 6] as number) << 16);
            const end = i + 8 + size + (size % 2);
            list.push({ type: String.fromCharCode(...b.subarray(i, i + 4)), bytes: b.slice(i, end) });
            i = end;
          }
          return list;
        };
        const was = read(input);
        const now = read(out);
        const wanted = was.filter((c) => ["VP8X", "ICCP", "ALPH", "VP8 ", "VP8L"].includes(c.type));
        expect(now.map((c) => c.type)).toEqual(wanted.map((c) => c.type));
        now.forEach((c, i) => {
          const original = (wanted[i] as { bytes: Uint8Array }).bytes;
          if (c.type === "VP8X") {
            expect(c.bytes[8]).toBe((original[8] as number) & ~0x0c);
            expect(same(c.bytes.subarray(9), original.subarray(9))).toBe(true);
          } else expect(same(c.bytes, original)).toBe(true);
        });
        expect((out[4] as number) | ((out[5] as number) << 8) | ((out[6] as number) << 16) | ((out[7] as number) << 24)).toBe(out.length - 8);
        expect(out.length).toBeLessThanOrEqual(input.length);
        expect(readDimensions(out, "image/webp")).toEqual({ width, height });
        expect(same(stripWebpMetadata(out) as Uint8Array, out)).toBe(true);
      }),
      propParams(),
    );
  });

  it("never throws on bytes that are not a picture, and answers null or a smaller file", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 120 }), (b) => {
        for (const f of [stripJpegMetadata, stripPngMetadata, stripWebpMetadata] as const) {
          const out = f(b);
          if (out instanceof Uint8Array) expect(out.length).toBeLessThanOrEqual(b.length + 12);
        }
      }),
      propParams(),
    );
  });

  it("never throws on a real picture cut off at any point, and never answers a file longer than the input", () => {
    const samples = [makeJpeg({ width: 800, height: 600, head: [JFIF()], scans: [bytesOf(1, 2, 0xff, 0x00)] }), makePng({ width: 800, height: 600 }), makeWebp({ width: 800, height: 600, kind: "extended", flags: 0x08, extra: [riffChunk("EXIF", [1, 2, 3])] })];
    for (const s of samples) {
      for (let n = 0; n <= s.length; n++) {
        const cut = s.subarray(0, n);
        for (const f of [stripJpegMetadata, stripPngMetadata, stripWebpMetadata] as const) {
          const out = f(cut);
          if (out instanceof Uint8Array) expect(out.length).toBeLessThanOrEqual(cut.length);
        }
      }
    }
    expect(join(bytesOf(1))).toEqual(bytesOf(1));
  });
});
