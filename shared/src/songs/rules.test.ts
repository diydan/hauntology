import { describe, expect, it } from "vitest";
import { createEngine, publicSnapshot, step } from "../party/engine";
import { PRESET_GHOST_IDS, PRESET_GHOSTS } from "../party/preset-ghosts";
import { clueSongOrAmbience, ghostThemeFor, hauntLoopFor, roundStingFor } from "./rules";

describe("Stock Song play rules (game-songs 5.3)", () => {
  it("maps Haunt level bands cleanly and rotates round stings 1..3", () => {
    expect(hauntLoopFor(0).id).toBe("haunt-low");
    expect(hauntLoopFor(3).id).toBe("haunt-low");
    expect(hauntLoopFor(4).id).toBe("haunt-mid");
    expect(hauntLoopFor(6).id).toBe("haunt-mid");
    expect(hauntLoopFor(7).id).toBe("haunt-high");
    expect(hauntLoopFor(10).id).toBe("haunt-high");

    expect([1, 2, 3, 4].map((r) => roundStingFor(r).id)).toEqual(["sting-1", "sting-2", "sting-3", "sting-1"]);
  });

  it("plays Relic/Zone Clue Song only when public log rules it out; otherwise plays ambience", () => {
    const seats = [1, 2].map((seat) => ({ seat, nickname: `P${seat}`, bot: seat !== 1, botLevel: "standard" as const }));
    let s = createEngine({ seed: 11, seats, settings: { baseSeconds: 60, hauntMax: 10, puzzles: "off" }, presetIds: PRESET_GHOST_IDS });
    s = step(s, { kind: "client", seat: 1, msg: { t: "start" } }, 1_000).state;
    const base = publicSnapshot(s, 2_000);

    // No public exclusion yet -> ambient Haunt loop with hint: null.
    const ambient = clueSongOrAmbience(base, { seed: 5 });
    expect(ambient.hint).toBeNull();
    expect(ambient.song.kind).toBe("haunt");

    // Inspected empty zone confirmed -> picks that zone's Stock Clue Song when matched.
    const z = base.zones[0]!;
    const withInspect = { ...base, events: [{ id: 1, kind: "inspect" as const, seat: 1, zone: z.id }] };
    const hinted = clueSongOrAmbience(withInspect, { emptyZones: [z.id], excludeIds: [], seed: 5 });
    expect(hinted.hint?.id).toBe(z.id);
    expect(["zone", "haunt"]).toContain(hinted.song.kind);
  });

  it("maps every Preset Ghost to its theme song", () => {
    for (const g of PRESET_GHOSTS) {
      expect(ghostThemeFor(g.id)?.id).toBe(`ghost-${g.id}`);
    }
    expect(ghostThemeFor("nonexistent")).toBeNull();
  });
});
