import { Link } from "../Link";
import { ScreenHeading } from "../RouteFocus";

/** An address that is not a route (Requirement 7.6). */
export default function NotFound() {
  return (
    <main className="screen">
      <ScreenHeading>There is nothing here</ScreenHeading>
      <p>This address does not lead anywhere. You can go back to the start, or visit a place in the gallery.</p>
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
