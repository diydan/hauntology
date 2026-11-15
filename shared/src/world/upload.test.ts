import { describe, expect, it } from "vitest";
import {
  MAX_LONG_SIDE, MAX_UPLOAD_BYTES, MIN_SHORT_SIDE, declaredType, prepareUpload, readDimensions, sniffType, stripJpegMetadata, stripMetadata, stripPngMetadata, stripWebpMetadata, validateUpload,
} from "./upload";
import { ADOBE, COMMENT, EXIF, ICC, IPTC, JFIF, XMP, bytesOf, join, jpegSegment, makeJpeg, makePng, makeWebp, pngChunk, riffChunk } from "./upload-kit";

const JPEG = (w = 800, h = 600) => makeJpeg({ width: w, height: h });
const PNG = (w = 800, h = 600) => makePng({ width: w, height: h });
const WEBP = (w = 800, h = 600, kind: "lossy" | "lossless" | "extended" = "lossy") => makeWebp({ width: w, height: h, kind });
const code = (b: Uint8Array, declared: unknown) => {
  const v = validateUpload(b, declared);
  return v.ok ? "ok" : v.code;
};

/** The markers of a JPEG's segments up to and including the first scan header, read independently of the stripper. */
const markers = (b: Uint8Array): number[] => {
  const out: number[] = [];
  let i = 2;
  while (i < b.length) {
    const m = b[i + 1] as number;
    out.push(m);
    if (m === 0xda || m === 0xd9) break;
    i += 2 + (((b[i + 2] as number) << 8) | (b[i + 3] as number));
  }
  return out;
};
const text = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

describe("sniffType and declaredType", () => {
  it("reads the type from the first bytes", () => {
    expect(sniffType(JPEG())).toBe("image/jpeg");
    expect(sniffType(PNG())).toBe("image/png");
    expect(sniffType(WEBP())).toBe("image/webp");
    for (const b of [new Uint8Array(0), bytesOf(0xff, 0xd8), bytesOf("GIF89a"), bytesOf("RIFF", 0, 0, 0, 0, "WAVE"), bytesOf("RIFF....WEB"), bytesOf(0x89, "PNG")]) expect(sniffType(b)).toBeNull();
  });

  it("needs every byte of a signature: a picture with any one of them changed is of no type", () => {
    const flip = (b: Uint8Array, at: number) => {
      const c = b.slice();
      c[at] = (c[at] as number) ^ 0x5a;
      return c;
    };
    for (let i = 0; i < 3; i++) expect(sniffType(flip(JPEG(), i)), `jpeg ${i}`).toBeNull();
    for (let i = 0; i < 8; i++) expect(sniffType(flip(PNG(), i)), `png ${i}`).toBeNull();
    for (const i of [0, 1, 2, 3, 8, 9, 10, 11]) expect(sniffType(flip(WEBP(), i)), `webp ${i}`).toBeNull();
  });

  it("normalises the declared type and takes only the three", () => {
    expect(declaredType("image/jpeg")).toBe("image/jpeg");
    expect(declaredType(" IMAGE/PNG ")).toBe("image/png");
    expect(declaredType("image/webp; charset=binary")).toBe("image/webp");
    for (const t of ["image/jpg", "image/gif", "image/svg+xml", "image/heic", "application/octet-stream", "", "jpeg", undefined, null, 5, {}]) expect(declaredType(t), String(t)).toBeNull();
  });
});

