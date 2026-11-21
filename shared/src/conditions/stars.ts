import { moonAge, SYNODIC_MONTH_DAYS } from "./moon";
import { STAR_LIST } from "./star-list";
import { MAX_STARS, type MoonSky, type Place, type SkyStar } from "./types";

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const MS_PER_DAY = 86_400_000;

const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const round2 = (x: number): number => Math.round(x * 100) / 100;

export function localSiderealDeg(lonDeg: number, instantMs: number): number {
  const days = (instantMs - J2000_MS) / MS_PER_DAY;
  const gmst = 280.46061837 + 360.98564736629 * days;
  return norm360(gmst + lonDeg);
}

/** Convert equatorial `(raDeg, decDeg)` at `lstDeg` and observer `latDeg` to horizontal `(az, alt)` degrees (North=0, East=90). */
export function equatorialToHorizontal(
  raDeg: number,
  decDeg: number,
  latDeg: number,
  lstDeg: number,
): Readonly<{ az: number; alt: number }> {
  const ha = norm360(lstDeg - raDeg) * RAD;
  const dec = decDeg * RAD;
  const lat = latDeg * RAD;
  const sinAlt = clamp(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha), -1, 1);
  const alt = Math.asin(sinAlt) * DEG;
  const east = -Math.cos(dec) * Math.sin(ha);
  const north = Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(ha);
  const az = norm360(Math.atan2(east, north) * DEG);
  return { az: (round2(az) % 360) + 0, alt: round2(alt) + 0 };
}

/**
 * Low-precision visible stars (`alt > 0`, at most 300) above `place` at `instantMs` (`conditions` 6.2; Requirement 6.1).
 * Precession, proper motion, parallax, and refraction are ignored; accuracy is within ~1° for 1940 onward.
 */
export function starsAbove(place: Pick<Place, "lat" | "lon">, instantMs: number): SkyStar[] {
  const lst = localSiderealDeg(place.lon, instantMs);
  const out: SkyStar[] = [];
  for (let id = 0; id < STAR_LIST.length && id < MAX_STARS; id++) {
    const s = STAR_LIST[id]!;
    const h = equatorialToHorizontal(s.ra, s.dec, place.lat, lst);
    if (h.alt > 0) out.push({ id, az: h.az, alt: h.alt, mag: s.mag });
  }
  return out;
}

/** Low-precision moon position (`az`, `alt`) and illuminated fraction (`0..1`) above `place` at `instantMs`. */
export function moonSky(place: Pick<Place, "lat" | "lon">, instantMs: number): MoonSky {
  const d = (instantMs - J2000_MS) / MS_PER_DAY;
  const L = norm360(218.316 + 13.176396 * d);
  const M = norm360(134.963 + 13.064993 * d) * RAD;
  const F = norm360(93.272 + 13.22935 * d) * RAD;
  const lon = (L + 6.289 * Math.sin(M)) * RAD;
  const lat = 5.128 * Math.sin(F) * RAD;
  const eps = 23.4397 * RAD;
  const ra = norm360(Math.atan2(Math.sin(lon) * Math.cos(eps) - Math.tan(lat) * Math.sin(eps), Math.cos(lon)) * DEG);
  const dec = Math.asin(clamp(Math.sin(lat) * Math.cos(eps) + Math.cos(lat) * Math.sin(eps) * Math.sin(lon), -1, 1)) * DEG;
  const h = equatorialToHorizontal(ra, dec, place.lat, localSiderealDeg(place.lon, instantMs));
  const phaseAngle = (moonAge(instantMs) / SYNODIC_MONTH_DAYS) * 2 * Math.PI;
  const lit = clamp(Math.round(((1 - Math.cos(phaseAngle)) / 2) * 1000) / 1000, 0, 1);
  return { az: h.az, alt: h.alt, lit };
}
