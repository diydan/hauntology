/**
 * Builds a JPEG header with an EXIF block, for the tests of `readCaptureDate`. Not part of the
 * product. The block has an IFD0 (make, model, DateTime, a pointer to the Exif directory and one to a
 * GPS directory) and an Exif directory (DateTimeOriginal, DateTimeDigitized, a serial number).
 */
export type ExifSpec = {
  order?: "II" | "MM";
  original?: string;
  digitized?: string;
  modified?: string;
  gpsDate?: string;
  make?: string;
  model?: string;
  serial?: string;
  gps?: boolean;
  /** Overrides the declared count and type of DateTimeOriginal. */
  originalCount?: number;
  originalType?: number;
  /** An APP0 segment first, as most JPEGs have. */
  leading?: boolean;
  /** The EXIF segment after the start of scan, where it must not be read. */
  exifAfterScan?: boolean;
  /** Bytes of image data after the headers. */
  trailing?: number;
  /** The six bytes before the TIFF header. Default "Exif" and two NULs. */
  header?: number[];
  /** The magic number after the byte order mark. Default 42. */
  magic?: number;
  /** Two characters written over the byte order mark, so the rest no longer matches it. */
  orderMark?: string;
  /** The type of the pointer to the Exif directory. Default 4 (LONG). */
  exifPointerType?: number;
  /** Declares the EXIF segment this many bytes shorter than it is, so the end of the block cuts into the data. */
  declaredShort?: number;
};

type Entry = { tag: number; type: number; count: number; value: number | Uint8Array };

export function jpegWithExif(spec: ExifSpec): Uint8Array {
  const little = (spec.order ?? "II") === "II";
  const u16 = (n: number) => (little ? [n & 0xff, (n >> 8) & 0xff] : [(n >> 8) & 0xff, n & 0xff]);
  const u32 = (n: number) => (little ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff] : [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
  const ascii = (s: string) => [...new TextEncoder().encode(s), 0];

  // Lay out: header(8) | IFD0 | exif IFD | gps IFD | data area. Offsets are from the start of the TIFF header.
  const data: number[] = [];
  const dataOffsets: Array<() => number> = [];
  const place = (bytes: number[]): number => {
    const idx = data.length;
    data.push(...bytes);
    return idx;
  };

  const ifd0: Entry[] = [];
  const exif: Entry[] = [];
  const gps: Entry[] = [];
  const str = (s: string): Entry["value"] => new Uint8Array(ascii(s));
  if (spec.make !== undefined) ifd0.push({ tag: 0x010f, type: 2, count: spec.make.length + 1, value: str(spec.make) });
  if (spec.model !== undefined) ifd0.push({ tag: 0x0110, type: 2, count: spec.model.length + 1, value: str(spec.model) });
  if (spec.modified !== undefined) ifd0.push({ tag: 0x0132, type: 2, count: 20, value: str(spec.modified) });
  if (spec.original !== undefined) exif.push({ tag: 0x9003, type: spec.originalType ?? 2, count: spec.originalCount ?? 20, value: str(spec.original) });
  if (spec.digitized !== undefined) exif.push({ tag: 0x9004, type: 2, count: 20, value: str(spec.digitized) });
  if (spec.serial !== undefined) exif.push({ tag: 0xa431, type: 2, count: spec.serial.length + 1, value: str(spec.serial) });
  if (spec.gps === true) {
    gps.push({ tag: 0x0001, type: 2, count: 2, value: str("N") });
    gps.push({ tag: 0x0002, type: 5, count: 3, value: new Uint8Array(24).fill(7) });
  }
  if (spec.gpsDate !== undefined) gps.push({ tag: 0x001d, type: 2, count: 11, value: str(spec.gpsDate) });

  const sizeOf = (entries: Entry[]) => 2 + entries.length * 12 + 4;
  const withPointers: Entry[] = [...ifd0];
  const hasExif = exif.length > 0;
  const hasGps = gps.length > 0;
  if (hasExif) withPointers.push({ tag: 0x8769, type: spec.exifPointerType ?? 4, count: 1, value: -1 });
  if (hasGps) withPointers.push({ tag: 0x8825, type: 4, count: 1, value: -2 });
  withPointers.sort((a, b) => a.tag - b.tag);
  exif.sort((a, b) => a.tag - b.tag);
  gps.sort((a, b) => a.tag - b.tag);

  const ifd0At = 8;
  const exifAt = ifd0At + sizeOf(withPointers);
  const gpsAt = exifAt + (hasExif ? sizeOf(exif) : 0);
  const dataAt = gpsAt + (hasGps ? sizeOf(gps) : 0);

  const serialise = (entries: Entry[]): number[] => {
    const out = [...u16(entries.length)];
    for (const e of entries) {
      out.push(...u16(e.tag), ...u16(e.type), ...u32(e.count));
      if (e.value === -1) out.push(...u32(exifAt));
      else if (e.value === -2) out.push(...u32(gpsAt));
      else if (typeof e.value === "number") out.push(...u32(e.value));
      else if (e.value.length <= 4) out.push(...e.value, ...new Array<number>(4 - e.value.length).fill(0));
      else out.push(...u32(dataAt + place([...e.value])));
    }
    out.push(...u32(0));
    return out;
  };
  void dataOffsets;

  const body: number[] = [];
  body.push(...serialise(withPointers));
  if (hasExif) body.push(...serialise(exif));
  if (hasGps) body.push(...serialise(gps));
  const mark = spec.orderMark !== undefined ? [...new TextEncoder().encode(spec.orderMark)] : little ? [0x49, 0x49] : [0x4d, 0x4d];
  const tiff = [...mark, ...u16(spec.magic ?? 42), ...u32(ifd0At), ...body, ...data];

  const exifBlock = [...(spec.header ?? [0x45, 0x78, 0x69, 0x66, 0, 0]), ...tiff];
  const segment = (marker: number, payload: number[], declared = payload.length + 2) => [0xff, marker, declared >> 8, declared & 0xff, ...payload];
  const app0 = segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const app1 = segment(0xe1, exifBlock, exifBlock.length + 2 - (spec.declaredShort ?? 0));
  const scan = [0xff, 0xda, 0x00, 0x02];
  const filler = new Array<number>(spec.trailing ?? 16).fill(0x11);
  const out = spec.exifAfterScan === true ? [0xff, 0xd8, ...scan, ...app1, ...filler] : [0xff, 0xd8, ...(spec.leading ? app0 : []), ...app1, ...scan, ...filler];
  return new Uint8Array(out);
}
