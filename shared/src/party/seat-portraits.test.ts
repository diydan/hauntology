import { describe, expect, it } from "vitest";
import { PRESET_PROFILES } from "../creator/presets";
import { applyPatch, emptyContrib } from "./lobby-contrib";
import { seatProfile, seatSpriteUrl } from "./seat-portraits";

describe("seat portraits (party-mode 19.8)", () => {
  it("a Preset Ghost is its own picture and its black and white twin; a designed ghost is the Room's sprite for that seat; no contribution is none", () => {
    const preset = PRESET_PROFILES[1]!;
    let c = applyPatch(emptyContrib(), 1, { kind: "ghost", profileId: preset.id, status: "ok" });
    c = applyPatch(c, 2, { kind: "ghost", profileId: "ghost-abc", status: "ok" });
    c = applyPatch(c, 3, { kind: "ghost", profileId: "ghost-def", status: "failed" });
    expect(seatProfile("K7M2", 1, c)).toEqual({ portraitUrl: preset.spriteUrl, monoUrl: preset.monoUrl, preset: true });
    expect(seatProfile("K7M2", 2, c)).toEqual({ portraitUrl: "/api/ghosts/sprite/room-K7M2-2" });
    expect(seatProfile("K7M2", 3, c)).toBeNull();
    expect(seatProfile("K7M2", 4, c)).toBeNull();
    expect(seatProfile("K7M2", 1, undefined)).toBeNull();
  });
  it("the sprite address is the Room's own key, encoded, and carries nothing else", () => {
    expect(seatSpriteUrl("K7M2", 5)).toBe("/api/ghosts/sprite/room-K7M2-5");
    expect(seatSpriteUrl("a b", 1)).toBe("/api/ghosts/sprite/room-a%20b-1");
  });
});
