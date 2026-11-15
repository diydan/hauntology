import type { ReactNode } from "react";
import { PuzzleHost } from "../../puzzles/PuzzleHost";
import type { PuzzleDevice } from "../../puzzles/usePuzzleDevice";
import type { ControllerPort, LockOffer } from "./controller-port";

/**
 * A Lock in front of this seat: the puzzle screen, played with the phone's remembered settings. The Controller's own bar is not drawn above it:
 * what the Controller keeps in reach (the Menu, a connection that is not fine) goes in the puzzle's bar as `barExtra`. The Room made the Lock
 * and checks the answer; this only draws it, sends the Attempt and says when the Player is done. A tap on Tilt in here is the same saved setting as the switch in the menu.
 */
export function LockArea({ port, offer, device, barExtra }: { port: ControllerPort; offer: LockOffer; device: PuzzleDevice; barExtra?: ReactNode }): ReactNode {
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <div className="pc-lock">
      <PuzzleHost
        key={offer.id}
        kind={offer.kind} view={offer.view} faded={offer.faded} clue={offer.clue} capMs={offer.capMs} attempts={offer.attempts}
        feel={device.feel} assist={device.device.assist} reducedMotion={reduced}
        onAttempt={(t) => port.attempt(offer.id, t)}
        onGiveUp={() => port.closeLock(offer.id, "gave_up")}
        onTimeUp={() => port.closeLock(offer.id, "time_up")}
        onFinish={() => port.closeLock(offer.id, "finished")}
        onTiltChoice={device.onTiltChoice}
        {...(barExtra ? { barExtra } : {})}
      />
    </div>
  );
}
