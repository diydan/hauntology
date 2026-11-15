/**
 * Cloudflare Turnstile, as a seam (Requirement 3.5, `world-pipeline` Requirement 4.5). The script is
 * fetched from Cloudflare's own address, only when the Confirm Gate is waiting for the check, and never
 * proxied, cached or self-hosted: Cloudflare's own documentation says doing any of those breaks the widget
 * when Cloudflare updates it. The page's policy lets that one origin in, and only when Turnstile is
 * configured (`shared/src/app/csp.ts`).
 *
 * `TurnstileApi` is the small part of `window.turnstile` the shell uses. The real loader and the demo
 * stand-in both give one, so the Gate cannot tell them apart.
 */
export const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** How long the script may take before the Gate says the check could not load. */
export const TURNSTILE_LOAD_MS = 15_000;

export type TurnstileOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  theme?: "dark" | "light" | "auto";
};

export type TurnstileApi = {
  render(container: HTMLElement, options: TurnstileOptions): string;
  remove(widgetId: string): void;
  reset(widgetId: string): void;
};

export type LoadTurnstile = () => Promise<TurnstileApi>;

type TurnstileWindow = Window & { turnstile?: TurnstileApi };

/** One load at a time: a second call while the script is loading, or after it loaded, shares the answer. A failure is forgotten, so "Try again" loads afresh. */
let pending: Promise<TurnstileApi> | null = null;

export function loadTurnstileScript(doc: Document = document, win: TurnstileWindow = window as TurnstileWindow, timeoutMs: number = TURNSTILE_LOAD_MS): Promise<TurnstileApi> {
  if (win.turnstile) return Promise.resolve(win.turnstile);
  if (pending !== null) return pending;
  pending = new Promise<TurnstileApi>((resolve, reject) => {
    const script = doc.createElement("script");
    const done = (fn: () => void) => {
      clearTimeout(timer);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
      fn();
    };
    const fail = (why: string) =>
      done(() => {
        script.remove();
        pending = null;
        reject(new Error(why));
      });
    const onLoad = () => (win.turnstile ? done(() => resolve(win.turnstile as TurnstileApi)) : fail("turnstile missing"));
    const onError = () => fail("turnstile script failed");
    const timer = setTimeout(() => fail("turnstile script timed out"), timeoutMs);
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    // Not `crossOrigin`, `integrity` or `nonce`: the script must be Cloudflare's own, current file.
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    doc.head.append(script);
  });
  return pending;
}

/** For tests: forgets a load in flight. */
export function resetTurnstileLoader(): void {
  pending = null;
}
