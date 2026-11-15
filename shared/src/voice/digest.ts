import type { Digest } from "./key";

/**
 * SHA-256 as 64 lowercase hex characters, using the Web Crypto API that both Node 20+ and Cloudflare Workers provide.
 * Passed to the key functions in `key.ts`, which stay pure because they never touch `crypto` themselves.
 */
export const sha256Hex: Digest = async (data: string): Promise<string> => {
  const bytes = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
};
