import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_SEED, propParams } from "./app/prop-config";
import {
  SESSION_TTL_SEC, fromBase64Url, newSessionState, sessionIdFrom, signSession, toBase64Url, toSessionRecord,
  touchSession, verifySession, withLastPlay, withLastWorld, withNoticeAcked, withoutWorld, type SessionState,
} from "./session-cookie";

const SECRET = "test-secret-0123456789abcdef-test";
const NOW = 1_800_000_000;
const sid = sessionIdFrom(new Uint8Array(16).map((_, i) => i + 1));
const fresh = (): SessionState => newSessionState(sid, NOW);

describe("session ids", () => {
  it("are 22 URL-safe characters from 16 bytes", () => {
    expect(sid).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(sessionIdFrom(new Uint8Array(16))).not.toBe(sid);
  });
});

describe("base64url", () => {
  it("round-trips bytes and refuses anything that is not canonical", () => {
    for (const n of [0, 1, 2, 3, 4, 31, 32, 33]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256);
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    }
    expect(fromBase64Url("AA==")).toBeNull(); // padding
    expect(fromBase64Url("AB")).toBeNull(); // stray bits in the last character
    expect(fromBase64Url("A")).toBeNull(); // impossible length
    expect(fromBase64Url("a+b/")).toBeNull(); // standard alphabet
    expect(fromBase64Url("ab cd")).toBeNull();
  });
});

