import { useEffect, useRef } from "react";
import { useRetryGate } from "./useRetryGate";

/**
 * The "Try again" control for a failed load. After a 429 it stays off until the advised delay has
 * passed and counts the seconds down (Requirement 7.5); otherwise it is on at once.
 */
export function RetryButton({ retryAfterSec, onRetry }: { retryAfterSec: number | undefined; onRetry: () => void }) {
  const gate = useRetryGate();
  const armed = useRef(false);
  useEffect(() => {
    if (!armed.current && retryAfterSec !== undefined) {
      armed.current = true;
      gate.arm(retryAfterSec);
    }
  }, [retryAfterSec, gate]);
  return (
    <button className="ui-button" type="button" disabled={!gate.enabled} onClick={onRetry}>
      {gate.enabled ? "Try again" : `Try again in ${gate.secondsLeft}`}
    </button>
  );
}
