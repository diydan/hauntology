/**
 * The `Range` request header, for one byte range of a file of known size.
 *
 * - no header, an unknown unit, a malformed value, or more than one range: `none` (send the whole file;
 *   a server may ignore a Range it does not support)
 * - a range that starts past the end, or an empty suffix: `unsatisfiable` (416)
 * - otherwise `ok`, clamped to the file: `bytes=0-` and `bytes=0-999999999` mean "to the end", and
 *   `bytes=-500` means the last 500 bytes.
 */
export type RangeResult =
  | { kind: "none" }
  | { kind: "unsatisfiable" }
  | { kind: "ok"; start: number; end: number };

const SPEC = /^bytes=(\d*)-(\d*)$/;

export function parseRange(header: string | null | undefined, size: number): RangeResult {
  if (header === undefined || header === null) return { kind: "none" };
  const m = SPEC.exec(header.trim());
  if (m === null) return { kind: "none" };
  const [, a = "", b = ""] = m;
  if (a === "" && b === "") return { kind: "none" };
  if (size <= 0) return { kind: "unsatisfiable" };

  if (a === "") {
    // A suffix: the last `b` bytes.
    const n = Number(b);
    if (!Number.isSafeInteger(n) || n === 0) return { kind: "unsatisfiable" };
    return { kind: "ok", start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(a);
  if (!Number.isSafeInteger(start)) return { kind: "none" };
  if (start >= size) return { kind: "unsatisfiable" };
  if (b === "") return { kind: "ok", start, end: size - 1 };
  const end = Number(b);
  if (!Number.isSafeInteger(end) || end < start) return { kind: "none" };
  return { kind: "ok", start, end: Math.min(end, size - 1) };
}
