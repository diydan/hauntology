/**
 * A small QR encoder with no dependencies (integration 5.1, party-mode 8.1): byte mode, error levels L, M and Q, versions 1 to 10 (up to 213
 * bytes at level L, 174 at M). It is made for the Room's join address, a short URL; it is not a general library. Pure and deterministic.
 *
 * Checked two ways in `qr.test.ts`: the six relic plates of `print/qr-plate.ts` are exactly its output, and a separate reader
 * (`qr-decode.testkit.ts`) reads every version back and finds the Reed-Solomon check clean.
 */
export type QrLevel = "L" | "M" | "Q";
export type QrMatrix = boolean[][];

/** Format bits of each level (the standard's own order: L 01, M 00, Q 11). */
export const LEVEL_BITS: Readonly<Record<QrLevel, number>> = { L: 1, M: 0, Q: 3 };

/** Per version 1..10: the check bytes in every block, and the blocks as [count, data bytes in each]. */
type BlockRow = Readonly<{ ec: number; groups: readonly (readonly [number, number])[] }>;
const BLOCKS: Readonly<Record<QrLevel, readonly BlockRow[]>> = {
  L: [
    { ec: 7, groups: [[1, 19]] }, { ec: 10, groups: [[1, 34]] }, { ec: 15, groups: [[1, 55]] }, { ec: 20, groups: [[1, 80]] }, { ec: 26, groups: [[1, 108]] },
    { ec: 18, groups: [[2, 68]] }, { ec: 20, groups: [[2, 78]] }, { ec: 24, groups: [[2, 97]] }, { ec: 30, groups: [[2, 116]] }, { ec: 18, groups: [[2, 68], [2, 69]] },
  ],
  M: [
    { ec: 10, groups: [[1, 16]] }, { ec: 16, groups: [[1, 28]] }, { ec: 26, groups: [[1, 44]] }, { ec: 18, groups: [[2, 32]] }, { ec: 24, groups: [[2, 43]] },
    { ec: 16, groups: [[4, 27]] }, { ec: 18, groups: [[4, 31]] }, { ec: 22, groups: [[2, 38], [2, 39]] }, { ec: 22, groups: [[3, 36], [2, 37]] }, { ec: 26, groups: [[4, 43], [1, 44]] },
  ],
  Q: [
    { ec: 13, groups: [[1, 13]] }, { ec: 22, groups: [[1, 22]] }, { ec: 18, groups: [[2, 17]] }, { ec: 26, groups: [[2, 24]] }, { ec: 18, groups: [[2, 15], [2, 16]] },
    { ec: 24, groups: [[4, 19]] }, { ec: 18, groups: [[2, 14], [4, 15]] }, { ec: 22, groups: [[4, 18], [2, 19]] }, { ec: 20, groups: [[4, 16], [4, 17]] }, { ec: 24, groups: [[6, 19], [2, 20]] },
  ],
};

/** Centres of the alignment patterns' rows and columns, versions 1..10. */
const ALIGN: readonly (readonly number[])[] = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

export const QR_MAX_VERSION = 10;

/** What the layout is for a version and level: the blocks and the check bytes in each. Shared with the reader used in tests. */
export function blockLayout(version: number, level: QrLevel): Readonly<{ ec: number; dataSizes: readonly number[] }> {
  const row = BLOCKS[level][version - 1];
  if (row === undefined) throw new Error(`QR version ${version} is not supported`);
  return { ec: row.ec, dataSizes: row.groups.flatMap(([n, size]) => Array<number>(n).fill(size)) };
}
export const alignmentCentres = (version: number): readonly number[] => ALIGN[version - 1] ?? [];
const dataBytesOf = (version: number, level: QrLevel): number => blockLayout(version, level).dataSizes.reduce((a, b) => a + b, 0);
const countBits = (version: number): number => (version <= 9 ? 8 : 16);

/** The most bytes a code can carry (version 10). */
export const QR_MAX_BYTES: Readonly<Record<QrLevel, number>> = {
  L: dataBytesOf(10, "L") - 3,
  M: dataBytesOf(10, "M") - 3,
  Q: dataBytesOf(10, "Q") - 3,
};

