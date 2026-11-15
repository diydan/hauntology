import { buildCsp } from "@hauntology/shared/app/csp";
import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { isServerPath, type AssetsPort } from "./assets";
import type { Bindings } from "./env";
import { SILENT, type Logger } from "../log";

const ORIGIN = "http://app.test";
const ENV: Bindings = { HMAC_SECRET: "test-secret-0123456789abcdef-test" };
const INDEX = '<!doctype html><html><body><div id="root"></div><script type="module" src="/assets/index-abc.js"></script></body></html>';

/** What the real binding does with an answer: its headers cannot be changed. */
class FrozenHeaders extends Headers {
  override set(): never {
    throw new TypeError("Can't modify immutable headers");
  }
  override append(): never {
    throw new TypeError("Can't modify immutable headers");
  }
  override delete(): never {
    throw new TypeError("Can't modify immutable headers");
  }
}
const frozen = (body: string | null, headers: Record<string, string>, status = 200): Response => {
  const r = new Response(body, { status, headers });
  Object.defineProperty(r, "headers", { value: new FrozenHeaders(Object.entries(headers)) });
  return r;
};

/**
 * A stand-in for the `ASSETS` binding as it is configured: files by path, and `index.html` with a 200 for every other path, a file that is not
 * there included (the single-page fallback; seen on `wrangler dev` and in Cloudflare's documentation). Only `/assets/index-abc.js`, `/docs/guide.html` and `/robots.txt` exist.
 */
