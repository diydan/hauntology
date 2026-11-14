import { ScreenHeading } from "../RouteFocus";

/** A stand-in until shell task 6.5 builds this Screen. It only gives the router somewhere to go. */
export default function End() {
  return (
    <main className="screen" data-placeholder="end">
      <ScreenHeading>The ending</ScreenHeading>
      <p>This Screen is not built yet.</p>
    </main>
  );
}
