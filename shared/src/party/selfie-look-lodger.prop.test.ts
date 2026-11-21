import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { mulberry32 } from "../puzzles/rng";
import { LODGER_VOICES } from "../creator/profile";
import { lodgerVoiceFor } from "../voice/voices";
import { confessionLine, lodgerLine, lodgerVoiceOf } from "./lodger";
import { CONFESSION_KINDS, DIRECTIVE_KINDS, PARTY_LINES, SPEAKERS, speakerFor } from "./narrate";
import { selfieAllowed, selfieQuality, SELFIE_MIN_BRIGHTNESS, withTransientSelfie, type SelfieReport, type TransientHolder } from "./selfie";
import { seatFadeMs, seatLook, seatPortrait } from "./seatLook";
import type { PublicPlayer, PublicView } from "./views";

const viewOf = (players: PublicPlayer[], ending: PublicView["ending"] = null): PublicView => ({ phase: ending ? "ended" : "playing", suspects: [], zones: [], relics: [], players, events: [], ending });
const player = (seat: number, poltergeist: boolean): PublicPlayer => ({ seat: seat as PublicPlayer["seat"], nickname: `P${seat}`, bot: false, poltergeist, handSize: 2 });

describe("Property 60: Speakers are fixed by kind and the Lodger gives no tell", () => {
  // Feature: party-mode, Property 60: Speakers are fixed by kind and the Lodger gives no tell
  // Validates: Requirements 3.14, 7.8, 7.9
  it("gives every kind one fixed Speaker, in the first split", () => {
    const keeper = new Set(["turn-start", "time-warning", "achievement", "suggest", "shown", "none-shown", "inspect", "seal", "cue", "nudge", "phone-cue", "reveal", "accuse-wrong"]);
    for (const k of DIRECTIVE_KINDS) expect(speakerFor(k), k).toBe(keeper.has(k) ? "keeper" : k === "accuse-right" || k === "ended-solved" ? "lodger" : "whisper");
    for (const k of DIRECTIVE_KINDS) expect(SPEAKERS[k][0]).toBe(speakerFor(k));
  });
  it("chooses a Lodger line from the kind and the seed alone: the same for any Suspect, and with no way to pass a Solution, Hand or guilt flag", () => {
    expect(lodgerLine.length).toBe(2);
    fc.assert(fc.property(fc.constantFrom(...DIRECTIVE_KINDS), fc.integer(), (kind, seed) => {
      const a = lodgerLine(kind, mulberry32(seed)), b = lodgerLine(kind, mulberry32(seed));
      if (a !== b) return false;
      if ((CONFESSION_KINDS as readonly string[]).includes(kind)) return a === null; // a confession never comes from here
      return a === null ? PARTY_LINES[kind]?.lodger === undefined : (PARTY_LINES[kind]?.lodger ?? []).includes(a);
    }), propParams());
  });
  it("makes the confession only after the Solution is public, and only for the Suspect in it", () => {
    const sol = { suspect: "s3", zone: "z1", relic: "r2" };
    const ended = viewOf([player(1, false)], { solution: sol, residueAt: {}, sources: [] });
    fc.assert(fc.property(fc.constantFrom("s1", "s2", "s3", "s4", "s5", "s6"), fc.constantFrom<"accuse-right" | "ended-solved">("accuse-right", "ended-solved"), fc.integer(), (suspect, kind, seed) => {
      const before = confessionLine(viewOf([player(1, false)]), suspect, kind, mulberry32(seed));
      const after = confessionLine(ended, suspect, kind, mulberry32(seed));
      return before === null && (suspect === "s3" ? (after !== null && (PARTY_LINES[kind]?.lodger ?? []).includes(after)) : after === null);
    }), propParams());
  });
  it("speaks in the Lodger Voice of the profile, the same before and after the reveal, and a picked voice changes no line", () => {
    for (const v of LODGER_VOICES) expect(lodgerVoiceOf({ lodgerVoice: v })).toBe(v);
    expect(lodgerVoiceOf({})).toBe("mark");
    expect(lodgerVoiceOf).toBe(lodgerVoiceFor);
    for (const kind of DIRECTIVE_KINDS) expect(lodgerLine(kind, mulberry32(5))).toBe(lodgerLine(kind, mulberry32(5)));
  });
});

