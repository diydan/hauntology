import type { ApiResult, ShellApi } from "@hauntology/shared/app/api";
import { capabilities } from "@hauntology/shared/app/capabilities";
import type { Capabilities, QuotaSnapshot, SessionRecord } from "@hauntology/shared/app/types";
import type { ErrorCode } from "@hauntology/shared/errors";

/**
 * The boot data every Screen shares: the Session record (with the server flags) and the Quota
 * Snapshot. It asks for each once, however many Screens or components call `load()` (Requirement 1.4).
 *
 * It is a plain store with `subscribe` and `getSnapshot`, so React reads it with
 * `useSyncExternalStore`. `getSnapshot` returns the same object until something changes.
 */

export type BootState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; session: SessionRecord; quota: QuotaSnapshot }
  | { status: "failed"; code: ErrorCode; retryAfterSec?: number };

export type QuotaStore = {
  getSnapshot(): BootState;
  subscribe(listener: () => void): () => void;
  /** Starts the two boot requests the first time; every later call gets the same answer. */
  load(): Promise<BootState>;
  /** After a failure only: asks again. In any other state it changes nothing. */
  retry(): Promise<BootState>;
  /** A call returned a newer Quota Snapshot (a quote, a sketch render). Ignored until ready. */
  setQuota(quota: QuotaSnapshot): void;
  /** The visitor acknowledged the content notice. Ignored until ready. */
  setNoticeAcked(): void;
};

type BootApi = Pick<ShellApi, "session" | "quota">;

export function createQuotaStore(api: BootApi): QuotaStore {
  let state: BootState = { status: "idle" };
  let inFlight: Promise<BootState> | null = null;
  const listeners = new Set<() => void>();

  const set = (next: BootState) => {
    state = next;
    for (const listener of [...listeners]) listener();
  };

  const boot = async (): Promise<BootState> => {
    set({ status: "loading" });
    const [session, quota]: [ApiResult<SessionRecord>, ApiResult<QuotaSnapshot>] = await Promise.all([api.session(), api.quota()]);
    if (!session.ok) set({ status: "failed", code: session.code, ...(session.retryAfterSec === undefined ? {} : { retryAfterSec: session.retryAfterSec }) });
    else if (!quota.ok) set({ status: "failed", code: quota.code, ...(quota.retryAfterSec === undefined ? {} : { retryAfterSec: quota.retryAfterSec }) });
    else set({ status: "ready", session: session.value, quota: quota.value });
    return state;
  };

  const load = (): Promise<BootState> => {
    inFlight ??= boot();
    return inFlight;
  };

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    load,
    retry() {
      if (state.status !== "failed") return load();
      inFlight = null;
      return load();
    },
    setQuota(quota) {
      if (state.status === "ready") set({ ...state, quota });
    },
    setNoticeAcked() {
      if (state.status === "ready" && !state.session.ackNotice) set({ ...state, session: { ...state.session, ackNotice: true } });
    },
  };
}

/** What Home may offer, or `null` until the boot data is in. */
export function capabilitiesOf(state: BootState): Capabilities | null {
  return state.status === "ready" ? capabilities(state.quota, state.session.flags) : null;
}
