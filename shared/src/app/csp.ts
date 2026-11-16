/**
 * The Content-Security-Policy and the other security headers for the app's own responses.
 *
 * The rules (shell design, "Security and privacy"): no inline script, nothing from a third-party
 * origin, no analytics, trackers or third-party fonts. The one exception is Turnstile, whose script
 * and frame come from Cloudflare's own origin and are allowed only when Turnstile is configured.
 *
 * - `'wasm-unsafe-eval'` is in `script-src` for WebAssembly (the splat renderer). It does not allow
 *   `eval` or inline script.
 * - `style-src 'self'` allows no inline `<style>` or `style=""` in the HTML. React sets styles
 *   through the CSS object model, which a policy does not block.
 * - `blob:` is for an upload preview, a sketch and a spoken line, all made in the browser.
 *
 * Spike note: if the Viewer's renderer turns out to need another source (for example a worker
 * from `data:`), widen it here, in one place, with a test.
 */

export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

export type SecurityOptions = {
  /** Turnstile is configured, so its script and frame may load. */
  turnstile: boolean;
};

export function buildCsp({ turnstile }: SecurityOptions): string {
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'none'"]],
    ["script-src", ["'self'", "'wasm-unsafe-eval'", ...(turnstile ? [TURNSTILE_ORIGIN] : [])]],
    ["style-src", ["'self'"]],
    ["img-src", ["'self'", "blob:"]],
    ["font-src", ["'self'"]],
    ["connect-src", ["'self'"]],
    ["media-src", ["'self'", "blob:"]],
    ["worker-src", ["'self'", "blob:"]],
    ["frame-src", turnstile ? [TURNSTILE_ORIGIN] : ["'none'"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'none'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  return directives.map(([name, sources]) => `${name} ${sources.join(" ")}`).join("; ");
}

/**
 * The microphone is for the held Talk Button and Stitch, location only after an explicit
 * "Use my location" tap, and the camera for the selfie, the relic scan and the optional backdrop of the
 * Spirit clues (puzzles spec 15.10), each only after the Player's own tap. All three are allowed to this
 * origin and to no frame. Everything else is off.
 */
export const PERMISSIONS_POLICY = "microphone=(self), geolocation=(self), camera=(self), payment=(), usb=(), bluetooth=(), serial=(), interest-cohort=()";

export function securityHeaders(options: SecurityOptions): Record<string, string> {
  return {
    "Content-Security-Policy": buildCsp(options),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": PERMISSIONS_POLICY,
  };
}
