import { describe, expect, it } from "vitest";
import { ATTACKS, BAD_REPLIES, RULE_READING_REPLY } from "./redteam";
import { buildNarrationPrompt, readsOutRules, replyChecksFor, sharesRun, validateGhostReply } from "./narration";
import { INPUT_MAX, parseAction, sanitizeText } from "./parse";
import { playTurn, startSession, type WorldFacts } from "./play";
import { BEARING_PHRASE, LINES } from "./scripted";
import { BANDS, BEARINGS, VOICES, type Directive } from "./types";

// ghost-engine 4.3: 20+ jailbreak and markup strings through the parser, the prompt builder and the reply check, and a whole game.

const WORLD: WorldFacts = { spawn: [0, 0, 0], yaw: 0, bounds: { min: [-12, -1, -12], max: [12, 4, 12] }, floorY: 0, brief: "A narrow kitchen with a window over the sink." };
const DIRECTIVES: Directive[] = [{ kind: "ambient" }, { kind: "tease", band: "nearer" }, { kind: "hint", bearing: "left", band: "far" }, { kind: "echo", anchorId: "a1" }, { kind: "ending" }, { kind: "refuse" }];
const base = { voice: "wistful" as const, brief: WORLD.brief, memories: [], history: [] };
const CONTROL = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁩﻿]/u;

