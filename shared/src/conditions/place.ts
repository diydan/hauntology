import { PlaceSchema, type Place } from "./types";

/**
 * `normalizePlace` and `normalizeMatches` (conditions 2.2, Requirements 1.1 and 1.3): the one door a position goes through. Whatever the browser or a city
 * search hands over, what comes out holds a latitude and a longitude rounded to two decimals (about a kilometre), a time zone name or null, and a short
 * label, and nothing else: no accuracy, altitude, heading, speed, fix time or address, and no digit of the unrounded position. Pure; never throws.
 */

/** The label of a position that came from the table's own location (the browser) and has no name. */
export const HERE = "Here";
export const MAX_MATCHES = 5;
const LABEL_MAX = 80;

const round2 = (x: number): number => Math.round(x * 100) / 100 + 0; // "+ 0" turns -0 into 0

/** An IANA zone name the runtime knows, or `null`. */
function knownZone(tz: unknown): string | null {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }); // throws a RangeError for a name it does not know
    return tz;
  } catch {
    return null;
  }
}

/** Control and invisible format characters (C0, DEL, C1, zero-width and bidi marks, line and paragraph separators, the byte order mark) are not label text. */
function isNoise(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f) || (code >= 0x200b && code <= 0x200f) || (code >= 0x2028 && code <= 0x202e) || (code >= 0x2060 && code <= 0x206f) || code === 0xfeff;
}

/** Noise out (as a space), spaces folded, then cut to the label's limit. */
function labelOf(label: unknown): string {
  if (typeof label !== "string") return HERE;
  let text = "";
  for (const ch of label) text += isNoise(ch.codePointAt(0) as number) ? " " : ch;
  let cut = text.replace(/\s+/g, " ").trim().slice(0, LABEL_MAX);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1); // the cut fell inside an emoji or another pair
  cut = cut.trim();
  return cut === "" ? HERE : cut;
}

export type PlaceResult = { ok: true; place: Place } | { ok: false; code: "bad_place" };

/** A Place from whatever was sent, or `bad_place`. A position that is not a finite number inside the globe is refused; every other field is dropped. */
export function normalizePlace(input: unknown): PlaceResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ok: false, code: "bad_place" };
  let lat: unknown;
  let lon: unknown;
  let tz: unknown;
  let label: unknown;
  try {
    const o = input as Record<string, unknown>;
    lat = o["lat"];
    lon = o["lon"];
    tz = o["tz"];
    label = o["label"];
  } catch {
    return { ok: false, code: "bad_place" }; // a getter that throws
  }
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) return { ok: false, code: "bad_place" };
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return { ok: false, code: "bad_place" };
  const place: Place = { lat: round2(lat), lon: round2(lon), tz: knownZone(tz), label: labelOf(label) };
  const checked = PlaceSchema.safeParse(place);
  return checked.success ? { ok: true, place: checked.data } : { ok: false, code: "bad_place" };
}

/** At most five Places from a raw list of matches (any number of them, any extra fields); a match that is not a position is dropped. */
export function normalizeMatches(raw: unknown): Place[] {
  if (!Array.isArray(raw)) return [];
  const out: Place[] = [];
  for (const item of raw) {
    if (out.length >= MAX_MATCHES) break;
    const r = normalizePlace(item);
    if (r.ok) out.push(r.place);
  }
  return out;
}