const reportArb: fc.Arbitrary<SelfieReport> = fc.record({ faces: fc.integer({ min: -1, max: 4 }), faceAreaShare: fc.double({ min: 0, max: 1, noNaN: true }), blur: fc.double({ min: 0, max: 1, noNaN: true }), brightness: fc.double({ min: 0, max: 1, noNaN: true }) });

describe("Property 61: Selfies are opt-in, transient and never change a rule", () => {
  // Feature: party-mode, Property 61: Selfies are opt-in, transient and never change a rule
  // Validates: Requirements 3.10, 3.11, 3.12, 3.13
  it("is allowed only with the switch on, the seat's own yes and no selfie made yet", () => {
    fc.assert(fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (selfies, selfieYes, selfieMade) => selfieAllowed({ selfies }, { selfieYes, selfieMade }) === (selfies && selfieYes && !selfieMade)), propParams());
  });
  it("names the first problem in a fixed order and passes only a good frame; a number that is not a number fails closed", () => {
    expect(selfieQuality({ faces: 0, faceAreaShare: 0.5, blur: 0, brightness: 1 })).toEqual({ ok: false, reason: "no_face" });
    expect(selfieQuality({ faces: 2, faceAreaShare: 0.5, blur: 0, brightness: 1 })).toEqual({ ok: false, reason: "many_faces" });
    expect(selfieQuality({ faces: 1, faceAreaShare: 0.05, blur: 0, brightness: 1 })).toEqual({ ok: false, reason: "too_small" });
    expect(selfieQuality({ faces: 1, faceAreaShare: 0.5, blur: 0.9, brightness: 1 })).toEqual({ ok: false, reason: "blurry" });
    expect(selfieQuality({ faces: 1, faceAreaShare: 0.5, blur: 0, brightness: 0.1 })).toEqual({ ok: false, reason: "dark" });
    expect(selfieQuality({ faces: 1, faceAreaShare: 0.5, blur: 0.2, brightness: SELFIE_MIN_BRIGHTNESS })).toEqual({ ok: true });
    expect(selfieQuality({ faces: Number.NaN, faceAreaShare: 0.5, blur: 0, brightness: 1 })).toEqual({ ok: false, reason: "no_face" });
    expect(selfieQuality({ faces: 1, faceAreaShare: Number.NaN, blur: 0, brightness: 1 })).toEqual({ ok: false, reason: "too_small" });
    expect(selfieQuality({ faces: 1, faceAreaShare: 0.5, blur: Number.NaN, brightness: 1 })).toEqual({ ok: false, reason: "blurry" });
    expect(selfieQuality({ faces: 1, faceAreaShare: 0.5, blur: 0, brightness: Number.NaN })).toEqual({ ok: false, reason: "dark" });
    expect(selfieQuality({ faces: 1, faceAreaShare: 0.5, blur: 0.6, brightness: 1 })).toEqual({ ok: true });
    expect(selfieQuality({ faces: 1, faceAreaShare: 0.5, blur: 0.61, brightness: 1 })).toEqual({ ok: false, reason: "blurry" });
    expect(selfieQuality({ faces: 1, faceAreaShare: 0.1, blur: 0, brightness: 1 })).toEqual({ ok: true });
    fc.assert(fc.property(reportArb, (r) => {
      const q = selfieQuality(r);
      return q.ok === (r.faces === 1 && r.faceAreaShare >= 0.1 && r.blur <= 0.6 && r.brightness >= 0.2);
    }), propParams());
  });
  it("zeroes the buffer and drops the reference exactly once on success, on a throw and on a timeout", async () => {
    const run = async (use: (b: Uint8Array) => Promise<unknown>, timeoutMs?: number) => {
      const bytes = new Uint8Array([9, 8, 7, 6]); const holder: TransientHolder = { ref: null, clearCount: 0 };
      let seen: Uint8Array | null = null;
      const out = await withTransientSelfie(bytes, (b) => { seen = b; return use(b); }, holder, timeoutMs).then((v) => ({ v }), (e: Error) => ({ e: e.message }));
      return { out, bytes, holder, seen };
    };
    const ok = await run(async (b) => b.length);
    expect(ok.out).toEqual({ v: 4 });
    expect([[...ok.bytes], ok.holder.ref, ok.holder.clearCount]).toEqual([[0, 0, 0, 0], null, 1]);
    const boom = await run(async () => { throw new Error("boom"); });
    expect(boom.out).toEqual({ e: "boom" });
    expect([[...boom.bytes], boom.holder.ref, boom.holder.clearCount]).toEqual([[0, 0, 0, 0], null, 1]);
    const slow = await run(() => new Promise(() => undefined), 20);
    expect(slow.out).toEqual({ e: "selfie_timeout" });
    expect([[...slow.bytes], slow.holder.ref, slow.holder.clearCount]).toEqual([[0, 0, 0, 0], null, 1]);
  });
  it("takes no rule input and returns no game state: its only outputs are a yes or no, a reason and a buffer scrubber", () => {
    expect(selfieAllowed.length).toBe(2);
    expect(selfieQuality.length).toBe(1);
  });
});

