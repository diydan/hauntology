import { voiceOfPreset } from "@hauntology/shared/ghost/scripted";

/**
 * Who the visitor is talking to, for the Chat's stage: a name, a portrait and which Speaker the
 * ghost speaks as. Until the Persona of `ghost-creator` exists the engine knows only the Preset
 * Ghost the visitor picked, and it chooses the voice from the preset's id (`voiceOfPreset`): a
 * soft (wistful) voice speaks as the Whisper and a dry (stern) one as the Keeper
 * (`ghost-voice` Requirement 1.7), so the stage uses the same function and never disagrees with
 * the voice. Green is only the Whisper's.
 */
export type GhostFace = {
  name: string;
  /** The Preset Ghost's picture (an address on this site), or `null` for the lantern orb. */
  sprite: string | null;
  speaker: "whisper" | "keeper";
};

export const DEFAULT_GHOST_NAME = "The ghost";

export function ghostFace(chosen: { ghostPreset?: string | undefined; ghostName?: string | undefined; ghostSprite?: string | undefined }): GhostFace {
  const name = chosen.ghostName?.trim();
  return {
    name: name === undefined || name === "" ? DEFAULT_GHOST_NAME : name,
    sprite: chosen.ghostSprite !== undefined && chosen.ghostSprite.startsWith("/") && !chosen.ghostSprite.startsWith("//") ? chosen.ghostSprite : null,
    speaker: voiceOfPreset(chosen.ghostPreset) === "wistful" ? "whisper" : "keeper",
  };
}
