import { HOME_FACTS, HOME_PREMISE, reasonCopy } from "@hauntology/shared/app/home-copy";
import { useEffect } from "react";
import { capabilitiesOf } from "../QuotaStore";
import { useBoot, useShell } from "../context";
import { whenIdle } from "../idle";
import { Link } from "../Link";
import { ScreenHeading } from "../RouteFocus";

/**
 * Home (Requirements 1.1 to 1.3, 10.4): the premise, three actions and the plain facts. "Draw a
 * place" and "Upload a photo" follow `capabilities` and, when off, stay on the page with the
 * reason in one line; the Gallery is always open. When the page is idle it prefetches the Gallery
 * list and nothing else.
 *
 * Both making actions lead to Create, which has the Sketch Pad and the photo picker side by side.
 */
export default function Home() {
  const { gallery } = useShell();
  const caps = capabilitiesOf(useBoot());

  useEffect(() => whenIdle(() => void gallery.load()), [gallery]);

  const reason = caps?.reason ? reasonCopy(caps.reason) : null;
  return (
    <main className="screen">
      <ScreenHeading>Hauntology</ScreenHeading>
      <p className="premise">{HOME_PREMISE}</p>

      <ul className="actions">
        <li>
          <Action label="Draw a place" on={caps?.canDraw ?? false} />
        </li>
        <li>
          <Action label="Upload a photo" on={caps?.canUpload ?? false} />
        </li>
        <li>
          <Link className="button" to={{ screen: "gallery" }}>
            Visit a gallery place
          </Link>
        </li>
      </ul>
      {reason ? (
        <p id="home-reason" className="reason">
          {reason}
        </p>
      ) : null}

      <ul className="facts">
        {HOME_FACTS.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
    </main>
  );
}

/** A link to Create when on. When off, a button that does nothing, still reachable by keyboard, tied to the reason line. */
function Action({ label, on }: { label: string; on: boolean }) {
  if (on) {
    return (
      <Link className="button" to={{ screen: "create" }}>
        {label}
      </Link>
    );
  }
  return (
    <button className="button" type="button" aria-disabled="true" aria-describedby="home-reason">
      {label}
    </button>
  );
}