describe("readDimensions", () => {
  it("reads the size of each kind of file", () => {
    expect(readDimensions(JPEG(1234, 567), "image/jpeg")).toEqual({ width: 1234, height: 567 });
    expect(readDimensions(PNG(1234, 567), "image/png")).toEqual({ width: 1234, height: 567 });
    for (const kind of ["lossy", "lossless", "extended"] as const) expect(readDimensions(WEBP(1234, 567, kind), "image/webp"), kind).toEqual({ width: 1234, height: 567 });
    expect(readDimensions(WEBP(16383, 1, "lossless"), "image/webp")).toEqual({ width: 16383, height: 1 });
    expect(readDimensions(WEBP(16384, 16384, "extended"), "image/webp")).toEqual({ width: 16384, height: 16384 });
  });

  it("finds the frame header after other segments, in every kind of frame", () => {
    expect(readDimensions(makeJpeg({ width: 700, height: 900, head: [JFIF(), EXIF(), ICC()], middle: [COMMENT()] }), "image/jpeg")).toEqual({ width: 700, height: 900 });
    for (const m of [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc9, 0xcf]) {
      const b = join(bytesOf(0xff, 0xd8), jpegSegment(m, bytesOf(8, 3, 0, 2, 0xff, 1, 1, 0x11, 0)), bytesOf(0xff, 0xd9));
      expect(readDimensions(b, "image/jpeg"), m.toString(16)).toEqual({ width: 767, height: 768 });
    }
  });

  it("does not take a DHT, a JPG or a DAC marker for a frame header, and gives up at the scan", () => {
    for (const m of [0xc4, 0xc8, 0xcc]) {
      const b = join(bytesOf(0xff, 0xd8), jpegSegment(m, bytesOf(8, 3, 0, 2, 0, 1, 1, 0x11, 0)), bytesOf(0xff, 0xd9));
      expect(readDimensions(b, "image/jpeg"), m.toString(16)).toBeNull();
    }
    expect(readDimensions(join(bytesOf(0xff, 0xd8), jpegSegment(0xda, bytesOf(1, 1, 0, 0, 63, 0)), bytesOf(1, 2, 0xff, 0xd9)), "image/jpeg")).toBeNull();
  });

  it("gives up at the scan, even when what follows it looks like a frame header", () => {
    const looksLikeFrame = bytesOf(0xff, 0xc0, 0, 11, 8, 3, 0, 2, 0, 1, 1, 0x11, 0);
    expect(readDimensions(join(bytesOf(0xff, 0xd8), jpegSegment(0xda, bytesOf(1, 1, 0, 0, 63, 0)), looksLikeFrame, bytesOf(0xff, 0xd9)), "image/jpeg")).toBeNull();
    expect(readDimensions(join(bytesOf(0xff, 0xd8), bytesOf(0xff, 0xd9), looksLikeFrame), "image/jpeg")).toBeNull();
  });

  it("gives null for a header that is cut off, the wrong shape, or has a side of zero", () => {
    expect(readDimensions(JPEG().subarray(0, 20), "image/jpeg")).toBeNull();
    expect(readDimensions(makeJpeg({ width: 0, height: 600 }), "image/jpeg")).toBeNull();
    expect(readDimensions(PNG().subarray(0, 20), "image/png")).toBeNull();
    expect(readDimensions(makePng({ width: 0, height: 5 }), "image/png")).toBeNull();
    const notIhdr = PNG();
    notIhdr.set(bytesOf("IDAT"), 12);
    expect(readDimensions(notIhdr, "image/png")).toBeNull();
    const shortIhdr = PNG();
    shortIhdr[11] = 12;
    expect(readDimensions(shortIhdr, "image/png")).toBeNull();
    const badStart = WEBP();
    badStart[23] = 0;
    expect(readDimensions(badStart, "image/webp")).toBeNull();
    const badLossless = WEBP(800, 600, "lossless");
    badLossless[20] = 0;
    expect(readDimensions(badLossless, "image/webp")).toBeNull();
    expect(readDimensions(WEBP().subarray(0, 25), "image/webp")).toBeNull();
    expect(readDimensions(join(bytesOf("RIFF", 0, 0, 0, 0, "WEBP"), riffChunk("EXIF", new Array(30).fill(1))), "image/webp")).toBeNull();
  });
});

