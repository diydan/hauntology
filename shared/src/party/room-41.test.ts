import { describe, expect, it } from "vitest";
import { mulberry32 } from "../puzzles/rng";
import { HELLO_MS, RoomCore, SEED_BYTES, type Ports } from "./server";

function fakes() {
  const disk: { text: string | undefined; alarm: number | null } = { text: undefined, alarm: null };
  const closed: { sid: string; code: number; reason: string }[] = [];
  const drawn: number[] = [];
  const clock = { t: 1_000_000 };
  const r = mulberry32(9);
  const ports: Ports = {
    load: async () => disk.text, save: async (t) => { disk.text = t; }, deleteAll: async () => { disk.text = undefined; },
    setAlarm: async (at) => { disk.alarm = at; },
    send: () => {}, close: (sid, code, reason) => { closed.push({ sid, code, reason }); }, now: () => clock.t,
    randomBytes: (n) => { drawn.push(n); return Uint8Array.from({ length: n }, () => Math.floor(r() * 256)); },
  };
  return { ports, disk, closed, drawn, clock };
}
const say = (core: RoomCore, sid: string, msg: unknown) => core.message(sid, JSON.stringify(msg));

describe("a Room's socket and seed (party-mode 4.1)", () => {
  it("draws 128 bits for the seed from the platform's random source", async () => {
    const f = fakes();
    await new RoomCore(f.ports).create("ABCD");
    expect(SEED_BYTES * 8).toBe(128);
    expect(f.drawn).toContain(SEED_BYTES);
    expect(f.drawn).not.toContain(4);
  });
  it("closes a socket that has not said hello within 5 s, and sets the alarm for it", async () => {
    const f = fakes();
    const core = new RoomCore(f.ports);
    await core.create("ABCD");
    await core.socketOpened("quiet");
    expect(f.disk.alarm).toBe(f.clock.t + HELLO_MS);
    f.clock.t += HELLO_MS - 1;
    await core.alarm();
    expect(f.closed).toEqual([]);
    f.clock.t += 1;
    await core.alarm();
    expect(f.closed).toEqual([{ sid: "quiet", code: 4408, reason: "hello_timeout" }]);
    f.clock.t += 10 * HELLO_MS;
    await core.alarm();
    expect(f.closed).toHaveLength(1); // closed once
  });
  it("keeps a socket that says hello in time, and forgets one that closes by itself", async () => {
    const f = fakes();
    const core = new RoomCore(f.ports);
    const { hostToken } = await core.create("ABCD");
    await core.socketOpened("tv");
    await core.socketOpened("gone");
    await say(core, "tv", { t: "hello", token: hostToken });
    await core.socketClosed("gone");
    f.clock.t += 2 * HELLO_MS;
    await core.alarm();
    expect(f.closed).toEqual([]);
  });
  it("still closes the quiet socket after the Room hibernated (a new RoomCore on the same storage)", async () => {
    const f = fakes();
    const first = new RoomCore(f.ports);
    await first.create("ABCD");
    await first.socketOpened("quiet");
    const woke = new RoomCore(f.ports);
    f.clock.t += HELLO_MS;
    await woke.alarm();
    expect(f.closed).toEqual([{ sid: "quiet", code: 4408, reason: "hello_timeout" }]);
  });
  it("closes a socket opened on a Room that does not exist", async () => {
    const f = fakes();
    await new RoomCore(f.ports).socketOpened("stray");
    expect(f.closed).toEqual([{ sid: "stray", code: 4404, reason: "room_unknown" }]);
  });
});
