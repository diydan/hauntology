import { startSession } from "@hauntology/shared/ghost/play";
import type { WorldFacts } from "@hauntology/shared/ghost/play";
import { SESSION_TTL_MS } from "@hauntology/shared/ghost/session";
import { describe, expect, it } from "vitest";
import { CloudflarePlaySessions } from "../play/cloudflare";
import { FakeNamespace } from "../worlds/fake-cloudflare";
import { PlayIndex } from "./play-index";
import { PlaySession } from "./play-session";

const WORLD: WorldFacts = { spawn: [0, 0, 0], yaw: 0, bounds: { min: [-12, -1, -12], max: [12, 4, 12] }, floorY: 0, brief: "A narrow kitchen with a window over the sink." };
const T0 = 1_800_000_000_000;

function setup() {
  const clock = { t: T0 };
  const index = new FakeNamespace((state) => new PlayIndex(state));
  const sessions = new FakeNamespace((state) => new PlaySession(state, { PLAY_INDEX: index }, () => clock.t));
  const plays = new CloudflarePlaySessions(sessions, index);
  const game = (id = "p-1", worldId = "w-1", owner = "sid-a") => startSession({ id, worldId, ownerSid: owner, world: WORLD, seed: 3, now: clock.t });
  const listed = (worldId: string) => (index.data.get("index")?.get(`w:${worldId}`) as string[] | undefined) ?? [];
  return { clock, index, sessions, plays, game, listed };
}
const look = { input: { button: "look" }, pose: {}, world: { bounds: WORLD.bounds, brief: WORLD.brief } };

describe("the games over Durable Objects", () => {
  it("starts a game, lists it with its world, and sets the alarm for the end of its day", async () => {
    const { plays, game, sessions, listed, clock } = setup();
    expect(await plays.start(game())).toBe(true);
    expect(listed("w-1")).toEqual(["p-1"]);
    expect(sessions.alarms.get("p-1")?.at).toBe(clock.t + SESSION_TTL_MS);
    expect(await plays.start(game())).toBe(false);
    expect(listed("w-1")).toEqual(["p-1"]);
  });

  it("plays a turn and restores the view, for the owner only", async () => {
    const { plays, game, clock } = setup();
    await plays.start(game());
    clock.t += 1600;
    const r = await plays.turn("p-1", "sid-a", look);
    expect(r).toMatchObject({ ok: true, turns: 1, ended: false });
    expect(await plays.get("p-1", "sid-a")).toMatchObject({ ok: true, worldId: "w-1", turns: 1 });
    expect(await plays.get("p-1", "sid-b")).toEqual({ ok: false, code: "session_not_found" });
    expect(await plays.turn("p-1", "sid-b", look)).toEqual({ ok: false, code: "session_not_found" });
    expect(await plays.get("p-nothing", "sid-a")).toEqual({ ok: false, code: "session_not_found" });
  });

  it("starts again with the same id, and moves the alarm to the new day", async () => {
    const { plays, game, clock, sessions } = setup();
    await plays.start(game());
    clock.t += 5_000_000;
    expect(await plays.reset("p-1", "sid-a", { world: WORLD, seed: 99 })).toMatchObject({ ok: true, turns: 0 });
    expect(sessions.alarms.get("p-1")?.at).toBe(clock.t + SESSION_TTL_MS);
    expect(await plays.reset("p-1", "sid-b", { world: WORLD, seed: 99 })).toEqual({ ok: false, code: "session_not_found" });
  });

  it("deletes every game of a world and no other, forgets them in the index, and is safe for a world with none", async () => {
    const { plays, game, sessions, listed } = setup();
    await plays.start(game("p-1", "w-1"));
    await plays.start(game("p-2", "w-1", "sid-b"));
    await plays.start(game("p-3", "w-2"));
    expect(listed("w-1").sort()).toEqual(["p-1", "p-2"]);
    await plays.deleteForWorld("w-1");
    expect(await plays.get("p-1", "sid-a")).toEqual({ ok: false, code: "session_not_found" });
    expect(await plays.get("p-2", "sid-b")).toEqual({ ok: false, code: "session_not_found" });
    expect(await plays.get("p-3", "sid-a")).toMatchObject({ ok: true });
    expect(listed("w-1")).toEqual([]);
    expect(listed("w-2")).toEqual(["p-3"]);
    expect(sessions.alarms.get("p-1")?.at).toBeNull();
    expect(sessions.data.get("p-1")?.size).toBe(0);
    await plays.deleteForWorld("w-1");
    await plays.deleteForWorld("w-never");
  });

  it("deletes a game when its alarm rings, and takes it off the index", async () => {
    const { plays, game, sessions, listed, clock } = setup();
    await plays.start(game("p-1", "w-1"));
    await plays.start(game("p-2", "w-1", "sid-b"));
    clock.t += SESSION_TTL_MS;
    await sessions.objects.get("p-1")?.alarm();
    expect(sessions.data.get("p-1")?.size).toBe(0);
    expect(listed("w-1")).toEqual(["p-2"]);
    expect(await plays.get("p-1", "sid-a")).toEqual({ ok: false, code: "session_not_found" });
  });
});

