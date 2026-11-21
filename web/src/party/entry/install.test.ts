import { describe, expect, it } from "vitest";
import manifestText from "../../../public/party.webmanifest?raw";
import swText from "../../../public/party-sw.js?raw";
import iconText from "../../../public/party-icon.svg?raw";
import playHtml from "../../../play.html?raw";

// The installable web app (party-mode 9.13): a manifest, a service worker with an offline shell that explains how to rejoin, and no way for the
// worker to hold a Room's data.
type Handler = (e: { request: { method: string; url: string; mode: string }; respondWith(p: Promise<unknown>): void; waitUntil(p: Promise<unknown>): void }) => void;

function boot(opts: { online: boolean; cached?: boolean }): { handlers: Record<string, Handler>; deleted: string[]; cacheNames: string[]; fetched: string[]; added: string[][]; skipped: () => boolean } {
  const handlers: Record<string, Handler> = {};
  const deleted: string[] = [];
  const fetched: string[] = [];
  const added: string[][] = [];
  let skip = false;
  const cacheNames = ["hauntology-party-shell-v0", "hauntology-party-shell-v1", "other-app"];
  const self = { location: { origin: "https://lab.example" }, addEventListener: (t: string, h: Handler) => { handlers[t] = h; }, skipWaiting: () => { skip = true; return Promise.resolve(); }, clients: { claim: () => Promise.resolve() } };
  const caches = {
    open: async () => ({ addAll: async (urls: string[]) => { added.push(urls); } }),
    keys: async () => cacheNames,
    delete: async (n: string) => { deleted.push(n); return true; },
    match: async (url: string) => (opts.cached && url === "/play" ? new Response("cached shell") : undefined),
  };
  const fetchFn = async (req: { url: string }) => { fetched.push(req.url); if (!opts.online) throw new Error("offline"); return new Response("live"); };
  new Function("self", "caches", "fetch", "URL", "Response", swText)(self, caches, fetchFn, URL, Response);
  return { handlers, deleted, cacheNames, fetched, added, skipped: () => skip };
}
const nav = (url = "https://lab.example/play") => ({ method: "GET", url, mode: "navigate" });

describe("installable web app (party-mode 9.13)", () => {
  it("has a manifest that opens the Controller standalone from the home screen, with an icon", () => {
    const m = JSON.parse(manifestText) as Record<string, unknown>;
    expect(m).toMatchObject({ name: "Hauntology", start_url: "/play", scope: "/play", display: "standalone" });
    const icons = m.icons as { src: string; type: string }[];
    expect(icons[0]).toMatchObject({ src: "/party-icon.svg", type: "image/svg+xml" });
    expect(iconText).toContain("<svg");
    expect(manifestText).not.toMatch(/token|code/i);
  });
  it("links the manifest from the phone page", () => {
    expect(playHtml).toContain('rel="manifest" href="/party.webmanifest"');
    expect(playHtml).toContain("controller-main.tsx");
    expect(playHtml).toContain("viewport-fit=cover");
  });
  it("keeps only the page shell, drops its own older shells on activate, and never touches another app's cache", async () => {
    const b = boot({ online: true });
    let installed: Promise<unknown> = Promise.resolve();
    b.handlers.install!({ request: nav(), respondWith: () => undefined, waitUntil: (p) => { installed = p; } });
    await installed;
    expect(b.added).toEqual([["/play"]]);
    expect(b.skipped()).toBe(true);
    let activated: Promise<unknown> = Promise.resolve();
    b.handlers.activate!({ request: nav(), respondWith: () => undefined, waitUntil: (p) => { activated = p; } });
    await activated;
    expect(b.deleted).toEqual(["hauntology-party-shell-v0"]);
  });
  it("never answers or caches anything under /api, another origin or a non-GET, so a game is always live", () => {
    const b = boot({ online: false });
    for (const req of [{ method: "GET", url: "https://lab.example/api/party/K7M2/ws", mode: "navigate" }, { method: "GET", url: "https://lab.example/api/voice/speak", mode: "cors" }, { method: "POST", url: "https://lab.example/play", mode: "navigate" }, { method: "GET", url: "https://elsewhere.example/play", mode: "navigate" }]) {
      let answered = false;
      b.handlers.fetch!({ request: req, respondWith: () => { answered = true; }, waitUntil: () => undefined });
      expect(answered, req.url).toBe(false);
    }
  });
  it("serves the page from the network when online, the cached shell when offline, and a plain offline page that says how to rejoin when there is none", async () => {
    const run = async (opts: { online: boolean; cached?: boolean }): Promise<Response> => {
      const b = boot(opts);
      let out: Promise<unknown> = Promise.resolve(null);
      b.handlers.fetch!({ request: nav(), respondWith: (p) => { out = p; }, waitUntil: () => undefined });
      return (await out) as Response;
    };
    expect(await (await run({ online: true })).text()).toBe("live");
    expect(await (await run({ online: false, cached: true })).text()).toBe("cached shell");
    const off = await run({ online: false });
    expect(off.status).toBe(503);
    const body = await off.text();
    expect(body).toContain("You are offline");
    expect(body).toContain("your seat is taken again for you");
    expect(body).toContain("ask the Master for a new Room Code");
  });
  it("stores nothing of a Room: no storage, no token, no Room Code in the worker", () => {
    expect(swText.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/token|localStorage|sessionStorage|indexedDB/i);
  });
});
