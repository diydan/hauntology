import type { NarrationAnswer, NarrationRequest, Narrator } from "../guarded/workersai/narrator";
import { describe, expect, it } from "vitest";
import { MemoryConditionsCache } from "../conditions/cache";
import type { WeatherFetch } from "../conditions/open-meteo";
import { conditionsFromEnv, type ConditionsEnv, type ConditionsService } from "../conditions/snapshot-store";
import type { Logger } from "../log";
import { MemoryPlaySessions } from "../play/memory";
import type { Narration } from "../play/narrate";
import { DEFAULT_CAPS, MemorySpendGuard } from "../worlds/fakes";
import { NOW, worldsKit, type Visitor } from "../worlds/test-kit";

// ghost-engine 3.1 through the routes: a game's start reads the real world once, keeps it frozen with the game, shows the client its sky and tells the narrator three closed
// words. NOW is 2027-01-15 08:00 UTC, so it is 03:00 in New York (night) and 17:00 in Tokyo (day). No test here calls a real weather host: the host is a function.

const ID = "w-kitchen-0000000000";
const CLOCK = { t: NOW };
const NEW_YORK = { lat: 40.7128, lon: -74.006, tz: "America/New_York", label: "New York, New York, United States" };
const FORECAST = JSON.stringify({ timezone: "America/New_York", current: { weather_code: 61, temperature_2m: 3, wind_speed_10m: 22 } });
const ARCHIVE = JSON.stringify({ timezone: "America/New_York", hourly: { time: ["1999-12-31T19:00"], weather_code: [61], temperature_2m: [3], wind_speed_10m: [22] } });
const SKY = { timeOfDay: "night", weather: "rain", tempBand: "cold", windBand: "breezy" };
const LINE = "The window over the sink is fogged, and the rain is soft on the glass tonight.";

function capture(): { log: Logger; lines: string[] } {
  const lines: string[] = [];
  const add = (level: string) => (event: string, fields?: unknown) => void lines.push(`${level} ${event} ${JSON.stringify(fields ?? {})}`);
  return { lines, log: { info: add("info"), warn: add("warn"), error: add("error") } as unknown as Logger };
}

/** The service over a weather host that is a function. `sleep` never fires unless `slow` (then it fires at once, so a call that never answers loses to it). */
function setup(over: { env?: ConditionsEnv; answer?: (url: string) => string | Error | "never"; withService?: boolean; service?: ConditionsService; narrator?: Narrator } = {}) {
  CLOCK.t = NOW;
  const urls: string[] = [];
  const answer = over.answer ?? ((url: string) => (url.includes("/archive") ? ARCHIVE : FORECAST));
  const fetch: WeatherFetch = (url) => {
    urls.push(url);
    const a = answer(url);
    if (a === "never") return new Promise(() => {});
    if (a instanceof Error) return Promise.reject(a);
    return Promise.resolve({ ok: true, status: 200, text: async () => a });
  };
  const { log, lines } = capture();
  const conditions = over.service ?? (over.withService === false ? undefined : conditionsFromEnv(over.env ?? {}, { fetch, cache: new MemoryConditionsCache(() => CLOCK.t), now: () => CLOCK.t, sleep: answer(NEW_YORK.label) === "never" ? () => Promise.resolve() : () => new Promise(() => {}), log }));
  const sessions = new MemoryPlaySessions(() => CLOCK.t);
  const narration: Narration | undefined = over.narrator === undefined ? undefined : { narrator: over.narrator, spend: new MemorySpendGuard({ ...DEFAULT_CAPS }, () => CLOCK.t), enabled: true, now: () => CLOCK.t };
  const kit = worldsKit(() => CLOCK.t, { play: { sessions, ...(conditions === undefined ? {} : { conditions }), ...(narration === undefined ? {} : { narration }) }, log, env: { HMAC_SECRET: "test-secret-0123456789abcdef-test" } });
  const start = (v: Visitor, body: unknown) => kit.send("/api/play/start", { method: "POST", headers: v.headers, body });
  const turn = (v: Visitor, id: string, body?: unknown) => kit.send(`/api/play/${id}/turn`, { method: "POST", headers: v.headers, ...(body !== undefined ? { body } : {}) });
  const get = (v: Visitor, id: string) => kit.send(`/api/play/${id}`, { headers: v.headers });
  const reset = (v: Visitor, id: string) => kit.send(`/api/play/${id}/reset`, { method: "POST", headers: v.headers });
  return { kit, urls, lines, start, turn, get, reset, wait: (ms = 2000) => void (CLOCK.t += ms) };
}
type Started = { playId: string; view: { atmosphere: unknown; anchors: Array<{ pos: [number, number, number] }> } };
async function begin(t: ReturnType<typeof setup>, conditions?: unknown) {
  const owner = await t.kit.visitor();
  t.kit.readyWorld(ID, owner);
  const r = await t.start(owner, { worldId: ID, ...(conditions === undefined ? {} : { conditions }) });
  return { owner, r, body: r.json as Started };
}
const choice = (extra: Record<string, unknown> = {}) => ({ hostHour: 12, place: NEW_YORK, ...extra });

