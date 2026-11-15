import { useSyncExternalStore, type ReactNode } from "react";
import { useDeviceSettings } from "../../device/device-settings";
import type { ControllerPort } from "./controller-port";
import { JoinPage } from "./JoinPage";
import { SeatedFrame } from "./SeatedFrame";
import "./controller.css";

/**
 * The phone Controller page (party-mode group 9): the join page until the Room has given a seat, then the seated frame. The Room is behind
 * the port. This is where the phone's remembered choices come in: `useDeviceSettings` reads them from the device once and saves every change,
 * and the frame, the menu and the Lock all use that one setting (a tap on Tilt in a Lock and the switch in the menu are the same choice).
 * `?code=` fills the Room Code in (the join URL carries only the code).
 */
export function Controller({ port, initialCode = "" }: { port: ControllerPort; initialCode?: string }): ReactNode {
  const view = useSyncExternalStore((onChange) => port.subscribe(() => onChange()), () => port.getView(), () => port.getView());
  const [device, setDevice] = useDeviceSettings();
  return (
    <div className="pc-page">
      {view.seat === null ? <JoinPage port={port} initialCode={initialCode} /> : <SeatedFrame port={port} view={view} control={{ device, setDevice }} />}
    </div>
  );
}