describe("validateUpload", () => {
  it("accepts each type at the sizes in the requirement, edges included", () => {
    for (const [type, make] of [["image/jpeg", JPEG], ["image/png", PNG], ["image/webp", WEBP]] as const) {
      expect(validateUpload(make(MIN_SHORT_SIDE, MIN_SHORT_SIDE), type), type).toEqual({ ok: true, type, width: 512, height: 512 });
      expect(validateUpload(make(MAX_LONG_SIDE, MIN_SHORT_SIDE), type), type).toMatchObject({ ok: true, width: 8192, height: 512 });
      expect(validateUpload(make(MIN_SHORT_SIDE, MAX_LONG_SIDE), type), type).toMatchObject({ ok: true });
    }
  });

  it("says upload_too_small below 512 on the shorter side, whichever side it is", () => {
    for (const [w, h] of [[511, 800], [800, 511], [100, 100], [1, 9000]] as const) expect(code(JPEG(w, h), "image/jpeg"), `${w}x${h}`).toBe("upload_too_small");
  });

  it("says upload_too_large above 8192 on the longer side", () => {
    for (const [w, h] of [[8193, 600], [600, 8193], [20000, 4000]] as const) expect(code(PNG(w, h), "image/png"), `${w}x${h}`).toBe("upload_too_large");
  });

  it("says upload_too_large past 10 MB and not at exactly 10 MB, before it looks at anything else", () => {
    const big = (n: number) => {
      const b = new Uint8Array(n);
      b.set(JPEG());
      return b;
    };
    expect(code(big(MAX_UPLOAD_BYTES), "image/jpeg")).toBe("ok");
    expect(code(big(MAX_UPLOAD_BYTES + 1), "image/jpeg")).toBe("upload_too_large");
    expect(code(new Uint8Array(MAX_UPLOAD_BYTES + 1), "image/gif")).toBe("upload_too_large");
    expect(code(new Uint8Array(MAX_UPLOAD_BYTES + 1), undefined)).toBe("upload_too_large");
  });

  it("says upload_bad_type when the declared type is not one of the three, before it looks at the bytes", () => {
    for (const t of ["image/gif", "image/jpg", "text/html", "", undefined, null, 7]) {
      expect(code(JPEG(), t), String(t)).toBe("upload_bad_type");
      expect(code(new Uint8Array(0), t), String(t)).toBe("upload_bad_type");
    }
  });

  it("says upload_bad_magic when the bytes are of another type than the declared one, or of none", () => {
    expect(code(PNG(), "image/jpeg")).toBe("upload_bad_magic");
    expect(code(JPEG(), "image/png")).toBe("upload_bad_magic");
    expect(code(WEBP(), "image/png")).toBe("upload_bad_magic");
    expect(code(bytesOf("GIF89a", new Array(40).fill(0)), "image/jpeg")).toBe("upload_bad_magic");
    expect(code(bytesOf("<html><script>alert(1)</script></html>"), "image/png")).toBe("upload_bad_magic");
    expect(code(new Uint8Array(0), "image/jpeg")).toBe("upload_bad_magic");
  });

  it("says upload_bad_magic when the header cannot be read, and looks at the type before the size", () => {
    expect(code(JPEG().subarray(0, 12), "image/jpeg")).toBe("upload_bad_magic");
    expect(code(makeJpeg({ width: 0, height: 0 }), "image/jpeg")).toBe("upload_bad_magic");
    expect(code(PNG(100, 100).subarray(0, 14), "image/png")).toBe("upload_bad_magic");
  });

  it("accepts a type given in capitals or with a parameter", () => {
    expect(code(JPEG(), "IMAGE/JPEG")).toBe("ok");
    expect(code(WEBP(), "image/webp; q=1")).toBe("ok");
  });
});

