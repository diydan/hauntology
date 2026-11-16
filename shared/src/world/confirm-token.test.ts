import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { toBase64Url } from "../session-cookie";
import { CONFIRM_TTL_MS, confirmIdOf, signConfirm, verifyConfirm, type ConfirmClaims } from "./confirm-token";

const SECRET = "secret-0123456789abcdef-secret";
const NOW = 1_800_000_000_000;
const claims: ConfirmClaims = { imageId: "img-1", imageHash: "a".repeat(64), sid: "S".repeat(22) };
const sign = (c: ConfirmClaims = claims, at = NOW) => signConfirm({ ...c, issuedAt: at }, SECRET);

describe("Confirm Token", () => {
  it("verifies for the claims it was made for, until 10 minutes have passed", async () => {
    const token = await sign();
    expect(await verifyConfirm(token, claims, NOW, SECRET)).toEqual({ ok: true, issuedAt: NOW });
    expect(await verifyConfirm(token, claims, NOW + CONFIRM_TTL_MS, SECRET)).toEqual({ ok: true, issuedAt: NOW });
    expect(await verifyConfirm(token, claims, NOW + CONFIRM_TTL_MS + 1, SECRET)).toEqual({ ok: false, code: "confirm_expired" });
    expect(CONFIRM_TTL_MS).toBe(600_000);
  });

  it("is bad, not expired, for the wrong image, hash or Session, however old", async () => {
    const token = await sign();
    for (const wrong of [{ ...claims, imageId: "img-2" }, { ...claims, imageHash: "b".repeat(64) }, { ...claims, sid: "T".repeat(22) }]) {
      expect(await verifyConfirm(token, wrong, NOW, SECRET)).toEqual({ ok: false, code: "bad_confirm" });
      expect(await verifyConfirm(token, wrong, NOW + 5 * CONFIRM_TTL_MS, SECRET)).toEqual({ ok: false, code: "bad_confirm" });
    }
  });

  it("is bad when it comes from another secret", async () => {
    const token = await signConfirm({ ...claims, issuedAt: NOW }, "another-secret-0123456789abcdef");
    expect(await verifyConfirm(token, claims, NOW, SECRET)).toEqual({ ok: false, code: "bad_confirm" });
  });

  it("is bad when it was issued in the future", async () => {
    expect(await verifyConfirm(await sign(claims, NOW + 1), claims, NOW, SECRET)).toEqual({ ok: false, code: "bad_confirm" });
  });

  it("is bad for anything that is not a token", async () => {
    const token = await sign();
    const [, payload, mac] = token.split(".") as [string, string, string];
    const junk = ["", "x", "c1", "c1..", "c1.a.b", `c2.${payload}.${mac}`, `${token}.x`, `c1.${payload}`, `c1.${payload}.${mac}=`, "a".repeat(513), `c1.${toBase64Url(new TextEncoder().encode("{}"))}.${mac}`, 7 as unknown as string, null as unknown as string];
    for (const j of junk) expect(await verifyConfirm(j, claims, NOW, SECRET), String(j).slice(0, 30)).toEqual({ ok: false, code: "bad_confirm" });
  });

  it("is not a Session cookie, and a Session cookie is not a Confirm Token", async () => {
    // A token made without the context line (as the Session signer would) must not verify.
    const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ i: claims.imageId, h: claims.imageHash, s: claims.sid, t: NOW })));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`c1.${payload}`))));
    expect(await verifyConfirm(`c1.${payload}.${mac}`, claims, NOW, SECRET)).toEqual({ ok: false, code: "bad_confirm" });
  });

  it("refuses a secret that is too short", async () => {
    await expect(signConfirm({ ...claims, issuedAt: NOW }, "short")).rejects.toThrow(RangeError);
    await expect(signConfirm({ ...claims, issuedAt: NOW }, "x".repeat(15))).rejects.toThrow(RangeError);
    await expect(signConfirm({ ...claims, issuedAt: NOW }, "x".repeat(16))).resolves.toBeTypeOf("string");
    await expect(verifyConfirm(await sign(), claims, NOW, "short")).rejects.toThrow(RangeError);
  });

  it("is bad when the clock is not a number", async () => {
    expect(await verifyConfirm(await sign(), claims, Number.NaN, SECRET)).toEqual({ ok: false, code: "bad_confirm" });
  });

  it("names a token by a short stable id that is not the token", async () => {
    const token = await sign();
    const id = await confirmIdOf(token);
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await confirmIdOf(token)).toBe(id);
    expect(await confirmIdOf(token + "x")).not.toBe(id);
    expect(token.includes(id)).toBe(false);
  });
});

/** Property 5: Confirm tokens bind their inputs. */
describe("Property 5: Confirm tokens bind their inputs", () => {
  const claimsArb = fc.record({
    imageId: fc.stringMatching(/^[A-Za-z0-9_-]{1,40}$/),
    imageHash: fc.stringMatching(/^[0-9a-f]{64}$/),
    sid: fc.stringMatching(/^[A-Za-z0-9_-]{22}$/),
  });

  it("verifies iff the tuple is the signed tuple and the time is before expiry", async () => {
    await fc.assert(
      fc.asyncProperty(claimsArb, claimsArb, fc.integer({ min: 0, max: 2_000_000_000_000 }), fc.integer({ min: -1_000, max: 2 * CONFIRM_TTL_MS }), async (signedFor, presented, issuedAt, later) => {
        const token = await signConfirm({ ...signedFor, issuedAt }, SECRET);
        const result = await verifyConfirm(token, presented, issuedAt + later, SECRET);
        const same = signedFor.imageId === presented.imageId && signedFor.imageHash === presented.imageHash && signedFor.sid === presented.sid;
        expect(result.ok).toBe(same && later >= 0 && later <= CONFIRM_TTL_MS);
      }),
      propParams(),
    );
  });

  it("fails when any single character of the token is changed", async () => {
    await fc.assert(
      fc.asyncProperty(claimsArb, fc.nat(), fc.integer({ min: 0, max: 63 }), async (c, at, pick) => {
        const token = await signConfirm({ ...c, issuedAt: at }, SECRET);
        const i = pick % token.length;
        const swap = token[i] === "A" ? "B" : "A";
        const tampered = token.slice(0, i) + swap + token.slice(i + 1);
        expect((await verifyConfirm(tampered, c, at, SECRET)).ok).toBe(false);
      }),
      propParams(),
    );
  });
});
