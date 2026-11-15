import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

/**
 * The Controller's menu (party-mode 9.10 and the settings of the puzzles spec): a bottom sheet on a phone, a side panel from 900 px
 * (`ui-sheet`). It takes focus when it opens (on its title), closes on Escape or on its Close button, and gives focus back to what had it
 * (the Menu button, named by `returnFocusTo`: a tap does not focus a button on every phone). It does not trap the Tab key: the page behind it is still there, and a Player who tabs out keeps the sheet open.
 */
export function MenuSheet({ title = "Menu", onClose, returnFocusTo, children }: { title?: string; onClose: () => void; returnFocusTo?: RefObject<HTMLElement | null>; children: ReactNode }): ReactNode {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const back = useRef(returnFocusTo);
  back.current = returnFocusTo;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    heading.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") { e.stopPropagation(); close.current(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      (back.current?.current ?? before)?.focus?.();
    };
  }, []);

  return (
    <aside className="ui-sheet is-open pc-sheet" aria-labelledby={titleId}>
      <div className="ui-sheet-head">
        <h2 className="ui-sheet-title" id={titleId} ref={heading} tabIndex={-1}>{title}</h2>
        <button type="button" className="ui-button ui-sheet-close" onClick={onClose}>Close</button>
      </div>
      {children}
    </aside>
  );
}
