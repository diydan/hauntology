import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CLOCK_RAN_OUT, EVENT_LEVELS, LINE_AT, SHOT_LINE, SHOT_NAMES, SHOT_SOUND, SHOT_TEXT, SOUND_AT, endingCard, frameTime, isEventLevel, reelLine,
  reelShot, reelSound, shadowMode, shadowPosition, shadowReading, shotLine, stepPosition,
} from "./scenes";
import { REEL_START, lineFor, riseWords, soundFor, stepReel, type ReelInput, type ReelState } from "./reel";

type Lab = {
  reelShot: (l: number, m: number) => unknown; reelLine: (l: number, m: number) => unknown; reelSound: (l: number, m: number) => unknown; isEventLevel: (l: number, m: number) => unknown;
  shadowPosition: (b: number, r: number) => number; stepPosition: (b: number, r: number) => number; endingCard: (o: string, j?: string[]) => unknown;
  SHOT_LINE: unknown; LINE_AT: unknown; SHOT_TEXT: unknown; SOUND_AT: unknown;
};
// the lab's file is plain JavaScript beside the playtest site; the path is a variable so the type checker does not follow it
const labPath = "../../../tools/playtest/js/scenes.js";
const loadLab = async (): Promise<Lab> => (await import(/* @vite-ignore */ labPath)) as Lab;
const MAXES = [8, 10, 12] as const;
const ORDER = ["ship", "coffin", "streets", "mirror", "hand", "bed", "house"] as const;

describe("the shots stay the same as the lab's (tools/playtest/js/scenes.js)", () => {
  it("gives the lab's shot, line, sound and card for every level and maximum", async () => {
    const lab = await loadLab();
    for (const max of MAXES) for (let l = -1; l <= max + 2; l++) {
      expect(reelShot(l, max)).toBe(lab.reelShot(l, max));
      expect(reelLine(l, max)).toEqual(lab.reelLine(l, max));
      expect(reelSound(l, max)).toBe(lab.reelSound(l, max));
      expect(isEventLevel(l, max)).toBe(lab.isEventLevel(l, max));
    }
    fc.assert(fc.property(fc.double({ min: 1, max: 600000, noNaN: true }), fc.double({ min: -1000, max: 700000, noNaN: true }), (b, r) => {
      expect(shadowPosition(b, r)).toBe(lab.shadowPosition(b, r));
      expect(stepPosition(b, r)).toBe(lab.stepPosition(b, r));
    }));
    for (const names of [[], ["Ada"], ["Ada", "Bo"], ["Ada", "Bo", "Cy"]]) {
      expect(endingCard("house", names)).toEqual(lab.endingCard("house", names));
      expect(endingCard("detectives", names)).toEqual(lab.endingCard("detectives", names));
    }
  });
  it("has the lab's lines, times and texts, and each line is its row of party-lines.md word for word", async () => {
    const lab = await loadLab();
    expect(SHOT_LINE).toEqual(lab.SHOT_LINE);
    expect(LINE_AT).toEqual(lab.LINE_AT);
    expect(SHOT_TEXT).toEqual(lab.SHOT_TEXT);
    expect(SOUND_AT).toEqual(lab.SOUND_AT);
    const fsName = "node:fs";
    const fs = (await import(/* @vite-ignore */ fsName)) as { readFileSync: (u: URL, enc: string) => string };
    const bank = fs.readFileSync(new URL("../../../docs/story/party-lines.md", import.meta.url), "utf8");
    for (const shot of SHOT_NAMES) {
      const row = `| \`${SHOT_LINE[shot].id}\` | ${SHOT_LINE[shot].text} |`;
      expect(bank, shot).toContain(row);
    }
  });
});

describe("Property 25: the Reel never goes backwards and every Event is seen (Requirements 20.1, 20.2)", () => {
  it("never goes back to an earlier shot as the level rises, for every maximum", () => {
    for (const max of MAXES) {
      let last = -1;
      for (let l = 0; l <= max; l++) {
        const at = ORDER.indexOf(reelShot(l, max) === "dawn" ? "house" : (reelShot(l, max) as (typeof ORDER)[number]));
        expect(at, `level ${l} of ${max}`).toBeGreaterThanOrEqual(last);
        last = at;
      }
    }
  });
  it("shows a different shot when the Haunt first reaches 3, 6 or 9 below the maximum", () => {
    for (const max of MAXES) for (const e of EVENT_LEVELS) if (e < max) expect(reelShot(e, max), `Event ${e} of ${max}`).not.toBe(reelShot(e - 1, max));
  });
  it("is the house at the maximum and never a shot before it, and is total", () => {
    for (const max of MAXES) { expect(reelShot(max, max)).toBe("house"); for (let l = 0; l < max; l++) expect(reelShot(l, max)).not.toBe("house"); }
    fc.assert(fc.property(fc.double(), fc.double(), (l, m) => { expect(SHOT_NAMES).toContain(reelShot(l, m)); }));
  });
});

