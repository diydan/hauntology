import { useEffect, useState } from "react";

/** The phone's clock as a state that moves on (every `everyMs`), so a countdown redraws. `now` can be given, so a test needs no real timer. */
export function useNow(now: () => number = Date.now, everyMs = 250): number {
  const [t, setT] = useState(() => now());
  useEffect(() => {
    setT(now());
    const id = setInterval(() => setT(now()), everyMs);
    return () => clearInterval(id);
  }, [now, everyMs]);
  return t;
}
