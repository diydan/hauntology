import type { NotFoundHandler } from "hono";
import type { AppEnv } from "./env";

/**
 * The built web app, as the Worker's `ASSETS` binding gives it (Workers static assets over `web/dist`). Only `fetch` is used. With
 * `not_found_handling = "single-page-application"` the binding answers `index.html` for a page a visitor asks for (a navigation) that
 * is not a file, so a link such as `/shared/<id>` opens the app; a file that is not there is a plain 404.
 */
export type AssetsPort = { fetch(request: Request): Promise<Response> };

/** Paths that belong to the Worker, never to the app: an unknown one is a 404, not the app's page. `/admin` exists only with a token. */
export const isServerPath = (pathname: string): boolean => /^\/(?:api|admin)(?:\/|$)/.test(pathname);

/**
 * What the Worker does with a request no route took (world-pipeline task 2). With the app configured `run_worker_first`, every request
 * comes here first, so every page carries the security headers (`securityHeadersMiddleware` runs around this handler and puts the
 * Content-Security-Policy on the page, naming Turnstile only when it is set up; a static file of headers could not do that).
 * - `/api` and `/admin` paths are the Worker's: a 404 with the plain text Hono gives, whatever the binding holds.
 * - Only `GET` and `HEAD` are answered from the app; any other method on a page path is a 405, and is not passed on.
 * - The request goes to the binding as it came (no cookie is read or made: a page needs no Session). The answer is copied so its
 *   headers can be changed, because the headers of an answer from a binding are read-only.
 * - A path that names a file (it ends in a dot and one to eight letters or digits: `.js`, `.css`, `.woff2`, `.ico`) that is not there gets
 *   the 404 it deserves. The binding, set to the single-page fallback and run after the Worker, answers every missing path with the app's
 *   page and a 200, whatever asked: an old tab asking for `/assets/index-OLDHASH.js` would be given HTML under a script's name. The app's
 *   own pages have no dot in them (a world id is letters, digits, `_` and `-`). A path ending in `.html` is passed on as it is.
 */
const NAMES_A_FILE = /\.[A-Za-z0-9]{1,8}$/;
const NAMES_A_PAGE = /\.html?$/i;

export const servePage = (assets: AssetsPort): NotFoundHandler<AppEnv> => async (c) => {
  const pathname = new URL(c.req.url).pathname;
  if (isServerPath(pathname)) return c.text("404 Not Found", 404);
  const method = c.req.method;
  if (method !== "GET" && method !== "HEAD") return c.text("Method Not Allowed", 405, { Allow: "GET, HEAD" });
  const answer = await assets.fetch(c.req.raw);
  if (NAMES_A_FILE.test(pathname) && !NAMES_A_PAGE.test(pathname) && (answer.headers.get("Content-Type") ?? "").toLowerCase().startsWith("text/html")) {
    await answer.body?.cancel();
    return c.text("404 Not Found", 404);
  }
  return new Response(answer.body, answer);
};