describe("sign and verify", () => {
  it("round-trips a Session", async () => {
    const s = withLastPlay(withLastWorld(withNoticeAcked(fresh()), "w-1"), "p-1");
    const cookie = await signSession(s, SECRET);
    expect(cookie).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    expect(await verifySession(cookie, SECRET, NOW)).toEqual(s);
  });

  it("does not put a photo, a caption or any text field in the cookie", async () => {
    const decoded = JSON.parse(new TextDecoder().decode(fromBase64Url((await signSession(fresh(), SECRET)).split(".")[1]!)!));
    expect(Object.keys(decoded).sort()).toEqual(["ackNotice", "exp", "sid"]);
  });

  it("refuses another secret, an expired Session and a Session at its expiry second", async () => {
    const cookie = await signSession(fresh(), SECRET);
    expect(await verifySession(cookie, "another-secret-0123456789abcdef", NOW)).toBeNull();
    expect(await verifySession(cookie, SECRET, NOW + SESSION_TTL_SEC - 1)).not.toBeNull();
    expect(await verifySession(cookie, SECRET, NOW + SESSION_TTL_SEC)).toBeNull();
    expect(await verifySession(cookie, SECRET, NOW + SESSION_TTL_SEC + 1)).toBeNull();
  });

  it("refuses malformed cookies", async () => {
    const good = await signSession(fresh(), SECRET);
    const [v, p, m] = good.split(".") as [string, string, string];
    for (const bad of ["", "v1", "v1.a", "v1.a.b.c", `v2.${p}.${m}`, `${v}.${p}`, `${v}.${p}.${m}.`, `.${p}.${m}`, `${v}..${m}`, `${v}.${p}.`]) {
      expect(await verifySession(bad, SECRET, NOW), JSON.stringify(bad)).toBeNull();
    }
  });

  it("refuses a validly signed payload with a bad shape or extra fields", async () => {
    const forge = async (obj: unknown) => {
      const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v1.${payload}`)));
      return `v1.${payload}.${toBase64Url(mac)}`;
    };
    const ok = { sid, exp: NOW + 100, ackNotice: false };
    expect(await verifySession(await forge(ok), SECRET, NOW)).toEqual(ok);
    for (const bad of [
      { ...ok, extra: 1 }, { ...ok, sid: "short" }, { ...ok, exp: "soon" }, { ...ok, lastWorldId: "a/b" },
      { ...ok, lastPlayId: "x".repeat(65) }, { sid, exp: NOW + 100 }, "text", null, [],
    ]) {
      expect(await verifySession(await forge(bad), SECRET, NOW), JSON.stringify(bad)).toBeNull();
    }
  });

  it("will not sign or verify with a short secret", async () => {
    await expect(signSession(fresh(), "short")).rejects.toThrow(RangeError);
    expect(await verifySession(await signSession(fresh(), SECRET), "short", NOW)).toBeNull();
  });
});

describe("any change to a cookie is refused", () => {
  const cookieArb = fc
    .record({
      world: fc.option(fc.stringMatching(/^[A-Za-z0-9_-]{1,64}$/), { nil: undefined }),
      play: fc.option(fc.stringMatching(/^[A-Za-z0-9_-]{1,64}$/), { nil: undefined }),
      ack: fc.boolean(),
    })
    .map(({ world, play, ack }) => {
      let s = fresh();
      if (world !== undefined) s = withLastWorld(s, world);
      if (play !== undefined) s = withLastPlay(s, play);
      return ack ? withNoticeAcked(s) : s;
    });

  it("verifies what was signed, and nothing a single edit can reach", async () => {
    await fc.assert(
      fc.asyncProperty(cookieArb, fc.nat(), fc.constantFrom("A", "b", "-", "_", "0", "."), async (state, at, ch) => {
        const cookie = await signSession(state, SECRET);
        if ((await verifySession(cookie, SECRET, NOW))?.sid !== state.sid) return false;
        const i = at % cookie.length;
        if (cookie[i] === ch) return true;
        const edited = cookie.slice(0, i) + ch + cookie.slice(i + 1);
        return (await verifySession(edited, SECRET, NOW)) === null;
      }),
      propParams(DEFAULT_SEED, 300),
    );
  });
});

describe("Session updates", () => {
  it("sets the last world and play, and keeps the notice flag", () => {
    const s = withNoticeAcked(withLastPlay(withLastWorld(fresh(), "w-1"), "p-1"));
    expect(s).toMatchObject({ lastWorldId: "w-1", lastPlayId: "p-1", ackNotice: true, sid });
  });

  it("refuses an id that is not a valid world or play id", () => {
    for (const bad of ["", "a/b", "a b", "x".repeat(65), "ä", "a\n"]) {
      expect(() => withLastWorld(fresh(), bad), JSON.stringify(bad)).toThrow(RangeError);
      expect(() => withLastPlay(fresh(), bad), JSON.stringify(bad)).toThrow(RangeError);
    }
  });

  it("forgets a deleted world and its play, and leaves another world alone", () => {
    const s = withLastPlay(withLastWorld(fresh(), "w-1"), "p-1");
    expect(withoutWorld(s, "w-1")).toEqual(fresh());
    expect(withoutWorld(s, "w-2")).toBe(s);
  });

  it("moves the expiry to a full lifetime from now", () => {
    expect(touchSession(fresh(), NOW + 1000).exp).toBe(NOW + 1000 + SESSION_TTL_SEC);
  });
});

describe("toSessionRecord", () => {
  const flags = { worldGenEnabled: true, dayCapReached: false, totalCapReached: true, voiceEnabled: true, liveEnabled: false, partyEnabled: true, ghostModel: false };

  it("leaves absent ids out, never undefined", () => {
    const record = toSessionRecord(fresh(), flags);
    expect(record).toEqual({ ackNotice: false, flags });
    expect("lastWorldId" in record || "lastPlayId" in record).toBe(false);
  });

  it("carries the ids, the notice flag and a copy of the flags", () => {
    const s = withNoticeAcked(withLastPlay(withLastWorld(fresh(), "w-1"), "p-1"));
    const record = toSessionRecord(s, flags);
    expect(record).toEqual({ lastWorldId: "w-1", lastPlayId: "p-1", ackNotice: true, flags });
    expect(record.flags).not.toBe(flags);
    expect(JSON.stringify(record)).not.toContain(sid);
  });
});
