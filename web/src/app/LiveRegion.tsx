import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * The one polite live region for the whole app: Stage changes, errors, route titles and ghost
 * speech all go through `announce` (Requirement 8.2). The region is on the page from the start,
 * because a screen reader only speaks changes to a region that already exists.
 *
 * Saying the same text twice is a new node each time, so it is read again.
 */

type Announce = (text: string) => void;
const AnnounceContext = createContext<Announce>(() => {});

export function LiveRegionProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ text: string; n: number }>({ text: "", n: 0 });
  const announce = useCallback<Announce>((text) => setMessage((m) => ({ text, n: m.n + 1 })), []);
  const value = useMemo(() => announce, [announce]);
  return (
    <AnnounceContext.Provider value={value}>
      {children}
      <div className="ui-sr-only" role="status" aria-live="polite" aria-atomic="true" data-live-region>
        <span key={message.n}>{message.text}</span>
      </div>
    </AnnounceContext.Provider>
  );
}

export const useAnnounce = (): Announce => useContext(AnnounceContext);
