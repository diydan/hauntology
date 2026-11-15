import { describe, expect, it } from "vitest";
import { playReduce, playStart } from "./play";
import type { PlayState } from "./types";

const W = "w-AbCdEfGhIjKlMnOpQrSt12";
const acked: PlayState = { mode: "play", found: 0, noticeAcked: true, ended: false };
const fresh: PlayState = { mode: "play", found: 0, noticeAcked: false, ended: false };

describe("playStart", () => {
  it("waits for the notice, or starts the Viewer at once when the Session already acknowledged it", () => {
    expect(playStart(false)).toEqual({ state: fresh, effects: [] });
    expect(playStart(true)).toEqual({ state: acked, effects: [{ e: "start_viewer" }] });
  });
});

describe("playReduce", () => {
  it("starts the Viewer once, after ack_notice", () => {
    const first = playReduce(fresh, { t: "ack_notice" }, W);
    expect(first).toEqual({ state: acked, effects: [{ e: "start_viewer" }] });
    const second = playReduce(first.state, { t: "ack_notice" }, W);
    expect(second.state).toBe(first.state);
    expect(second.effects).toEqual([]);
  });

  it("opens and closes the Chat with one set_input_mode each", () => {
    const open = playReduce(acked, { t: "open_chat" }, W);
    expect(open).toEqual({ state: { ...acked, mode: "chat" }, effects: [{ e: "set_input_mode", mode: "chat" }] });
    expect(playReduce(open.state, { t: "open_chat" }, W).effects).toEqual([]);
    const close = playReduce(open.state, { t: "close_chat" }, W);
    expect(close).toEqual({ state: acked, effects: [{ e: "set_input_mode", mode: "play" }] });
    expect(playReduce(close.state, { t: "close_chat" }, W).effects).toEqual([]);
  });

  it("does not open the Chat behind the content notice", () => {
    const r = playReduce(fresh, { t: "open_chat" }, W);
    expect(r.state).toBe(fresh);
    expect(r.effects).toEqual([]);
  });

  it("exit disposes the Viewer, then goes Home by default or to the Gallery when asked", () => {
    expect(playReduce(acked, { t: "exit" }, W).effects).toEqual([
      { e: "dispose_viewer" }, { e: "navigate", to: { screen: "home" } },
    ]);
    expect(playReduce(acked, { t: "exit", to: "gallery" }, W).effects).toEqual([
      { e: "dispose_viewer" }, { e: "navigate", to: { screen: "gallery" } },
    ]);
  });

  it("exit works from every state, even behind the notice or with the Chat open", () => {
    for (const s of [fresh, { ...acked, mode: "chat" as const }, { ...acked, ended: true }]) {
      expect(playReduce(s, { t: "exit" }, W).effects.map((e) => e.e)).toEqual(["dispose_viewer", "navigate"]);
    }
  });

  it("records found memories, never lowers the count and never passes three", () => {
    let s = acked;
    s = playReduce(s, { t: "view", found: 2, ended: false }, W).state;
    expect(s.found).toBe(2);
    s = playReduce(s, { t: "view", found: 1, ended: false }, W).state;
    expect(s.found).toBe(2);
    s = playReduce(s, { t: "view", found: 9, ended: false }, W).state;
    expect(s.found).toBe(3);
    expect(playReduce(acked, { t: "view", found: Number.NaN, ended: false }, W).state).toBe(acked);
  });

  it("ended disposes the Viewer and goes to the Ending once", () => {
    const end = playReduce(acked, { t: "view", found: 3, ended: true }, W);
    expect(end.state).toEqual({ ...acked, found: 3, ended: true });
    expect(end.effects).toEqual([{ e: "dispose_viewer" }, { e: "navigate", to: { screen: "end", worldId: W } }]);
    const again = playReduce(end.state, { t: "view", found: 3, ended: true }, W);
    expect(again.state).toBe(end.state);
    expect(again.effects).toEqual([]);
  });

  it("does not touch the disposed Viewer's input mode after the end", () => {
    const ended = playReduce({ ...acked, mode: "chat" }, { t: "view", found: 3, ended: true }, W).state;
    expect(playReduce(ended, { t: "close_chat" }, W).effects).toEqual([]);
    expect(playReduce(ended, { t: "open_chat" }, W).effects).toEqual([]);
  });

  it("keeps the Chat usable when the Viewer falls back, and only ever to a worse rung", () => {
    const pano = playReduce(acked, { t: "viewer_degraded", rung: "pano" }, W);
    expect(pano).toEqual({ state: { ...acked, degraded: "pano" }, effects: [] });
    const thumb = playReduce(pano.state, { t: "viewer_degraded", rung: "thumb" }, W);
    expect(thumb.state.degraded).toBe("thumb");
    expect(playReduce(thumb.state, { t: "viewer_degraded", rung: "pano" }, W).state).toBe(thumb.state);
    expect(playReduce(thumb.state, { t: "open_chat" }, W).effects).toEqual([{ e: "set_input_mode", mode: "chat" }]);
  });
});