const names = fc.array(fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim() !== ""), { maxLength: 5 });
describe("Property 26: an ending says who joined the haunting and never says Poltergeist (Requirements 21.1 to 21.3)", () => {
  it("names the joiners on the house card, says no one won, and never uses the word", () => {
    fc.assert(fc.property(names, (joined) => {
      const house = endingCard("house", joined);
      expect(house.shot).toBe("house");
      expect(house.lines).toContain("No one won.");
      for (const n of joined) expect(house.lines.join(" ")).toContain(n.trim());
      const all = [house.title, ...house.lines, endingCard("detectives", joined).title, ...endingCard("detectives", joined).lines].join(" ");
      expect(all.toLowerCase()).not.toContain("poltergeist");
    }));
  });
  it("says the haunting continues on the house card and shows the dawn for a Detective win", () => {
    expect(endingCard("house").title).toBe("The haunting continues.");
    expect(endingCard("detectives").shot).toBe("dawn");
    expect(endingCard("detectives", ["Ada"]).lines.join(" ")).not.toContain("Ada");
  });
});

describe("Property 32: a line is written for its picture and said over it only (Requirements 20.7 to 20.9)", () => {
  it("every shot has one line, the line ends inside the shot's own clip is checked by the lab; here it starts at its moment", () => {
    for (const shot of SHOT_NAMES) { expect(shotLine(shot)?.id).toMatch(/^scene\./); expect(LINE_AT[shot]).toBeGreaterThanOrEqual(0); }
    expect(shotLine("nope")).toBeNull();
    expect(shotLine("toString")).toBeNull();
  });
  it("says the line in words always and aloud only where narration is on and the Room is not speaking", () => {
    fc.assert(fc.property(fc.constantFrom(...SHOT_NAMES), fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean(), (shot, narrationOn, roomLineBusy, stillPicture, lull) => {
      const m = lineFor(shot, { narrationOn, roomLineBusy, stillPicture, lull }, LINE_AT[shot]);
      if (lull) { expect(m).toBeNull(); return; }
      expect(m?.line).toEqual(SHOT_LINE[shot]);
      expect(m?.speak).toBe(narrationOn && !roomLineBusy);
      expect(m?.atS).toBe(stillPicture ? 0 : LINE_AT[shot]);
    }));
  });
  it("plays a sound only with sound on, and only the two shots that have one", () => {
    for (const shot of SHOT_NAMES) {
      expect(soundFor(shot, { soundOn: false })).toBeNull();
      expect(soundFor(shot, { soundOn: true })?.sound).toBe(SHOT_SOUND[shot]);
    }
  });
});

describe("Property 24: the clock shadow follows the clock and nothing else (Requirements 19.1 to 19.4)", () => {
  const ms = fc.integer({ min: 1000, max: 300000 });
  it("is 1 - remaining / base, held at both ends", () => {
    fc.assert(fc.property(ms, fc.integer({ min: -5000, max: 400000 }), (base, rem) => {
      const p = shadowPosition(base, rem);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      if (rem >= 0 && rem <= base) expect(p).toBeCloseTo(1 - rem / base, 9);
    }));
  });
  it("steps back for Help and forward for Spook by the share of the Turn that the change is", () => {
    fc.assert(fc.property(ms, fc.integer({ min: 20000, max: 300000 }), (base, rem0) => {
      const rem = Math.min(rem0, base);
      fc.pre(rem > 10000 && rem + 10000 <= base);
      expect(shadowPosition(base, rem + 10000)).toBeLessThan(shadowPosition(base, rem));
      expect(shadowPosition(base, rem - 10000)).toBeGreaterThan(shadowPosition(base, rem));
      expect(shadowPosition(base, rem - 10000) - shadowPosition(base, rem)).toBeCloseTo(10000 / base, 9);
    }));
  });
  it("stands still while paused, whatever the clock says", () => {
    fc.assert(fc.property(ms, ms, fc.double({ min: 0, max: 1, noNaN: true }), fc.constantFrom("scrub", "step") as fc.Arbitrary<"scrub" | "step">, (base, rem, last, mode) => {
      expect(shadowReading({ baseMs: base, remainingMs: rem, paused: true, mode, lastPosition: last })).toBe(last);
    }));
  });
  it("is not shown where the Master chose no clock", () => {
    expect(shadowMode({ hasClock: false, footage: true, reducedMotion: false, saveData: false })).toBe("none");
    expect(shadowReading({ baseMs: null, remainingMs: null, paused: false, mode: "none", lastPosition: 0.5 })).toBe(0);
  });
  it("moves once a second and never ahead of the clock under reduced motion, data saver or footage off", () => {
    for (const o of [{ footage: true, reducedMotion: true, saveData: false }, { footage: true, reducedMotion: false, saveData: true }, { footage: false, reducedMotion: false, saveData: false }])
      expect(shadowMode({ hasClock: true, ...o })).toBe("step");
    expect(shadowMode({ hasClock: true, footage: true, reducedMotion: false, saveData: false })).toBe("scrub");
    fc.assert(fc.property(ms, fc.integer({ min: 0, max: 300000 }), (base, rem) => {
      const exact = shadowPosition(base, rem);
      const step = stepPosition(base, rem);
      expect(step).toBeLessThanOrEqual(exact + 1e-12); // never ahead: it rounds the time left up, so the shadow lags
      expect(step).toBeGreaterThanOrEqual(exact - 1000 / base - 1e-12);
    }));
  });
  it("keeps the clip time inside the clip and says in words that the clock ran out", () => {
    fc.assert(fc.property(fc.double({ min: -2, max: 3, noNaN: true }), fc.double({ min: 0.5, max: 30, noNaN: true }), (p, d) => {
      const t = frameTime(p, d);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(d);
    }));
    expect(CLOCK_RAN_OUT).toBe("The clock ran out.");
  });
});

