import type { ApiResult, ShellApi, WorldStatus } from "@hauntology/shared/app/api";
import { POLL_MAX_MS, pollPlan, stageOf } from "@hauntology/shared/app/stage";
import type { Route, Stage } from "@hauntology/shared/app/types";
import { routeForApiError } from "@hauntology/shared/app/routes";

/**
 * The Haunt screen's Stage display, without a DOM (Requirements 4.1, 4.4, 4.6, 4.7 and 10.3). It asks
 * `GET /api/worlds/:id` on the schedule of `pollPlan`, pauses while the tab is hidden, and says
 * honestly when the wait passes the expected maximum without ever cancelling the job.
 *
 * - The first poll is at once, hidden tab or not, so the screen shows a Stage as soon as it can.
 * - A rate limit moves the next poll to the end of it. Any other failure keeps the last Stage on
 *   screen, says it could not check, and tries again a few seconds later.
 * - A world that is gone (`world_not_found`, `session_expired`) is `gone`: the screen leaves for the
 *   Expired Screen. A world the visitor does not own looks the same, so ids cannot be probed.
 * - The wait is counted from when this controller began: the API does not say when the job started,
 *   so a reload starts the 15 minutes again.
 */

export type HauntUi = {
  /** `null` until the first answer. */
  stage: Stage | null;
  title: string | undefined;
  /** Present when the stage is `failed`. */
  failure: WorldStatus["failure"];
  overdue: boolean;
  /** The last check failed and the Stage on screen may be old. */
  stale: boolean;
  /** Where to go, when the world is gone. */
  leaveTo: Route | null;
};

export type Scheduler = {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
};

export type HauntDeps = {
  api: Pick<ShellApi, "world">;
  worldId: string;
  now: () => number;
  visible: () => boolean;
  /** Calls back when the tab is hidden or shown. Returns the way to stop. */
  onVisibility: (listener: () => void) => () => void;
  scheduler: Scheduler;
};

export type HauntController = {
  getSnapshot(): HauntUi;
  subscribe(listener: () => void): () => void;
  /** Starts polling. Calling it again does nothing, until `destroy` has been called. */
  begin(): void;
  /** Stops everything; a late answer changes nothing. */
  destroy(): void;
  /** Resolves when the poll in flight (if any) has finished, for tests. */
  settled(): Promise<void>;
};

export const browserScheduler: Scheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createHauntController(deps: HauntDeps): HauntController {
  const { api, worldId, now, scheduler } = deps;
  let ui: HauntUi = { stage: null, title: undefined, failure: undefined, overdue: false, stale: false, leaveTo: null };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<HauntUi>) => {
    ui = { ...ui, ...patch };
    for (const l of [...listeners]) l();
  };

  // Set by `begin`: the wait is counted from there.
  let startedAt = 0;
  let lastPollAt = 0;
  let rateLimitedUntil: number | null = null;
  let timer: unknown = null;
  let began = false;
  let alive = true;
  let inFlight: Promise<void> = Promise.resolve();
  let polling = false;
  let stopVisibility: (() => void) | null = null;

  const cancelTimer = () => {
    if (timer !== null) scheduler.clear(timer);
    timer = null;
  };

  /** Works out the next poll from what is known now, and sets (or clears) the timer. */
  const plan = (): void => {
    cancelTimer();
    if (!alive) return;
    const t = now();
    const p = pollPlan({ now: t, lastPollAt, visible: deps.visible(), stage: ui.stage ?? "queued", rateLimitedUntil, startedAt });
    if (p.overdue !== ui.overdue) set({ overdue: p.overdue });
    if (p.pollAt === null || polling) return;
    timer = scheduler.set(() => void poll(), Math.max(0, p.pollAt - t));
  };

  const poll = (): Promise<void> => {
    if (!alive) return inFlight;
    cancelTimer();
    polling = true;
    inFlight = (async () => {
      const result: ApiResult<WorldStatus> = await api.world(worldId);
      polling = false;
      if (!alive) return;
      lastPollAt = now();
      if (result.ok) {
        // A limit that has passed changes nothing: `pollPlan` takes the later of it and the usual gap.
        const stage = stageOf(result.value.status);
        set({ stage, title: result.value.title, failure: result.value.failure, stale: false });
      } else {
        const gone = routeForApiError(result.code);
        if (gone !== null) {
          set({ leaveTo: gone });
          alive = false;
          return;
        }
        // `retryAfterSec` is there for a 429; any other failure waits a little longer than a normal poll.
        rateLimitedUntil = lastPollAt + (result.retryAfterSec !== undefined ? result.retryAfterSec * 1000 : POLL_MAX_MS);
        set({ stale: true });
      }
      plan();
    })();
    return inFlight;
  };

  return {
    getSnapshot: () => ui,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    begin() {
      if (began) return;
      began = true;
      alive = true;
      startedAt = now();
      lastPollAt = startedAt;
      stopVisibility = deps.onVisibility(() => {
        if (!alive) return;
        // Hidden: stop the timer. Shown again: poll at once if one is due, else wait for the plan.
        plan();
      });
      void poll();
    },
    destroy() {
      alive = false;
      // A StrictMode remount may begin again; a world that is gone stays gone (it was `leaveTo`).
      began = ui.leaveTo !== null;
      cancelTimer();
      stopVisibility?.();
      stopVisibility = null;
    },
    settled: () => inFlight,
  };
}
