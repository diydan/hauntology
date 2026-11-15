import { describe, expect, it } from "vitest";
import { CloudflareTurnstile } from "./turnstile";

const answer = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });

describe("CloudflareTurnstile", () => {
  it("sends the secret, the token and the address to the siteverify address, and says yes to success true", async () => {
    let seen: { url: string; body: URLSearchParams; method: string } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, body: init.body as URLSearchParams, method: init.method as string };
      return new Response(JSON.stringify({ success: true }));
    }) as unknown as typeof fetch;
    expect(await new CloudflareTurnstile("the-secret", f).verify("the-token", "203.0.113.9")).toBe(true);
    expect(seen).not.toBeNull();
    const s = seen as unknown as { url: string; body: URLSearchParams; method: string };
    expect(s.url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(s.method).toBe("POST");
    expect(Object.fromEntries(s.body)).toEqual({ secret: "the-secret", response: "the-token", remoteip: "203.0.113.9" });
  });

  it("leaves the address out when it is not known", async () => {
    let body: URLSearchParams | null = null;
    const f = (async (_u: string, init: RequestInit) => { body = init.body as URLSearchParams; return new Response('{"success":true}'); }) as unknown as typeof fetch;
    await new CloudflareTurnstile("s", f).verify("t", null);
    await new CloudflareTurnstile("s", f).verify("t", "");
    expect(Object.fromEntries(body as unknown as URLSearchParams)).toEqual({ secret: "s", response: "t" });
  });

  it("says no to anything that is not exactly success true", async () => {
    for (const reply of [{ success: false }, {}, { success: "true" }, { success: 1 }, null, [], "yes", { success: false, "error-codes": ["timeout-or-duplicate"] }]) {
      expect(await new CloudflareTurnstile("s", answer(reply) as unknown as typeof fetch).verify("t", null), JSON.stringify(reply)).toBe(false);
    }
  });

  it("says no to a bad status, a body that is not JSON and a network error", async () => {
    expect(await new CloudflareTurnstile("s", answer({ success: true }, 500) as unknown as typeof fetch).verify("t", null)).toBe(false);
    expect(await new CloudflareTurnstile("s", (async () => new Response("<html>")) as unknown as typeof fetch).verify("t", null)).toBe(false);
    expect(await new CloudflareTurnstile("s", (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch).verify("t", null)).toBe(false);
  });

  it("says no when Cloudflare does not answer in time", async () => {
    const hang = ((_u: string, init: RequestInit) => new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))))) as unknown as typeof fetch;
    expect(await new CloudflareTurnstile("s", hang, 20).verify("t", null)).toBe(false);
  });
});
