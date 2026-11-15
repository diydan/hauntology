import { fromBase64Url, toBase64Url } from "../session-cookie";

/**
 * The Confirm Token (world-pipeline Requirements 4.2 and 4.3, task 3.8). A Quote issues one; creating a
 * world needs one that still verifies. It binds the image id, the hash of the image bytes and the Session,
 * so a token cannot be used for another picture, after the picture changed, or by another visitor, and it
 * is good for 10 minutes. Format: `c1.<base64url(JSON {i,h,s,t})>.<base64url(HMAC-SHA-256)>`.
 *
 * The MAC covers a context line as well as the token, so a Session cookie (signed with the same secret)
 * can never pass as a Confirm Token. Pure: the clock is a parameter, WebCrypto does the HMAC.
 */

/** 10 minutes. A token is valid for exactly this long and not a millisecond more. */
export const CONFIRM_TTL_MS = 10 * 60 * 1000;
const MIN_SECRET_LENGTH = 16;
const CONTEXT = "hauntology/confirm/v1\n";
const enc = new TextEncoder();
const dec = new TextDecoder();

export type ConfirmClaims = { imageId: string; imageHash: string; sid: string };
export type ConfirmCheck = { ok: true; issuedAt: number } | { ok: false; code: "bad_confirm" | "confirm_expired" };

async function key(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  if (secret.length < MIN_SECRET_LENGTH) throw new RangeError("confirm secret is too short");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

const signed = (payload: string): Uint8Array => enc.encode(`${CONTEXT}c1.${payload}`);

export async function signConfirm(claims: ConfirmClaims & { issuedAt: number }, secret: string): Promise<string> {
  const payload = toBase64Url(enc.encode(JSON.stringify({ i: claims.imageId, h: claims.imageHash, s: claims.sid, t: claims.issuedAt })));
  const mac = await crypto.subtle.sign("HMAC", await key(secret, "sign"), signed(payload));
  return `c1.${payload}.${toBase64Url(new Uint8Array(mac))}`;
}

const BAD: ConfirmCheck = { ok: false, code: "bad_confirm" };

/**
 * `ok` only when the token is ours, is for exactly these claims and is not older than 10 minutes. Anything
 * else is `bad_confirm`, except a token that is ours and for these claims but too old, which is
 * `confirm_expired` (so a refused token never tells a stranger whether it was once valid for someone else).
 */
export async function verifyConfirm(token: string, expected: ConfirmClaims, now: number, secret: string): Promise<ConfirmCheck> {
  if (typeof token !== "string" || token.length > 512) return BAD;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "c1") return BAD;
  const [, payload = "", mac = ""] = parts;
  const macBytes = fromBase64Url(mac);
  const payloadBytes = fromBase64Url(payload);
  if (macBytes === null || payloadBytes === null) return BAD;

  const valid = await crypto.subtle.verify("HMAC", await key(secret, "verify"), macBytes, signed(payload));
  if (!valid) return BAD;

  let claims: unknown;
  try {
    claims = JSON.parse(dec.decode(payloadBytes));
  } catch {
    return BAD;
  }
  const c = claims as { i?: unknown; h?: unknown; s?: unknown; t?: unknown } | null;
  if (c === null || typeof c !== "object") return BAD;
  if (c.i !== expected.imageId || c.h !== expected.imageHash || c.s !== expected.sid) return BAD;
  if (typeof c.t !== "number" || !Number.isFinite(c.t) || !Number.isFinite(now)) return BAD;
  if (c.t > now) return BAD; // issued in the future: not ours
  if (now - c.t > CONFIRM_TTL_MS) return { ok: false, code: "confirm_expired" };
  return { ok: true, issuedAt: c.t };
}

/** A short, stable name for a token (22 characters), kept on the world it started so the token cannot start another. */
export async function confirmIdOf(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`${CONTEXT}id\n${token}`)));
  return toBase64Url(digest.slice(0, 16));
}
