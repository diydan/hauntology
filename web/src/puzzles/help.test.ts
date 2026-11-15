import { describe, expect, it } from "vitest";
import { KIND_INFO } from "@hauntology/shared/puzzles/kinds";
import { KINDS, type Kind } from "@hauntology/shared/puzzles/types";
import { COMMON_HELP, KIND_HELP } from "./help";

const screens = import.meta.glob("./kinds/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const source = (kind: Kind): string => {
  const name = { lockpick: "LockPick", wires: "Wires", clock: "Clock", safe: "Safe", musicbox: "MusicBox", candles: "Candles", moved: "Moved", photo: "Photo", words: "Words", board: "Board", maze: "Maze" }[kind];
  return screens[`./kinds/${name}.tsx`] ?? "";
};
const textOf = (kind: Kind): string => [KIND_HELP[kind].title, ...KIND_HELP[kind].steps, ...KIND_HELP[kind].extras].join("\n");
const sentences = (text: string): string[] => text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);

describe("the help of every puzzle", () => {
  it("has a card for each Kind with a title, at least two steps, and nothing empty", () => {
    expect(Object.keys(KIND_HELP).sort()).toEqual([...KINDS].sort());
    for (const k of KINDS) {
      const h = KIND_HELP[k];
      expect(h.title.length, k).toBeGreaterThan(2);
      expect(h.steps.length, k).toBeGreaterThanOrEqual(2);
      for (const line of [...h.steps, ...h.extras, ...COMMON_HELP]) expect(line.trim().length, `${k}: ${line}`).toBeGreaterThan(5);
    }
  });

  it("is written in short sentences: none longer than 14 words", () => {
    for (const k of KINDS) for (const line of [...KIND_HELP[k].steps, ...KIND_HELP[k].extras]) for (const s of sentences(line)) expect(s.split(/\s+/).length, `${k}: ${s}`).toBeLessThanOrEqual(14);
    for (const line of COMMON_HELP) for (const s of sentences(line)) expect(s.split(/\s+/).length, s).toBeLessThanOrEqual(16);
  });

  it("uses words for numbers, so it never hides an answer or a size in a digit", () => {
    for (const k of KINDS) expect(/\d/.test(textOf(k)), k).toBe(false);
    expect(/\d/.test(COMMON_HELP.join(" "))).toBe(false);
  });

  it("says how a Kind works, never how to solve it: no word that gives a hint", () => {
    const hints = /\b(hint|tip|trick|answer|try to|best way|solution|cheat)\b/i;
    for (const k of KINDS) expect(hints.test(textOf(k)), k).toBe(false);
  });

  it("names every phone extra a Kind has: tilt or twist, the microphone, and a buzz or sound", () => {
    for (const k of KINDS) {
      const extras = KIND_HELP[k].extras.join(" ");
      if (KIND_INFO[k].usesTilt || k === "clock" || k === "safe") expect(/Tilt|Twist/.test(extras), `${k} tilt or twist`).toBe(true);
    }
    expect(KIND_HELP.candles.extras.join(" ")).toMatch(/microphone.*only measures loudness.*Nothing is recorded/);
    for (const k of KINDS.filter((x) => x !== "candles")) expect(/microphone/i.test(textOf(k)), `${k} has no microphone`).toBe(false);
    for (const k of ["wires", "clock", "safe", "musicbox", "moved", "photo", "maze", "lockpick", "words", "board"] as const) expect(/Buzz|Sound/.test(KIND_HELP[k].extras.join(" ")), `${k} buzz or sound`).toBe(true);
  });

  it("says that every puzzle can be done by touch, that sound and buzz are shown on screen, and how many tries there are", () => {
    const common = COMMON_HELP.join(" ");
    expect(common).toMatch(/three tries/);
    expect(common).toMatch(/touch alone/);
    expect(common).toMatch(/also shown on screen/);
  });

  it("only mentions buttons that the screen really has, and names each of them", () => {
    const labels: Readonly<Record<Kind, readonly string[]>> = {
      lockpick: ["Tension"], wires: ["Check the wires"], clock: ["Set this time", "Flip it"], safe: ["Set", "Undo", "Flip it"],
      musicbox: ["Wind", "Clear"], candles: ["Watch", "Relight", "Blow to snuff"], moved: ["These changed"], photo: ["Check", "Turn"],
      words: ["Pick"], board: ["Pick"], maze: [],
    };
    for (const k of KINDS) {
      expect(source(k).length, `${k} source`).toBeGreaterThan(200);
      for (const label of labels[k]) {
        expect(source(k), `${k} screen has "${label}"`).toContain(label);
        expect(textOf(k), `${k} help names "${label}"`).toContain(label);
      }
    }
  });
});
