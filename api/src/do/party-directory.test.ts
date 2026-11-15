import { describe, expect, it } from "vitest";
import { fakeState } from "../worlds/fake-cloudflare";
import { PartyDirectory } from "./party-directory";

const post = async (d: PartyDirectory, path: string, body: unknown) => {
  const res = await d.fetch(new Request(`https://dir${path}`, { method: "POST", body: JSON.stringify(body) }));
  return { status: res.status, json: res.status === 204 ? null : await res.json() };
};

describe("PartyDirectory", () => {
  it("holds the total cap and one live Room per session, and frees a slot on delete", async () => {
    const d = new PartyDirectory(fakeState().state, {}, () => 1, 2);
    expect((await post(d, "/create", { code: "AAAA", sessionId: "s1" })).json).toEqual({ ok: true });
    expect((await post(d, "/create", { code: "BBBB", sessionId: "s1" })).json).toEqual({ ok: false, code: "session_has_room" });
    expect((await post(d, "/create", { code: "AAAA", sessionId: "s2" })).json).toEqual({ ok: false, code: "code_taken" });
    expect((await post(d, "/create", { code: "BBBB", sessionId: "s2" })).json).toEqual({ ok: true });
    expect((await post(d, "/create", { code: "CCCC", sessionId: "s3" })).json).toEqual({ ok: false, code: "rooms_full" });
    expect((await post(d, "/has", { code: "AAAA" })).json).toEqual({ live: true });
    expect((await post(d, "/delete", { code: "AAAA" })).status).toBe(204);
    expect((await post(d, "/create", { code: "CCCC", sessionId: "s3" })).json).toEqual({ ok: true });
    expect((await post(d, "/create", { sessionId: "s4" })).status).toBe(400);
  });
});