describe("Property 62: Seat looks follow only the public Poltergeist flag", () => {
  // Feature: party-mode, Property 62: Seat looks follow only the public Poltergeist flag
  // Validates: Requirements 19.8, 19.9
  it("is mono exactly when the seat's public flag is set, and never goes back to colour as the flags only grow", () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 1, max: 6 }), { maxLength: 8 }), (joins) => {
      const flagged = new Set<number>();
      let prevMono = new Set<number>();
      for (const seat of [0, ...joins]) {
        if (seat > 0) flagged.add(seat);
        const view = viewOf([1, 2, 3, 4, 5, 6].map((s) => player(s, flagged.has(s))));
        const mono = new Set([1, 2, 3, 4, 5, 6].filter((s) => seatLook(view, s) === "mono"));
        if ([...mono].some((s) => !flagged.has(s)) || [...flagged].some((s) => !mono.has(s))) return false;
        if ([...prevMono].some((s) => !mono.has(s))) return false;
        prevMono = mono;
      }
      return true;
    }), propParams());
    expect(seatLook(viewOf([]), 3)).toBe("colour");
  });
  it("draws the portrait or a chip in colour, and in mono the Preset's own picture or the same one under a greyscale filter", () => {
    const preset = { portraitUrl: "/p.png", monoUrl: "/p-mono.png", preset: true };
    const designed = { portraitUrl: "/d.png" };
    expect(seatPortrait({ seat: 2, nickname: "Sam", profile: preset }, "colour")).toEqual({ kind: "image", url: "/p.png", filter: "none" });
    expect(seatPortrait({ seat: 2, nickname: "Sam", profile: preset }, "mono")).toEqual({ kind: "image", url: "/p-mono.png", filter: "none" });
    expect(seatPortrait({ seat: 2, nickname: "Sam", profile: designed }, "mono")).toEqual({ kind: "image", url: "/d.png", filter: "grayscale(1)" });
    expect(seatPortrait({ seat: 2, nickname: "Sam", profile: { portraitUrl: "/p.png", preset: true } }, "mono")).toEqual({ kind: "image", url: "/p.png", filter: "grayscale(1)" });
    expect(seatPortrait({ seat: 2, nickname: "Sam", profile: { portraitUrl: "/d.png", monoUrl: "/x-mono.png", preset: false } }, "mono")).toEqual({ kind: "image", url: "/d.png", filter: "grayscale(1)" });
    expect(seatPortrait({ seat: 2, nickname: "Sam" }, "colour")).toEqual({ kind: "chip", label: "Sam", seat: 2, filter: "none" });
    expect(seatPortrait({ seat: 2, nickname: "Sam", profile: null }, "mono")).toEqual({ kind: "chip", label: "Sam", seat: 2, filter: "grayscale(1)" });
  });
  it("cross-fades for at most 0.6 s and cuts under reduced motion", () => {
    expect([seatFadeMs(false), seatFadeMs(true)]).toEqual([600, 0]);
  });
});
