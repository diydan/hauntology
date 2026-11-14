import { ScreenHeading } from "../RouteFocus";

/** A stand-in until shell task 8.1 builds this Screen. It only gives the router somewhere to go. */
export default function Confirm() {
  return (
    <main className="screen" data-placeholder="confirm">
      <ScreenHeading>Enter this place?</ScreenHeading>
      <p>This Screen is not built yet.</p>
    </main>
  );
}