describe("stripJpegMetadata", () => {
  it("removes EXIF, XMP, IPTC and comments, keeps the colour profile and the tables, and keeps the scan byte for byte", () => {
    const scan = bytesOf(9, 8, 7, 0xff, 0x00, 6, 0xff, 0xd3, 5, 4);
    const input = makeJpeg({ width: 800, height: 600, head: [JFIF(), EXIF(), XMP(), IPTC(), COMMENT(), ICC(), ADOBE()], middle: [COMMENT("again")], scans: [scan] });
    const out = stripJpegMetadata(input)!;
    expect(markers(out)).toEqual([0xe0, 0xe2, 0xee, 0xdb, 0xc0, 0xc4, 0xda]);
    expect(text(out)).not.toMatch(/Canon|GPS|xmpmeta|Photoshop|taken at home|again/);
    expect(out.slice(out.length - 2 - scan.length)).toEqual(join(scan, bytesOf(0xff, 0xd9)));
    expect(readDimensions(out, "image/jpeg")).toEqual({ width: 800, height: 600 });
    expect(out.length).toBeLessThan(input.length);
  });

  it("drops a JFIF header that carries a thumbnail, an APP2 that is not a colour profile, and an Adobe marker of another shape", () => {
    const thumb = jpegSegment(0xe0, bytesOf("JFIF\0", 1, 1, 0, u(1), u(1), 2, 2, new Array(12).fill(5)));
    // The right length for a JFIF header, but it says there is a thumbnail, in either direction.
    const sneakyX = jpegSegment(0xe0, bytesOf("JFIF\0", 1, 1, 0, u(1), u(1), 3, 0));
    const sneakyY = jpegSegment(0xe0, bytesOf("JFIF\0", 1, 1, 0, u(1), u(1), 0, 3));
    expect(markers(stripJpegMetadata(makeJpeg({ width: 800, height: 600, head: [sneakyX, sneakyY] }))!)).toEqual([0xdb, 0xc0, 0xc4, 0xda]);
    const mpf = jpegSegment(0xe2, bytesOf("MPF\0", new Array(20).fill(1)));
    const odd = jpegSegment(0xee, bytesOf("Adobe", 0, 100, 0, 0, 0, 0, 1, 9, 9));
    const jfxx = jpegSegment(0xe0, bytesOf("JFXX\0", 0x10, new Array(10).fill(3)));
    expect(markers(stripJpegMetadata(makeJpeg({ width: 800, height: 600, head: [thumb, mpf, odd, jfxx] }))!)).toEqual([0xdb, 0xc0, 0xc4, 0xda]);
  });

  it("removes metadata that comes between scans, not only before the first", () => {
    const input = makeJpeg({ width: 800, height: 600, scans: [bytesOf(1, 2), bytesOf(3, 4), bytesOf(5, 6)], between: { 0: [COMMENT("hidden one")], 1: [EXIF("Exif\0\0late gps"), XMP()] } });
    const out = stripJpegMetadata(input)!;
    expect(text(out)).not.toMatch(/hidden one|late gps|xmpmeta/);
    expect(out.length).toBe(input.length - COMMENT("hidden one").length - EXIF("Exif\0\0late gps").length - XMP().length);
  });

  it("drops what follows the end of the image", () => {
    const out = stripJpegMetadata(makeJpeg({ width: 800, height: 600, trailing: bytesOf("SECRET appended data MPF") }))!;
    expect(out.slice(-2)).toEqual(bytesOf(0xff, 0xd9));
    expect(text(out)).not.toContain("SECRET");
  });

  it("keeps a restart marker and a stuffed byte inside the scan, and does not take them for the end of it", () => {
    const scan = bytesOf(1, 0xff, 0x00, 0xff, 0xd0, 2, 0xff, 0xd7, 3, 0xff, 0xff, 0x00, 4);
    const out = stripJpegMetadata(makeJpeg({ width: 800, height: 600, scans: [scan], between: { 0: [COMMENT("x")] } }))!;
    expect(out.slice(out.length - 2 - scan.length)).toEqual(join(scan, bytesOf(0xff, 0xd9)));
  });

  it("is idempotent and leaves a picture with nothing to remove as it was", () => {
    const clean = makeJpeg({ width: 800, height: 600, head: [JFIF(), ICC()] });
    expect(stripJpegMetadata(clean)).toEqual(clean);
    const once = stripJpegMetadata(makeJpeg({ width: 800, height: 600, head: [EXIF(), COMMENT()] }))!;
    expect(stripJpegMetadata(once)).toEqual(once);
  });

  it("refuses a file that is not a whole JPEG", () => {
    const whole = makeJpeg({ width: 800, height: 600, head: [EXIF()] });
    expect(stripJpegMetadata(whole.subarray(0, whole.length - 2))).toBeNull(); // no end marker
    expect(stripJpegMetadata(makeJpeg({ width: 800, height: 600, noEnd: true }))).toBeNull();
    expect(stripJpegMetadata(whole.subarray(0, 30))).toBeNull(); // cut in a segment
    expect(stripJpegMetadata(bytesOf(0xff, 0xd8, 0xff))).toBeNull();
    expect(stripJpegMetadata(bytesOf(1, 2, 3, 4, 5))).toBeNull();
    expect(stripJpegMetadata(new Uint8Array(0))).toBeNull();
    expect(stripJpegMetadata(join(bytesOf(0xff, 0xd8, 0xff, 0xd8), bytesOf(0xff, 0xd9)))).toBeNull(); // a second start of image
    expect(stripJpegMetadata(join(bytesOf(0xff, 0xd8), bytesOf(0xff, 0xe1, 0x00, 0x01), bytesOf(0xff, 0xd9)))).toBeNull(); // a length under 2
  });
});