// ---- Reed-Solomon over GF(256), polynomial 0x11D ----
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255] as number;
}
export const gfMul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : (EXP[(LOG[a] as number) + (LOG[b] as number)] as number));
export const gfPow = (i: number): number => EXP[((i % 255) + 255) % 255] as number;

function generator(degree: number): number[] {
  let g = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] = (next[j] as number) ^ (g[j] as number);
      next[j + 1] = (next[j + 1] as number) ^ gfMul(g[j] as number, gfPow(i));
    }
    g = next;
  }
  return g; // highest power first, leading 1
}

function checkBytes(data: readonly number[], degree: number): number[] {
  const g = generator(degree);
  const rem = new Array<number>(degree).fill(0);
  for (const d of data) {
    const factor = d ^ (rem.shift() as number);
    rem.push(0);
    for (let i = 0; i < degree; i++) rem[i] = (rem[i] as number) ^ gfMul(g[i + 1] as number, factor);
  }
  return rem;
}

// ---- the bytes: mode, count, text, padding, blocks ----
function dataBytes(text: Uint8Array, version: number, level: QrLevel): number[] {
  const bits: number[] = [];
  const push = (value: number, len: number): void => { for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  push(0b0100, 4);
  push(text.length, countBits(version));
  for (const b of text) push(b, 8);
  const capacity = dataBytesOf(version, level) * 8;
  push(0, Math.min(4, capacity - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; out.length < capacity / 8; pad = pad === 0xec ? 0x11 : 0xec) out.push(pad);
  return out;
}

function interleave(data: readonly number[], version: number, level: QrLevel): number[] {
  const { ec, dataSizes } = blockLayout(version, level);
  const blocks: number[][] = [];
  let at = 0;
  for (const size of dataSizes) { blocks.push(data.slice(at, at + size)); at += size; }
  const checks = blocks.map((b) => checkBytes(b, ec));
  const out: number[] = [];
  const longest = Math.max(...dataSizes);
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.length) out.push(b[i] as number);
  for (let i = 0; i < ec; i++) for (const c of checks) out.push(c[i] as number);
  return out;
}

// ---- the picture ----
const bchBits = (value: number, poly: number, polyBits: number): number => {
  let rem = value;
  for (let i = 0; i < polyBits - 1; i++) rem = (rem << 1) ^ ((rem >>> (polyBits - 2)) * poly);
  return rem;
};
/** The 15 format bits (level and mask, with their BCH check, masked by 0x5412). */
export const formatBits = (level: QrLevel, mask: number): number => {
  const data = (LEVEL_BITS[level] << 3) | mask;
  return ((data << 10) | bchBits(data, 0x537, 11)) ^ 0x5412;
};
/** The 18 version bits for versions 7 and up. */
export const versionBits = (version: number): number => (version << 12) | bchBits(version, 0x1f25, 13);

const MASKS: readonly ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => ((((r + c) % 2) + ((r * c) % 3)) % 2) === 0,
];

type Grid = Readonly<{ size: number; dark: boolean[][]; fixed: boolean[][] }>;

