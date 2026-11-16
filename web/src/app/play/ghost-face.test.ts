import { voiceOfPreset } from "@hauntology/shared/ghost/scripted";
import { describe, expect, it } from "vitest";
import { DEFAULT_GHOST_NAME, ghostFace } from "./ghost-face";

describe("ghostFace: who the visitor is talking to", () => {
  it("is the plain ghost, as the Whisper, with the orb, when nothing was chosen", () => {
    expect(ghostFace({})).toEqual({ name: DEFAULT_GHOST_NAME, sprite: null, speaker: "whisper" });
    expect(DEFAULT_GHOST_NAME).toBe("The ghost");
  });

  it("speaks as the Whisper for a soft voice and the Keeper for a dry one, exactly as the engine chooses the voice", () => {
    for (let i = 0; i < 300; i += 1) {
      const id = i === 0 ? "" : `preset-${i.toString(36)}-${(i * 7919) % 1013}`;
      expect(ghostFace({ ghostPreset: id }).speaker).toBe(voiceOfPreset(id) === "wistful" ? "whisper" : "keeper");
    }
    const speakers = new Set(["preset-maren", "preset-alder", "preset-wick", "preset-ines", "preset-tobias", "preset-odile"].map((id) => ghostFace({ ghostPreset: id }).speaker));
    expect(speakers).toEqual(new Set(["whisper", "keeper"]));
  });

  it("uses the chosen name, trimmed, and the plain name for a blank one", () => {
    expect(ghostFace({ ghostName: "  Maren " }).name).toBe("Maren");
    expect(ghostFace({ ghostName: "   " }).name).toBe(DEFAULT_GHOST_NAME);
    expect(ghostFace({ ghostName: "" }).name).toBe(DEFAULT_GHOST_NAME);
  });

  it("takes a picture only from this site, never another address", () => {
    expect(ghostFace({ ghostSprite: "/demo/ghosts/preset-maren.svg" }).sprite).toBe("/demo/ghosts/preset-maren.svg");
    for (const bad of ["//evil.example/x.svg", "https://evil.example/x.svg", "http://x/y", "javascript:alert(1)", "data:image/svg+xml,<svg/>", "demo/x.svg", ""]) {
      expect(ghostFace({ ghostSprite: bad }).sprite).toBeNull();
    }
    expect(ghostFace({}).sprite).toBeNull();
  });
});