describe("a game started with a place", () => {
  it("reads the weather once, and the client's view carries the sky and nothing of the place", async () => {
    const t = setup();
    const { r, body } = await begin(t, choice());
    expect(r.status).toBe(200);
    expect(body.view.atmosphere).toMatchObject({ ...SKY, moon: expect.any(String), stars: expect.any(Array), moonSky: expect.any(Object) });
    expect(t.urls).toEqual(["https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.01&current=weather_code,temperature_2m,wind_speed_10m&timezone=auto"]);
    expect(JSON.stringify(r.json)).not.toMatch(/New York|40\.7|74\.0|America|tz|label|lat|lon/);
  });

  it("keeps the same sky on every turn, on a reload and after Haunt again, with no second weather call", async () => {
    const t = setup();
    const { owner, body } = await begin(t, choice());
    const sky = body.view.atmosphere;
    for (let i = 0; i < 3; i++) {
      t.wait();
      const r = await t.turn(owner, body.playId, { input: { text: `hello ${i}` }, pose: { pos: [0, 0, 0], yaw: 0 } });
      expect(r.status).toBe(200);
      expect((r.json as { view: { atmosphere: unknown } }).view.atmosphere).toEqual(sky);
    }
    expect(((await t.get(owner, body.playId)).json as { view: { atmosphere: unknown } }).view.atmosphere).toEqual(sky);
    const again = await t.reset(owner, body.playId);
    expect(again.status).toBe(200);
    expect((again.json as { view: { atmosphere: unknown } }).view.atmosphere).toEqual(sky);
    expect(t.urls).toHaveLength(1);
    expect(t.lines.filter((l) => l.includes("conditions.read"))).toHaveLength(1);
  });

  it("a second game at the same place within 15 minutes is answered from the cache, and one 15 minutes later reads again", async () => {
    const t = setup();
    await begin(t, choice());
    const second = await t.start(await t.kit.visitor(), { worldId: ID, conditions: choice() }); // a visitor who may not play still costs no call
    expect(second.status).toBe(404);
    const owner2 = await t.kit.visitor();
    t.kit.readyWorld("w-other-00000000000", owner2);
    await t.start(owner2, { worldId: "w-other-00000000000", conditions: choice({ place: { ...NEW_YORK, lat: 40.7131, lon: -74.0062 } }) });
    expect(t.urls).toHaveLength(1);
    CLOCK.t += 15 * 60 * 1000;
    await t.start(owner2, { worldId: "w-other-00000000000", conditions: choice() });
    expect(t.urls).toHaveLength(2);
  });

  it("an owner who is turned away (a world that is not theirs) causes no weather call at all", async () => {
    const t = setup();
    const r = await t.start(await t.kit.visitor(), { worldId: "w-nothing-000000000", conditions: choice() });
    expect(r.status).toBe(404);
    expect(t.urls).toEqual([]);
  });

  it("with a Memory Day reads the archive for that date", async () => {
    const day = JSON.stringify({ timezone: "America/New_York", hourly: { time: ["1999-12-31T19:00"], weather_code: [73], temperature_2m: [-4], wind_speed_10m: [3] } });
    const t = setup({ answer: () => day });
    const { body } = await begin(t, choice({ memoryDay: { date: "1999-12-31", timeOfDay: "dusk" } }));
    expect(t.urls).toHaveLength(1);
    expect(t.urls[0]).toContain("/v1/archive?");
    expect(t.urls[0]).toContain("start_date=1999-12-31&end_date=1999-12-31");
    expect(body.view.atmosphere).toMatchObject({ weather: "snow", timeOfDay: "dusk" });
  });
});