function functionGrid(version: number): Grid {
  const size = 17 + 4 * version;
  const dark = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (r: number, c: number, v: boolean): void => { if (r >= 0 && c >= 0 && r < size && c < size) { dark[r]![c] = v; fixed[r]![c] = true; } };
  const finder = (r0: number, c0: number): void => {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const edge = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
      const inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
      set(r0 + dr, c0 + dc, inside && edge !== 2);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const centres = alignmentCentres(version);
  for (const cr of centres) for (const cc of centres) {
    if ((cr === 6 && cc === 6) || (cr === 6 && cc === size - 7) || (cr === size - 7 && cc === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(cr + dr, cc + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  // reserve the format and version areas (drawn after the mask is chosen)
  for (let i = 0; i < 9; i++) { set(8, i, false); set(i, 8, false); }
  for (let i = 0; i < 8; i++) { set(8, size - 1 - i, false); set(size - 1 - i, 8, false); }
  set(size - 8, 8, true); // the always-dark module
  if (version >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { set(i, size - 11 + j, false); set(size - 11 + j, i, false); }
  return { size, dark, fixed };
}

function placeData(grid: Grid, codewords: readonly number[]): boolean[][] {
  const { size, fixed } = grid;
  const out = grid.dark.map((row) => [...row]);
  const bits: boolean[] = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push(((cw >>> i) & 1) === 1);
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let n = 0; n < size; n++) {
      const upward = ((right + 1) & 2) === 0;
      const r = upward ? size - 1 - n : n;
      for (const c of [right, right - 1]) {
        if (!fixed[r]![c]) { out[r]![c] = k < bits.length ? (bits[k] as boolean) : false; k++; }
      }
    }
  }
  return out;
}

function applyMask(base: boolean[][], fixed: boolean[][], mask: number): boolean[][] {
  const fn = MASKS[mask] as (r: number, c: number) => boolean;
  return base.map((row, r) => row.map((v, c) => (fixed[r]![c] ? v : v !== fn(r, c))));
}

function drawFormat(m: boolean[][], level: QrLevel, mask: number, version: number): void {
  const size = m.length;
  const bits = formatBits(level, mask);
  const bit = (i: number): boolean => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) m[i]![8] = bit(i);
  m[7]![8] = bit(6);
  m[8]![8] = bit(7);
  m[8]![7] = bit(8);
  for (let i = 9; i < 15; i++) m[8]![14 - i] = bit(i);
  for (let i = 0; i < 8; i++) m[8]![size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) m[size - 15 + i]![8] = bit(i);
  m[size - 8]![8] = true;
  if (version >= 7) {
    const vb = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const v = ((vb >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      m[b]![a] = v;
      m[a]![b] = v;
    }
  }
}

/** The standard's four penalty rules; the mask with the lowest total is used (ties go to the lower mask). */
function penalty(m: boolean[][]): number {
  const size = m.length;
  let total = 0;
  const lines = [...m, ...Array.from({ length: size }, (_, c) => m.map((row) => row[c] as boolean))];
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) run++;
      else { if (run >= 5) total += 3 + (run - 5); run = 1; }
    }
    const s = line.map((v) => (v ? "1" : "0")).join("");
    for (const pat of ["00001011101", "10111010000"]) for (let at = s.indexOf(pat); at !== -1; at = s.indexOf(pat, at + 1)) total += 40;
  }
  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
    const v = m[r]![c];
    if (v === m[r]![c + 1] && v === m[r + 1]![c] && v === m[r + 1]![c + 1]) total += 3;
  }
  const darkCount = m.flat().filter(Boolean).length;
  total += Math.floor(Math.abs((darkCount * 100) / (size * size) - 50) / 5) * 10;
  return total;
}

/**
 * The code for `text` (UTF-8 bytes) at the given error level (default M), in the smallest version that holds it. `true` is a dark module. Throws when the
 * text does not fit version 10. `mask` forces a mask (for tests); otherwise the best one is chosen.
 */
export function encodeQr(text: string, level: QrLevel = "M", mask?: number): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  let version = 1;
  while (version <= QR_MAX_VERSION && 4 + countBits(version) + bytes.length * 8 > dataBytesOf(version, level) * 8) version++;
  if (version > QR_MAX_VERSION) throw new Error(`QR text too long: ${bytes.length} bytes, at most ${QR_MAX_BYTES[level]} at level ${level}`);
  const grid = functionGrid(version);
  const placed = placeData(grid, interleave(dataBytes(bytes, version, level), version, level));
  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  for (const k of mask === undefined ? [0, 1, 2, 3, 4, 5, 6, 7] : [mask]) {
    const m = applyMask(placed, grid.fixed, k);
    drawFormat(m, level, k, version);
    const score = penalty(m);
    if (score < bestScore) { best = m; bestScore = score; }
  }
  return best as boolean[][];
}

export const qrSize = (m: QrMatrix): number => m.length;

/** An SVG path for the dark modules (one unit square each) inside a quiet zone of `quiet` modules; the viewBox is `0 0 size+2*quiet size+2*quiet`. */
export function qrPath(m: QrMatrix, quiet = 4): string {
  const parts: string[] = [];
  m.forEach((row, r) => row.forEach((v, c) => { if (v) parts.push(`M${c + quiet} ${r + quiet}h1v1h-1z`); }));
  return parts.join("");
}