const run = (inputs: readonly ReelInput[], from: ReelState = REEL_START): ReelState => inputs.reduce(stepReel, from);
const lv = (level: number, max = 10): ReelInput => ({ t: "level", level, max });

describe("the Reel reducer (Requirement 20)", () => {
  it("shows a first sight still, with no words and no play", () => {
    const s = run([lv(4)]);
    expect(s).toMatchObject({ level: 4, held: "streets", playing: null, said: [], plays: 0 });
  });
  it("plays the shot of a new level once, says what it shows, and says a Haunt Event fired", () => {
    const s = run([lv(2), lv(3)]);
    expect(s).toMatchObject({ playing: "coffin", plays: 1, last: "rise" });
    expect(s.said).toEqual([`The film moves on. ${SHOT_TEXT.coffin}`, "A Haunt Event fired."]);
    const t = run([lv(2), lv(1), lv(2)]);
    expect(t.said).toEqual([`The film moves on. ${SHOT_TEXT.ship}`]);
  });
  it("says a Haunt Event when a rise crosses an Event level, but not at the maximum", () => {
    expect(riseWords(1, 4, 10)).toContain("A Haunt Event fired.");
    expect(riseWords(9, 10, 10)).not.toContain("A Haunt Event fired.");
    expect(riseWords(3, 5, 10)).not.toContain("A Haunt Event fired.");
  });
  it("does not play during a window or an answer choice, and plays when it closes if the level is still the same", () => {
    const s = run([lv(2), { t: "blocked", blocked: true }, lv(3)]);
    expect(s).toMatchObject({ playing: null, pending: "coffin", plays: 0 });
    expect(s.said.length).toBeGreaterThan(0); // the words are said at once, whatever the picture
    const t = stepReel(s, { t: "blocked", blocked: false });
    expect(t).toMatchObject({ playing: "coffin", pending: null, plays: 1 });
  });
  it("drops a shot still waiting when the level moves on, and a window stops a shot that plays", () => {
    const s = run([lv(2), { t: "blocked", blocked: true }, lv(3), lv(5), { t: "blocked", blocked: false }]);
    expect(s.playing).toBe("streets");
    const u = run([lv(2), lv(3), { t: "blocked", blocked: true }]);
    expect(u.playing).toBeNull();
    expect(u.held).toBe("coffin");
  });
  it("holds the lower shot still and says nothing when the Haunt falls (a Lull)", () => {
    const rise = run([lv(6), lv(7)]);
    const s = stepReel(rise, lv(5));
    expect(s).toMatchObject({ playing: null, held: "streets", last: "fall" });
    expect(s.said).toEqual(rise.said);
    expect(s.plays).toBe(rise.plays);
  });
  it("can always be skipped, and ends when the shot is done", () => {
    const s = run([lv(2), lv(3), { t: "skip" }]);
    expect(s).toMatchObject({ playing: null, held: "coffin" });
    expect(run([lv(2), lv(3), { t: "done" }]).playing).toBeNull();
  });
  it("Property 25 over the Host: any run of levels plays each shot of a rise at most once and never plays on a fall", () => {
    fc.assert(fc.property(fc.constantFrom(...MAXES), fc.array(fc.integer({ min: 0, max: 12 }), { minLength: 1, maxLength: 30 }), (max, levels) => {
      let s = REEL_START;
      for (const l of levels) {
        const before = s;
        s = stepReel(s, lv(Math.min(l, max), max));
        if (before.level !== null && s.level !== null && s.level < before.level) { expect(s.playing).toBeNull(); expect(s.said).toEqual(before.said); }
        if (before.level !== null && s.level !== null && s.level > before.level) expect(s.plays).toBe(before.plays + 1);
        if (s.level !== null) expect(s.held).toBe(reelShot(s.level, max));
      }
    }));
  });
});
