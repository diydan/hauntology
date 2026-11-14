/**
 * The origin check for state-changing requests (security rule: session cookie plus origin check).
 * A request is allowed when its `Origin` header is exactly the origin it was sent to, or one of the
 * extra origins configured for development. A missing header, `null` and every near miss
 * (another scheme, host or port, a trailing slash, a different case) are refused.
 */
export function isAllowedOrigin(origin: string | undefined, requestUrl: string, extraOrigins: readonly string[] = []): boolean {
  if (origin === undefined || origin === "" || origin === "null") return false;
  let own: string;
  try {
    own = new URL(requestUrl).origin;
  } catch {
    return false;
  }
  return origin === own || extraOrigins.includes(origin);
}

/** `ALLOWED_ORIGINS` is a comma-separated list. Blank entries are dropped. */
export const parseOriginList = (value: string | undefined): string[] =>
  (value ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "");
