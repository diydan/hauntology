import { describe, expect, it } from "vitest";
import { mulberry32 } from "../puzzles/rng";
import { parseClientMessage } from "./protocol";
import { RoomCore, type Ports } from "./server";

describe("the cue, nudge, frame and sound messages are validated like every other (party-mode 7)", () => {
  const bad: unknown[] = [
    { t: "cue" }, { t: "cue", cue: 5 }, { t: "cue", cue: "x".repeat(17) }, { t: "cue", cue: "creak", place: "roof" }, { t: "cue", cue: "creak", extra: 1 },
    { t: "nudge" }, { t: "nudge", kind: "shove" }, { t: "nudge", kind: "help", target: 2 },
    { t: "frame" }, { t: "frame", target: 0, cue: "creak" }, { t: "frame", target: 7, cue: "creak" }, { t: "frame", target: 1.5, cue: "creak" }, { t: "frame", target: "2", cue: "creak" }, { t: "frame", target: 2 },
    { t: "sound" }, { t: "sound", consent: "yes" }, { t: "sound", consent: true, audio: 1 }, { t: "sound", consent: true, sneaky: true },
  ];
  it("refuses a message of the wrong shape, a stray field, or a value out of range", () => {
    for (const m of bad) expect(parseClientMessage(JSON.stringify(m)), JSON.stringify(m)).toEqual({ kind: "bad" });
  });
  it("accepts the messages as the protocol states them", () => {
    for (const m of [{ t: "cue", cue: "creak" }, { t: "cue", cue: "bell", place: "tv" }, { t: "nudge", kind: "help" }, { t: "nudge", kind: "spook" }, { t: "frame", target: 3, cue: "laugh" }, { t: "sound", consent: false }, { t: "sound", consent: true, audio: true }]) {
      expect(parseClientMessage(JSON.stringify(m)).kind, JSON.stringify(m)).toBe("game");
    }
  });
  it("refuses an oversize message and one that is not JSON", () => {
    expect(parseClientMessage(JSON.stringify({ t: "cue", cue: "creak", pad: "x".repeat(9000) }))).toEqual({ kind: "bad" });
    expect(parseClientMessage("{nope")).toEqual({ kind: "bad" });
  });
  it("closes the socket of a device that sends one, and keeps the Room", async () => {
    const closed: { sid: string; code: number }[] = [];
    const disk: { text: string | undefined } = { text: undefined };
    const r = mulberry32(2);
    const ports: Ports = { load: async () => disk.text, save: async (t) => { disk.text = t; }, deleteAll: async () => {}, setAlarm: async () => {}, send: () => {}, close: (sid, code) => { closed.push({ sid, code }); }, now: () => 1, randomBytes: (n) => Uint8Array.from({ length: n }, () => Math.floor(r() * 256)) };
    const core = new RoomCore(ports);
    await core.create("ABCD");
    const a = await core.join("Ana");
    if (!a.ok) throw new Error("join");
    await core.message("ana", JSON.stringify({ t: "hello", token: a.token }));
    await core.message("ana", JSON.stringify({ t: "frame", target: 99, cue: "creak" }));
    expect(closed).toEqual([{ sid: "ana", code: 4400 }]);
    expect(disk.text).toBeDefined();
  });
});
