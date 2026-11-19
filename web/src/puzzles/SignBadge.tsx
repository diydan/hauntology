import type { ReactNode } from "react";
import { SIGN_LABELS, type Sign } from "@hauntology/shared/puzzles/world-clues";

/** Crisp geometric mark for a World Clue Sign; inherits its stroke from CSS (`currentColor`) with no raw colour. */
export function SignMark({ sign }: { sign: Sign }): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {sign === "moon" ? <path d="M16.5 4.5a8 8 0 1 0 0 15 6.5 6.5 0 0 1 0-15z" /> : null}
      {sign === "key" ? (
        <>
          <circle cx="8" cy="12" r="4" />
          <path d="M12 12h9M17 12v4M20 12v3" />
        </>
      ) : null}
      {sign === "eye" ? (
        <>
          <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z" />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" />
        </>
      ) : null}
      {sign === "hand" ? <path d="M7 13V6M10 12V4M13 12V5M16 13V7M7 13v4a5 5 0 0 0 10 0v-4" /> : null}
      {sign === "star" ? <polygon points="12 2 15 9 22 9 16.5 14 18.5 21 12 17 5.5 21 7.5 14 2 9 9 9" /> : null}
      {sign === "bell" ? (
        <>
          <path d="M6 16h12l-1.5-5a4.5 4.5 0 0 0-9 0L6 16z" />
          <circle cx="12" cy="19.5" r="1.2" fill="currentColor" />
        </>
      ) : null}
    </svg>
  );
}

/** Shows the Sign's mark beside its name in words inside a shared `ui-chip` (Requirement 4.3). */
export function SignChip({ sign, active = false }: { sign: Sign; active?: boolean }): ReactNode {
  return (
    <span className={`ui-chip${active ? " is-active" : ""}`}>
      <SignMark sign={sign} /> <span>{SIGN_LABELS[sign]}</span>
    </span>
  );
}
