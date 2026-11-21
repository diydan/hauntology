import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { soundPlan, type PhoneSeat } from "./cues";
import { isSoundId, phoneAction, SOUND_FILE_MAX_BYTES, SOUND_FILES, SOUND_IDS, SOUND_TOTAL_MAX_BYTES, soundAvailability, soundUrl } from "./sounds";

const nodeFs = "node:fs";
const fs = (await import(nodeFs)) as { readFileSync(p: string, enc: string): string };
const tool = fs.readFileSync(new URL("../../../tools/check-sounds.mjs", import.meta.url).pathname, "utf8");

describe("Property 52: Sound files are checked", () => {
  // Feature: party-mode, Property 52: Sound files are checked
  // Validates: Requirements 20.1, 20.3
  it("names the same seven files and limits as the build check (tools/check-sounds.mjs; its own tests check the files)", () => {
    const names = /export const NAMES = \[([^\]]*)\]/.exec(tool)?.[1]?.match(/'([a-z]+)'/g)?.map((s) => s.replace(/'/g, ""));
    expect(names).toEqual([...SOUND_IDS]);
    expect(tool).toContain(`perFile: ${SOUND_FILE_MAX_BYTES / 1024} * 1024`);
    expect(tool).toContain(`total: ${SOUND_TOTAL_MAX_BYTES / 1024} * 1024`);
    expect(tool).toMatch(/seconds: 3, becomingSeconds: 4/);
    expect(SOUND_FILES.find((f) => f.id === "becoming")?.maxSeconds).toBe(4);
    expect(SOUND_FILES.filter((f) => f.id !== "becoming").every((f) => f.maxSeconds === 3)).toBe(true);
    expect(SOUND_FILES.length * SOUND_FILE_MAX_BYTES).toBe(SOUND_TOTAL_MAX_BYTES);
  });
});

describe("Property 53: Absent sound files change nothing", () => {
  // Feature: party-mode, Property 53: Absent sound files change nothing
  // Validates: Requirements 20.2
  it("reports which files exist from names or ids, ignoring anything else", () => {
    const a = soundAvailability(["creak.m4a", "bell", "notes.txt", "../creak.m4a"]);
    expect(a.present).toEqual(["creak", "bell"]);
    expect(a.missing).toHaveLength(SOUND_IDS.length - 2);
    expect(a.has("bell") && !a.has("laugh")).toBe(true);
    expect(soundAvailability([]).present).toEqual([]);
    expect(isSoundId("creak") && !isSoundId("knock")).toBe(true);
    expect(soundUrl("wind")).toBe("/sounds/wind.m4a");
  });
  it("plays only with consent, audio and the file; otherwise flashes and vibrates (vibration only under reduced motion), and never does more than the plan allows", () => {
    fc.assert(fc.property(fc.record({ consent: fc.boolean(), hasAudio: fc.boolean(), soundsThisRound: fc.integer({ min: 0, max: 4 }) }), fc.subarray([...SOUND_IDS]), fc.constantFrom(...SOUND_IDS), fc.boolean(), fc.boolean(), fc.boolean(), (ph, files, id, reduced, vib, soundsOn) => {
      const p: PhoneSeat = { seat: 1, bot: false, ...ph };
      const plan = soundPlan(p, soundsOn);
      const a = phoneAction(plan, soundAvailability(files), id, reduced, vib);
      if (plan === "none") return a.action === "none" && !a.vibrate;
      if (a.action === "play") return plan === "play" && files.includes(id) && !a.vibrate;
      if (plan === "play" && files.includes(id)) return false;
      return (a.action === "flash") === !reduced && a.vibrate === vib;
    }), propParams());
  });
  it("shows the same decision whether or not files exist for a phone that cannot play (the state never reads the files)", () => {
    const none = soundAvailability([]), all = soundAvailability([...SOUND_IDS]);
    expect(phoneAction("flash", none, "creak", false, true)).toEqual(phoneAction("flash", all, "creak", false, true));
  });
});
