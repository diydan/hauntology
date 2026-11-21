/*
 * The phone Controller's service worker (party-mode 9.13): it keeps the page shell so the app opens from the home screen, and when the phone is
 * offline it shows a plain page that says how to rejoin. It never touches the Room: nothing under /api is cached or answered here, so a game
 * is always live, and no token or Room data is ever stored by it.
 */
const SHELL = "hauntology-party-shell-v1";
const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline</title></head><body style="font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.5"><h1>You are offline</h1><p>This phone cannot reach the game. Turn the connection back on, then open this page again. If the game is still going, your seat is taken again for you. If it is not, ask the Master for a new Room Code.</p></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(["/play"]).catch(() => undefined)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((n) => n.startsWith("hauntology-party-shell-") && n !== SHELL).map((n) => caches.delete(n)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/play").then((hit) => hit ?? new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }))));
  }
});
