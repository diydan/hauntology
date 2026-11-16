import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { slotCoord, tableLayout } from "./layout";
import { BOARD, roomCenter } from "./marks";
import { WHISPER_HEIGHT, whisperAt } from "./whisper";

const zonesArb = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 6, maxLength: 6 });

describe("Property 4: The Whisper's tour reads nothing hidden", () => {
  // Feature: spirit-table, Property 4: The Whisper's tour reads nothing hidden
  // Validates: Requirements 2.4
  it("is deterministic, stays inside the Table's bounds, moves continuously without jumps, and obeys reduced motion", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 10 }),
        zonesArb,
        fc.boolean(),
        fc.nat(5),
        fc.integer({ min: 0, max: 20 }),
        fc.constantFrom(8, 10, 12),
        fc.integer({ min: -100_000, max: 500_000 }),
        fc.boolean(),
        (roomCode, zones, hasCold, coldIdx, level, max, tMs, reducedMotion) => {
          const coldSpot = hasCold ? zones[coldIdx]! : null;
          const haunt = { level, max };
          const w1 = whisperAt(roomCode, zones, coldSpot, haunt, tMs, reducedMotion);
          const w2 = whisperAt(roomCode, zones, coldSpot, haunt, tMs, reducedMotion);
          if (JSON.stringify(w1) !== JSON.stringify(w2)) return false;

          // Inside Table bounds and finite
          if (![w1.x, w1.z, w1.height, w1.glow].every(Number.isFinite)) return false;
          if (Math.abs(w1.x) > 1.5 * BOARD.W || Math.abs(w1.z) > BOARD.D) return false;
          if (w1.height <= 0 || w1.height > 0.25 || w1.glow < 0 || w1.glow > 1) return false;

          // Cold Spot pins XZ to that room's center
          if (coldSpot !== null) {
            const slot = tableLayout(roomCode, zones).find((r) => r.zone === coldSpot)!.slot;
            const c = roomCenter(slotCoord(slot));
            if (Math.abs(w1.x - c.x) > 1e-12 || Math.abs(w1.z - c.z) > 1e-12) return false;
          }

          // No sudden jump across one 30fps frame (33 ms)
          const next = whisperAt(roomCode, zones, coldSpot, haunt, tMs + 33, reducedMotion);
          if (Math.hypot(next.x - w1.x, next.z - w1.z) > 0.025 || Math.abs(next.height - w1.height) > 0.002) return false;

          // Reduced motion holds completely still at nominal height across any two times
          const stillA = whisperAt(roomCode, zones, coldSpot, haunt, tMs, true);
          const stillB = whisperAt(roomCode, zones, coldSpot, haunt, tMs + 42_000, true);
          return JSON.stringify(stillA) === JSON.stringify(stillB) && stillA.height === WHISPER_HEIGHT;
        },
      ),
      propParams(),
    );
  });

  it("glows no less at a higher Haunt level", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 8 }),
        zonesArb,
        fc.integer({ min: 0, max: 15 }),
        fc.integer({ min: 0, max: 15 }),
        fc.constantFrom(8, 10, 12),
        (roomCode, zones, a, b, max) => {
          const lo = Math.min(a, b), hi = Math.max(a, b);
          const wLo = whisperAt(roomCode, zones, null, { level: lo, max }, 1000, false);
          const wHi = whisperAt(roomCode, zones, null, { level: hi, max }, 1000, false);
          return wHi.glow >= wLo.glow;
        },
      ),
      propParams(),
    );
  });
});
