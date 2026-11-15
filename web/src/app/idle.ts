/**
 * Runs `run` when the browser is idle: `requestIdleCallback` with a 1 s limit, or a 1 s timer where
 * it does not exist (Safari). Returns the way to cancel. Used to prefetch the Gallery list after
 * Home is shown (Requirement 10.4).
 */
export const IDLE_TIMEOUT_MS = 1000;

type IdleEnv = {
  requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

export function whenIdle(run: () => void, env: IdleEnv = globalThis as IdleEnv): () => void {
  if (typeof env.requestIdleCallback === "function") {
    const id = env.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    return () => env.cancelIdleCallback?.(id);
  }
  const timer = setTimeout(run, IDLE_TIMEOUT_MS);
  return () => clearTimeout(timer);
}
