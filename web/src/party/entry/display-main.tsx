import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { prefersReducedMotion } from "../controller/play/PlayerSettings";
import { DisplayPage } from "../display/DisplayPage";
import { RoomHostPort } from "../phone/host-port";
import { browserDeps } from "../phone/socket-port";
import "../../styles/tokens.css";
import "../../../../design/fonts.css";
import "../../../../design/elements.css";
import "../../styles/app.css";
import "../host/host.css";

/**
 * The optional Display page at `/display` (party-mode group 10). The Room Code is in the address (`?code=`) and the Display token in its fragment
 * (`#t=`), which a browser never sends to a server, so the token is in no log and no request. A Display that cannot attach shows how to get one.
 */
function App(): React.ReactNode {
  const port = useMemo(() => new RoomHostPort(browserDeps(location, { fetch: (u, i) => fetch(u, i), WebSocket: WebSocket as never, sessionStorage }), { persist: false, role: "display" }), []);
  const [attached, setAttached] = useState<boolean | null>(null);
  const [size, setSize] = useState({ width: innerWidth, height: innerHeight });
  useEffect(() => {
    const code = (new URLSearchParams(location.search).get("code") ?? "").toUpperCase();
    const token = new URLSearchParams(location.hash.replace(/^#/, "")).get("t") ?? "";
    setAttached(port.attach(code, token));
    history.replaceState(null, "", `${location.pathname}?code=${encodeURIComponent(code)}`); // the token leaves the address bar
    const onResize = (): void => setSize({ width: innerWidth, height: innerHeight });
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, [port]);
  if (attached === false) return <main className="ph-page ui-stack"><h1 className="ui-title">Display</h1><p className="ui-lead">Open the Display from the Host page: it hands over the code and a one-time link.</p></main>;
  return <DisplayPage port={port} reducedMotion={prefersReducedMotion()} storage={localStorage} size={size} />;
}

const root = document.getElementById("root");
if (root !== null) createRoot(root).render(<StrictMode><App /></StrictMode>);
