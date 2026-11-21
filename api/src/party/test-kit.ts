// Test-only helpers for the party services: a small RGBA PNG with a subject block, as the Ghost Creator tests make.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 255] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
};
/** zlib with stored (uncompressed) blocks: enough for a PNG the decoder can inflate. */
function zlibStore(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [Uint8Array.from([0x78, 0x01])];
  for (let at = 0; at < data.length || at === 0; at += 65535) {
    const part = data.subarray(at, Math.min(data.length, at + 65535));
    const head = new Uint8Array(5);
    head[0] = at + 65535 >= data.length ? 1 : 0;
    new DataView(head.buffer).setUint16(1, part.length, true);
    new DataView(head.buffer).setUint16(3, 0xffff - part.length, true);
    blocks.push(head, part);
    if (at + 65535 >= data.length) break;
  }
  let a = 1, b = 0;
  for (const byte of data) { a = (a + byte) % 65521; b = (b + a) % 65521; }
  const tail = new Uint8Array(4);
  new DataView(tail.buffer).setUint32(0, (b << 16) | a);
  blocks.push(tail);
  const out = new Uint8Array(blocks.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of blocks) { out.set(p, at); at += p.length; }
  return out;
}

/** A small RGBA PNG whose subject is a centred block at the given coverage/inset (fractions). */
export function pngWithSubject(w: number, h: number, insetFrac: number, opaque = true): Uint8Array {
  const raw = new Uint8Array(h * (1 + w * 4));
  const inset = Math.floor(w * insetFrac);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * (1 + w * 4) + 1 + x * 4;
      const inside = x >= inset && x < w - inset && y >= 2 && y < h - 2;
      raw[i] = 200; raw[i + 1] = 220; raw[i + 2] = 210;
      raw[i + 3] = inside || !opaque ? 255 : 0;
      if (!opaque) raw[i + 3] = 255;
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w); v.setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = 6;
  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibStore(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
