/**
 * Helpers for the `*.live.test.ts` files, which run the world routes against a Worker that is already running
 * (`wrangler dev -c wrangler.check.jsonc`, see `dev/check-worker.ts`) when `LIVE_URL` is set, and are skipped otherwise.
 */
export const LIVE_URL: string | undefined = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.LIVE_URL;

export type LiveReply = { status: number; headers: Headers; text: string; json: unknown };
export type LiveVisitor = { headers: Record<string, string>; sid: string };

export function liveKit(base: string) {
  const origin = new URL(base).origin;

  const send = async (path: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}): Promise<LiveReply> => {
    const headers = { ...(init.headers ?? {}), ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) };
    const res = await fetch(`${base}${path}`, { method: init.method ?? "GET", headers, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) });
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, text, json };
  };

  /** A visitor with a Session of their own; the Session id is read from the cookie payload (not verified: tests only). */
  const visitor = async (): Promise<LiveVisitor> => {
    const res = await send("/api/session");
    const cookie = (res.headers.get("Set-Cookie") as string).split(";")[0] as string;
    const payload = cookie.slice(cookie.indexOf("=") + 1).split(".")[1] as string;
    const sid = (JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { sid: string }).sid;
    return { headers: { Cookie: cookie, Origin: origin }, sid };
  };

  const anonymous = (): Record<string, string> => ({ Origin: origin });
  const dev = (path: string, body: unknown = {}) => send(`/dev/${path}`, { method: "POST", body });
  /** A name no earlier run used, so a persisted dev state does not get in the way. */
  const unique = (prefix: string): string => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  return { send, visitor, anonymous, dev, unique, origin };
}
