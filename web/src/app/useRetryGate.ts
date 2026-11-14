import { controlEnabled, retryGate } from "@hauntology/shared/app/errors-copy";
import { useCallback, useEffect, useState } from "react";

/**
 * After a 429 the control that caused it stays off until the advised delay has passed
 * (Requirement 7.5). `arm(retryAfterSec)` starts the wait; `enabled` turns true on its own.
 * The delay is clamped to 1 to 120 seconds by `retryGate`.
 */
export function useRetryGate(now: () => number = Date.now, tickMs = 250) {
  const [gate, setGate] = useState<{ enabledAt: number } | null>(null);
  const [time, setTime] = useState(() => now());

  const arm = useCallback(
    (retryAfterSec: number) => {
      const t = now();
      setTime(t);
      setGate(retryGate(retryAfterSec, t));
    },
    [now],
  );

  useEffect(() => {
    if (gate === null) return;
    const id = setInterval(() => setTime(now()), tickMs);
    return () => clearInterval(id);
  }, [gate, now, tickMs]);

  const enabled = gate === null || controlEnabled(gate, time);
  const secondsLeft = gate === null || enabled ? 0 : Math.ceil((gate.enabledAt - time) / 1000);
  return { enabled, secondsLeft, arm };
}