const fakeAssets = () => {
  const calls: Request[] = [];
  const port: AssetsPort = {
    async fetch(request) {
      calls.push(request);
      const path = new URL(request.url).pathname;
      if (path === "/assets/index-abc.js") return frozen(request.method === "HEAD" ? null : "export {}", { "Content-Type": "text/javascript; charset=utf-8", ETag: '"js1"' });
      if (path === "/docs/guide.html") return frozen("<html>guide</html>", { "Content-Type": "text/html; charset=utf-8" });
      if (path === "/robots.txt") return frozen("User-agent: *", { "Content-Type": "text/plain; charset=utf-8" });
      return frozen(request.method === "HEAD" ? null : INDEX, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate" });
    },
  };
  return { port, calls };
};
const appWith = (port: AssetsPort, log?: Logger) => createApp({ assets: port, ...(log !== undefined ? { log } : {}) });

describe("serving the web app (world-pipeline task 2)", () => {
  it("answers a page with the app's index and the security headers, passing the request on as it came", async () => {
    const { port, calls } = fakeAssets();
    const res = await appWith(port).request(`${ORIGIN}/`, {}, ENV);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(INDEX);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    expect(res.headers.get("Content-Security-Policy")).toBe(buildCsp({ turnstile: false }));
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("Permissions-Policy")).toContain("microphone=(self)");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("GET");
    expect(new URL(calls[0]?.url ?? "").pathname).toBe("/");
  });

  it("opens the app at a deep link such as a share link, and at any page that is not a file", async () => {
    const { port, calls } = fakeAssets();
    const app = appWith(port);
    for (const path of ["/shared/w-0123456789abcdef", "/haunt/w-x", "/gallery", "/expired", "/no/such/page", "/shared/w-x?utm=1"]) {
      const res = await app.request(`${ORIGIN}${path}`, { headers: { "Sec-Fetch-Mode": "navigate" } }, ENV);
      expect(res.status, path).toBe(200);
      expect(await res.text(), path).toBe(INDEX);
      expect(res.headers.get("Content-Security-Policy"), path).toBe(buildCsp({ turnstile: false }));
    }
    expect(calls.map((c) => c.url.replace(ORIGIN, ""))).toEqual(["/shared/w-0123456789abcdef", "/haunt/w-x", "/gallery", "/expired", "/no/such/page", "/shared/w-x?utm=1"]);
  });

  it("serves a file as it is, with the headers the binding gave and the security headers added", async () => {
    const { port } = fakeAssets();
    const app = appWith(port);
    const js = await app.request(`${ORIGIN}/assets/index-abc.js`, {}, ENV);
    expect(js.status).toBe(200);
    expect(await js.text()).toBe("export {}");
    expect(js.headers.get("Content-Type")).toBe("text/javascript; charset=utf-8");
    expect(js.headers.get("ETag")).toBe('"js1"');
    expect(js.headers.get("Content-Security-Policy")).toBe(buildCsp({ turnstile: false }));
    const txt = await app.request(`${ORIGIN}/robots.txt`, {}, ENV);
    expect(txt.status).toBe(200);
    expect(await txt.text()).toBe("User-agent: *");
  });

  it("answers a file that is not there with a 404, never with the page the fallback would give (an old tab asking for a retired script)", async () => {
    const { port, calls } = fakeAssets();
    const app = appWith(port);
    for (const path of ["/assets/index-OLDHASH.js", "/assets/index-OLDHASH.css", "/assets/font-9.woff2", "/favicon.ico", "/sitemap.xml", "/media/clip.mp4", "/a/b/c.JS", "/x.a1B2c3D4", "/assets/missing.js?v=2"]) {
      for (const mode of ["navigate", "no-cors", "cors"]) {
        const res = await app.request(`${ORIGIN}${path}`, { headers: { "Sec-Fetch-Mode": mode } }, ENV);
        expect(res.status, `${mode} ${path}`).toBe(404);
        expect(await res.text(), `${mode} ${path}`).toBe("404 Not Found");
        expect(res.headers.get("Content-Type"), path).toContain("text/plain");
        expect(res.headers.get("Content-Security-Policy"), path).toBe(buildCsp({ turnstile: false }));
      }
    }
    expect(calls.length).toBe(27);
  });

  it("still opens the app for a page, and for a .html file as it is: only a name that ends like a file is a file", async () => {
    const { port } = fakeAssets();
    const app = appWith(port);
    expect(await (await app.request(`${ORIGIN}/docs/guide.html`, {}, ENV)).text()).toBe("<html>guide</html>");
    for (const path of ["/shared/w-0123456789abcdef", "/gallery/", "/shared/w_x-y", "/.well-known", "/a.b/c", "/page.", "/x.123456789", "/x.tar-gz"]) {
      const res = await app.request(`${ORIGIN}${path}`, {}, ENV);
      expect(res.status, path).toBe(200);
      expect(await res.text(), path).toBe(INDEX);
    }
  });

  it("names Turnstile's origin on the page only when it is set up", async () => {
    const { port } = fakeAssets();
    const app = appWith(port);
    expect((await app.request(`${ORIGIN}/`, {}, { ...ENV, TURNSTILE_SECRET: "s3cret" })).headers.get("Content-Security-Policy")).toBe(buildCsp({ turnstile: true }));
    expect((await app.request(`${ORIGIN}/`, {}, ENV)).headers.get("Content-Security-Policy")).toBe(buildCsp({ turnstile: false }));
  });

  it("answers HEAD from the app too, with no body", async () => {
    const { port, calls } = fakeAssets();
    const res = await appWith(port).request(`${ORIGIN}/gallery`, { method: "HEAD" }, ENV);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
    expect(res.headers.get("Content-Security-Policy")).toBe(buildCsp({ turnstile: false }));
    expect(calls.map((c) => c.method)).toEqual(["HEAD"]);
  });

  it("makes no Session and sets no cookie for a page or a file", async () => {
    const { port } = fakeAssets();
    const app = appWith(port);
    for (const path of ["/", "/shared/w-x", "/assets/index-abc.js"]) expect((await app.request(`${ORIGIN}${path}`, {}, ENV)).headers.get("Set-Cookie"), path).toBeNull();
  });

  it("never answers an /api or /admin path with the page, and never asks the binding about one", async () => {
    const { port, calls } = fakeAssets();
    const app = appWith(port);
    for (const path of ["/api", "/api/", "/api/nothing-here", "/api/worlds/nothing/deeper/still", "/admin", "/admin/", "/admin/status", "/admin/kill", "/api/../api/x", "/./api/x"]) {
      for (const method of ["GET", "HEAD", "POST", "DELETE"]) {
        const res = await app.request(`${ORIGIN}${path}`, { method, headers: { Origin: ORIGIN, "Sec-Fetch-Mode": "navigate" } }, ENV);
        expect(res.status, `${method} ${path}`).toBe(404);
        expect(await res.text(), `${method} ${path}`).not.toContain("root");
        expect(res.headers.get("Content-Security-Policy"), `${method} ${path}`).toBe(buildCsp({ turnstile: false }));
      }
    }
    expect(calls).toHaveLength(0);
  });

  it("serves a path that only starts like /api or /admin from the app", async () => {
    const { port, calls } = fakeAssets();
    const app = appWith(port);
    for (const path of ["/apis", "/api-docs", "/administrator", "/admin-panel", "/apiary/x"]) expect(await (await app.request(`${ORIGIN}${path}`, {}, ENV)).text(), path).toBe(INDEX);
    expect(calls).toHaveLength(5);
  });

  it("keeps the routes of the API: a route wins over the app, and a Session cookie is still made for the API", async () => {
    const { port, calls } = fakeAssets();
    const res = await appWith(port).request(`${ORIGIN}/api/session`, {}, ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Set-Cookie")).not.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("refuses any method but GET and HEAD on a page, and does not pass it on", async () => {
    const { port, calls } = fakeAssets();
    const app = appWith(port);
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const res = await app.request(`${ORIGIN}/shared/w-x`, { method }, ENV);
      expect(res.status, method).toBe(405);
      expect(res.headers.get("Allow"), method).toBe("GET, HEAD");
      expect(res.headers.get("Content-Security-Policy"), method).toBe(buildCsp({ turnstile: false }));
    }
    expect(calls).toHaveLength(0);
  });

  it("is a plain 404 for every path when the app is not configured, as before", async () => {
    const app = createApp();
    for (const path of ["/", "/gallery", "/assets/index-abc.js"]) expect((await app.request(`${ORIGIN}${path}`, {}, ENV)).status, path).toBe(404);
  });

  it("is a plain 500, with one line that names no path, when the binding fails", async () => {
    const lines: Array<{ event: string; fields: unknown }> = [];
    const log: Logger = { ...SILENT, error: (event, fields) => void lines.push({ event, fields }) };
    const app = appWith({ fetch: async () => { throw new Error("secret path /shared/w-private"); } }, log);
    const res = await app.request(`${ORIGIN}/shared/w-private`, {}, ENV);
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Internal Server Error");
    expect(JSON.stringify(lines)).not.toContain("w-private");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.event).toBe("request.error");
  });
});

describe("isServerPath", () => {
  it("is true for /api and /admin and everything under them, and for nothing else", () => {
    for (const p of ["/api", "/api/", "/api/x", "/api/worlds/w-1/assets/a.spz", "/admin", "/admin/", "/admin/status"]) expect(isServerPath(p), p).toBe(true);
    for (const p of ["/", "/apis", "/api-x", "/administrator", "/admin-x", "/x/api", "/shared/api", "/API/x", "/Admin", "//api/x", "/api%2Fx"]) expect(isServerPath(p), p).toBe(false);
  });
});
