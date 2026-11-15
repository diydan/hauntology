import { describe, expect, it } from "vitest";
import { LODGER_BANK } from "./banks/lodger";
import { sha256Hex } from "./digest";
import { LIBRARY_PREFIX, libraryKey } from "./key";
import { buildLibrary } from "./library";
import { LODGER_VOICE_ORDER, voiceFor } from "./voices";

/**
 * The committed manifest `shared/fixtures/voice-library.json` is a file snapshot of the Library: keys and spoken texts,
 * no audio (ghost-voice task 3.11). If the banks change, this test fails until the manifest is rewritten with
 * `pnpm --filter @hauntology/shared exec vitest run -u src/voice/library.manifest.test.ts`.
 * `node tools/check-voice-library.mjs` checks the same file against the story markdown without TypeScript.
 */
describe("the voice library manifest", () => {
  it("matches buildLibrary for the banks that exist", async () => {
    const entries = buildLibrary({ lodger: LODGER_BANK });
    const manifest = {
      version: 1,
      prefix: LIBRARY_PREFIX,
      lodgerVoices: LODGER_VOICE_ORDER.map((v) => voiceFor("lodger", "inworld", v)),
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