describe("stripPngMetadata", () => {
  it("keeps the chunks the picture needs, in order and unchanged, and drops text, EXIF, time, size-in-metres, animation and unknown chunks", () => {
    const keep = [pngChunk("gAMA", [0, 1, 0, 0]), pngChunk("sRGB", [0]), pngChunk("tRNS", [1, 2]), pngChunk("PLTE", [1, 2, 3])];
    const drop = [pngChunk("tEXt", bytesOf("Author\0Someone")), pngChunk("iTXt", bytesOf("XML:com.adobe.xmp\0xmp")), pngChunk("zTXt", [1]), pngChunk("eXIf", bytesOf("Exif\0\0GPS")), pngChunk("tIME", [7, 230, 1, 1, 1, 1, 1]), pngChunk("pHYs", new Array(9).fill(0)), pngChunk("acTL", new Array(8).fill(0)), pngChunk("caBX", bytesOf("c2pa manifest")), pngChunk("prVW", [1])];
    const input = makePng({ width: 800, height: 600, before: [drop[0]!, ...keep.slice(0, 2), drop[1]!, drop[3]!], between: [drop[2]!, keep[2]!, drop[4]!], after: [keep[3]!, ...drop.slice(5)] });
    const out = stripPngMetadata(input)!;
    const types: string[] = [];
    for (let i = 8; i < out.length; ) {
      const len = (out[i] as number) * 0x1000000 + ((out[i + 1] as number) << 16) + ((out[i + 2] as number) << 8) + (out[i + 3] as number);
      types.push(text(out.subarray(i + 4, i + 8)));
      i += 12 + len;
    }
    expect(types).toEqual(["IHDR", "gAMA", "sRGB", "IDAT", "tRNS", "PLTE", "IEND"]);
    expect(text(out)).not.toMatch(/Someone|xmp|GPS|c2pa/);
    expect(readDimensions(out, "image/png")).toEqual({ width: 800, height: 600 });
  });

  it("keeps several IDAT chunks, and drops what follows IEND", () => {
    const input = makePng({ width: 800, height: 600, idat: [bytesOf(1, 2), bytesOf(3, 4), bytesOf(5)], trailing: bytesOf("appended secret") });
    const out = stripPngMetadata(input)!;
    expect(out.length).toBe(input.length - "appended secret".length);
    expect(text(out)).not.toContain("secret");
  });

  it("is idempotent, and leaves a clean picture as it was", () => {
    const clean = PNG();
    expect(stripPngMetadata(clean)).toEqual(clean);
    const once = stripPngMetadata(makePng({ width: 800, height: 600, before: [pngChunk("tEXt", bytesOf("a\0b"))] }))!;
    expect(stripPngMetadata(once)).toEqual(once);
  });

  it("refuses a file that is not a whole PNG: no signature, no IHDR first, cut off, no IEND, no IDAT", () => {
    const whole = PNG();
    expect(stripPngMetadata(whole.subarray(0, whole.length - 12))).toBeNull();
    expect(stripPngMetadata(whole.subarray(0, 40))).toBeNull();
    for (const cut of [1, 2, 3, 4, 8, 11]) expect(stripPngMetadata(whole.subarray(0, whole.length - cut)), `IEND cut by ${cut}`).toBeNull();
    // A last chunk named IEND that says it is longer than what is left of the file.
    const withoutEnd = makePng({ width: 800, height: 600, noEnd: true });
    expect(stripPngMetadata(join(withoutEnd, bytesOf(0, 0, 0, 100, "IEND", 1, 2, 3, 4, 5, 6, 7, 8)))).toBeNull();
    expect(stripPngMetadata(makePng({ width: 800, height: 600, noEnd: true }))).toBeNull();
    expect(stripPngMetadata(JPEG())).toBeNull();
    expect(stripPngMetadata(join(bytesOf(0x89, "PNG\r\n", 0x1a, "\n"), pngChunk("tEXt", bytesOf("a\0b")), pngChunk("IEND")))).toBeNull(); // IHDR is not first
    expect(stripPngMetadata(join(bytesOf(0x89, "PNG\r\n", 0x1a, "\n"), pngChunk("IHDR", new Array(13).fill(0)), pngChunk("IEND")))).toBeNull(); // no IDAT
    expect(stripPngMetadata(join(bytesOf(0x89, "PNG\r\n", 0x1a, "\n"), pngChunk("IHDR", new Array(12).fill(0)), pngChunk("IDAT", [1]), pngChunk("IEND")))).toBeNull(); // IHDR is not 13 bytes
  });
});

