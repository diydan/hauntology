import { toBase64Url } from "../session-cookie";

/**
 * The dedup key and the world id (world-pipeline Requirement 6, task 3.10).
 *
 * `worldKey` is a function of the image and the options and nothing else: the same picture with the same
 * options always has the same key. `deriveWorldId` turns (Session, key, attempt) into the world's id: the
 * same Session asking for the same world gets the same id, so a repeat request finds the world it already
 * has instead of starting another. The id is an HMAC, so it cannot be worked out without the secret, and it
 * has 128 bits (16 bytes of the MAC, written as 22 characters; Requirement 9.4 asks for at least 128).
 *
 * Dedup is per Session on purpose: a world is private to the Session that made it (shell "World access"),
 * so handing Session B the world of Session A for the same picture would give B a world B cannot open.
 */

export type WorldOptions = { enhance: boolean };
export const normaliseOptions = (o: Partial<WorldOptions> | undefined): WorldOptions => ({ enhance: o?.enhance === true });

const HASH = /^[0-9a-f]{64}$/;
const enc = new TextEncoder();
const hex = (bytes: Uint8Array): string => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/** `imageHash` is the lowercase hex SHA-256 of the stored image bytes. */
export async function worldKey(imageHash: string, options?: Partial<WorldOptions>): Promise<string> {
  if (!HASH.test(imageHash)) throw new RangeError("imageHash must be 64 lowercase hex characters");
  const o = normaliseOptions(options);
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`world/v1|${imageHash}|enhance=${o.enhance ? 1 : 0}`))));
}

/** `w-` and 22 URL-safe characters (the first 16 bytes of the MAC: 128 bits). `attempt` is 0 for the first try and goes up after a failed world. */
export async function deriveWorldId(sid: string, key: string, attempt: number, secret: string): Promise<string> {
  if (secret.length < 16) throw new RangeError("world id secret is too short");
  if (!Number.isInteger(attempt) || attempt < 0) throw new RangeError("attempt must be a non-negative integer");
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(`hauntology/world-id/v1\n${sid}\n${key}\n${attempt}`)));
  return `w-${toBase64Url(mac.slice(0, 16))}`;
}
