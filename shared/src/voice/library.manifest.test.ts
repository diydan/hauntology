import { describe, expect, it } from "vitest";
import { SCRIPTED_BANKS } from "./banks";
import { sha256Hex } from "./digest";
import { LIBRARY_PREFIX, libraryKey } from "./key";
import { buildLibrary } from "./library";
import { FINITE_VALUES } from "./placeholders";
import { LODGER_VOICE_ORDER, voiceFor } from "./voices";

/**
 * The committed manifest `shared/fixtures/voice-library.json` is a file snapshot of the Library: keys and spoken texts,
 * no audio (ghost-voice task 3.11), for the Whisper, the Keeper and the Lodger, with the values the finite placeholders were
 * expanded over (`finite`, so the offline checker can compare them with its own copy). If the banks change, this test fails until the manifest is rewritten with
 * `pnpm --filter @hauntology/shared exec vitest run -u src/voice/library.manifest.test.ts`.
 * `node tools/check-voice-library.mjs` checks the same file against the story markdown without TypeScript.
 */
describe("the voice library manifest", () => {
  it("matches buildLibrary for every bank", async () => {
    const entries = buildLibrary(SCRIPTED_BANKS, FINITE_VALUES);
    const manifest = {
      version: 1,
      prefix: LIBRARY_PREFIX,
      lodgerVoices: LODGER_VOICE_ORDER.map((v) => voiceFor("lodger", "inworld", v)),
      finite: FINITE_VALUES,
      count: entries.length,
      entries: await Promise.all(
        entries.map(async (e) => ({
          key: await libraryKey(e.voice, e.spoken, sha256Hex),
          voice: e.voice,
          spoken: e.spoken,
          sources: e.sources,
        })),
      ),
    };
    await expect(JSON.stringify(manifest, null, 2) + "\n").toMatchFileSnapshot("../../fixtures/voice-library.json");
  });
});