describe("stripWebpMetadata", () => {
  const meta = () => [riffChunk("EXIF", bytesOf("Exif\0\0GPS home")), riffChunk("XMP ", bytesOf("<x:xmpmeta/>")), riffChunk("JUNK", [1, 2, 3])];

  it("drops EXIF, XMP and unknown chunks, clears their flags, keeps the others, and writes the size again", () => {
    const icc = riffChunk("ICCP", [1, 2, 3, 4, 5]);
    const input = makeWebp({ width: 800, height: 600, kind: "extended", flags: 0x08 | 0x04 | 0x20 | 0x10, extra: [icc, ...meta()] });
    const out = stripWebpMetadata(input) as Uint8Array;
    expect(text(out)).not.toMatch(/GPS|xmpmeta|JUNK/);
    expect(out[20]).toBe(0x20 | 0x10); // ICC and alpha stay
    expect(text(out)).toContain("ICCP");
    expect(out.length).toBe(input.length - meta().reduce((n, c) => n + c.length, 0));
    expect(out[4]! | (out[5]! << 8) | (out[6]! << 16)).toBe(out.length - 8);
    expect(readDimensions(out, "image/webp")).toEqual({ width: 800, height: 600 });
  });

  it("handles the three kinds, with and without metadata, and is idempotent", () => {
    for (const kind of ["lossy", "lossless"] as const) {
      const clean = makeWebp({ width: 800, height: 600, kind });
      expect(stripWebpMetadata(clean)).toEqual(clean);
    }
    const once = stripWebpMetadata(makeWebp({ width: 800, height: 600, kind: "extended", flags: 0x0c, extra: meta() })) as Uint8Array;
    expect(stripWebpMetadata(once)).toEqual(once);
  });

  it("refuses an animated WebP, by flag or by chunk, as upload_rejected", () => {
    expect(stripWebpMetadata(makeWebp({ width: 800, height: 600, animated: true }))).toEqual({ rejected: "animated" });
    expect(stripWebpMetadata(makeWebp({ width: 800, height: 600, kind: "extended", extra: [riffChunk("ANIM", [0, 0, 0, 0, 0, 0])] }))).toEqual({ rejected: "animated" });
    expect(stripWebpMetadata(makeWebp({ width: 800, height: 600, kind: "extended", extra: [riffChunk("ANMF", new Array(16).fill(0))] }))).toEqual({ rejected: "animated" });
    expect(stripMetadata(makeWebp({ width: 800, height: 600, animated: true }), "image/webp")).toEqual({ ok: false, code: "upload_rejected" });
  });

  it("refuses a file that is not a whole WebP: cut off, a size that lies, no image chunk, two image chunks", () => {
    const whole = makeWebp({ width: 800, height: 600, kind: "extended", extra: meta() });
    expect(stripWebpMetadata(whole.subarray(0, whole.length - 5))).toBeNull();
    expect(stripWebpMetadata(makeWebp({ width: 800, height: 600, riffSizeDelta: 50 }))).toBeNull();
    expect(stripWebpMetadata(makeWebp({ width: 800, height: 600, kind: "extended", noImage: true }))).toBeNull();
    expect(stripWebpMetadata(makeWebp({ width: 800, height: 600, extra: [riffChunk("VP8L", [0x2f, 0, 0, 0, 0])] }))).toBeNull();
    expect(stripWebpMetadata(JPEG())).toBeNull();
    const shortX = makeWebp({ width: 800, height: 600, extra: [] });
    expect(stripWebpMetadata(join(bytesOf("RIFF", 0, 0, 0, 0, "WEBP"), riffChunk("VP8X", [0, 0, 0]), riffChunk("VP8 ", shortX.subarray(20, 30))))).toBeNull();
  });
});

