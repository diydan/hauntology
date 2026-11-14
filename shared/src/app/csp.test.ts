import { describe, expect, it } from "vitest";
import { PERMISSIONS_POLICY, TURNSTILE_ORIGIN, buildCsp, securityHeaders } from "./csp";

const parse = (csp: string): Map<string, string[]> =>
  new Map(csp.split("; ").map((d) => { const [name, ...sources] = d.split(" "); return [name!, sources] as const; }));

describe("buildCsp", () => {
  it("allows no inline script, no eval and no inline style, with or without Turnstile", () => {
    for (const turnstile of [false, true]) {
      const csp = buildCsp({ turnstile });
      expect(csp).not.toContain("'unsafe-inline'");
      expect(csp).not.toContain("'unsafe-eval'");
      expect(csp).not.toContain("*");
      expect(csp).not.toMatch(/(^|[ ;])(https?|wss?):(?!\/\/challenges\.cloudflare\.com)/);
    }
  });

  it("starts from nothing and lets in only this origin, blob: and, for WebAssembly, wasm-unsafe-eval", () => {
    const d = parse(buildCsp({ turnstile: false }));
    expect(d.get("default-src")).toEqual(["'none'"]);
    expect(d.get("script-src")).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    expect(d.get("connect-src")).toEqual(["'self'"]);
    expect(d.get("font-src")).toEqual(["'self'"]);
    expect(d.get("img-src")).toEqual(["'self'", "blob:"]);
    expect(d.get("frame-src")).toEqual(["'none'"]);
    for (const [name, sources] of d) {
      for (const s of sources) expect(["'none'", "'self'", "blob:", "'wasm-unsafe-eval'"], `${name} ${s}`).toContain(s);
    }
    // wasm-unsafe-eval is for script only.
    for (const [name, sources] of d) if (name !== "script-src") expect(sources).not.toContain("'wasm-unsafe-eval'");
  });

  it("closes the page to plugins, base tags, framing and foreign forms", () => {
    const d = parse(buildCsp({ turnstile: false }));
    expect(d.get("object-src")).toEqual(["'none'"]);
    expect(d.get("base-uri")).toEqual(["'none'"]);
    expect(d.get("frame-ancestors")).toEqual(["'none'"]);
    expect(d.get("form-action")).toEqual(["'self'"]);
  });

  it("names Cloudflare's own origin only when Turnstile is configured, and only for script and frame", () => {
    expect(buildCsp({ turnstile: false })).not.toContain("challenges.cloudflare.com");
    const d = parse(buildCsp({ turnstile: true }));
    const withOrigin = [...d].filter(([, sources]) => sources.includes(TURNSTILE_ORIGIN)).map(([name]) => name).sort();
    expect(withOrigin).toEqual(["frame-src", "script-src"]);
    expect(d.get("frame-src")).toEqual([TURNSTILE_ORIGIN]);
    expect(TURNSTILE_ORIGIN).toBe("https://challenges.cloudflare.com");
  });
});

describe("securityHeaders", () => {
  it("carries the policy, nosniff, no referrer and a permissions policy", () => {
    const h = securityHeaders({ turnstile: false });
    expect(h["Content-Security-Policy"]).toBe(buildCsp({ turnstile: false }));
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("no-referrer");
    expect(h["Permissions-Policy"]).toBe(PERMISSIONS_POLICY);
    expect(Object.keys(h).sort()).toEqual(["Content-Security-Policy", "Permissions-Policy", "Referrer-Policy", "X-Content-Type-Options"]);
  });

  it("allows the microphone and location to this origin only, and the camera to nobody", () => {
    expect(PERMISSIONS_POLICY).toContain("microphone=(self)");
    expect(PERMISSIONS_POLICY).toContain("geolocation=(self)");
    expect(PERMISSIONS_POLICY).toContain("camera=()");
    expect(PERMISSIONS_POLICY).not.toContain("*");
  });
});
