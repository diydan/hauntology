// A small QR code encoder (byte mode, error correction L or M, versions 1 to 10), so the lab can show its link as
// a code without calling any outside service. Written from the QR Code Model 2 standard (ISO/IEC 18004); the
// structure follows the public-domain-style layout used by most small encoders. Pure: no DOM.
const ECC = {
  L: { fmt: 1, cw: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18], blocks: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4] },
  M: { fmt: 0, cw: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26], blocks: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5] },
};
export const MAX_VERSION = 10;
const bit = (x, i) => ((x >>> i) & 1) !== 0;

function rawModules(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) { const n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; }
  return r;
}
export const dataCodewords = (ver, ecc) => Math.floor(rawModules(ver) / 8) - ECC[ecc].cw[ver - 1] * ECC[ecc].blocks[ver - 1];
export const capacityBytes = (ver, ecc) => Math.floor((dataCodewords(ver, ecc) * 8 - 4 - (ver < 10 ? 8 : 16)) / 8);

function alignPositions(ver) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

// ------------------------------------------------------------ Reed-Solomon over GF(256), polynomial 0x11D
function gmul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z; }
function rsDivisor(degree) {
  const res = new Array(degree).fill(0); res[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < res.length; j++) { res[j] = gmul(res[j], root); if (j + 1 < res.length) res[j] ^= res[j + 1]; }
    root = gmul(root, 2);
  }
  return res;
}
function rsRemainder(data, divisor) {
  const res = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ res.shift();
    res.push(0);
    divisor.forEach((c, i) => { res[i] ^= gmul(c, factor); });
  }
  return res;
}
export { rsDivisor, rsRemainder };

function interleave(data, ver, ecc) {
  const nb = ECC[ecc].blocks[ver - 1], el = ECC[ecc].cw[ver - 1];
  const raw = Math.floor(rawModules(ver) / 8), nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb);
  const rs = rsDivisor(el), blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - el + (i < nShort ? 0 : 1));
    k += dat.length;
    const e = rsRemainder(dat, rs);
    if (i < nShort) dat.push(0);
    blocks.push(dat.concat(e));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - el || j >= nShort) out.push(b[i]); });
  return out;
}

// ------------------------------------------------------------ matrix
function penalty(m) {
  const size = m.length;
  let score = 0;
  const lineScore = (get) => {
    let s = 0, run = 1;
    for (let i = 1; i < size; i++) {
      if (get(i) === get(i - 1)) { run++; if (run === 5) s += 3; else if (run > 5) s += 1; } else run = 1;
    }
    const bits = Array.from({ length: size }, (_, i) => (get(i) ? 1 : 0)).join('');
    for (const pat of ['10111010000', '00001011101']) { let at = bits.indexOf(pat); while (at >= 0) { s += 40; at = bits.indexOf(pat, at + 1); } }
    return s;
  };
  for (let y = 0; y < size; y++) score += lineScore((i) => m[y][i]);
  for (let x = 0; x < size; x++) score += lineScore((i) => m[i][x]);
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (m[y][x]) dark++;
    if (x + 1 < size && y + 1 < size && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
  }
  score += (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10;
  return score;
}
const maskBit = (mask, x, y) => [
  (x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0, (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  ((x * y) % 2) + ((x * y) % 3) === 0, (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
][mask];
export { maskBit };

/** Encode text (UTF-8, byte mode) to a square boolean matrix (true = dark). Throws when it does not fit version 10. */
export function qrMatrix(text, ecc = 'M') {
  if (!ECC[ecc]) throw new Error('ecc must be L or M');
  const bytes = [...new TextEncoder().encode(String(text))];
  let ver = 1;
  while (ver <= MAX_VERSION && bytes.length > capacityBytes(ver, ecc)) ver++;
  if (ver > MAX_VERSION) throw new Error(`text too long for a version ${MAX_VERSION} code (${bytes.length} bytes)`);
  // data bits: mode 0100, count, bytes, terminator, padding
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const capBits = dataCodewords(ver, ecc) * 8;
  put(0, Math.min(4, capBits - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < capBits; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  const codewords = interleave(data, ver, ecc);

  const size = ver * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFn = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFn = (x, y, dark) => { modules[y][x] = dark; isFn[y][x] = true; };
  for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, dist !== 2 && dist !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const ap = alignPositions(ver), na = ap.length;
  for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const formatBits = (mask) => {
    const d = (ECC[ecc].fmt << 3) | mask;
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const b = ((d << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) setFn(8, i, bit(b, i));
    setFn(8, 7, bit(b, 6)); setFn(8, 8, bit(b, 7)); setFn(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(b, i));
    setFn(8, size - 8, true);
  };
  formatBits(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const b = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3), c = Math.floor(i / 3); setFn(a, c, bit(b, i)); setFn(c, a, bit(b, i)); }
  }
  // codewords in the zigzag order
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
      if (!isFn[y][x] && k < codewords.length * 8) { modules[y][x] = bit(codewords[k >>> 3], 7 - (k & 7)); k++; }
    }
  }
  // best mask by penalty
  let best = 0, bestScore = Infinity;
  const flip = (mask) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!isFn[y][x] && maskBit(mask, x, y)) modules[y][x] = !modules[y][x]; };
  for (let mask = 0; mask < 8; mask++) {
    flip(mask); formatBits(mask);
    const s = penalty(modules);
    if (s < bestScore) { best = mask; bestScore = s; }
    flip(mask);
  }
  flip(best); formatBits(best);
  return modules;
}

/** An SVG path for the dark modules plus a quiet zone (`border` modules, the standard asks for 4). */
export function qrPath(matrix, border = 4) {
  const n = matrix.length;
  let d = '';
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (!matrix[y][x]) { x++; continue; }
      let w = 1;
      while (x + w < n && matrix[y][x + w]) w++;
      d += `M${x + border} ${y + border}h${w}v1h-${w}z`;
      x += w;
    }
  }
  return { size: n + border * 2, d };
}
