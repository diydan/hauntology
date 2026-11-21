import { describe, expect, it } from "vitest";
import { ErrorCode } from "../errors";
import { parseCreatorMessage, parseHostMessage, parseShellMessage, parseViewerMessage, type HostToShell, type ShellToViewer, type ViewerToShell } from "./events";

const anchor = { id: "a1", pos: [1, 0, -2], radius: 2.5 };

describe("ViewerToShell", () => {
  it("accepts a pose, a prompt (with a target or none), a degraded notice and a frame rate", () => {
    const ok: ViewerToShell[] = [
      { t: "pose", pos: [0, 1.6, 0], yaw: -3.1 },
      { t: "prompt", target: "ghost" },
      { t: "prompt", target: "anchor" },
      { t: "prompt", target: null },
      { t: "clue_seen", sign: "moon" },
      { t: "degraded", rung: "pano" },
      { t: "degraded", rung: "thumb" },
      { t: "fps", fps: 59.6 },
      { t: "fps", fps: 0 },
    ];
    for (const m of ok) expect(parseViewerMessage(m)).toEqual(m);
  });

  it("rejects bad shapes, non-finite numbers, unknown kinds and extra fields", () => {
    const bad: unknown[] = [
      null, undefined, "pose", 7, [], {},
      { t: "pose", pos: [0, 0], yaw: 0 },
      { t: "pose", pos: [0, 0, 0, 0], yaw: 0 },
      { t: "pose", pos: [0, Number.NaN, 0], yaw: 0 },
      { t: "pose", pos: [0, 0, 0], yaw: Number.POSITIVE_INFINITY },
      { t: "pose", pos: [0, 0, 0] },
      { t: "pose", pos: [0, 0, 0], yaw: 0, seed: "hidden" },
      { t: "prompt", target: "wall" },
      { t: "prompt" },
      { t: "fps", fps: -1 },
      { t: "fps", fps: Number.NaN },
      { t: "fps" },
      { t: "degraded", rung: "splat" },
      { t: "set_input_mode", mode: "chat" },
      { t: "unknown" },
    ];
    for (const m of bad) expect(parseViewerMessage(m), JSON.stringify(m)).toBeNull();
  });
});

describe("ShellToViewer", () => {
  it("accepts an input mode and a view", () => {
    const ok: ShellToViewer[] = [
      { t: "set_input_mode", mode: "chat" },
      { t: "set_input_mode", mode: "play" },
      { t: "set_atmosphere", atmosphere: null },
      { t: "set_atmosphere", atmosphere: { timeOfDay: "night", weather: "fog", tempBand: "cold", windBand: "calm", moon: "full moon" } },
      { t: "apply_view", found: [], anchors: [], hauntLevel: 0, ghostVisible: false },
      { t: "apply_view", found: ["a1", "a3"], anchors: [anchor as never], hauntLevel: 1, ghostVisible: true },
      { t: "set_world_clues", clues: [{ zone: "z1", sign: "key", sight: { kind: "clock", h: 3, m: 15 } }] },
      { t: "set_doors", doors: [] },
      { t: "set_doors", doors: [{ id: "cellar-door", x: 1.5, z: -2, width: 1.2, yaw: 0.5, open: false }] },
    ];
    for (const m of ok) expect(parseShellMessage(m)).toEqual(m);
  });

  it("rejects out-of-range, over-long and leaking views", () => {
    const base = { t: "apply_view", found: ["a1"], anchors: [anchor], hauntLevel: 0.5, ghostVisible: true };
    const bad: unknown[] = [
      { t: "set_input_mode", mode: "walk" },
      { t: "set_atmosphere" },
      { t: "set_doors" },
      { t: "set_doors", doors: Array.from({ length: 4 }, (_, i) => ({ id: `d${i}`, x: 0, z: 0, width: 1, yaw: 0, open: true })) },
      { t: "set_doors", doors: [{ id: "cellar-door", x: 1, z: 1, width: 1.2, yaw: 0, open: false, lock: "knock" }] },
      { t: "set_doors", doors: [{ id: "cellar-door", x: 1, z: 1, width: 1.2, yaw: 0, open: false, pattern: [1, 2] }] },
      { t: "set_doors", doors: [{ id: "Bad Id", x: 1, z: 1, width: 1.2, yaw: 0, open: false }] },
      { t: "set_doors", doors: [{ id: "a", x: Number.NaN, z: 1, width: 1.2, yaw: 0, open: false }] },
      { t: "set_doors", doors: [{ id: "a", x: 1, z: 1, width: 0, yaw: 0, open: false }] },
      { t: "set_atmosphere", atmosphere: { timeOfDay: "night", weather: "fog", tempBand: "cold", windBand: "calm", moon: "full moon", place: { lat: 1, lon: 2 } } },
      { t: "set_atmosphere", atmosphere: { timeOfDay: "night", weather: "hail", tempBand: "cold", windBand: "calm", moon: "full moon" } },
      { ...base, hauntLevel: 1.01 },
      { ...base, hauntLevel: -0.01 },
      { ...base, hauntLevel: Number.NaN },
      { ...base, found: ["a1", "a2", "a3", "a1"] },
      { ...base, found: ["a4"] },
      { ...base, anchors: [{ ...anchor, radius: 0 }] },
      { ...base, anchors: [{ ...anchor, hook: "a hidden seed" }] },
      { ...base, anchors: [anchor, anchor, anchor, anchor] },
      { ...base, seeds: [] },
      { ...base, ghostVisible: "yes" },
      { t: "pose", pos: [0, 0, 0], yaw: 0 },
    ];
    for (const m of bad) expect(parseShellMessage(m), JSON.stringify(m)).toBeNull();
  });
});

describe("HostToShell", () => {
  it("accepts started, scripted, ended and a refusal with any API error code", () => {
    const ok: HostToShell[] = [{ t: "started" }, { t: "scripted" }, { t: "ended" }, ...Object.values(ErrorCode).map((code): HostToShell => ({ t: "refused", code }))];
    for (const m of ok) expect(parseHostMessage(m)).toEqual(m);
  });

  it("rejects anything else, so no card, note or seed can come through", () => {
    const bad: unknown[] = [
      null, undefined, "started", 3, [], {}, { t: "start" }, { t: "refused" }, { t: "refused", code: "made_up" }, { t: "refused", code: 5 },
      { t: "started", seed: "abc" }, { t: "ended", solution: ["a", "b", "c"] }, { t: "scripted", line: "hi" }, { t: "refused", code: "world_too_small", note: "x" },
    ];
    for (const m of bad) expect(parseHostMessage(m), JSON.stringify(m)).toBeNull();
  });
});

describe("CreatorToShell", () => {
  it("accepts only chosen, and nothing with extra fields", () => {
    expect(parseCreatorMessage({ t: "chosen" })).toEqual({ t: "chosen" });
    for (const bad of [null, "chosen", {}, { t: "pick" }, { t: "chosen", ghostId: "g1" }, { t: "chosen", portrait: "data:image/png;base64,AAAA" }, [], 3]) expect(parseCreatorMessage(bad), JSON.stringify(bad)).toBeNull();
  });
});
