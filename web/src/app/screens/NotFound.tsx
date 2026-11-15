import { Link } from "../Link";
import { ScreenHeading } from "../RouteFocus";

/** An address that is not a route (Requirement 7.6). */
export default function NotFound() {
  return (
    <main className="screen ui-stack">
      <ScreenHeading>There is nothing here</ScreenHeading>
      <p>This address does not lead anywhere. You can go back to the start, or visit a place in the gallery.</p>
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
