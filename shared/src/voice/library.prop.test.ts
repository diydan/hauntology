import * as fc from "fast-check";
import { describe, it } from "vitest";
import { propParams } from "../app/prop-config";
import { sha256Hex } from "./digest";
import { libraryKey, normalise } from "./key";
import { FINITE, scriptedBanksArb } from "./library.arb";
import { buildLibrary, estimateLibrary, requestChars } from "./library";
import type { BankLine } from "./library";
import { PLAYER_PLACEHOLDERS, spokenPart } from "./speakable";
import { LODGER_VOICE_ORDER, SPEAKER_ORDER, steeringTag, voiceFor } from "./voices";

/** The finite expansions of a template, in the same order as the real code (a test copy, so the two can disagree). */
function expansions(text: string): string[] {
  const names = [...new Set([...text.matchAll(/\{([a-z]+)\}/g)].map((m) => m[1] ?? ""))].filter((n) => n in FINITE);
  let out = [text];
  for (const n of names) out = out.flatMap((t) => (FINITE[n] ?? []).map((v) => t.split(`{${n}}`).join(v)));
  return out;
}

describe("Property 14: The Library is complete and free of player text, and nothing is prepared because of a secret", () => {
  // Validates: Requirements 1.8, 1.9, 1.10, 1.11
  it("lists only plain spoken text of at most 240 characters, with no placeholder, markup or cue", () => {
    fc.assert(
      fc.property(scriptedBanksArb, (banks) => {
        for (const e of buildLibrary(banks, FINITE)) {
          if (e.spoken.length === 0 || e.spoken.length > 240) return false;
          if (e.spoken !== normalise(e.spoken)) return false;
          if (/[[\]<>`*#{}]/.test(e.spoken)) return false;
          if (PLAYER_PLACEHOLDERS.some((p) => e.spoken.includes(p))) return false;
          if (e.sources.length === 0) return false;
        }
        return true;
      }),
      propParams(),
    );
  });

  it("never lists a text-only line, and lists every spoken line that has a spoken part", () => {
    fc.assert(
      fc.property(scriptedBanksArb, (banks) => {
        const entries = buildLibrary(banks, FINITE);
        const all: BankLine[] = [...(banks.whisper ?? []), ...(banks.keeper ?? []), ...(banks.lodger ?? [])];
        const textOnly = new Set(all.filter((l) => !l.spoken).map((l) => l.id));
        if (entries.some((e) => e.sources.some((id) => textOnly.has(id)))) return false;
        for (const l of all.filter((x) => x.spoken)) {
          const hasSpokenPart = expansions(l.text).some((t) => spokenPart(t) !== "");
          if (hasSpokenPart !== entries.some((e) => e.sources.includes(l.id))) return false;
        }
        return true;
      }),
      propParams(),
    );
  });

  it("lists each text as a whole-sentence start of its source line", () => {
    fc.assert(
      fc.property(scriptedBanksArb, (banks) => {
        const byId = new Map<string, BankLine>();
        for (const l of [...(banks.whisper ?? []), ...(banks.keeper ?? []), ...(banks.lodger ?? [])]) byId.set(l.id, l);
        return buildLibrary(banks, FINITE).every((e) =>
          e.sources.every((id) => expansions(byId.get(id)?.text ?? "").some((t) => normalise(t).startsWith(e.spoken))),
        );
      }),
      propParams(),
    );
  });

  it("gives the Whisper and the Keeper one voice and each Lodger text all six, never a different set", () => {
    fc.assert(
      fc.property(scriptedBanksArb, (banks) => {
        const entries = buildLibrary(banks, FINITE);
        const lodgerVoices = LODGER_VOICE_ORDER.map((v) => voiceFor("lodger", "inworld", v));
        for (const e of entries) {
          if (e.speaker === "whisper" && e.voice !== "inworld:Pippa") return false;
          if (e.speaker === "keeper" && e.voice !== "inworld:Ronald") return false;
        }
        const byText = new Map<string, string[]>();
        for (const e of entries.filter((x) => x.speaker === "lodger")) byText.set(e.spoken, [...(byText.get(e.spoken) ?? []), e.voice]);
        return [...byText.values()].every((vs) => vs.length === 6 && lodgerVoices.every((v) => vs.includes(v)));
      }),
      propParams(),
    );
  });

  it("has no duplicate (voice, text) and no duplicate key, and lists Speakers in a fixed order", () => {
    fc.assert(
      fc.asyncProperty(scriptedBanksArb, async (banks) => {
        const entries = buildLibrary(banks, FINITE);
        const pairs = new Set(entries.map((e) => `${e.voice}\u0000${e.spoken}`));
        if (pairs.size !== entries.length) return false;
        const keys = new Set(await Promise.all(entries.map((e) => libraryKey(e.voice, e.spoken, sha256Hex))));
        if (keys.size !== entries.length) return false;
        const order = entries.map((e) => SPEAKER_ORDER.indexOf(e.speaker));
        return order.every((n, i) => i === 0 || n >= (order[i - 1] ?? 0));
      }),
      propParams(),
    );
  });

  it("depends on the banks alone: the same banks give the same list, in the same order, every time", () => {
    fc.assert(
      fc.property(scriptedBanksArb, (banks) => {
        const a = buildLibrary(banks, FINITE);
        const b = buildLibrary(structuredClone(banks), FINITE);
        return JSON.stringify(a) === JSON.stringify(b);
      }),
      propParams(),
    );
  });

  it("estimates the characters as the tag plus the text of every file, and never more for fewer files", () => {
    fc.assert(
      fc.property(scriptedBanksArb, (banks) => {
        const entries = buildLibrary(banks, FINITE);
        const est = estimateLibrary(entries);
        const chars = entries.reduce((n, e) => n + steeringTag(e.speaker).length + e.spoken.length, 0);
        const half = estimateLibrary(entries.slice(0, Math.floor(entries.length / 2)));
        return est.files === entries.length && est.chars === chars && half.chars <= est.chars && half.usd <= est.usd &&
          entries.every((e) => requestChars(e) === steeringTag(e.speaker).length + e.spoken.length);
      }),
      propParams(),
    );
  });
});