describe("stripMetadata and prepareUpload", () => {
  it("strips each type, and answers upload_bad_magic for a file that is not whole", () => {
    expect(stripMetadata(makeJpeg({ width: 800, height: 600, head: [EXIF()] }), "image/jpeg")).toMatchObject({ ok: true });
    expect(stripMetadata(makePng({ width: 800, height: 600, before: [pngChunk("tEXt", bytesOf("a\0b"))] }), "image/png")).toMatchObject({ ok: true });
    expect(stripMetadata(makeWebp({ width: 800, height: 600 }), "image/webp")).toMatchObject({ ok: true });
    expect(stripMetadata(bytesOf(1, 2, 3), "image/jpeg")).toEqual({ ok: false, code: "upload_bad_magic" });
    expect(stripMetadata(bytesOf(1, 2, 3), "image/png")).toEqual({ ok: false, code: "upload_bad_magic" });
    expect(stripMetadata(bytesOf(1, 2, 3), "image/webp")).toEqual({ ok: false, code: "upload_bad_magic" });
  });

  it("validates, strips and checks the stripped file, in one go", () => {
    const r = prepareUpload(makeJpeg({ width: 1024, height: 768, head: [JFIF(), EXIF(), XMP()] }), "image/jpeg");
    expect(r).toMatchObject({ ok: true, type: "image/jpeg", width: 1024, height: 768 });
    expect(r.ok && text(r.bytes)).not.toMatch(/GPS|xmpmeta/);
    expect(prepareUpload(JPEG(300, 300), "image/jpeg")).toEqual({ ok: false, code: "upload_too_small" });
    expect(prepareUpload(JPEG(), "image/png")).toEqual({ ok: false, code: "upload_bad_magic" });
    expect(prepareUpload(makeJpeg({ width: 800, height: 600, noEnd: true }), "image/jpeg")).toEqual({ ok: false, code: "upload_bad_magic" });
    expect(prepareUpload(makeWebp({ width: 800, height: 600, animated: true }), "image/webp")).toEqual({ ok: false, code: "upload_rejected" });
  });
});

function u(n: number): number[] {
  return [(n >>> 8) & 0xff, n & 0xff];
}
