import { Link } from "../Link";
import { ScreenHeading } from "../RouteFocus";

/** A place that is gone, or a visit that ended (Requirements 7.6 and 7.7). */
export default function Expired() {
  return (
    <main className="screen ui-stack">
      <ScreenHeading>That place is gone</ScreenHeading>
      <p>It may have been deleted, its time may have run out, or it may not be shared any more. Places you make are kept for a short while only. Nothing is wrong on your side.</p>
      <p className="ui-row">
        <Link className="ui-button ui-button--primary" to={{ screen: "home" }}>
          Home
        </Link>{" "}
        <Link className="ui-button" to={{ screen: "gallery" }}>
          Gallery
        </Link>
      </p>
    </main>
  );
}
