import { securityHeaders } from "@hauntology/shared/app/csp";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./env";

/**
 * Sets the Content-Security-Policy and the other security headers on every response the app
 * makes, including refusals. Turnstile's origin is named only when `TURNSTILE_SECRET` is set.
 */
export const securityHeadersMiddleware = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  await next();
  const turnstile = typeof c.env?.TURNSTILE_SECRET === "string" && c.env.TURNSTILE_SECRET !== "";
  for (const [name, value] of Object.entries(securityHeaders({ turnstile }))) c.res.headers.set(name, value);
};
