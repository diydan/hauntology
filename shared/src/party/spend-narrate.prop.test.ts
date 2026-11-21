import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { mulberry32 } from "../puzzles/rng";
import { DEFAULT_ROOM_CAPS, narrationRequests, NO_SPEND, planNarration, reserve, roomCaps } from "./spend";
import { CONFESSION_KINDS, DIRECTIVE_KINDS, LINE_VARIANTS_MIN, partyScripted, PARTY_LINES, SPEAKERS, speakerFor, type Speaker } from "./narrate";

const eventsArb = fc.array(fc.record({ id: fc.nat(40), kind: fc.constantFrom(...DIRECTIVE_KINDS) }), { maxLength: 150 });

describe("Property 23: Spend is bounded and narration never changes the game", () => {
  // Feature: party-mode, Property 23: Spend is bounded and narration never changes the game
  // Validates: Requirements 10.1, 10.2
  it("defaults to 12 images and 60 model calls, and ignores bad overrides", () => {
    expect(roomCaps()).toEqual(DEFAULT_ROOM_CAPS);
    expect(roomCaps({ images: -1, models: 1.5 })).toEqual(DEFAULT_ROOM_CAPS);
    expect(roomCaps({ images: 2, models: 3 })).toEqual({ images: 2, models: 3 });
  });
  it("never spends past the Room's caps, and a refusal changes nothing", () => {
    fc.assert(fc.property(fc.array(fc.tuple(fc.constantFrom("images", "models"), fc.boolean()), { maxLength: 200 }), fc.nat(15), fc.nat(15), (calls, im, mo) => {
      const caps = { images: im, models: mo };
      let s = NO_SPEND;
      for (const [meter, allowed] of calls) {
        const r = reserve(s, caps, meter as "images" | "models", { allowed });
        if (!r.ok && r.spend !== s) return false;
        if (r.ok && !allowed) return false;
        s = r.spend;
        if (s.images > caps.images || s.models > caps.models) return false;
      }
      return true;
    }), propParams());
  });
  it("asks for at most one model narration per public event, never for a scripted-only kind, never past the cap, and none with the kill switch on", () => {
    fc.assert(fc.property(eventsArb, fc.nat(80), fc.boolean(), (events, models, kill) => {
      const { steps, spend } = planNarration(events, NO_SPEND, { images: 0, models }, kill);
      if (steps.length !== events.length) return false;
      const n = narrationRequests(steps);
      const ids = new Set(events.map((e) => e.id)).size;
      if (n > ids || n > models || n !== spend.models) return false;
      if (kill && n !== 0) return false;
      const modelIds = steps.filter((s) => s.mode === "model").map((s) => s.id);
      if (new Set(modelIds).size !== modelIds.length) return false;
      return steps.every((s, k) => s.mode === "scripted" || !["cue", "nudge", "phone-cue"].includes((events[k] as { kind: string }).kind));
    }), propParams());
  });
  it("is the same game whatever the narration mode: the plan reads only ids and kinds, so no state can differ", () => {
    const events = [{ id: 1, kind: "suggest" }, { id: 2, kind: "cue" }];
    const a = planNarration(events, NO_SPEND, DEFAULT_ROOM_CAPS, false), b = planNarration(events, NO_SPEND, DEFAULT_ROOM_CAPS, true);
    expect(a.steps.map((s) => s.id)).toEqual(b.steps.map((s) => s.id));
    expect(a.steps.map((s) => s.mode)).toEqual(["model", "scripted"]);
    expect(b.steps.map((s) => s.mode)).toEqual(["scripted", "scripted"]);
  });
  it("refuses with the kill switch before looking at any cap", () => {
    expect(reserve(NO_SPEND, DEFAULT_ROOM_CAPS, "models", { allowed: true, killSwitch: true })).toMatchObject({ ok: false, reason: "kill_switch" });
    expect(reserve({ images: 12, models: 0 }, DEFAULT_ROOM_CAPS, "images")).toMatchObject({ ok: false, reason: "room_cap" });
    expect(reserve(NO_SPEND, DEFAULT_ROOM_CAPS, "images", { allowed: false })).toMatchObject({ ok: false, reason: "global_cap" });
  });
});

describe("Party scripted lines (7.8, 7.9)", () => {
  it("has at least five variants for every Speaker each kind uses, and none for a Speaker it does not use", () => {
    for (const kind of DIRECTIVE_KINDS) {
      for (const sp of SPEAKERS[kind]) expect(PARTY_LINES[kind]?.[sp]?.length ?? 0).toBeGreaterThanOrEqual(LINE_VARIANTS_MIN);
      for (const sp of ["whisper", "keeper", "lodger"] as Speaker[]) if (!SPEAKERS[kind].includes(sp)) expect(PARTY_LINES[kind]?.[sp]).toBeUndefined();
    }
  });
  it("gives the first split of Speakers", () => {
    for (const k of ["turn-start", "time-warning", "achievement", "suggest", "shown", "none-shown", "inspect", "seal", "cue", "nudge", "phone-cue", "reveal", "accuse-wrong"] as const) expect(speakerFor(k)).toBe("keeper");
    for (const k of ["haunt-event", "poltergeist", "ended-haunted"] as const) expect(speakerFor(k)).toBe("whisper");
    for (const k of ["accuse-right", "ended-solved"] as const) expect(speakerFor(k)).toBe("lodger");
  });
  it("is deterministic for a seed, reaches every variant, and is clean text: no digits, markup, stage directions or names", () => {
    const seen = new Set<string>();
    for (const kind of DIRECTIVE_KINDS) for (const sp of SPEAKERS[kind]) {
      const list = PARTY_LINES[kind]?.[sp] ?? [];
      for (let s = 0; s < 300; s++) seen.add(partyScripted(kind, sp, mulberry32(s)));
      for (const line of list) {
        expect(line).not.toMatch(/[0-9<>{}\[\]*_]/);
        expect(line.length).toBeLessThanOrEqual(120);
      }
      expect(partyScripted(kind, sp, mulberry32(7))).toBe(partyScripted(kind, sp, mulberry32(7)));
    }
    const total = DIRECTIVE_KINDS.flatMap((k) => SPEAKERS[k].map((sp) => PARTY_LINES[k]?.[sp]?.length ?? 0)).reduce((a, b) => a + b, 0);
    expect(seen.size).toBe(total);
  });
  it("gives the Lodger no tell: only the confession kinds say guilt, and the confession says it only there", () => {
    const tell = /\b(it was (me|I)|I am the one|you found me|I did it|guilty|innocent|confess)\b/i;
    for (const kind of DIRECTIVE_KINDS) for (const line of PARTY_LINES[kind]?.lodger ?? []) {
      if ((CONFESSION_KINDS as readonly string[]).includes(kind)) continue;
      expect(line).not.toMatch(tell);
    }
    expect((PARTY_LINES["accuse-right"]?.lodger ?? []).some((l) => tell.test(l))).toBe(true);
  });
  it("answers a Speaker the kind does not use with the kind's own", () => {
    expect(partyScripted("turn-start", "lodger", mulberry32(1))).toBe(partyScripted("turn-start", "keeper", mulberry32(1)));
  });
});
