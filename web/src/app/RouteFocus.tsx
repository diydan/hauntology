import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

/**
 * Focus moves to the Screen's heading on every route change (Requirement 8.1) and not on the first
 * load, where the page itself is new. `ScreenHeading` focuses itself when it mounts, so a Screen
 * that loads late (a dynamic import) still gets focus.
 */
const FocusOnMount = createContext<{ current: boolean }>({ current: false });

export const FocusProvider = FocusOnMount.Provider;

export function ScreenHeading({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const flag = useContext(FocusOnMount);
  useEffect(() => {
    if (flag.current) ref.current?.focus();
  }, [flag]);
  return (
    <h1 className="ui-heading" ref={ref} tabIndex={-1}>
      {children}
    </h1>
  );
}
