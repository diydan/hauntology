import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { MemorySpendGuard } from "../worlds/fakes";
import { MemoryWorldStore } from "../worlds/memory-store";
import { BYTES, SECRET, sampleManifest } from "../worlds/test-kit";
import { ADMIN_TOKEN_MIN, adminTokenFrom, constantTimeEqual, type AdminSpend } from "./admin";

const TOKEN = "t0ken-abcdefghijklmnopqrstuvwxyz-0123456789";
const ORIGIN = "http://app.test";
const auth = (token = TOKEN) => ({ Authorization: `Bearer ${token}` });

class Spend implements AdminSpend {
  killed = false;
  dayCapReached = false;
  totalCapReached = false;
  down = false;
  calls: string[] = [];
  async statusStrict() {
    this.calls.push("status");
    if (this.down) throw new Error("down");
    return { killed: this.killed, dayCapReached: this.dayCapReached, totalCapReached: this.totalCapReached };
  }
  async setKill(on: boolean) {
    this.calls.push(`kill:${on}`);
    if (this.down) throw new Error("down");
    this.killed = on;
  }
}

function setup(opts: { available?: boolean; env?: Record<string, string>; admin?: boolean } = {}) {
  const spend = new Spend();
  const app = createApp({
    ...(opts.admin === false ? {} : { admin: { token: TOKEN, spend, worldGenAvailable: opts.available ?? true } }),
    spend: async () => spend.statusStrict(),
  });
  const env = { HMAC_SECRET: SECRET, ...(opts.env ?? {}) };
  const send = async (path: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
    const res = await app.request(`${ORIGIN}${path}`, { method: init.method ?? "GET", headers: init.headers ?? {}, ...(init.body !== undefined ? { body: init.body } : {}) }, env);
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, text, json };
  };
  return { spend, app, env, send };
}

