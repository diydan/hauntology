import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * An accessible modal dialog without `confirm()` or the `<dialog>` element's quirks: it labels
 * itself, moves focus inside, keeps Tab inside, closes on Escape, and gives focus back to what had
 * it. Used for the journal now and "Delete my place" later.
 */
export function Dialog({ title, onClose, children, closeLabel = "Close" }: { title: string; onClose: () => void; children: ReactNode; closeLabel?: string }) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => before?.focus?.();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || box.current === null) return;
    const items = [...box.current.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((el) => !el.hasAttribute("disabled"));
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="dialog-backdrop">
      <div ref={box} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <h2 id={titleId}>{title}</h2>
        {children}
        <p>
          <button ref={closeButton} className="button" type="button" onClick={onClose}>
            {closeLabel}
          </button>
        </p>
      </div>
    </div>
  );
}
