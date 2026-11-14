import { buildCsp } from "@hauntology/shared/app/csp";
import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import type { Bindings } from "./env";

const ORIGIN = "http://app.test";
const ENV: Bindings = { HMAC_SECRET: "test-secret-0123456789abcdef-test" };

describe("security headers", () => {
  const app = createApp();

  it("sets the policy on a normal answer, without Turnstile by default", async () => {
    const res = await app.request(`${ORIGIN}/api/session`, {}, ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Security-Policy")).toBe(buildCsp({ turnstile: false }));
    expect(res.headers.get("Content-Security-Policy")).not.toContain("challenges.cloudflare.com");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("Permissions-Policy")).toContain("microphone=(self)");
  });

  it("names Turnstile's origin only when TURNSTILE_SECRET is set and not empty", async () => {
    const on = await app.request(`${ORIGIN}/api/session`, {}, { ...ENV, TURNSTILE_SECRET: "s3cret" });
    expect(on.headers.get("Content-Security-Policy")).toBe(buildCsp({ turnstile: true }));
    for (const value of ["", undefined]) {
      const off = await app.request(`${ORIGIN}/api/session`, {}, { ...ENV, TURNSTILE_SECRET: value });
      expect(off.headers.get("Content-Security-Policy"), String(value)).toBe(buildCsp({ turnstile: false }));
    }
  });

  it("sets the policy on a refusal and on an unknown path too", async () => {
    const refused = await app.request(`${ORIGIN}/api/session/ack-notice`, { method: "POST", headers: { Origin: "http://evil.test" } }, ENV);
    expect(refused.status).toBe(403);
    expect(refused.headers.get("Content-Security-Policy")).toBe(buildCsp({ turnstile: false }));
    expect(refused.headers.get("Set-Cookie")).toBeNull();

    const missing = await app.request(`${ORIGIN}/nothing-here`, {}, ENV);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Content-Security-Policy")).toBe(buildCsp({ turnstile: false }));
  });
});
