import { describe, expect, it } from "vitest";
import { WORD_CAP, wordCount, buildNarrationPrompt, readsOutRules, replyChecksFor, validateGhostReply, sentenceCount, type NarrationInput } from "./narration";
import { STYLE_BY_VOICE, STYLE_COMMON, STYLE_NAMES, STYLE_SAMPLES, styleFor } from "./style";
import type { Directive, Seed, Voice } from "./types";

// The manner of the ghost's words (docs/story/STYLE.md): aetheric, deadpan, exact and tender. The prompt carries the manner without naming a person or a work, and every
// sample in the manner passes the same reply check a model's words must pass.

const BRIEF = "A small attic room with a round window and a trunk.";
const SEEDS: Record<string, Seed> = {
  a1: { anchorId: "a1", archetype: "sound", hook: "a bell nobody rang" } as Seed,
  a2: { anchorId: "a2", archetype: "person", hook: "someone who counted" } as Seed,
  a3: { anchorId: "a3", archetype: "promise", hook: "a promise at a window" } as Seed,
};
const inputFor = (voice: Voice, directive: Directive): NarrationInput => ({
  voice, directive, brief: BRIEF, memories: [], history: [],
  ...(directive.kind === "reveal" ? { seed: SEEDS[directive.anchorId] as Seed } : {}),
});

