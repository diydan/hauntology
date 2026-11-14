import type { Scheduler } from "../app/haunt/controller";

/** A clock and a scheduler a test moves by hand, so polling is exact and no real timer runs. */
export function manualClock(start = Date.UTC(2026, 10, 15, 14, 30)) {
  let t = start;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const scheduler: Scheduler = {
    set: (fn, ms) => {
      if (ms < 0) throw new Error(`a timer was set with a negative delay (${ms})`);
      const id = nextId++;
      timers.set(id, { at: t + ms, fn });
      return id;
    },
    clear: (h) => void timers.delete(h as number),
  };
  const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  return {
    now: () => t,
    scheduler,
    timers,
    pending: () => [...timers.values()].map((x) => x.at - t).sort((a, b) => a - b),
    /** Moves time forward, firing every timer that falls due on the way, and lets answers settle. */
    async advance(ms: number) {
      const end = t + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) break;
        timers.delete(due[0]);
        t = Math.max(t, due[1].at);
        due[1].fn();
        await flush();
      }
      t = end;
      await flush();
    },
  };
}
