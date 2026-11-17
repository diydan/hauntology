import { describe, expect, it } from "vitest";
import { parseProfile, serializeProfile } from "./profile";
import { PRESET_PROFILES, presetById } from "./presets";
import { validateTraits } from "./traits";

describe("Preset Ghosts (ghost-creator task 2)", () => {
  it("ships the six Suspects with their locked Lodger Voices and both pictures", () => {
    expect(PRESET_PROFILES.map((p) => [p.persona.name, p.lodgerVoice])).toEqual([
      ["Percy", "mark"],
      ["Captain Thorne", "conrad"],
      ["Dr. Pike", "arjun"],
      ["Cora Bell", "chloe"],
      ["Lady Vane", "eleanor"],
      ["Mrs. Dunmore", "victoria"],
    ]);
    for (const p of PRESET_PROFILES) {
      expect(p.preset).toBe(true);
      expect(p.spriteUrl).toMatch(/^\/ghosts\/[a-z]+\.webp$/);
      expect(p.monoUrl).toMatch(/^\/ghosts\/[a-z]+-mono\.webp$/);
      expect(validateTraits(p.traits).ok).toBe(true);
      expect(parseProfile(serializeProfile(p))).toEqual({ ok: true, profile: p });
      expect(presetById(p.id)).toBe(p);
    }
    expect(new Set(PRESET_PROFILES.map((p) => p.id)).size).toBe(6);
  });
});
