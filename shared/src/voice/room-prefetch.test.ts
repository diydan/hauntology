import { describe, expect, it } from "vitest";
import { SCRIPTED_BANKS } from "./banks";
import { buildLibrary } from "./library";
import { FINITE_VALUES } from "./placeholders";
import { initialRoomVoiceState, planRoomPrefetch, ROOM_PREFETCH_MAX } from "./room-voice";

const entries = buildLibrary(SCRIPTED_BANKS, FINITE_VALUES);
const playing = { phase: "playing", haunt: { level: 0, max: 10 }, minutesToMidnight: null } as const;
const on = { ...initialRoomVoiceState(), speechOn: true };

describe("planRoomPrefetch (ghost-voice 4.8)", () => {
  it("lists nothing while speaking is off or outside play", () => {
    expect(planRoomPrefetch(initialRoomVoiceState(), playing, entries, 1).hostMsg).toBeNull();
    expect(planRoomPrefetch(on, { ...playing, phase: "lobby" }, entries, 1).hostMsg).toBeNull();
  });
  it("lists at most 8 Library lines, never a Lodger line, each kept as a line of its own with a stable id", () => {
    const a = planRoomPrefetch(on, playing, entries, 1);
    const ids = a.hostMsg?.lineIds ?? [];
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThanOrEqual(ROOM_PREFETCH_MAX);
    expect(new Set(ids).size).toBe(ids.length);
    expect(a.state.prefetchLines?.every((l) => l.speaker !== "lodger" && l.spoken !== "")).toBe(true);
    expect(a.state.prefetchLines?.map((l) => l.id)).toEqual(ids);
    expect(planRoomPrefetch(on, playing, entries, 999).hostMsg?.lineIds).toEqual(ids);
  });
  it("does not send the same list twice, and does not touch the spoken lines or their count", () => {
    const first = planRoomPrefetch(on, playing, entries, 1);
    const again = planRoomPrefetch(first.state, playing, entries, 2);
    expect(again.hostMsg).toBeNull();
    expect(again.state).toBe(first.state);
    expect(first.state.spokenCount).toBe(0);
    expect(first.state.voiceLines).toEqual([]);
  });
});
