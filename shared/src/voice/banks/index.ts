import type { ScriptedBanks } from "../library";
import { GHOST_KEEPER_BANK, GHOST_WHISPER_BANK } from "./ghost";
import { LODGER_BANK } from "./lodger";
import { PARTY_KEEPER_BANK, PARTY_WHISPER_BANK } from "./party";

/**
 * Every scripted bank, as `buildLibrary` takes them: the Whisper and the Keeper (single player, then party) and the Lodger.
 * The three files it joins are generated from docs/story/ by tools/build-banks.mjs; this file is written by hand.
 */
export const SCRIPTED_BANKS: ScriptedBanks = {
  whisper: [...GHOST_WHISPER_BANK, ...PARTY_WHISPER_BANK],
  keeper: [...GHOST_KEEPER_BANK, ...PARTY_KEEPER_BANK],
  lodger: LODGER_BANK,
};
