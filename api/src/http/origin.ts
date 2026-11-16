import { isAllowedOrigin, parseOriginList } from "@hauntology/shared/origin";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./env";

/**
 * Refuses a state-changing request (anything but GET, HEAD and OPTIONS) whose `Origin` is not the
 * origin it was sent to, or a listed development origin. It runs before the Session middleware, so
 * a refused request neither creates a Session nor sets a cookie.
 */
export const originGuard = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  if (!isAllowedOrigin(c.req.header("Origin"), c.req.url, parseOriginList(c.env?.ALLOWED_ORIGINS))) {
    return c.json({ ok: false, code: "bad_origin" }, 403);
  }
  return next();
};
