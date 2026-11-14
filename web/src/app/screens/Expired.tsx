import { Link } from "../Link";
import { ScreenHeading } from "../RouteFocus";

/** A place that is gone, or a visit that ended (Requirements 7.6 and 7.7). */
export default function Expired() {
  return (
    <main className="screen">
      <ScreenHeading>That place is gone</ScreenHeading>
      <p>It may have been deleted, or its time ran out. Places you make are kept for a short while only. Nothing is wrong on your side.</p>
      <p>
        <Link className="button" to={{ screen: "home" }}>
          Home
        </Link>{" "}
        <Link className="button" to={{ screen: "gallery" }}>
          Gallery
        </Link>
      </p>
    </main>
  );
}
