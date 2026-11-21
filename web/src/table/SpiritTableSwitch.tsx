import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import type { Theory } from "@hauntology/shared/party/theory";
import type { TableFeed } from "../party/controller/controller-port";
import { spiritTableOffered } from "./flag";
import { createOrientationSource, type OrientationSource } from "./orientation";
import type { SpiritTableLayerProps } from "./SpiritTableLayer";

/**
 * The Controller's side of the Spirit table (spirit-table 1.1 to 1.4, 3.5). The layer is a lazy chunk: a phone that never turns the switch on
 * downloads none of its code (1.4). The switch is the Player's own device switch, off by default, with the motion tap, and there is no Master
 * control for it. It is absent in a solo case, with `SPIRIT_TABLE_ENABLED` off, and when the Room gave no view to draw. Nothing is sent to the
 * Room and nothing is kept: the switch is off again on the next visit, and the Theory marks live only in this page.
 */
const Layer = lazy(() => import("./SpiritTableLayer"));

export type SpiritTableDevice = Readonly<{ on: boolean; motion: boolean; toggle: () => void; source: OrientationSource }>;

/** The state of the switch, held by the frame so the menu's switch and the section on the page are one choice. */
export function useSpiritTable(feed: TableFeed | undefined, enabled?: boolean): SpiritTableDevice & { offered: boolean } {
  const source = useMemo(() => createOrientationSource(), []);
  const [on, setOn] = useState(false);
  const [motion, setMotion] = useState(false);
  const offered = !!feed && spiritTableOffered({ solo: feed.solo, ...(enabled === undefined ? {} : { enabled }) });
  const toggle = (): void => {
    if (on) { source.disable(); setMotion(false); setOn(false); return; }
    setOn(true); // an explicit tap; it also asks for motion permission, which an iPhone only allows from a tap
    void source.enable().then(setMotion, () => setMotion(false));
  };
  return { offered, on: offered && on, motion, toggle, source };
}

export function SpiritTableSwitch({ device }: { device: SpiritTableDevice }): ReactNode {
  return (
    <button type="button" role="switch" aria-checked={device.on} className="ui-button ui-switch" onClick={device.toggle}>
      <span className="ui-switch-name">Spirit table</span>
      <span className="ui-switch-state">{device.on ? "On" : "Off"}</span>
    </button>
  );
}

export function SpiritTableSection({ device, feed, roomCode, theory, onTheory }: {
  device: SpiritTableDevice; feed: TableFeed; roomCode: string; theory: Theory; onTheory: (t: Theory) => void;
} & Partial<Pick<SpiritTableLayerProps, "createRenderer" | "media" | "frame" | "reducedMotion">>): ReactNode {
  return (
    <section className="ui-stack" aria-label="Spirit table">
      <Suspense fallback={<p className="ui-status" role="status">Loading the table…</p>}>
        <Layer feed={feed} roomCode={roomCode} theory={theory} onTheory={onTheory} orientation={device.source} initialTilt={device.motion} />
      </Suspense>
    </section>
  );
}
