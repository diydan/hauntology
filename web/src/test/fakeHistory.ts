import type { HistoryLike } from "../app/router";

/** A browser history in memory: a stack of paths, a position, and Back and Forward. */
export function fakeHistory(start: string) {
  const stack = [start];
  let at = 0;
  const listeners = new Set<() => void>();
  const h: HistoryLike & { back(): void; forward(): void; stack: string[] } = {
    path: () => stack[at]!,
    push(p) { stack.splice(at + 1); stack.push(p); at++; },
    replace(p) { stack[at] = p; },
    listen(cb) { listeners.add(cb); return () => void listeners.delete(cb); },
    back() { if (at > 0) { at--; for (const l of [...listeners]) l(); } },
    forward() { if (at < stack.length - 1) { at++; for (const l of [...listeners]) l(); } },
    stack,
  };
  return h;
}
