import type { TurnstileVerifier } from "./ports";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Cloudflare Turnstile server-side check. It fails closed: a timeout, a network error, a bad status or an
 * answer that is not exactly `{"success": true}` is a no. It sends the secret and the visitor's own token
 * (and their address, when known) to Cloudflare and nothing else.
 */
export class CloudflareTurnstile implements TurnstileVerifier {
  constructor(
    private readonly secret: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 4000,
  ) {}

  async verify(token: string, ip: string | null): Promise<boolean> {
    try {
      const body = new URLSearchParams({ secret: this.secret, response: token });
      if (ip !== null && ip !== "") body.set("remoteip", ip);
      const res = await this.fetchImpl(SITEVERIFY, { method: "POST", body, signal: AbortSignal.timeout(this.timeoutMs) });
      if (!res.ok) return false;
      const json = (await res.json()) as { success?: unknown };
      return json !== null && typeof json === "object" && json.success === true;
    } catch {
      return false;
    }
  }
}
