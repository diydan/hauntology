import type { MemoryDay } from "./types";
import { timeOfDay } from "./time";

/**
 * `readCaptureDate`: the one field the sky card wants from a photo, and nothing else.
 *
 * It reads the EXIF `DateTimeOriginal` of a JPEG (the moment the shutter was pressed) and gives back a
 * date and a Time of Day, or nothing. It looks at two tags only: the pointer to the Exif sub-directory
 * (0x8769) and `DateTimeOriginal` (0x9003) inside it. The GPS block, the make and model, the serial
 * number, the other dates (`DateTime`, `DateTimeDigitized`, the GPS date stamp) and everything else are
 * never read, so they cannot be returned, and the caller re-encodes the picture afterwards, which drops
 * them all. It never throws: any byte sequence, truncated or corrupt, gives nothing. A date outside 1940
 * to yesterday gives nothing too. `today` is the visitor's own date, passed in.
 *
 * Only the first 64 KB of a file are needed: an EXIF block is one JPEG segment, at most 65 535 bytes.
 */
export function readCaptureDate(bytes: Uint8Array, today: Date): MemoryDay | undefined {
  try {
    return read(bytes, today);
  } catch {
    return undefined;
  }
}

const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TYPE_ASCII = 2;
const TYPE_LONG = 4;
/** "YYYY:MM:DD HH:MM:SS" and its NUL. */
const DATE_BYTES = 20;
const MIN_DATE = "1940-01-01";

function read(b: Uint8Array, today: Date): MemoryDay | undefined {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return undefined;
  let pos = 2;
  while (pos + 4 <= b.length) {
    if (b[pos] !== 0xff) return undefined;
    const marker = b[pos + 1] as number;
    if (marker === 0xff) {
      pos += 1; // fill byte
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return undefined; // image data or end: no EXIF after this
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2; // a marker with no length
      continue;
    }
    const length = ((b[pos + 2] as number) << 8) | (b[pos + 3] as number);
    if (length < 2) return undefined;
    const start = pos + 4;
    const end = pos + 2 + length;
    if (end > b.length) return undefined;
    if (marker === 0xe1 && isExifHeader(b, start, end)) {
      const found = fromTiff(b, start + 6, end, today);
      if (found !== undefined) return found;
    }
    pos = end;
  }
  return undefined;
}

/** "Exif" then two NULs. */
function isExifHeader(b: Uint8Array, start: number, end: number): boolean {
  return end - start >= 14 && b[start] === 0x45 && b[start + 1] === 0x78 && b[start + 2] === 0x69 && b[start + 3] === 0x66 && b[start + 4] === 0 && b[start + 5] === 0;
}

/** Reads inside `[base, end)` only: a read outside it throws, and the caller turns that into "nothing". */
function fromTiff(b: Uint8Array, base: number, end: number, today: Date): MemoryDay | undefined {
  const order = ((b[base] as number) << 8) | (b[base + 1] as number);
  const little = order === 0x4949;
  if (!little && order !== 0x4d4d) return undefined;
  const u16 = (at: number): number => {
    if (at < base || at + 2 > end) throw new RangeError("outside the EXIF block");
    const x = b[at] as number;
    const y = b[at + 1] as number;
    return little ? x | (y << 8) : (x << 8) | y;
  };
  const u32 = (at: number): number => {
    if (at < base || at + 4 > end) throw new RangeError("outside the EXIF block");
    const x = [b[at], b[at + 1], b[at + 2], b[at + 3]] as number[];
    return (little ? x[0]! + x[1]! * 0x100 + x[2]! * 0x10000 + x[3]! * 0x1000000 : x[3]! + x[2]! * 0x100 + x[1]! * 0x10000 + x[0]! * 0x1000000);
  };
  if (u16(base + 2) !== 42) return undefined;

  /** The value field of the first entry with `tag` in the directory at `offset`, with its type and count. */
  const find = (offset: number, tag: number): { type: number; count: number; value: number } | undefined => {
    const dir = base + offset;
    const n = u16(dir);
    for (let i = 0; i < n; i++) {
      const at = dir + 2 + i * 12;
      if (u16(at) === tag) return { type: u16(at + 2), count: u32(at + 4), value: u32(at + 8) };
    }
    return undefined;
  };

  const exifPointer = find(u32(base + 4), TAG_EXIF_IFD);
  if (exifPointer === undefined || exifPointer.type !== TYPE_LONG) return undefined;
  const original = find(exifPointer.value, TAG_DATE_TIME_ORIGINAL);
  if (original === undefined || original.type !== TYPE_ASCII || original.count !== DATE_BYTES) return undefined;

  let text = "";
  for (let i = 0; i < DATE_BYTES - 1; i++) {
    const at = base + original.value + i;
    if (at < base || at >= end) throw new RangeError("outside the EXIF block");
    text += String.fromCharCode(b[at] as number);
  }
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (m === null) return undefined;
  const [y, mo, d, h] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (h > 23 || Number(m[5]) > 59 || Number(m[6]) > 59) return undefined;

  const real = new Date(y, mo - 1, d);
  if (real.getFullYear() !== y || real.getDate() !== d) return undefined;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const last = `${String(yesterday.getFullYear()).padStart(4, "0")}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  if (date < MIN_DATE || date > last) return undefined;
  return { date, timeOfDay: timeOfDay(h) };
}
