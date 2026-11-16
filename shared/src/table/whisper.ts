import { hashParts, mulberry32, shuffleWith } from "./hash";
import { slotCoord, tableLayout } from "./layout";
import { BOARD, roomCenter, type Board } from "./marks";

/**
 * Where the Whisper floats above the Spirit table (spirit-table 2.4): hovers over the Cold Spot room when one is
 * active, otherwise drifts smoothly between rooms on a tour derived from the Room Code alone. Glow rises with
 * haunt.level / haunt.max, and reduced motion holds her still with no bob or travel.
 */
export const WHISPER_REST_MS = 4500;
export const WHISPER_MOVE_MS = 3000;
export const WHISPER_HEIGHT = 0.085;
export const WHISPER_BOB = 0.008;
const BOB_RAD_PER_MS = 0.0021;

export type WhisperState = Readonly<{ x: number; z: number; height: number; glow: number }>;

export function whisperGlow(haunt: Readonly<{ level: number; max: number }>): number {
  if (!Number.isFinite(haunt.level) || haunt.level <= 0) return 0;
  if (!Number.isFinite(haunt.max) || haunt.max <= 0) return 1;
  return Math.min(1, Math.max(0, haunt.level / haunt.max));
}

export function whisperAt(
  roomCode: string,
  zones: readonly string[],
  coldSpot: string | null,
  haunt: Readonly<{ level: number; max: number }>,
  tMs: number,
  reducedMotion: boolean,
  board: Board = BOARD,
): WhisperState {
  const glow = whisperGlow(haunt);
  if (zones.length === 0) return { x: 0, z: 0, height: WHISPER_HEIGHT, glow };

  const layout = tableLayout(roomCode, zones);
  const posByZone = new Map(layout.map((r) => [r.zone, roomCenter(slotCoord(r.slot), board)] as const));
  const safeT = Number.isFinite(tMs) ? tMs : 0;
  const bob = reducedMotion ? 0 : WHISPER_BOB * Math.sin(safeT * BOB_RAD_PER_MS);

  if (coldSpot !== null) {
    const spot = posByZone.get(coldSpot);
    if (spot) return { x: spot.x, z: spot.z, height: WHISPER_HEIGHT + bob, glow };
  }

  const unique = [...new Set(zones)].sort();
  const tour = shuffleWith(mulberry32(hashParts("whisper-tour", roomCode, ...unique)), unique);
  if (reducedMotion || tour.length === 1) {
    const stop = posByZone.get(tour[0] ?? "") ?? { x: 0, z: 0 };
    return { x: stop.x, z: stop.z, height: WHISPER_HEIGHT, glow };
  }

  const stepMs = WHISPER_REST_MS + WHISPER_MOVE_MS;
  const totalMs = tour.length * stepMs;
  const phase = ((safeT % totalMs) + totalMs) % totalMs;
  const idx = Math.floor(phase / stepMs) % tour.length;
  const within = phase - idx * stepMs;
  const from = posByZone.get(tour[idx] ?? "") ?? { x: 0, z: 0 };
  const to = posByZone.get(tour[(idx + 1) % tour.length] ?? "") ?? from;
  const linear = within <= WHISPER_REST_MS ? 0 : (within - WHISPER_REST_MS) / WHISPER_MOVE_MS;
  const smooth = linear * linear * (3 - 2 * linear);
  return {
    x: from.x + (to.x - from.x) * smooth,
    z: from.z + (to.z - from.z) * smooth,
    height: WHISPER_HEIGHT + bob,
    glow,
  };
}
