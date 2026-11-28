import { describe, expect, it } from "vitest";
import { parseShellMessage } from "@hauntology/shared/app/events";
import { remoteInputMessage, remoteMove, viewerMessages } from "./host-viewer";

describe("remoteInputMessage (party-mode 8.3)", () => {
  it("turns the active Detective's stick and look into a message the Viewer accepts", () => {
    const m = remoteInputMessage(remoteMove({ move: [0.5, -1], look: [10, -4] }));
    expect(parseShellMessage(m)).toEqual(m);
    expect(m).toMatchObject({ t: "remote_input", forward: 1, strafe: 0.5 });
    expect(m.yawDelta).toBeCloseTo(-0.075);
  });
  it("holds every number inside the contract, so a hostile phone cannot make the screen spin", () => {
    const m = remoteInputMessage({ forward: 50, strafe: -50, sprint: false, yawDelta: 1e9, pitchDelta: Number.NaN });
    expect(m).toEqual({ t: "remote_input", forward: 1, strafe: -1, yawDelta: 0.5, pitchDelta: 0 });
    expect(parseShellMessage(m)).toEqual(m);
  });
});

describe("viewerMessages frames (party-mode 8.4)", () => {
  const host = { game: { atmosphere: null, pub: { doors: [], zones: [{ id: "z1", name: "a" }, { id: "z2", name: "b" }, { id: "z3", name: "c" }] } } } as never;
  const places = { z1: { x: 4, z: 0 }, z2: { x: 0, z: 4 } };
  it("sends no frames until both the Zone places and the spawn are known", () => {
    expect(viewerMessages(host, { sky: null }, places, null).some((m) => m.t === "set_frames")).toBe(false);
    expect(viewerMessages(host, { sky: null }, {}, { x: 0, z: 0 }).some((m) => m.t === "set_frames")).toBe(false);
  });
  it("sends an empty frame for each Zone that has a place, in a message the Viewer accepts, once per change", () => {
    const last: { sky: string | null; frames?: string } = { sky: null };
    const m = viewerMessages(host, last, places, { x: 0, z: 0 }).find((x) => x.t === "set_frames");
    expect(m).toBeDefined();
    expect(parseShellMessage(m)).toEqual(m);
    expect((m as { frames: { zone: string; url: null }[] }).frames.map((f) => [f.zone, f.url])).toEqual([["z1", null], ["z2", null]]);
    expect(viewerMessages(host, last, places, { x: 0, z: 0 }).some((x) => x.t === "set_frames")).toBe(false);
  });
});

describe("viewerMessages frame photos (party-mode 8.4)", () => {
  const host = { game: { atmosphere: null, pub: { doors: [], zones: [{ id: "z1", name: "a" }, { id: "z2", name: "b" }] } } } as never;
  const places = { z1: { x: 4, z: 0 }, z2: { x: 0, z: 4 } };
  it("puts a fetched photo's address in its Zone's frame and resends when it arrives", () => {
    const last: { sky: string | null; frames?: string } = { sky: null };
    viewerMessages(host, last, places, { x: 0, z: 0 }, {});
    const m = viewerMessages(host, last, places, { x: 0, z: 0 }, { z2: "blob:https://h.test/00000000-0000-0000-0000-000000000001" }).find((x) => x.t === "set_frames");
    expect(parseShellMessage(m)).toEqual(m);
    expect((m as { frames: { zone: string; url: string | null }[] }).frames.map((f) => [f.zone, f.url])).toEqual([["z1", null], ["z2", "blob:https://h.test/00000000-0000-0000-0000-000000000001"]]);
  });
});
