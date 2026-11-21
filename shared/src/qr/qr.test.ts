import { describe, expect, it } from "vitest";
import { qrMatrixForRelic } from "../print/qr-plate";
import { alignmentCentres, encodeQr, formatBits, qrPath, qrSize, QR_MAX_BYTES, versionBits } from "./qr";
import { decodeQr } from "./qr-decode.testkit";

const same = (a: boolean[][], b: boolean[][]): boolean => a.length === b.length && a.every((row, y) => row.every((v, x) => v === b[y]![x]));

describe("encodeQr: agrees with the printed relic plates", () => {
  // The plates (`print/qr-plate.ts`) were made by another tool, which adds one extra zero byte after the terminator. That is also a valid code, so the
  // pictures differ; what must agree is the layout: the reader finds the same level, text and data bytes, and the same codewords up to that byte.
  it.each(["r1", "r2", "r3", "r4", "r5", "r6"] as const)("hw:%s: the plate and our code carry the same data", (id) => {
    const plate = decodeQr(qrMatrixForRelic(id));
    const ours = decodeQr(encodeQr(`hw:${id}`, "Q"));
    expect(plate).toMatchObject({ level: "Q", version: 1, eccClean: true, text: `hw:${id}` });
    expect(ours).toMatchObject({ level: "Q", version: 1, eccClean: true, text: `hw:${id}` });
    expect(ours.data.slice(0, 7)).toEqual(plate.data.slice(0, 7));
  });
});

describe("encodeQr: round trip through an independent reader", () => {
  const samples = [
    "A",
    "https://lab.example/play?code=K7M2",
    "https://mtest.hauntology.app/play?code=ABCD",
    "ünï© ☠ ghost",
    "x".repeat(100),
    "y".repeat(150),
  ];
  for (const level of ["L", "M", "Q"] as const) {
    for (const text of samples) {
      it(`reads back ${JSON.stringify(text.slice(0, 20))} (${text.length} chars) at level ${level}`, () => {
        const m = encodeQr(text, level);
        const r = decodeQr(m);
        expect(r.level).toBe(level);
        expect(r.eccClean).toBe(true);
        expect(r.versionInfoOk).toBe(true);
        expect(r.text).toBe(text);
      });
    }
  }

  it("uses a square matrix of 17 + 4 * version modules with the three finder patterns", () => {
    const m = encodeQr("hello", "M");
    expect(qrSize(m)).toBe(21);
    for (const [r0, c0] of [[0, 0], [0, 14], [14, 0]] as const) {
      expect(m[r0]![c0]).toBe(true);
      expect(m[r0 + 3]![c0 + 3]).toBe(true);
      expect(m[r0 + 1]![c0 + 1]).toBe(false);
    }
    expect(m[13]![8]).toBe(true); // the always-dark module
  });

  it("grows the version with the text and refuses what does not fit", () => {
    expect(qrSize(encodeQr("x".repeat(14), "M"))).toBe(21);
    expect(qrSize(encodeQr("x".repeat(15), "M"))).toBe(25);
    expect(() => encodeQr("x".repeat(QR_MAX_BYTES.M + 1), "M")).toThrow(/too long/);
    expect(decodeQr(encodeQr("x".repeat(QR_MAX_BYTES.M), "M")).text).toBe("x".repeat(QR_MAX_BYTES.M));
  });

  it("is deterministic", () => {
    expect(same(encodeQr("https://lab.example/play?code=K7M2"), encodeQr("https://lab.example/play?code=K7M2"))).toBe(true);
  });

  it("detects a flipped module as an error the reader can see", () => {
    const m = encodeQr("https://lab.example/play?code=K7M2", "M");
    m[10]![10] = !m[10]![10];
    const r = decodeQr(m);
    expect(r.eccClean).toBe(false);
  });
});

describe("qrPath", () => {
  it("draws one square per dark module inside the quiet zone", () => {
    const m = encodeQr("hw:r1", "Q");
    const p = qrPath(m, 4);
    const dark = m.flat().filter(Boolean).length;
    expect(p.split("M").length - 1).toBe(dark);
    expect(p.startsWith("M4 4h1v1h-1z")).toBe(true);
  });
});

// What the standard says, written down separately from the tables in `qr.ts` so a typo there is seen.
describe("encodeQr: anchors from the standard", () => {
  /** Bytes a code can carry in byte mode, versions 1 to 10, for L, M and Q. */
  const CAPACITY: readonly (readonly [number, number, number])[] = [
    [17, 14, 11], [32, 26, 20], [53, 42, 32], [78, 62, 46], [106, 84, 60], [134, 106, 74], [154, 122, 86], [192, 152, 108], [230, 180, 130], [271, 213, 151],
  ];
  const LEVELS = ["L", "M", "Q"] as const;
  for (let v = 1; v <= 10; v++) for (const [i, level] of LEVELS.entries()) {
    it(`version ${v} at level ${level} holds exactly ${CAPACITY[v - 1]![i]} bytes and reads back clean`, () => {
      const cap = CAPACITY[v - 1]![i]!;
      const text = "ab".repeat(Math.ceil(cap / 2)).slice(0, cap);
      const m = encodeQr(text, level);
      expect(qrSize(m)).toBe(17 + 4 * v);
      const r = decodeQr(m);
      expect(r).toMatchObject({ eccClean: true, versionInfoOk: true, text });
      if (v < 10) expect(qrSize(encodeQr(text + "!", level))).toBe(17 + 4 * (v + 1));
      else expect(() => encodeQr(text + "!", level)).toThrow(/too long/);
    });
  }
  it("QR_MAX_BYTES is the standard's version 10 capacity", () => { expect(QR_MAX_BYTES).toEqual({ L: 271, M: 213, Q: 151 }); });

  it("alignment pattern centres follow the standard's rule: the first at 6, the last 7 from the edge, the rest evenly spaced in even steps", () => {
    for (let v = 2; v <= 10; v++) {
      const n = Math.floor(v / 7) + 2;
      const last = 17 + 4 * v - 7;
      const step = Math.ceil((last - 6) / (n - 1) / 2) * 2;
      const want = [6, ...Array.from({ length: n - 1 }, (_, k) => last - step * (n - 2 - k))];
      expect(alignmentCentres(v)).toEqual(want);
    }
  });

  it("the format and version words are the standard's", () => {
    expect(formatBits("M", 0)).toBe(0b101010000010010);
    expect(formatBits("L", 0)).toBe(0b111011111000100);
    expect(versionBits(7)).toBe(0b000111110010010100);
    expect(versionBits(8)).toBe(0b001000010110111100);
    expect(versionBits(10)).toBe(0b001010010011010011);
  });

  it("pads with the standard's alternating bytes after the terminator", () => {
    // "A" at level M, version 1: mode 0100, count 00000001, 'A' 01000001, terminator 0000 -> 40 14 10, then EC 11 EC 11 ...
    const r = decodeQr(encodeQr("A", "M"));
    expect(r.data).toEqual([0x40, 0x14, 0x10, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec]);
  });
});
