import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { prefersReducedMotion } from "../controller/play/PlayerSettings";
import { DisplayPage } from "../display/DisplayPage";
import { soundAvailability, SOUND_IDS } from "@hauntology/shared/party/sounds";
import { browserAudio } from "../phone/browser-audio";
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
  // The creak of a door (knock-door 8.2). A browser lets sound start only after a touch or a key, so the first one unlocks it; until then the creak is dropped (the picture and the words still show).
  const sound = useMemo(() => {
    const audio = browserAudio({ ...(typeof AudioContext === "undefined" ? {} : { AudioContext }), fetch: (u: RequestInfo | URL, i?: RequestInit) => fetch(u, i) });
    const deps = { play: audio.play, vibrate: () => undefined, available: soundAvailability(SOUND_IDS), canVibrate: false, reducedMotion: prefersReducedMotion(), now: Date.now, setTimer: (f: () => void, ms: number) => setTimeout(f, ms), clearTimer: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
    return { deps, offsetMs: 0, unlock: audio.unlock };
  }, []);
  useEffect(() => {
    const unlock = (): void => { void sound.unlock(); };
    addEventListener("pointerdown", unlock, { once: true });
    addEventListener("keydown", unlock, { once: true });
    return () => { removeEventListener("pointerdown", unlock); removeEventListener("keydown", unlock); };
  }, [sound]);
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
  return <DisplayPage port={port} reducedMotion={prefersReducedMotion()} storage={localStorage} size={size} sound={{ deps: sound.deps, offsetMs: sound.offsetMs }} playKnock={playKnock} />;
}

/** The ghost's knock after a Slam: the footage-scene file `knock.m4a`, no louder than 80 percent. A missing file or a blocked sound is silent. */
const playKnock = (): void => { try { const a = new Audio("/sounds/knock.m4a"); a.volume = 0.8; void a.play().catch(() => undefined); } catch { /* silent */ } };

const root = document.getElementById("root");
if (root !== null) createRoot(root).render(<StrictMode><App /></StrictMode>);
