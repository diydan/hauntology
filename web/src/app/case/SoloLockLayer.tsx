import type { ReactNode } from "react";
import { useDeviceSettings } from "../../device/device-settings";
import { LockArea } from "../../party/controller/LockArea";
import { SightCard } from "../../puzzles/SightCard";
import { usePuzzleDevice } from "../../puzzles/usePuzzleDevice";
import type { RoomClient, RoomSnapshot } from "./room-client";

/**
 * The puzzle on the shared screen (integration 5.3): a Lock the Room gave the visitor, or a Sight (a clue shown once), in place of the table.
 * It is the same Lock screen as on a phone, played here by touch or mouse (Touch only), with settings that last for this visit and are never
 * saved to the device. The Room made the Lock and checks every Attempt; this only draws it and tells the Room what the visitor did.
 */
export function SoloLockLayer({ client, lock, sight }: { client: RoomClient; lock: RoomSnapshot["lock"]; sight: RoomSnapshot["sight"] }): ReactNode {
  const [device, setDevice] = useDeviceSettings({ touchOnly: true }, null);
  const play = usePuzzleDevice({ device, setDevice });
  if (sight !== null) {
    return (
      <div className="solo-lock ui-stack">
        <SightCard key={sight.id} sight={sight.sight} title="Something to remember" feel={play.feel} onDone={() => client.ackSight(sight.id)} />
      </div>
    );
  }
  if (lock === null) return null;
  return (
    <div className="solo-lock ui-stack">
      <LockArea port={client} offer={{ ...lock, clue: null }} device={play} />
    </div>
  );
}