describe("PlaySession (internal addresses)", () => {
  it("answers only POST to known addresses, and refuses a game that does not fit", async () => {
    const { sessions } = setup();
    const stub = sessions.get("p-9");
    expect((await stub.fetch("https://play-session/get")).status).toBe(404);
    expect((await stub.fetch("https://play-session/nothing", { method: "POST", body: "{}" })).status).toBe(404);
    expect((await stub.fetch("https://play-session/start", { method: "POST", body: JSON.stringify({ game: { v: 1 } }) })).status).toBe(400);
    expect((await stub.fetch("https://play-session/start", { method: "POST", body: "not json" })).status).toBe(400);
    expect(await (await stub.fetch("https://play-session/get", { method: "POST", body: "{}" })).json()).toEqual({ ok: false, code: "session_not_found" });
  });
});

describe("PlayIndex (internal addresses)", () => {
  const post = (path: string, body: unknown) => setup().index.get("index").fetch(`https://play-index${path}`, { method: "POST", body: JSON.stringify(body) });

  it("refuses ids that are not ids, and anything but POST", async () => {
    const { index } = setup();
    const stub = index.get("index");
    expect((await stub.fetch("https://play-index/add")).status).toBe(404);
    for (const body of [{}, { worldId: "../x", playId: "p" }, { worldId: "w", playId: "a b" }, { worldId: 5 }]) expect((await stub.fetch("https://play-index/add", { method: "POST", body: JSON.stringify(body) })).status).toBe(400);
    expect((await post("/nothing", { worldId: "w" })).status).toBe(404);
  });

  it("lists a game once however often it is added, takes the list once, and keeps at most 500 for a world", async () => {
    const { index } = setup();
    const stub = index.get("index");
    const call = (path: string, body: unknown) => stub.fetch(`https://play-index${path}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json()) as Promise<{ ok: boolean; ids?: string[] }>;
    await call("/add", { worldId: "w", playId: "p-1" });
    await call("/add", { worldId: "w", playId: "p-1" });
    await call("/add", { worldId: "w", playId: "p-2" });
    expect((await call("/take", { worldId: "w" })).ids).toEqual(["p-1", "p-2"]);
    expect((await call("/take", { worldId: "w" })).ids).toEqual([]);
    for (let i = 0; i < 520; i++) await call("/add", { worldId: "big", playId: `p-${i}` });
    const ids = (await call("/take", { worldId: "big" })).ids as string[];
    expect(ids).toHaveLength(500);
    expect(ids[0]).toBe("p-20");
    expect(ids.at(-1)).toBe("p-519");
    await call("/add", { worldId: "w", playId: "p-1" });
    await call("/remove", { worldId: "w", playId: "p-1" });
    expect((await call("/take", { worldId: "w" })).ids).toEqual([]);
  });
});