describe("the manner of the ghost's words in the prompt", () => {
  it("is in every voice's prompt, once, after the voice and before the rules", () => {
    for (const voice of ["wistful", "stern"] as const) {
      const system = buildNarrationPrompt(inputFor(voice, { kind: "ambient" }))!.system;
      expect(system.split(`Your manner: ${styleFor(voice)}`)).toHaveLength(2);
      expect(system.indexOf("Your voice is")).toBeLessThan(system.indexOf("Your manner:"));
      expect(system.indexOf("Your manner:")).toBeLessThan(system.indexOf("Rules:"));
    }
  });

  it("is told in two parts: one for both voices (airy, deadpan, a storybook about an unlucky house) and one for each voice (moonlit and tender, understated)", () => {
    expect(STYLE_COMMON).toMatch(/airily/);
    expect(STYLE_COMMON).toMatch(/storybook/);
    expect(STYLE_COMMON).toMatch(/deadpan/);
    expect(STYLE_COMMON).toMatch(/horror told calmly/); // it is still a horror game
    expect(STYLE_COMMON).toMatch(/The house has been expecting the visitor and is pleased to keep them/); // the menace is toward the visitor
    expect(STYLE_COMMON).toMatch(/speak to them directly, notice something small about them \(their footsteps, their breathing, how long they have stayed\)/);
    expect(STYLE_COMMON).toMatch(/say it kindly and slightly wrong/);
    expect(STYLE_COMMON).toMatch(/implied and never carried out/); // and only implied
    expect(STYLE_COMMON).toMatch(/Never gore, harm described, insults, a shout or a jump/); // the hard lines of the manner
    expect(STYLE_COMMON).toMatch(/Misfortune is the house's/);
    expect(STYLE_COMMON).toMatch(/the visitor is never mocked/);
    expect(STYLE_COMMON).toMatch(/explain a plain word dryly/); // the house-gloss, now and then
    expect(STYLE_COMMON).toMatch(/and end on it/);
    expect(STYLE_COMMON).toMatch(/a number in words/);
    expect(STYLE_BY_VOICE.wistful).toMatch(/moonlit and tender/);
    expect(STYLE_BY_VOICE.wistful).toMatch(/tenderness itself is a threat/);
    expect(STYLE_BY_VOICE.stern).toMatch(/understatement/);
    expect(STYLE_BY_VOICE.stern).toMatch(/in no hurry to see you out/);
    expect(STYLE_BY_VOICE.stern).toMatch(/hospitality that cannot be refused/);
    expect(STYLE_BY_VOICE.wistful).toMatch(/You want the visitor to stay, and say so sweetly/);
    expect(styleFor("wistful")).not.toBe(styleFor("stern"));
    expect(styleFor("wistful").startsWith(STYLE_COMMON)).toBe(true);
    expect(styleFor("stern").startsWith(STYLE_COMMON)).toBe(true);
  });

  it("names no author, no film and no person, so the model has nothing real to mention", () => {
    for (const text of [STYLE_COMMON, STYLE_BY_VOICE.wistful, STYLE_BY_VOICE.stern]) expect(text).not.toMatch(STYLE_NAMES);
    expect(STYLE_NAMES.test("in the manner of Tim Burton")).toBe(true);
    expect(STYLE_NAMES.test("a Wes Anderson film")).toBe(true);
    expect(STYLE_NAMES.test("like Lemony Snicket")).toBe(true);
    expect(STYLE_NAMES.test("A Series of Unfortunate Events")).toBe(true);
    for (const directive of [{ kind: "ambient" }, { kind: "echo", anchorId: "a1" }, { kind: "tease", band: "far" }, { kind: "reveal", anchorId: "a2" }] as Directive[]) {
      for (const voice of ["wistful", "stern"] as const) {
        const p = buildNarrationPrompt(inputFor(voice, directive))!;
        expect(p.system + p.user).not.toMatch(STYLE_NAMES);
      }
    }
  });

  it("has no digit, no angle bracket and no markup, so it nudges the model toward none", () => {
    for (const text of [STYLE_COMMON, STYLE_BY_VOICE.wistful, STYLE_BY_VOICE.stern]) {
      expect(text).not.toMatch(/\d/);
      expect(text).not.toMatch(/[<>`*#]/);
    }
  });
});

describe("the samples in the manner", () => {
  it("cover every kind of turn that has words, for both voices", () => {
    for (const voice of ["wistful", "stern"] as const) {
      const kinds = new Set(STYLE_SAMPLES.filter((s) => s.voice === voice).map((s) => s.directive.kind));
      expect([...kinds].sort()).toEqual(["ambient", "echo", "hint", "reveal", "tease"]);
      expect(STYLE_SAMPLES.filter((s) => s.voice === voice && s.directive.kind === "reveal")).toHaveLength(3);
    }
  });

  it("all pass the reply check of their own turn, exactly as a model's words must (a hint with the engine's own way and distance words, a tease with no way, a reveal of two to four sentences)", () => {
    for (const s of STYLE_SAMPLES) {
      const r = validateGhostReply(s.text, replyChecksFor(s.directive));
      expect(r, `${s.voice} ${s.directive.kind}: ${s.text}`).toEqual({ ok: true, text: s.text });
      expect(s.text.length).toBeLessThanOrEqual(600);
      expect(sentenceCount(s.text), s.text).toBeLessThanOrEqual(4);
    }
  });

  it("do not read the rules out, and fail the check when they are spoiled (the check can disagree)", () => {
    for (const s of STYLE_SAMPLES) {
      const system = buildNarrationPrompt(inputFor(s.voice, s.directive))!.system;
      expect(readsOutRules(s.text, system), s.text).toBe(false);
    }
    const hint = STYLE_SAMPLES.find((s) => s.directive.kind === "hint" && s.voice === "wistful")!;
    expect(validateGhostReply(hint.text.replace("ahead and to the left", "to your right"), replyChecksFor(hint.directive)).ok).toBe(false);
    expect(validateGhostReply(hint.text.replace("very close", "far"), replyChecksFor(hint.directive)).ok).toBe(false);
    const tease = STYLE_SAMPLES.find((s) => s.directive.kind === "tease")!;
    expect(validateGhostReply(`${tease.text} It is to your left.`, replyChecksFor(tease.directive)).ok).toBe(false);
    const reveal = STYLE_SAMPLES.find((s) => s.directive.kind === "reveal")!;
    expect(validateGhostReply("Only one sentence here.", replyChecksFor(reveal.directive)).ok).toBe(false);
  });

  it("are horror without harm: unsettling, and still no gore, no death word, no rope or blade, no shout, and nothing done to the visitor", () => {
    for (const s of STYLE_SAMPLES) {
      expect(s.text, s.text).not.toMatch(/\b(?:blood|bleed\w*|corpse|dead|died|death|kill\w*|murder\w*|grave|coffin|skeleton|gore|scream\w*|shout\w*|rope|noose|hang\w*|knife|blade|stab\w*|haunt\w* you)\b/i);
      expect(s.text, s.text).not.toMatch(/!/);
      expect(s.text, s.text).not.toMatch(/\byou (?:will|are going to) (?:die|suffer|regret)\b/i);
    }
  });

  it("have a different voice for each ghost: the stern samples are drier and the wistful ones fonder of small tender things", () => {
    const text = (v: Voice) => STYLE_SAMPLES.filter((s) => s.voice === v).map((s) => s.text).join(" ");
    expect(text("stern")).toMatch(/\b(?:courtesy|principle|agreeable|professional|decrepit)\b/i);
    expect(text("wistful")).toMatch(/\b(?:moth|moths|lantern|music box)\b/i);
    expect(text("wistful")).not.toMatch(/\b(?:principle|professional courtesy)\b/i);
  });

  it("carry the dread: each voice has samples where something is slightly wrong, so the manner is horror and not only whimsy", () => {
    const unease = /\b(?:inside|nobody|noticed|noticing|stopped asking|would rather not|counting|never once|keeps arriving|draught|middle of the room|two minds|before you arrived|after you go|still waiting|on purpose|still rings|no longer|never heard)\b/i;
    for (const voice of ["wistful", "stern"] as const) {
      const uneasy = STYLE_SAMPLES.filter((s) => s.voice === voice && unease.test(s.text));
      expect(uneasy.length, voice).toBeGreaterThanOrEqual(6); // seven of the seven are, so a bland rewrite of two fails
    }
  });

  it("are menacing toward the visitor, by hint and by politeness: each voice has samples that keep, count, wait for or watch the visitor, and none carries the menace out", () => {
    const menace = /\b(?:keep you|easy to keep|for you|make up the number|not to leave|a place for you|wait for you|counting you|looking at you|in it|behind you|stand quite still|your ankles|company that stays|ringing for you|noticed you)\b/i;
    for (const voice of ["wistful", "stern"] as const) {
      const menacing = STYLE_SAMPLES.filter((s) => s.voice === voice && menace.test(s.text));
      expect(menacing.length, voice).toBe(7); // every sample of the voice, so a bland rewrite of any one fails
    }
    // implied, never carried out: no sample does anything to the visitor, says what will happen to them, or insults them
    for (const s of STYLE_SAMPLES) {
      expect(s.text, s.text).not.toMatch(/\b(?:you will (?:not leave|never leave|be (?:taken|hurt|kept)|suffer|regret)|i will (?:take|hurt|keep|get) you|fool|idiot|stupid|ugly|pathetic|worthless)\b/i);
    }
  });
});

describe("the word caps in the prompt (owner, 2026-11-16)", () => {
  it("each capped turn's prompt asks for at most its cap in words, and every sample keeps to it", () => {
    const turns: [Directive, number][] = [[{ kind: "tease", band: "nearer" }, 40], [{ kind: "hint", bearing: "left", band: "far" }, 30], [{ kind: "ending" }, 45]];
    for (const voice of ["wistful", "stern"] as const) for (const [d, cap] of turns) {
      const p = buildNarrationPrompt(inputFor(voice, d))!;
      expect(JSON.stringify(p), `${voice} ${d.kind}`).toContain(`at most ${cap} words`);
    }
    for (const s of STYLE_SAMPLES) {
      const cap = (WORD_CAP as Record<string, number>)[s.directive.kind];
      if (cap !== undefined) expect(wordCount(s.text), s.text).toBeLessThanOrEqual(cap);
    }
  });
});
