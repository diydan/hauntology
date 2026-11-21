import { describe, expect, it } from "vitest";
import { mulberry32 } from "../puzzles/rng";
import { RoomCore, type Ports } from "./server";

function fakes() {
  const disk: { text: string | undefined; alarm: number | null } = { text: undefined, alarm: null };
  const inbox = new Map<string, unknown[]>();
  const clock = { t: 1_000_000 };
  const r = mulberry32(9);
  const ports: Ports = {
    load: async () => disk.text, save: async (t) => { disk.text = t; }, deleteAll: async () => { disk.text = undefined; }, setAlarm: async (at) => { disk.alarm = at; },
    send: (sid, msg) => { if (!inbox.has(sid)) inbox.set(sid, []); inbox.get(sid)!.push(JSON.parse(JSON.stringify(msg))); }, close: () => {}, now: () => clock.t,
    randomBytes: (n) => Uint8Array.from({ length: n }, () => Math.floor(r() * 256)), requireWorld: () => true,
  };
  const of = (sid: string, t?: string) => (inbox.get(sid) ?? []).filter((m) => t === undefined || (m as { t: string }).t === t) as { t: string; [k: string]: unknown }[];
  return { ports, disk, clock, of };
}
const say = (core: RoomCore, sid: string, msg: unknown) => core.message(sid, JSON.stringify(msg));
const NAMES = ["ana", "ben", "cat", "dot"];

async function haunted() {
  const f = fakes();
  const core = new RoomCore(f.ports);
  const { hostToken, displayToken } = await core.create("ABCD");
  const toks: string[] = [];
  for (const n of NAMES) { const j = await core.join(n); if (!j.ok) throw new Error("join"); toks.push(j.token); }
  await say(core, "host", { t: "hello", token: hostToken });
  await say(core, "disp", { t: "hello", token: displayToken });
  for (let i = 0; i < 4; i++) await say(core, NAMES[i]!, { t: "hello", token: toks[i] });
  await say(core, "ana", { t: "world", id: "kitchen", walkRadius: 9 });
  await say(core, "ana", { t: "start" });
  for (const n of NAMES) await say(core, n, { t: "light", consent: true });
  for (const n of NAMES) await say(core, n, { t: "clockSample", sentMs: 1_000_000, serverMs: 1_000_050, receivedMs: 1_000_100 });
  // seat 2 (ben) seals a wrong Accusation and the Round passes
  for (let i = 0; i < 20; i++) {
    const view = f.of("host", "public").at(-1)!.view as { active: number; phase: string; players?: unknown; seats: { seat: number; poltergeist: boolean }[]; suspects: { id: string }[]; zones: { id: string }[]; relics: { id: string }[] };
    if (view.seats.find((s) => s.seat === 2)!.poltergeist) break;
    f.clock.t += 100;
    const priv = f.of(NAMES[view.active - 1]!, "private").at(-1)!;
    void priv;
    if (view.active === 2) {
      const sol = (JSON.parse(f.disk.text as string) as { engine: { deal: { solution: { suspect: string } } } }).engine.deal.solution;
      await say(core, "ben", { t: "seal", suspect: view.suspects.find((x) => x.id !== sol.suspect)!.id, zone: view.zones[0]!.id, relic: view.relics[0]!.id });
    } else await say(core, NAMES[view.active - 1]!, { t: "pass" });
    const pend = (f.of("host", "public").at(-1)!.view as { haunt: { choosing: { chooser: number | null; options: string[] } | null } }).haunt.choosing;
    if (pend?.chooser != null) { f.clock.t += 100; await say(core, NAMES[pend.chooser - 1]!, { t: "choose", option: pend.options[0] }); }
  }
  return { f, core };
}

describe("RoomCore: Rattle and the Becoming reach the right screens (party-mode 4.21)", () => {
  it("sends the Becoming to the Host and the joining phone only, with a creeping dark on every phone that agreed to light", async () => {
    const { f } = await haunted();
    expect(f.of("host", "becoming")).toHaveLength(1);
    expect(f.of("host", "becoming")[0]).toMatchObject({ seat: 2 });
    expect(f.of("ben", "becoming")).toHaveLength(1);
    for (const n of ["ana", "cat", "dot", "disp"]) expect(f.of(n, "becoming")).toHaveLength(0);
    for (const n of ["ana", "ben", "cat", "dot"]) expect(f.of(n, "lightCue").filter((m) => m.cue === "creeping-dark")).toHaveLength(1);
    expect(f.of("disp", "lightCue")).toHaveLength(0);
  });
  it("a Rattle sounds on the Host, plays a breathing glow on every phone that agreed, and tells every screen one line; the Master's switch turns it off", async () => {
    const { f, core } = await haunted();
    f.clock.t += 10_000;
    await say(core, "ben", { t: "rattleOn", on: true });
    await say(core, "ben", { t: "rattle", via: "shake" });
    expect(f.of("host", "rattleSound")).toHaveLength(1);
    expect(f.of("host", "rattleSound")[0]).toMatchObject({ level: 1, sound: "creak", line: "the floorboards creaked" });
    for (const n of ["disp", "ana", "cat"]) expect(f.of(n, "rattleSound")).toHaveLength(0); // no phone consented to sound
    for (const n of ["ana", "ben", "cat", "dot"]) expect(f.of(n, "lightCue").filter((m) => m.cue === "glow")).toHaveLength(1);
    const ev = (f.of("disp", "public").at(-1)!.view as { events: { kind: string }[] }).events.filter((e) => e.kind === "rattle");
    expect(ev).toHaveLength(1);
    expect(JSON.stringify(f.of("disp"))).not.toContain('"from"');
    await say(core, "ana", { t: "roomSettings", rattle: false });
    f.clock.t += 5_000;
    await say(core, "ben", { t: "rattle", via: "button" });
    expect(f.of("ben", "refused").at(-1)).toEqual({ t: "refused", code: "rattle_denied:rattle_off" });
    expect(f.of("host", "rattleSound")).toHaveLength(1);
  });
});
