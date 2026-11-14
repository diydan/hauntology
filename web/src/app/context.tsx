import type { ShellApi } from "@hauntology/shared/app/api";
import { createContext, useContext, useSyncExternalStore } from "react";
import type { DebugStore } from "./debugStore";
import type { QuotaStore } from "./QuotaStore";
import type { Router } from "./router";

/** What every Screen can reach. The App provides one value; a Screen never builds its own client. */
export type ShellContextValue = {
  api: ShellApi;
  router: Router;
  quota: QuotaStore;
  /** The Stage and frame rate shown by `?debug=1`. Screens write to it; nothing else reads it. */
  debug: DebugStore;
};

export const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const value = useContext(ShellContext);
  if (value === null) throw new Error("useShell needs a ShellContext");
  return value;
}

export function useRouterState() {
  const { router } = useShell();
  return useSyncExternalStore(router.subscribe, router.getSnapshot, router.getSnapshot);
}

export function useBoot() {
  const { quota } = useShell();
  return useSyncExternalStore(quota.subscribe, quota.getSnapshot, quota.getSnapshot);
}
