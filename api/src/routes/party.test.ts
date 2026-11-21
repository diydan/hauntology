import { describe, expect, it } from "vitest";
import { JOINS_PER_MINUTE, PartyDirectory } from "../do/party-directory";
import { PartyRoom } from "../do/party-room";
import { FakeNamespace } from "../worlds/fake-cloudflare";
import { partyRoutes } from "./party";

function app(session = "s1", o: { enabled?: boolean; ip?: string } = {}) {
  const rooms = new FakeNamespace((state) => new PartyRoom(state));
  const directory = new FakeNamespace((state) => new PartyDirectory(state));
  let n = 0;
  const routes = partyRoutes({ rooms, directory, sessionOf: () => session, ipHashOf: async () => o.ip ?? "ip1", enabled: () => o.enabled ?? true, random: () => ((n++ * 0.137) % 1) });
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

  it("refuses a websocket upgrade from another site, and lets a same-site one reach the Room (party-mode 4.1)", async () => {
    const { routes } = app();
    const evil = await routes.request("/ABCD/ws", { headers: { Upgrade: "websocket", Origin: "https://evil.example" } });
    expect(evil.status).toBe(403);
    expect(await evil.json()).toEqual({ ok: false, code: "bad_origin" });
    // a same-site upgrade is not refused for its origin: it goes on to the Room (the fake Room has no WebSocketPair, so it stops there)
    let status = 0;
    try { status = (await routes.request("/ABCD/ws", { headers: { Upgrade: "websocket", Origin: "http://localhost" } })).status; } catch { status = -1; }
    expect(status).not.toBe(403);
  });

  it("answers party_disabled on every route when the kill switch is off", async () => {
    const { routes, directory } = app("s1", { enabled: false });
    for (const [path, method] of [["/", "POST"], ["/ABCD/join", "POST"], ["/ABCD/ws", "GET"]] as const) {
      const res = await routes.request(path, { method });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ ok: false, code: "party_disabled" });
    }
    expect(directory.calls).toEqual([]);
  });

  it("limits join attempts per hashed IP, good codes and bad codes alike", async () => {
    const { routes } = app("s1", { ip: "same" });
    const room = (await (await routes.request("/", { method: "POST" })).json()) as { code: string };
    for (let i = 0; i < JOINS_PER_MINUTE; i++) expect((await routes.request(`/${i % 2 ? room.code : "QQQQ"}/join`, { method: "POST", body: JSON.stringify({ nickname: "A" }) })).status).not.toBe(429);
    const late = await routes.request(`/${room.code}/join`, { method: "POST", body: JSON.stringify({ nickname: "B" }) });
    expect(late.status).toBe(429);
    expect(await late.json()).toEqual({ ok: false, code: "rate_limited" });
  });

  it("with replace, a visitor's new case ends their old Room first, so a reload never blocks a new case", async () => {
    const { routes, rooms } = app("same");
    const first = (await (await routes.request("/", { method: "POST" })).json()) as { code: string; hostToken: string };
    const second = await routes.request("/", { method: "POST", body: JSON.stringify({ replace: true }) });
    expect(second.status).toBe(200);
    const room = (await second.json()) as { code: string };
    expect(room.code).not.toBe(first.code);
    expect(rooms.data.get(first.code)?.has("room")).toBe(false); // the old Room's data is gone, not just its directory entry
    expect((await routes.request(`/${first.code}/join`, { method: "POST", body: JSON.stringify({ nickname: "A" }) })).status).toBe(404);
    expect((await routes.request(`/${room.code}/join`, { method: "POST", body: JSON.stringify({ nickname: "A" }) })).status).toBe(200);
    const third = await routes.request("/", { method: "POST" });
    expect(await third.json()).toEqual({ code: "session_has_room" });
  });

  it("DELETE ends a Room for its Master or host token; a Player's token, a wrong token or no token is refused and the Room stays", async () => {
    const { routes, rooms } = app("s1");
    const room = (await (await routes.request("/", { method: "POST" })).json()) as { code: string; hostToken: string };
    const master = (await (await routes.request(`/${room.code}/join`, { method: "POST", body: JSON.stringify({ nickname: "Ana" }) })).json()) as { token: string };
    const player = (await (await routes.request(`/${room.code}/join`, { method: "POST", body: JSON.stringify({ nickname: "Ben" }) })).json()) as { token: string };
    const del = (token?: string) => routes.request(`/${room.code}`, { method: "DELETE", headers: token === undefined ? {} : { Authorization: `Bearer ${token}` } });
    const refused = await del(player.token);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ ok: false, code: "not_master" });
    for (const unknown of ["nope", undefined]) expect((await del(unknown)).status).toBe(401); // a malformed or missing token: no identity at all
    expect(rooms.data.get(room.code)?.has("room")).toBe(true);
    expect((await routes.request(`/${room.code}/join`, { method: "POST", body: JSON.stringify({ nickname: "Cy" }) })).status).toBe(200);
    expect((await del(room.hostToken)).status).toBe(204);
    expect(rooms.data.get(room.code)?.has("room")).toBe(false);
    expect((await routes.request(`/${room.code}/join`, { method: "POST", body: JSON.stringify({ nickname: "Dee" }) })).status).toBe(404);
    expect((await del(master.token)).status).toBe(404); // already gone: says so, once
    expect((await routes.request("/", { method: "POST" })).status).toBe(200); // the session's place is free again
  });

  it("DELETE by the Master's token ends the Room too", async () => {
    const { routes } = app("s1");
    const room = (await (await routes.request("/", { method: "POST" })).json()) as { code: string };
    const master = (await (await routes.request(`/${room.code}/join`, { method: "POST", body: JSON.stringify({ nickname: "Ana" }) })).json()) as { token: string };
    const res = await routes.request(`/${room.code}`, { method: "DELETE", headers: { Authorization: `Bearer ${master.token}` } });
    expect(res.status).toBe(204);
  });
});
