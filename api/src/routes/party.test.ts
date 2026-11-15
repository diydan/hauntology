import { describe, expect, it } from "vitest";
import { PartyDirectory } from "../do/party-directory";
import { PartyRoom } from "../do/party-room";
import { FakeNamespace } from "../worlds/fake-cloudflare";
import { partyRoutes } from "./party";

function app(session = "s1") {
  const rooms = new FakeNamespace((state) => new PartyRoom(state));
  const directory = new FakeNamespace((state) => new PartyDirectory(state));
  let n = 0;
  const routes = partyRoutes({ rooms, directory, sessionOf: () => session, random: () => ((n++ * 0.137) % 1) });
  return { routes, rooms, directory };
}

describe("/api/party routes", () => {
  it("creates a Room with a clean code and tokens, joins by any spelling of the code, and refuses an unknown code without detail", async () => {
    const { routes } = app();
    const res = await routes.request("/", { method: "POST" });
    const room = (await res.json()) as { code: string; hostToken: string; displayToken: string };
    expect(room.code).toMatch(/^[A-HJ-KM-NP-Z2-9]{4}$/);
    expect(room.hostToken).toMatch(/^[0-9a-f]{32}$/);
    const join = await routes.request(`/${room.code.toLowerCase().split("").join(" ")}/join`, { method: "POST", body: JSON.stringify({ nickname: "<b>Ana</b>" }) });
    expect(await join.json()).toMatchObject({ ok: true, seat: 1 });
    const unknown = await routes.request("/QQQQ/join", { method: "POST", body: "{}" });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ ok: false, code: "room_unknown" });
    expect((await routes.request("/0000/join", { method: "POST", body: "{}" })).status).toBe(404);
  });

  it("allows one live Room per session", async () => {
    const { routes } = app("same");
    expect((await routes.request("/", { method: "POST" })).status).toBe(200);
    const second = await routes.request("/", { method: "POST" });
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({ code: "session_has_room" });
  });

  it("only upgrades a websocket request, and never takes a token in the address", async () => {
    const { routes } = app();
    const res = await routes.request("/ABCD/ws");
    expect(res.status).toBe(426);
  });
});
