import type { ShellApi } from "@hauntology/shared/app/api";
import { confirmReduce, confirmStart } from "@hauntology/shared/app/confirm";
import type { ConfirmEffect, ConfirmEvent, ConfirmState, FlowState, QuotaSnapshot, Route } from "@hauntology/shared/app/types";

/**
 * The Confirm Gate's work, without a DOM (Requirements 3.1 to 3.7). It runs the effects that
 * `confirmReduce` returns, one after another, and feeds the answers back as events. The reducer decides
 * everything that matters (a Confirm Token is used in at most one `create`, nothing is created before
 * "Enter this place" or after "Back"); this file only does the calls.
 *
 * - This is the only place in the shell that calls `POST /api/worlds` (a test reads the source to check).
 * - The Confirm Token lives in `ConfirmState` and nowhere else: not in a URL, storage or a log.
 * - A late answer (the Screen was left, or began again) is dropped: a generation counter says whose it is.
 * - After a world is made it asks for the quota again, so Home shows the places that are left.
 */
export type ConfirmUi = {
  state: ConfirmState;
  /** The picture and the places left, from the last quote. They stay while the check and the wait go on, when the state no longer holds them. */
  quote: { imageUrl: string; quota: QuotaSnapshot } | undefined;
  /** The public key of the Turnstile widget, from the quote. */
  siteKey: string | undefined;
  /** The wait a 429 asked for, for the "Try again" control. */
  retryAfterSec: number | undefined;
};

export type ConfirmController = {
  getSnapshot(): ConfirmUi;
  subscribe(listener: () => void): () => void;
  /** Asks for the quote. Calling it again does nothing, until `destroy` has been called. */
  begin(): void;
  /** "Enter this place". */
  enter(): void;
  /** The Turnstile widget gave its result. */
  turnstileOk(token: string): void;
  /** "Back": to Create, without creating anything. */
  back(): void;
  /** "Pick another place": to the Gallery, without creating anything. */
  pickAnother(): void;
  /** After a rejection: a new quote and a new token. */
  retry(): void;
  destroy(): void;
  /** Resolves when everything started so far has finished (for tests). */
  settled(): Promise<void>;
};

export type ConfirmDeps = {
  api: Pick<ShellApi, "quote" | "createWorld" | "quota">;
  /** The picked Place Image. */
  imageId: string;
  setQuota: (quota: QuotaSnapshot) => void;
  setFlow: (patch: Partial<FlowState>) => void;
  navigate: (route: Route) => void;
};

export function createConfirmController(deps: ConfirmDeps): ConfirmController {
  const { api, imageId } = deps;
  let ui: ConfirmUi = { state: { k: "quoting" }, quote: undefined, siteKey: undefined, retryAfterSec: undefined };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<ConfirmUi>) => {
    ui = { ...ui, ...patch };
    for (const l of [...listeners]) l();
  };

  let generation = 0;
  let began = false;
  let queue: Promise<void> = Promise.resolve();

  const runEffect = async (effect: ConfirmEffect, mine: number): Promise<void> => {
    switch (effect.e) {
      case "quote": {
        const r = await api.quote(effect.imageId);
        if (mine !== generation) return;
        if (r.ok) {
          deps.setQuota(r.value.quota);
          set({ quote: { imageUrl: r.value.imageUrl, quota: r.value.quota }, siteKey: r.value.turnstileSiteKey, retryAfterSec: undefined });
          dispatch({ t: "quote_ok", imageUrl: r.value.imageUrl, token: r.value.confirmToken, quota: r.value.quota, needsTurnstile: r.value.needsTurnstile });
        } else {
          set({ retryAfterSec: r.retryAfterSec });
          dispatch({ t: "quote_fail", code: r.code });
        }
        return;
      }
      case "create": {
        const r = await api.createWorld({ imageId: effect.imageId, confirmToken: effect.token, ...(effect.turnstile === undefined ? {} : { turnstile: effect.turnstile }) });
        if (mine !== generation) return;
        if (r.ok) {
          dispatch({ t: "create_ok", worldId: r.value.worldId });
        } else {
          set({ retryAfterSec: r.retryAfterSec });
          dispatch({ t: "create_fail", code: r.code });
        }
        return;
      }
      case "navigate": {
        // Haunt is for the place just made: the flow must know it before the guard looks.
        if (effect.to.screen === "haunt" && effect.to.worldId !== undefined) deps.setFlow({ worldId: effect.to.worldId, ghostReady: false, playEnded: false });
        deps.navigate(effect.to);
        if (effect.to.screen === "haunt") {
          // A world cost a place: ask again, so Home does not show an old count. A failure changes nothing.
          void api.quota().then((q) => {
            if (q.ok) deps.setQuota(q.value);
          });
        }
        return;
      }
    }
  };

  const run = (effects: ConfirmEffect[], mine: number): void => {
    if (effects.length === 0) return;
    queue = queue.then(async () => {
      for (const e of effects) {
        if (mine !== generation) return;
        await runEffect(e, mine);
      }
    });
  };

  const dispatch = (event: ConfirmEvent): void => {
    const step = confirmReduce(ui.state, event, imageId);
    if (step.state !== ui.state) set({ state: step.state });
    run(step.effects, generation);
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
      const first = confirmStart(imageId);
      set({ state: first.state, quote: undefined, siteKey: undefined, retryAfterSec: undefined });
      run(first.effects, generation);
    },
    enter: () => dispatch({ t: "enter" }),
    turnstileOk: (token) => dispatch({ t: "turnstile_ok", turnstile: token }),
    back: () => dispatch({ t: "back" }),
    pickAnother() {
      // The same rule as "Back" (nothing while a world is being made), with the Gallery as the place to go.
      const step = confirmReduce(ui.state, { t: "back" }, imageId);
      if (step.state === ui.state) return;
      set({ state: step.state });
      deps.navigate({ screen: "gallery" });
    },
    retry: () => dispatch({ t: "retry" }),
    destroy() {
      generation++;
      began = false;
      // A new visit must not wait behind a call of the old one that is still on its way.
      queue = Promise.resolve();
    },
    async settled() {
      // An answer can start the next call, so wait until the queue stops growing.
      let seen: Promise<void>;
      do {
        seen = queue;
        await seen;
      } while (seen !== queue);
    },
  };
}
