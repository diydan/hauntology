// The QR encoder: structure checks plus a small independent reader that unmasks the matrix, checks every
// Reed-Solomon block and parses the payload. (It was also decoded with Apple's CoreImage reader once, 49 of 49.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix, qrPath, capacityBytes, dataCodewords, rsDivisor, rsRemainder, maskBit } from '../js/qr.js';
import { rngFrom } from '../js/core.js';

const TABLE = { L: { fmt: 1, cw: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18], blocks: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4] }, M: { fmt: 0, cw: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26], blocks: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5] } };
const bit = (x, i) => ((x >>> i) & 1) === 1;

/** Which modules are function patterns, coded separately from the encoder. */
function functionMap(ver) {
  const n = ver * 4 + 17, f = Array.from({ length: n }, () => new Array(n).fill(false));
  const box = (x0, y0, x1, y1) => { for (let y = Math.max(0, y0); y <= Math.min(n - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(n - 1, x1); x++) f[y][x] = true; };
  box(0, 0, 8, 8); box(n - 8, 0, n - 1, 8); box(0, n - 8, 8, n - 1); // finders, separators and format bits
  for (let i = 0; i < n; i++) { f[6][i] = true; f[i][6] = true; }
  if (ver >= 2) {
    const na = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2, pos = [6];
    for (let p = n - 7; pos.length < na; p -= step) pos.splice(1, 0, p);
    pos.forEach((cy, i) => pos.forEach((cx, j) => { if (!((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0))) box(cx - 2, cy - 2, cx + 2, cy + 2); }));
  }
  if (ver >= 7) { box(n - 11, 0, n - 9, 5); box(0, n - 11, 5, n - 9); }
  return f;
}
function readFormat(m) {
  const n = m.length, a = [], b = [];
  for (let i = 0; i <= 5; i++) a.push(m[i][8]); a.push(m[7][8], m[8][8], m[8][7]); for (let i = 9; i < 15; i++) a.push(m[8][14 - i]);
  for (let i = 0; i < 8; i++) b.push(m[8][n - 1 - i]); for (let i = 8; i < 15; i++) b.push(m[n - 15 + i][8]);
  const val = (bits) => bits.reduce((v, x, i) => v | ((x ? 1 : 0) << i), 0);
  return [val(a), val(b)];
}
function decode(m, eccName) {
  const n = m.length, ver = (n - 17) / 4, fn = functionMap(ver);
  const [f1, f2] = readFormat(m);
  assert.equal(f1, f2, 'both copies of the format bits agree');
  const bits = f1 ^ 0x5412, d = bits >>> 10;
  let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  assert.equal(bits & 0x3ff, rem & 0x3ff, 'the format bits are a valid BCH word');
  assert.equal(d >>> 3, TABLE[eccName].fmt, 'the ECC level in the format bits');
  const mask = d & 7;
  const bitsOut = [];
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? n - 1 - vert : vert;
      if (!fn[y][x]) bitsOut.push(m[y][x] !== maskBit(mask, x, y));
    }
  }
  const cws = []; for (let i = 0; i + 8 <= bitsOut.length; i += 8) cws.push(bitsOut.slice(i, i + 8).reduce((v, b) => (v << 1) | (b ? 1 : 0), 0));
  const nb = TABLE[eccName].blocks[ver - 1], el = TABLE[eccName].cw[ver - 1], total = cws.length, nShort = nb - (total % nb), shortLen = Math.floor(total / nb);
  const blocks = Array.from({ length: nb }, () => []);
  let k = 0;
  // every block has shortLen + 1 slots; a short block has an unused slot where a long block has its last data byte
  for (let i = 0; i <= shortLen; i++) for (let j = 0; j < nb; j++) { if (i === shortLen - el && j < nShort) blocks[j].push(null); else blocks[j].push(cws[k++]); }
  const data = [];
  const rs = rsDivisor(el);
  for (const b of blocks) {
    const clean = b.filter((v) => v !== null), dat = clean.slice(0, clean.length - el), ecc = clean.slice(clean.length - el);
    assert.deepEqual(rsRemainder(dat, rs), ecc, 'every Reed-Solomon block checks out');
    data.push(...dat);
  }
  const bitStr = data.map((v) => v.toString(2).padStart(8, '0')).join('');
  assert.equal(bitStr.slice(0, 4), '0100', 'byte mode');
  const cb = ver < 10 ? 8 : 16, len = parseInt(bitStr.slice(4, 4 + cb), 2);
  const out = []; for (let i = 0; i < len; i++) out.push(parseInt(bitStr.slice(4 + cb + i * 8, 12 + cb + i * 8), 2));
  return new TextDecoder().decode(new Uint8Array(out));
}

test('qr: capacities match the standard for the versions the lab uses', () => {
  assert.deepEqual([1, 2, 3, 4, 10].map((v) => capacityBytes(v, 'M')), [14, 26, 42, 62, 213]);
  assert.deepEqual([1, 2, 3, 4, 10].map((v) => capacityBytes(v, 'L')), [17, 32, 53, 78, 271]);
  assert.deepEqual([1, 4, 10].map((v) => dataCodewords(v, 'M')), [16, 64, 216]);
});

test('qr: the lab link fits and has the three finder patterns, timing lines and the dark module', () => {
  const m = qrMatrix('https://mtest.hauntology.app/lab#room=ABCDE');
  const n = m.length;
  assert.equal(n, 33, 'version 4');
  const finder = (x0, y0) => { for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) { const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3)); assert.equal(m[y0 + dy][x0 + dx], ring !== 2, `finder ${x0},${y0} at ${dx},${dy}`); } };
  finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
  for (let i = 8; i < n - 8; i++) { assert.equal(m[6][i], i % 2 === 0); assert.equal(m[i][6], i % 2 === 0); }
  assert.equal(m[n - 8][8], true);
});

test('qr: encoding is deterministic and ECC level changes the code', () => {
  const t = 'https://mtest.hauntology.app/lab#room=QAZ77';
  assert.deepEqual(qrMatrix(t), qrMatrix(t));
  assert.notDeepEqual(qrMatrix(t, 'L'), qrMatrix(t, 'M'));
});

test('qr: random texts of many lengths read back exactly, in every version and both levels', () => {
  const r = rngFrom(2024);
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 :/#=.-_äö✓';
  for (const ecc of ['L', 'M']) {
    for (let v = 1; v <= 10; v++) {
      const cap = capacityBytes(v, ecc);
      for (const len of [Math.max(1, cap - 5), cap]) {
        let s = ''; while (new TextEncoder().encode(s).length < len - 3) s += alphabet[Math.floor(r() * alphabet.length)];
        while (new TextEncoder().encode(s).length > cap) s = s.slice(0, -1);
        const m = qrMatrix(s, ecc);
        assert.equal(decode(m, ecc), s, `v${v} ${ecc} len ${len}`);
      }
    }
  }
});

test('qr: text that is too long is refused, and the SVG path covers only dark modules', () => {
  assert.throws(() => qrMatrix('x'.repeat(300)), /too long/);
  assert.throws(() => qrMatrix('x', 'Q'), /ecc/);
  const m = qrMatrix('hi');
  const { size, d } = qrPath(m, 4);
  assert.equal(size, m.length + 8);
  const dark = [...d.matchAll(/h(\d+)v1/g)].reduce((a, x) => a + Number(x[1]), 0);
  assert.equal(dark, m.flat().filter(Boolean).length);
});
