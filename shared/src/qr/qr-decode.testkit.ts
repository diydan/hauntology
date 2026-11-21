import { alignmentCentres, blockLayout, formatBits, gfMul, gfPow, versionBits, type QrLevel, type QrMatrix } from "./qr";

/**
 * A reader for the codes `encodeQr` makes, used only by tests. It reads the format bits (nearest of the 32 valid words, from the first copy), finds
 * which modules are data by its own walk of the standard's layout, removes the mask, reads the bytes in the standard's order, undoes the
 * interleave, checks every block's Reed-Solomon syndromes and parses the byte-mode text.
 */
const LEVELS: readonly QrLevel[] = ["L", "M", "Q"];

export type Decoded = Readonly<{ level: QrLevel; mask: number; version: number; eccClean: boolean; versionInfoOk: boolean; text: string; data: readonly number[] }>;

const popcount = (n: number): number => { let c = 0; for (let v = n; v > 0; v >>>= 1) c += v & 1; return c; };

function readFormat(m: QrMatrix): { level: QrLevel; mask: number } {
  let raw = 0;
  const size = m.length;
  // the copy along the bottom-left and top-right edges, read independently of the top-left copy the encoder draws first
  for (let i = 0; i < 8; i++) if (m[8]![size - 1 - i]) raw |= 1 << i;
  for (let i = 8; i < 15; i++) if (m[size - 15 + i]![8]) raw |= 1 << i;
  let best = { level: "M" as QrLevel, mask: 0, dist: 99 };
  for (const level of LEVELS) for (let mask = 0; mask < 8; mask++) {
    const d = popcount(raw ^ formatBits(level, mask));
    if (d < best.dist) best = { level, mask, dist: d };
  }
  if (best.dist > 3) throw new Error("format bits unreadable");
  return best;
}

/** Which modules are not data: found by drawing the layout again from its description (not by calling the encoder's grid). */
function isFunction(size: number, version: number): (r: number, c: number) => boolean {
  const centres = alignmentCentres(version);
  return (r, c) => {
    if (r < 9 && c < 9) return true;
    if (r < 9 && c >= size - 8) return true;
    if (r >= size - 8 && c < 9) return true;
    if (r === 6 || c === 6) return true;
    if (version >= 7 && ((r < 6 && c >= size - 11) || (c < 6 && r >= size - 11))) return true;
    for (const cr of centres) for (const cc of centres) {
      if ((cr === 6 && cc === 6) || (cr === 6 && cc === size - 7) || (cr === size - 7 && cc === 6)) continue;
      if (Math.abs(r - cr) <= 2 && Math.abs(c - cc) <= 2) return true;
    }
    return false;
  };
}

const MASK_FNS: readonly ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (_r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => ((((r + c) % 2) + ((r * c) % 3)) % 2) === 0,
];

function syndromesZero(block: readonly number[], ec: number): boolean {
  for (let i = 0; i < ec; i++) {
    let acc = 0;
    for (const b of block) acc = gfMul(acc, gfPow(i)) ^ b; // Horner, highest power first
    if (acc !== 0) return false;
  }
  return true;
}

export function decodeQr(m: QrMatrix): Decoded {
  const size = m.length;
  const version = (size - 17) / 4;
  const { level, mask } = readFormat(m);
  const fn = isFunction(size, version);
  const bits: number[] = [];
  const pairs: number[] = [];
  for (let c = size - 1; c > 6; c -= 2) pairs.push(c); // two columns at a time from the right edge
  pairs.push(5, 3, 1); // the timing column 6 is skipped, so the last pairs are (5,4) (3,2) (1,0)
  for (const col of pairs) {
    for (let n = 0; n < size; n++) {
      const upward = ((col + 1) & 2) === 0;
      const r = upward ? size - 1 - n : n;
      for (const c of [col, col - 1]) {
        if (fn(r, c)) continue;
        const v = (m[r]![c] as boolean) !== (MASK_FNS[mask] as (r: number, c: number) => boolean)(r, c);
        bits.push(v ? 1 : 0);
      }
    }
  }
  const words: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) words.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  const { ec, dataSizes } = blockLayout(version, level);
  const total = dataSizes.reduce((a, b) => a + b, 0) + ec * dataSizes.length;
  const used = words.slice(0, total);
  const blocks: number[][] = dataSizes.map(() => []);
  let at = 0;
  const longest = Math.max(...dataSizes);
  for (let i = 0; i < longest; i++) dataSizes.forEach((size2, b) => { if (i < size2) blocks[b]!.push(used[at++] as number); });
  for (let i = 0; i < ec; i++) dataSizes.forEach((_s, b) => { blocks[b]!.push(used[at++] as number); });
  const eccClean = blocks.every((b) => syndromesZero(b, ec));
  let versionInfoOk = true;
  if (version >= 7) {
    // both copies of the 18 version bits, read from the picture, against the standard's word for this version
    let a = 0;
    let b = 0;
    for (let i = 0; i < 18; i++) {
      if (m[Math.floor(i / 3)]![size - 11 + (i % 3)]) a |= 1 << i;
      if (m[size - 11 + (i % 3)]![Math.floor(i / 3)]) b |= 1 << i;
    }
    versionInfoOk = a === versionBits(version) && b === a;
  }
  const data = blocks.flatMap((b, i) => b.slice(0, dataSizes[i]));
  const stream = data.map((b) => b.toString(2).padStart(8, "0")).join("");
  if (stream.slice(0, 4) !== "0100") return { level, mask, version, eccClean, versionInfoOk, text: "", data };
  const countLen = version <= 9 ? 8 : 16;
  const count = parseInt(stream.slice(4, 4 + countLen), 2);
  const bytes = new Uint8Array(count);
  for (let i = 0; i < count; i++) bytes[i] = parseInt(stream.slice(4 + countLen + i * 8, 4 + countLen + i * 8 + 8), 2);
  return { level, mask, version, eccClean, versionInfoOk, text: new TextDecoder().decode(bytes), data };
}
