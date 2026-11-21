import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Controller } from "../controller/Controller";
import type { PlayExtras } from "../controller/SeatedFrame";
import { prefersReducedMotion } from "../controller/play/PlayerSettings";
import { browserAudio } from "../phone/browser-audio";
import { canVibrate } from "../phone/haptics";
import { browserRecorder } from "../phone/recorder";
import { browserDeps, RoomSocketPort } from "../phone/socket-port";
import { loadWorldChoices } from "../phone/worlds";
import { soundAvailability } from "@hauntology/shared/party/sounds";
import { SOUND_IDS } from "@hauntology/shared/party/sounds";
import "../../styles/tokens.css";
import "../../../../design/fonts.css";
import "../../../../design/elements.css";
import "../../styles/app.css";

/** The phone page at `/play` (party-mode group 9): the Controller over the Room socket, with the phone's own sound, microphone, storage and the Gallery's places. */
function App(): React.ReactNode {
  const port = useMemo(() => new RoomSocketPort(browserDeps(location, { fetch: (u, i) => fetch(u, i), WebSocket: WebSocket as never, sessionStorage })), []);
  const audio = useMemo(() => browserAudio({ ...(typeof AudioContext === "undefined" ? {} : { AudioContext }), fetch: (u: RequestInfo | URL, i?: RequestInit) => fetch(u, i) }), []);
  const [worlds, setWorlds] = useState<PlayExtras["worlds"]>([]);
  useEffect(() => { void loadWorldChoices((u, i) => fetch(u, i)).then(setWorlds); }, []);
  const extras: PlayExtras = useMemo(() => ({
    worlds, storage: localStorage, unlock: audio.unlock, record: browserRecorder,
    soundDeps: { play: audio.play, vibrate: (ms) => void navigator.vibrate?.(ms), available: soundAvailability(SOUND_IDS), canVibrate: canVibrate(), reducedMotion: prefersReducedMotion(), now: Date.now, setTimer: (f, ms) => setTimeout(f, ms), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
  }), [worlds, audio]);
  const code = new URLSearchParams(location.search).get("code")?.toUpperCase().slice(0, 8) ?? "";
  return <Controller port={port} initialCode={code} extras={extras} />;
}

// The home-screen app (party-mode 9.13): the manifest is linked from the page, and the worker keeps the shell and says how to rejoin when offline.
if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/party-sw.js", { scope: "/play" }).catch(() => undefined);

const root = document.getElementById("root");
if (root !== null) createRoot(root).render(<StrictMode><App /></StrictMode>);
