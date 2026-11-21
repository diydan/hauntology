import { describe, expect, it } from "vitest";
import { mulberry32 } from "../puzzles/rng";
import { RoomCore, type Ports } from "./server";

/**
 * Conditions task 5.7, the Party Mode half of Property 7 (and party-mode Property 38 at the Room level):
 * the same game, played with any sky, no sky, a failing service or conditions off, gives the same messages and the
 * same stored game. Only the cosmetic sky (the Host's `setAtmosphere`, the Public View's `atmosphere`, the stored
 * `sky` and the lobby's `conditions` and `place` switches) may differ.
 */
type Svc = NonNullable<Ports["conditions"]>;
const WORLD = { t: "world", id: "kitchen", walkRadius: 9 };

function rig(conditions: Svc | undefined) {
  const disk: { text: string | undefined } = { text: undefined };
  const sent: { sid: string; msg: { t: string; [k: string]: unknown } }[] = [];
  const r = mulberry32(11);
  const clock = { t: 5_000_000 };
  const ports: Ports = {
    load: async () => disk.text, save: async (t) => { disk.text = t; }, deleteAll: async () => { disk.text = undefined; }, setAlarm: async () => undefined,
    send: (sid, msg) => { sent.push({ sid, msg: JSON.parse(JSON.stringify(msg)) }); }, close: () => {}, now: () => clock.t,
    randomBytes: (n) => Uint8Array.from({ length: n }, () => Math.floor(r() * 256)), requireWorld: () => true,
    ...(conditions === undefined ? {} : { conditions }),
  };
  return { ports, disk, sent, clock };
}
const say = (core: RoomCore, sid: string, msg: unknown) => core.message(sid, JSON.stringify(msg));

/** One scripted game; every step is sent whether or not the Engine accepts it, so refusals are compared too. */
async function play(conditions: Svc | undefined, choice: "off" | "place" | "table"): Promise<{ trace: string; stored: string; calls: number }> {
  let calls = 0;
  const svc: Svc | undefined = conditions === undefined ? undefined : async (...a) => { calls++; return conditions(...a); };
  const f = rig(svc);
  const core = new RoomCore(f.ports);
  const { hostToken, displayToken } = await core.create("ABCD");
  const a = await core.join("Ana");
  const b = await core.join("Ben");
  if (!a.ok || !b.ok) throw new Error("join");
  await say(core, "host", { t: "hello", token: hostToken });
  await say(core, "disp", { t: "hello", token: displayToken });
  await say(core, "ana", { t: "hello", token: a.token });
  await say(core, "ben", { t: "hello", token: b.token });
  await say(core, "ana", WORLD);
  await say(core, "ana", { t: "roomSettings", conditions: choice, ...(choice === "place" ? { place: { lat: 48.86, lon: 2.35, label: "Paris" } } : {}) });
  await say(core, "ana", { t: "start" });
  for (const [who, m] of [
    ["ana", { t: "walk", zone: "z1" }], ["ben", { t: "inspect" }], ["ana", { t: "inspect" }], ["ana", { t: "pause" }], ["ben", { t: "resume" }],
    ["ana", { t: "resume" }], ["ana", { t: "nudge", kind: "help" }], ["ana", { t: "endTurn" }], ["ben", { t: "walk", zone: "z2" }], ["ben", { t: "inspect" }],
    ["ben", { t: "endTurn" }], ["ana", { t: "pass" }], ["ben", { t: "pass" }], ["ana", { t: "choose", option: "lull" }],
  ] as const) {
    f.clock.t += 7_000;
    await say(core, who, m);
  }
  await core.alarm?.();
  // Normalise only what the sky is allowed to touch.
  const strip = (text: string): string => text
    .replace(/,"atmosphere":(null|\{[^}]*\})/g, "")
    .replace(/"sky":(null|\{[^}]*\})/g, '"sky":null')
    .replace(/\\"sky\\":(null|\{[^}]*\})/g, '\\"sky\\":null')
    .replace(/"conditions":"(off|place|table)"/g, '"conditions":"-"')
    .replace(/"place":(null|\{[^}]*\})/g, '"place":null')
    .replace(/\\"conditions\\":\\"(off|place|table)\\"/g, '\\"conditions\\":\\"-\\"')
    .replace(/\\"place\\":(null|\{[^}]*\})/g, '\\"place\\":null');
  const trace = f.sent.filter((s) => s.msg.t !== "setAtmosphere").map((s) => `${s.sid}:${strip(JSON.stringify(s.msg))}`).join("\n");
  return { trace, stored: strip(f.disk.text ?? ""), calls };
}

const rain: Svc = async () => ({ weather: "rain", timeOfDay: "night", moon: "full" } as never);
const snow: Svc = async () => ({ weather: "snow", timeOfDay: "dawn", moon: "new" } as never);

describe("Room rules are free of the real world (conditions 5.7, party-mode Property 38)", () => {
  it("plays the same game with any sky, no service, a failing service, a nonsense answer or conditions off", async () => {
    const base = await play(undefined, "off");
    expect(base.trace.length).toBeGreaterThan(500);
    const variants: [string, Svc | undefined, "off" | "place" | "table"][] = [
      ["rain at night", rain, "table"], ["snow at dawn", snow, "place"], ["service says nothing", async () => null, "table"],
      ["service throws", async () => { throw new Error("down"); }, "place"], ["nonsense answer", async () => ({ weather: "", timeOfDay: 4, moon: "x" }) as never, "table"],
      ["no service wired", undefined, "table"], ["conditions off with a service", rain, "off"],
    ];
    for (const [name, svc, choice] of variants) {
      const got = await play(svc, choice);
      expect(got.trace, name).toBe(base.trace);
      expect(got.stored, name).toBe(base.stored);
    }
  });
  it("reads the sky once for the whole game, and not at all when it is off", async () => {
    expect((await play(rain, "table")).calls).toBe(1);
    expect((await play(rain, "place")).calls).toBe(1);
    expect((await play(rain, "off")).calls).toBe(0);
  });
  it("does let the sky show (so the comparison above can disagree): the Host and the Public View carry it", async () => {
    const f = rig(rain);
    const core = new RoomCore(f.ports);
    const { hostToken } = await core.create("ABCD");
    const a = await core.join("Ana");
    const b = await core.join("Ben");
    if (!a.ok || !b.ok) throw new Error("join");
    await say(core, "host", { t: "hello", token: hostToken });
    await say(core, "ana", { t: "hello", token: a.token });
    await say(core, "ben", { t: "hello", token: b.token });
    await say(core, "ana", WORLD);
    await say(core, "ana", { t: "roomSettings", conditions: "table" });
    await say(core, "ana", { t: "start" });
    expect(f.sent.filter((s) => s.sid === "host" && s.msg.t === "setAtmosphere")).toHaveLength(1);
    const pub = f.sent.filter((s) => s.sid === "ben" && s.msg.t === "public").at(-1)!.msg.view as { atmosphere?: unknown };
    expect(pub.atmosphere).toEqual({ weather: "rain", timeOfDay: "night", moon: "full" });
  });
});
