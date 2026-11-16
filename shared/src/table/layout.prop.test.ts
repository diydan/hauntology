import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { BOARD, roomCenter } from "./marks";
import { tableData } from "./data";
import { SLOT_COUNT, slotCoord, tableLayout } from "./layout";

const zonesArb = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 6, maxLength: 6 });
const cardsArb = (prefix: string) =>
  fc.uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 6, maxLength: 6 }).map((xs) =>
    xs.map((name, i) => ({ id: `${prefix}${i + 1}`, name })),
  );

describe("Property 2: The layout is the same everywhere and says nothing", () => {
  // Feature: spirit-table, Property 2: The layout is the same everywhere and says nothing
  // Validates: Requirements 2.1, 2.3
  it("gives the same six distinct slots every time for a Room Code and Zone ids, independent of Zone order", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 12 }), zonesArb, (roomCode, zones) => {
        const a = tableLayout(roomCode, zones);
        const b = tableLayout(roomCode, zones);
        if (JSON.stringify(a) !== JSON.stringify(b) || a.length !== SLOT_COUNT) return false;
        const slots = a.map((x) => x.slot);
        if (new Set(slots).size !== SLOT_COUNT) return false;
        if (!slots.every((s) => Number.isInteger(s) && s >= 0 && s < SLOT_COUNT)) return false;

        // Every slot covers a distinct 3-by-2 coordinate inside the board
        const coords = new Set(slots.map((s) => {
          const cr = slotCoord(s);
          const center = roomCenter(cr);
          expect(Math.abs(center.x)).toBeLessThan(1.5 * BOARD.W);
          expect(Math.abs(center.z)).toBeLessThan(BOARD.D);
          return `${cr.c},${cr.r}`;
        }));
        if (coords.size !== SLOT_COUNT) return false;

        // Reordering the zones list still maps each Zone id to the exact same slot
        const reversed = tableLayout(roomCode, [...zones].reverse());
        const mapA = new Map(a.map((x) => [x.zone, x.slot]));
        return reversed.every((x) => mapA.get(x.zone) === x.slot);
      }),
      propParams(),
    );
  });

  it("produces different layouts across distinct Room Codes", () => {
    const zones = ["z1", "z2", "z3", "z4", "z5", "z6"];
    const seen = new Set(Array.from({ length: 24 }, (_, i) => JSON.stringify(tableLayout(`RM${i}`, zones).map((r) => r.slot))));
    expect(seen.size).toBeGreaterThan(10);
  });

  it("lists Suspects and Relics in exact pool order and puts none in a room when there is no Theory mark", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 10 }),
        cardsArb("z"),
        cardsArb("s"),
        cardsArb("r"),
        (roomCode, zones, suspects, relics) => {
          const td = tableData(
            {
              phase: "playing",
              active: 1,
              seats: [{ seat: 1, nickname: "A", poltergeist: false }],
              haunt: { level: 0, max: 10, coldSpot: null },
              zones,
              suspects,
              relics,
              events: [],
              ending: null,
            },
            { seat: 1 },
            { auto: new Map(), mine: new Map(), columns: [1, "residue"] },
            roomCode,
          );
          return (
            JSON.stringify(td.suspects.map((s) => s.card)) === JSON.stringify(suspects.map((s) => s.id)) &&
            JSON.stringify(td.relics.map((r) => r.card)) === JSON.stringify(relics.map((r) => r.id)) &&
            td.suspects.every((s) => s.placedIn === undefined)
          );
        },
      ),
      propParams(),
    );
  });
});