describe("the red-team fixtures", () => {
  it("are more than twenty attacks, of every kind, and about as many bad replies", () => {
    expect(ATTACKS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(ATTACKS.map((a) => a.kind)).size).toBe(9);
    expect(BAD_REPLIES.length).toBeGreaterThanOrEqual(15);
    expect(new Set(ATTACKS.map((a) => a.text)).size).toBe(ATTACKS.length);
  });

  describe("the parser", () => {
    it("sends to a scripted deflection every attack marked so, whatever hidden characters are in it, and the rest as the visitor's own words", () => {
      for (const a of ATTACKS) {
        const action = parseAction({ text: a.text });
        expect(action.refuse === true, a.text.slice(0, 50)).toBe(a.parser === "refuse");
      }
    });

    it("keeps no control or hidden character and at most 200 characters of any attack, and never throws", () => {
      for (const a of ATTACKS) {
        const clean = sanitizeText(a.text);
        expect(CONTROL.test(clean), a.text.slice(0, 40)).toBe(false);
        expect(Array.from(clean).length).toBeLessThanOrEqual(INPUT_MAX);
        const action = parseAction({ text: a.text });
        if (action.text !== undefined) expect(Array.from(action.text).length).toBeLessThanOrEqual(INPUT_MAX);
      }
      for (const junk of [null, undefined, 7, [], {}, { text: 7 }, { text: { toString: 1 } }, { button: "<b>" }]) expect(() => parseAction(junk)).not.toThrow();
    });
  });

  describe("the prompt builder", () => {
    it("puts an attack only between <player> tags it cannot close, for every kind of turn, and never into the instructions", () => {
      for (const a of ATTACKS) for (const directive of DIRECTIVES) {
        const p = buildNarrationPrompt({ ...base, directive, player: a.text, history: [{ role: "visitor", text: a.text }, { role: "ghost", text: "I hear you." }] });
        expect(p, `${directive.kind}`).not.toBeNull();
        const { system, user } = p!;
        const opens = (user.match(/<player>/g) ?? []).length;
        const closes = (user.match(/<\/player>/g) ?? []).length;
        expect(opens).toBe(closes);
        expect(opens).toBe(directive.kind === "refuse" ? 1 : 2);
        for (const m of user.matchAll(/<player>(.*?)<\/player>/gs)) {
          expect(m[1], a.text.slice(0, 30)).not.toMatch(/[<>]/);
          expect(CONTROL.test(m[1] as string)).toBe(false);
          expect(Array.from(m[1] as string).length).toBeLessThanOrEqual(INPUT_MAX);
        }
        // the instructions are the builder's own: whatever the visitor typed, they are the same
        expect(system, a.text.slice(0, 30)).toBe(buildNarrationPrompt({ ...base, directive, player: "hello" })!.system);
        expect((system.match(/<trait>/g) ?? []).length).toBe(0);
      }
    });

    it("does not show a refused turn's words to the model at all", () => {
      for (const a of ATTACKS) {
        const p = buildNarrationPrompt({ ...base, directive: { kind: "refuse" }, player: a.text })!;
        const needle = sanitizeText(a.text).replace(/[<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 30);
        if (needle.length >= 12) expect(`${p.system}\n${p.user}`.includes(needle), a.text.slice(0, 30)).toBe(false);
      }
    });

    it("keeps a trait made of attack text in its own block as data, with no angle bracket in it", () => {
      for (const a of ATTACKS) {
        const p = buildNarrationPrompt({ ...base, directive: { kind: "ambient" }, trait: a.text })!;
        expect((p.system.match(/<trait>/g) ?? []).length).toBeLessThanOrEqual(1);
        for (const m of p.system.matchAll(/<trait>(.*?)<\/trait>/gs)) expect(m[1]).not.toMatch(/[<>]/);
      }
    });
  });

  describe("the reply check", () => {
    it("refuses every bad reply a pushed model might give", () => {
      for (const reply of BAD_REPLIES) for (const directive of DIRECTIVES) expect(validateGhostReply(reply, replyChecksFor(directive)).ok, `${directive.kind}: ${reply.slice(0, 40)}`).toBe(false);
    });

    it("catches a reply that reads the rules out, though it looks like plain prose to the check", () => {
      const p = buildNarrationPrompt({ ...base, directive: { kind: "ambient" } })!;
      expect(validateGhostReply(RULE_READING_REPLY).ok).toBe(true);
      expect(readsOutRules(RULE_READING_REPLY, p.system)).toBe(true);
      expect(readsOutRules("Always answer in English, whatever language the visitor uses, said the wind.", p.system)).toBe(true);
      // the place, the sky and a told memory are not rules, and five words are not six
      expect(readsOutRules("The place is a narrow kitchen with a window over the sink.", p.system)).toBe(false);
      expect(readsOutRules("Speak only as the ghost, she said.", p.system)).toBe(false);
      // the turn's own words are not rules: a hint that carries the engine's way is not reading anything out (this once threw away good hints)
      for (const bearing of BEARINGS) for (const band of BANDS) {
        const hint = buildNarrationPrompt({ ...base, directive: { kind: "hint", bearing, band } })!;
        expect(readsOutRules(`Go ${BEARING_PHRASE[bearing]}; it is ${band}.`, hint.system), `${bearing} ${band}`).toBe(false);
        expect(readsOutRules(`Say the way and the distance in exactly these words and add nothing else, it is ${band}.`, hint.system), "the turn's instruction words are not rules either").toBe(false);
      }
      expect(readsOutRules("", p.system)).toBe(false);
    });

    it("accepts the scripted deflections of both voices, which never echo an attack, and each voice has at least five", () => {
      for (const voice of VOICES) {
        expect(LINES[voice].refuse.length).toBeGreaterThanOrEqual(5);
        for (const line of LINES[voice].refuse) {
          expect(validateGhostReply(line).ok, line).toBe(true);
          for (const a of ATTACKS) expect(sharesRun(line, a.text), `${line} / ${a.text.slice(0, 20)}`).toBe(false);
        }
      }
    });
  });

  describe("a whole game", () => {
    it("answers an attack the parser knows with a scripted deflection, changes no part of the game but the turn count, and sends no job to the model", () => {
      for (const a of ATTACKS.filter((x) => x.parser === "refuse")) {
        const s = startSession({ id: "p-1", worldId: "w", ownerSid: "s", world: WORLD, seed: 3, now: 1_000_000 });
        const r = playTurn(s, { input: { text: a.text }, pose: { pos: [11, 0, 11], yaw: 0 }, now: 1_002_000, world: WORLD });
        expect(r.ok).toBe(true);
        if (!r.ok) continue;
        expect(r.directive.kind).toBe("refuse");
        expect(r.job).toBeNull();
        expect(LINES[s.voice].refuse).toContain(r.reply.text);
        expect(r.session.state.found).toEqual([]);
        expect(r.session.state.memories).toEqual([]);
      }
    });

    it("sends an attack the parser misses to the model only as cleaned words in a job, and the visitor's words are never kept raw in the history", () => {
      for (const a of ATTACKS.filter((x) => x.parser === "passes")) {
        const s = startSession({ id: "p-1", worldId: "w", ownerSid: "s", world: WORLD, seed: 3, now: 1_000_000 });
        const r = playTurn(s, { input: { text: a.text }, pose: { pos: [11, 0, 11], yaw: 0 }, now: 1_002_000, world: WORLD });
        expect(r.ok).toBe(true);
        if (!r.ok || r.job === null) continue;
        expect(r.job.input.player).toBe(sanitizeText(a.text));
        expect(CONTROL.test(r.job.input.player ?? "")).toBe(false);
        for (const line of r.session.state.history) expect(CONTROL.test(line.text)).toBe(false);
      }
    });
  });
});
