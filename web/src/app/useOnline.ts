import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void): (() => void) => {
  addEventListener("online", onChange);
  addEventListener("offline", onChange);
  return () => {
    removeEventListener("online", onChange);
    removeEventListener("offline", onChange);
  };
};

/** Whether the browser thinks it is online. */
export const useOnline = (): boolean => useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