describe("adminTokenFrom", () => {
  it("takes a printable token of at least 32 characters, trimmed, and nothing else", () => {
    expect(ADMIN_TOKEN_MIN).toBe(32);
    expect(adminTokenFrom("a".repeat(32))).toBe("a".repeat(32));
    expect(adminTokenFrom(`  ${"a".repeat(32)}\n`)).toBe("a".repeat(32));
    for (const bad of ["a".repeat(31), "", "   ", `${"a".repeat(20)} ${"b".repeat(20)}`, `${"a".repeat(40)}\tx`, `${"é".repeat(40)}`, undefined, null, 5, {}, ["a".repeat(40)]]) {
      expect(adminTokenFrom(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("constantTimeEqual", () => {
  it("is true for equal text and false for anything else, whatever the lengths", async () => {
    expect(await constantTimeEqual("abc", "abc")).toBe(true);
    expect(await constantTimeEqual("", "")).toBe(true);
    expect(await constantTimeEqual("é青", "é青")).toBe(true);
    for (const [a, b] of [["abc", "abd"], ["abc", "ab"], ["abc", "abcd"], ["abc", ""], ["", "a"], ["abc", "ABC"], [TOKEN, `${TOKEN} `]] as const) expect(await constantTimeEqual(a, b), `${a} ${b}`).toBe(false);
  });
});

describe("the operator's routes", () => {
  it("are not there when no token is set up: a plain 404, no cookie, whatever is asked", async () => {
    const t = setup({ admin: false });
    for (const [method, path] of [["GET", "/admin/status"], ["POST", "/admin/kill"], ["GET", "/admin"], ["GET", "/admin/anything"]] as const) {
      const r = await t.send(path, { method, headers: auth(), ...(method === "POST" ? { body: '{"on":true}' } : {}) });
      expect(r.status, `${method} ${path}`).toBe(404);
      expect(r.headers.get("Set-Cookie")).toBeNull();
    }
    expect(t.spend.killed).toBe(false);
  });

  describe("refuse, and change nothing, without the token", () => {
    const wrong: [string, Record<string, string>][] = [
      ["no header", {}],
      ["another scheme", { Authorization: `Basic ${btoa(`admin:${TOKEN}`)}` }],
      ["no value", { Authorization: "Bearer" }],
      ["no scheme", { Authorization: TOKEN }],
      ["a wrong token", auth("wrong-" + TOKEN)],
      ["a prefix of it", auth(TOKEN.slice(0, 30))],
      ["it with more after", auth(TOKEN + "x")],
      ["it in capitals", auth(TOKEN.toUpperCase())],
      ["two tokens", { Authorization: `Bearer ${TOKEN} ${TOKEN}` }],
    ];
    for (const [name, headers] of wrong) {
      it(name, async () => {
        const t = setup();
        const status = await t.send("/admin/status", { headers });
        const kill = await t.send("/admin/kill", { method: "POST", headers, body: '{"on":true}' });
        for (const r of [status, kill]) {
          expect([r.status, r.json]).toEqual([401, { ok: false, code: "unauthorized" }]);
          expect(r.headers.get("WWW-Authenticate")).toBe("Bearer");
          expect(r.headers.get("Cache-Control")).toBe("no-store");
        }
        expect(t.spend.calls).toEqual([]);
        expect(t.spend.killed).toBe(false);
      });
    }

    it("a token anywhere but the header, a Session cookie, or the right Origin is not a credential", async () => {
      const t = setup();
      const cookie = (await t.send("/api/session")).headers.get("Set-Cookie")!.split(";")[0]!;
      for (const r of [
        await t.send(`/admin/status?token=${TOKEN}`),
        await t.send("/admin/kill", { method: "POST", body: JSON.stringify({ on: true, token: TOKEN }) }),
        await t.send("/admin/status", { headers: { Cookie: cookie, Origin: ORIGIN } }),
        await t.send("/admin/kill", { method: "POST", headers: { Cookie: cookie, Origin: ORIGIN }, body: '{"on":true}' }),
      ]) expect(r.status).toBe(401);
      expect(t.spend.killed).toBe(false);
    });

    it("takes the token only as the whole header value, never from the middle of one", async () => {
      const t = setup();
      for (const header of [`Token Bearer ${TOKEN}`, `x Bearer ${TOKEN}`, `Bearer: ${TOKEN}`, ` Bearer ${TOKEN}x`]) {
        expect((await t.send("/admin/status", { headers: { Authorization: header } })).status, header).toBe(401);
      }
    });

    it("compares the whole of what it was given: tokens whose hashes agree in one place and not in another are not equal", async () => {
      // Find strings whose SHA-256 agrees with another's at a chosen byte, so a comparison of one byte only would let them through.
      const digest = async (text: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
      for (const position of [0, 1, 15, 30, 31]) {
        const seen = new Map<number, string>();
        let pair: [string, string] | null = null;
        for (let i = 0; i < 2000 && pair === null; i++) {
          const text = `candidate-${i}`;
          const byte = (await digest(text))[position] as number;
          const earlier = seen.get(byte);
          if (earlier !== undefined) pair = [earlier, text];
          else seen.set(byte, text);
        }
        expect(pair, `a pair at byte ${position}`).not.toBeNull();
        expect(await constantTimeEqual(pair![0], pair![1]), `byte ${position}`).toBe(false);
      }
    });

    it("also refuses a path that does not exist, before it says anything about the route", async () => {
      const t = setup();
      expect((await t.send("/admin/nothing")).status).toBe(401);
      expect((await t.send("/admin/nothing", { headers: auth() })).status).toBe(404);
    });
  });

  it("accepts the token with the scheme in any case and extra spaces, and needs no Origin and no cookie (a script, not a page)", async () => {
    const t = setup();
    for (const header of [`Bearer ${TOKEN}`, `bearer ${TOKEN}`, `BEARER   ${TOKEN}`]) {
      const r = await t.send("/admin/status", { headers: { Authorization: header } });
      expect(r.status, header).toBe(200);
      expect(r.headers.get("Set-Cookie")).toBeNull();
    }
  });

  describe("GET /admin/status", () => {
    it("says open when nothing closes worlds", async () => {
      const r = await setup().send("/admin/status", { headers: auth() });
      expect(r.json).toEqual({ worldGen: "open", reasons: [], killed: false, dayCapReached: false, totalCapReached: false });
      expect(r.headers.get("Cache-Control")).toBe("no-store");
    });

    it("says closed with each reason: the kill switch, the setting, no key for the world service", async () => {
      const t = setup();
      t.spend.killed = true;
      expect((await t.send("/admin/status", { headers: auth() })).json).toMatchObject({ worldGen: "closed", reasons: ["kill_switch"], killed: true });
      const off = setup({ env: { WORLD_GEN_ENABLED: "off" } });
      expect((await off.send("/admin/status", { headers: auth() })).json).toMatchObject({ worldGen: "closed", reasons: ["WORLD_GEN_ENABLED"], killed: false });
      const nokey = setup({ available: false });
      expect((await nokey.send("/admin/status", { headers: auth() })).json).toMatchObject({ worldGen: "closed", reasons: ["no_world_service_key"] });
      const all = setup({ available: false, env: { WORLD_GEN_ENABLED: "false" } });
      all.spend.killed = true;
      expect((await all.send("/admin/status", { headers: auth() })).json.reasons).toEqual(["WORLD_GEN_ENABLED", "kill_switch", "no_world_service_key"]);
    });

    it("shows the caps, which close nothing by themselves for the operator but are worth knowing", async () => {
      const t = setup();
      t.spend.dayCapReached = true;
      t.spend.totalCapReached = true;
      expect((await t.send("/admin/status", { headers: auth() })).json).toMatchObject({ worldGen: "open", dayCapReached: true, totalCapReached: true });
    });

    it("says it cannot tell, not closed, when SpendGuard cannot be reached", async () => {
      const t = setup();
      t.spend.down = true;
      const r = await t.send("/admin/status", { headers: auth() });
      expect([r.status, r.json]).toEqual([502, { ok: false, code: "spend_guard_unavailable" }]);
    });
  });

  describe("POST /admin/kill", () => {
    it("closes new worlds, and opens them again, and says what the switch is now", async () => {
      const t = setup();
      const close = await t.send("/admin/kill", { method: "POST", headers: auth(), body: '{"on":true}' });
      expect([close.status, close.json]).toEqual([200, { worldGen: "closed", reasons: ["kill_switch"], killed: true, dayCapReached: false, totalCapReached: false }]);
      expect(t.spend.killed).toBe(true);
      const again = await t.send("/admin/kill", { method: "POST", headers: auth(), body: '{"on":true}' });
      expect(again.json.killed).toBe(true); // closing twice is the same
      const open = await t.send("/admin/kill", { method: "POST", headers: auth(), body: '{"on":false}' });
      expect([open.status, open.json]).toEqual([200, { worldGen: "open", reasons: [], killed: false, dayCapReached: false, totalCapReached: false }]);
      expect(t.spend.killed).toBe(false);
      expect(t.spend.calls.filter((c) => c.startsWith("kill:"))).toEqual(["kill:true", "kill:true", "kill:false"]);
    });

    it("shows on the Home flags at once, in both directions", async () => {
      const t = setup();
      const flag = async () => ((await t.send("/api/session")).json as { flags: { worldGenEnabled: boolean } }).flags.worldGenEnabled;
      expect(await flag()).toBe(true);
      await t.send("/admin/kill", { method: "POST", headers: auth(), body: '{"on":true}' });
      expect(await flag()).toBe(false);
      await t.send("/admin/kill", { method: "POST", headers: auth(), body: '{"on":false}' });
      expect(await flag()).toBe(true);
    });

    it("refuses a body that is not exactly a boolean `on`, and changes nothing", async () => {
      const t = setup();
      for (const body of ["", "{", "null", "[]", "[true]", "{}", '{"on":"true"}', '{"on":1}', '{"on":null}', '{"ON":true}', "true", '"on"']) {
        const r = await t.send("/admin/kill", { method: "POST", headers: auth(), body });
        expect([r.status, r.json], body).toEqual([400, { ok: false, code: "bad_request" }]);
      }
      const huge = await t.send("/admin/kill", { method: "POST", headers: auth(), body: JSON.stringify({ on: true, pad: "x".repeat(2000) }) });
      expect([huge.status, huge.json]).toEqual([413, { ok: false, code: "bad_request" }]);
      expect(t.spend.calls).toEqual([]);
      expect(t.spend.killed).toBe(false);
    });

    it("takes only POST on /kill and only GET on /status", async () => {
      const t = setup();
      for (const method of ["GET", "PUT", "DELETE", "PATCH"]) expect((await t.send("/admin/kill", { method, headers: auth() })).status, `${method} /kill`).toBe(404);
      for (const method of ["POST", "PUT", "DELETE"]) expect((await t.send("/admin/status", { method, headers: auth(), ...(method === "POST" ? { body: "{}" } : {}) })).status, `${method} /status`).toBe(404);
      expect(t.spend.killed).toBe(false);
    });

    it("does not say it worked when SpendGuard could not be reached", async () => {
      const t = setup();
      t.spend.down = true;
      const r = await t.send("/admin/kill", { method: "POST", headers: auth(), body: '{"on":true}' });
      expect([r.status, r.json]).toEqual([502, { ok: false, code: "spend_guard_unavailable" }]);
      expect(r.text).not.toMatch(/killed|closed/);
    });
  });

  it("never returns the token, or sets a cookie, on any answer", async () => {
    const t = setup();
    const all = [
      await t.send("/admin/status"),
      await t.send("/admin/status", { headers: auth("x".repeat(40)) }),
      await t.send("/admin/status", { headers: auth() }),
      await t.send("/admin/kill", { method: "POST", headers: auth(), body: '{"on":true}' }),
      await t.send("/admin/kill", { method: "POST", headers: auth(), body: "nope" }),
    ];
    for (const r of all) {
      expect(r.text).not.toContain(TOKEN);
      expect(JSON.stringify([...r.headers])).not.toContain(TOKEN);
      expect(r.headers.get("Set-Cookie")).toBeNull();
      expect(r.headers.get("Content-Security-Policy")).not.toBeNull(); // the app's security headers still apply
    }
  });

  it("leaves the Gallery as it was while worlds are closed (Requirement 9.3)", async () => {
    const spend = new Spend();
    const store = new MemoryWorldStore();
    store.putWorld({ id: "greenhouse", kind: "gallery", status: "ready", manifest: sampleManifest("greenhouse") });
    for (const [name, bytes] of Object.entries(BYTES)) store.putBundleFile("greenhouse", name, bytes, 1);
    const app = createApp({ admin: { token: TOKEN, spend, worldGenAvailable: true }, spend: async () => spend.statusStrict(), worlds: { store } });
    const env = { HMAC_SECRET: SECRET };
    await app.request(`${ORIGIN}/admin/kill`, { method: "POST", headers: auth(), body: '{"on":true}' }, env);
    expect(spend.killed).toBe(true);
    const res = await app.request(`${ORIGIN}/api/worlds/greenhouse`, {}, env);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("ready");
  });

  it("works with the real ledger as well as the fake: SpendGuard's own kill flag is what is set", async () => {
    const guard = new MemorySpendGuard();
    const spend: AdminSpend = { statusStrict: async () => guard.status(), setKill: async (on) => { guard.killed = on; } };
    const app = createApp({ admin: { token: TOKEN, spend, worldGenAvailable: true } });
    await app.request(`${ORIGIN}/admin/kill`, { method: "POST", headers: auth(), body: '{"on":true}' }, { HMAC_SECRET: SECRET });
    expect(await guard.reserve({ meter: "world", sessionId: "s", ipHash: "i", now: 1 })).toEqual({ ok: false, reason: "killed" });
    await app.request(`${ORIGIN}/admin/kill`, { method: "POST", headers: auth(), body: '{"on":false}' }, { HMAC_SECRET: SECRET });
    expect((await guard.reserve({ meter: "world", sessionId: "s", ipHash: "i", now: 1 })).ok).toBe(true);
  });
});
