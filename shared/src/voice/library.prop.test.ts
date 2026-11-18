import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { createEngine, publicSnapshot, step } from "../party/engine";
import { PRESET_GHOST_IDS } from "../party/preset-ghosts";
import { sha256Hex } from "./digest";
import { libraryKey, normalise } from "./key";
import { FINITE, scriptedBanksArb } from "./library.arb";
import { buildLibrary, estimateLibrary, prefetchPlan, requestChars } from "./library";
import type { BankLine } from "./library";
import { SCRIPTED_BANKS } from "./banks";
import { FINITE_VALUES } from "./placeholders";
import { PLAYER_PLACEHOLDERS, splitSentences, spokenPart } from "./speakable";
import { toVoiceLine } from "./to-line";
import { lodgerVoiceArb, playerWordArb, safeSentenceArb, speakerArb } from "./voice.arb";
import { LODGER_VOICE_ORDER, SPEAKER_ORDER, steeringTag, voiceFor } from "./voices";

/** The finite expansions of a template, in the same order as the real code (a test copy, so the two can disagree). */
function expansions(text: string): string[] {
  const names = [...new Set([...text.matchAll(/\{([a-z]+)\}/g)].map((m) => m[1] ?? ""))].filter((n) => n in FINITE);
  let out = [text];
  for (const n of names) out = out.flatMap((t) => (FINITE[n] ?? []).map((v) => t.split(`{${n}}`).join(v)));
  return out;
}

describe("Property 14: The Library is complete and free of player text, and nothing is prepared because of a secret", () => {
  // Feature: ghost-voice, Property 14: The Library is complete and free of player text, and nothing is prepared because of a secret
  // Validates: Requirements 1.8, 1.9, 1.10
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

  it("toVoiceLine yields a spoken part free of all playerText and ending at a whole sentence", () => {
    fc.assert(
      fc.property(
        fc.array(safeSentenceArb, { minLength: 1, maxLength: 4 }),
        fc.array(playerWordArb, { minLength: 0, maxLength: 4 }),
        speakerArb,
        fc.option(lodgerVoiceArb, { nil: undefined }),
        (sentences, playerText, speaker, lodgerVoice) => {
          const text = sentences.join(" ");
          const line = toVoiceLine({
            id: "line-1",
            text,
            kind: "narration",
            speaker,
            ...(lodgerVoice !== undefined ? { lodgerVoice } : {}),
            playerText,
            now: 1,
          });
          if (line === null) return true;
          for (const raw of playerText) {
            const needle = raw.trim().toLowerCase();
            if (needle !== "") expect(line.spoken.toLowerCase()).not.toContain(needle);
          }
          if (line.spoken !== "") {
            const allParts = splitSentences(line.text);
            const spokenParts = splitSentences(line.spoken);
            expect(allParts.slice(0, spokenParts.length).join(" ")).toBe(line.spoken);
          }
          return true;
        },
      ),
      propParams(),
    );
  });

  it("two game states differing only in Solution, Hands, Residue or accusation accuracy produce the exact same prefetchPlan", () => {
    const entries = buildLibrary(SCRIPTED_BANKS, FINITE_VALUES);
    const seats = [1, 2, 3].map((seat) => ({ seat, nickname: `P${seat}`, bot: seat !== 1, botLevel: "standard" as const }));
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 0, max: 10 }),
        fc.constantFrom(8 as const, 10 as const, 12 as const),
        fc.option(fc.integer({ min: 0, max: 120 }), { nil: null }),
        (seed, hauntLevel, hauntMax, minutesToMidnight) => {
          const base = step(
            createEngine({ seed, seats, settings: { baseSeconds: 60, hauntMax }, presetIds: PRESET_GHOST_IDS }),
            { kind: "client", seat: 1, msg: { t: "start" } },
            0,
          ).state;
          const sol = base.pool;
          const altSolution = {
            suspect: sol.suspects[1]!.id,
            zone: sol.zones[1]!.id,
            relic: sol.relics[1]!.id,
          };
          const stateA = {
            ...base,
            haunt: { ...base.haunt, level: hauntLevel },
            players: base.players.map((p, idx) => (idx === 0 ? { ...p, sealed: base.deal!.solution, hasSealed: true } : p)),
          };
          const stateB = {
            ...base,
            haunt: { ...base.haunt, level: hauntLevel },
            deal: {
              ...base.deal!,
              solution: altSolution,
              hands: { 1: base.deal!.hands[2] ?? [], 2: base.deal!.hands[3] ?? [], 3: base.deal!.hands[1] ?? [] },
            },
            residueAt: { [sol.zones[2]!.id]: sol.relics[2]!.id },
            players: base.players.map((p, idx) => (idx === 0 ? { ...p, sealed: base.deal!.solution, hasSealed: true } : p)),
          };
          const pubA = publicSnapshot(stateA, 1000);
          const pubB = publicSnapshot(stateB, 1000);
          const planA = prefetchPlan({ phase: pubA.phase, haunt: { level: pubA.haunt.level, max: pubA.haunt.max }, minutesToMidnight }, entries);
          const planB = prefetchPlan({ phase: pubB.phase, haunt: { level: pubB.haunt.level, max: pubB.haunt.max }, minutesToMidnight }, entries);
          expect(planA).toEqual(planB);
        },
      ),
      propParams(),
    );
  });
});