describe("a game that gets the normal look", () => {
  it("with no conditions in the request, there is no call and no atmosphere", async () => {
    const t = setup();
    const { body } = await begin(t);
    expect(body.view.atmosphere).toBeNull();
    expect(t.urls).toEqual([]);
    expect(t.lines.filter((l) => l.includes("conditions.read"))).toEqual(['info conditions.read {"source":"default","reason":"no_place","cache":false}']);
  });

  it("a choice with no place (only the host's hour) is the same", async () => {
    const t = setup();
    expect((await begin(t, { hostHour: 23 })).body.view.atmosphere).toBeNull();
    expect(t.urls).toEqual([]);
  });

  it("with CONDITIONS_ENABLED=false, however much was chosen, there is no call and no atmosphere", async () => {
    const t = setup({ env: { CONDITIONS_ENABLED: "false" } });
    const { body } = await begin(t, choice({ memoryDay: { date: "1999-12-31", timeOfDay: "dusk" } }));
    expect(body.view.atmosphere).toBeNull();
    expect(t.urls).toEqual([]);
    expect(t.lines.some((l) => l.includes('"reason":"disabled"'))).toBe(true);
  });

  it("with no conditions service at all (the old Worker), the game starts as it did", async () => {
    const t = setup({ withService: false });
    const { r, body } = await begin(t, choice());
    expect(r.status).toBe(200);
    expect(body.view.atmosphere).toBeNull();
    expect(t.urls).toEqual([]);
  });

  it("a conditions service that fails in a way it should never (it rejects) still starts the game with the normal look, and says nothing of the place", async () => {
    const t = setup({ service: { read: () => Promise.reject(new Error(`boom: ${NEW_YORK.label}`)) } as unknown as ConditionsService });
    const { r, body } = await begin(t, choice());
    expect(r.status).toBe(200);
    expect(body.view.atmosphere).toBeNull();
    expect(t.lines.join("\n")).not.toContain("New York");
  });

  it("a conditions value that is not a choice, or a place off the globe, starts the game with the normal look", async () => {
    for (const bad of ["rain", 5, [], { place: "here" }, { place: { lat: 200, lon: 0 } }, { place: { lat: "40", lon: "-74" } }, { hostHour: 99, place: { lat: NaN, lon: 0 } }]) {
      const t = setup();
      const { r, body } = await begin(t, bad);
      expect(r.status, JSON.stringify(bad)).toBe(200);
      expect(body.view.atmosphere, JSON.stringify(bad)).toBeNull();
      expect(t.urls, JSON.stringify(bad)).toEqual([]);
    }
  });
});

describe("a weather service that does not help never stops a game", () => {
  it("a failure gives a clear sky at the place's own hour, and the game starts", async () => {
    const t = setup({ answer: () => new Error("down") });
    const { r, body } = await begin(t, choice());
    expect(r.status).toBe(200);
    expect(body.view.atmosphere).toMatchObject({ weather: "clear", tempBand: "mild", windBand: "calm", timeOfDay: "night" });
    expect(t.urls).toHaveLength(1);
    expect(t.lines.some((l) => l.includes('"source":"default","reason":"error"'))).toBe(true);
  });

  it("an answer that is not weather does the same, and one that is too slow is cut at the limit", async () => {
    const odd = setup({ answer: () => "<html>busy</html>" });
    expect((await begin(odd, choice())).body.view.atmosphere).toMatchObject({ weather: "clear" });
    const slow = setup({ answer: () => "never" });
    const { r, body } = await begin(slow, choice());
    expect(r.status).toBe(200);
    expect(body.view.atmosphere).toMatchObject({ weather: "clear", timeOfDay: "night" });
    expect(slow.lines.some((l) => l.includes('"reason":"timeout"'))).toBe(true);
  });
});

describe("what the narrator and the log are told", () => {
  const ok = (text: string): NarrationAnswer => ({ ok: true, text, stopReason: "end_turn", usage: { inputTokens: 600, outputTokens: 40 }, thinkingBlocks: 0, shape: [] });
  const model = (): Narrator & { calls: NarrationRequest[] } => {
    const calls: NarrationRequest[] = [];
    return { calls, async narrate(req) { calls.push(req); return ok(LINE); } };
  };

  it("the model is told the sky in three words and never the label, the position or the date", async () => {
    const narrator = model();
    const t = setup({ narrator });
    const { owner, body } = await begin(t, choice({ memoryDay: { date: "1999-12-31", timeOfDay: "dusk" }, label: "my own house, 12 Elm Street" }));
    t.wait();
    await t.turn(owner, body.playId, { input: { text: "hello" }, pose: { pos: [0, 0, 0], yaw: 0 } });
    expect(narrator.calls).toHaveLength(1);
    const asked = `${narrator.calls[0]!.system}\n${narrator.calls[0]!.user}`;
    expect(asked).toMatch(/The sky tonight/);
    expect(asked).toMatch(/\brain\b/);
    expect(asked).not.toMatch(/New York|Elm|40\.7|74\.0|1999|America|label/);
  });

  it("with no sky chosen the prompt has no sky sentence at all", async () => {
    const narrator = model();
    const t = setup({ narrator });
    const { owner, body } = await begin(t);
    t.wait();
    await t.turn(owner, body.playId, { input: { text: "hello" }, pose: { pos: [0, 0, 0], yaw: 0 } });
    expect(`${narrator.calls[0]!.system}${narrator.calls[0]!.user}`).not.toMatch(/The sky tonight/);
  });

  it("no log line of a game that had a place holds the place, its label, a position, a date or what the visitor typed", async () => {
    const t = setup();
    const { owner, body } = await begin(t, choice({ memoryDay: { date: "1999-12-31", timeOfDay: "dusk" } }));
    t.wait();
    await t.turn(owner, body.playId, { input: { text: "tell me about Elm Street" }, pose: { pos: [0, 0, 0], yaw: 0 } });
    await t.get(owner, body.playId);
    const all = t.lines.join("\n");
    expect(all).toMatch(/conditions\.read/);
    expect(all).not.toMatch(/New York|America|40\.7|74\.0|1999|Elm Street|latitude|longitude|open-meteo/i);
  });
});
