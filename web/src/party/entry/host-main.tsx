import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { parseViewerMessage } from "@hauntology/shared/app/events";
import { soundAvailability, SOUND_IDS } from "@hauntology/shared/party/sounds";
import { browserHostAudioSupport, fetchHostSpeech } from "../../app/case/host-voice";
import { mountViewer } from "../../app/viewer/mount";
import { prefersReducedMotion, } from "../controller/play/PlayerSettings";
import { HostPage, type HostExtras } from "../host/HostPage";
import { remoteInputMessage } from "../host/host-viewer";
import { browserAudio } from "../phone/browser-audio";
import { RoomHostPort } from "../phone/host-port";
import { browserDeps, RoomSocketPort } from "../phone/socket-port";
import { loadWorldChoices } from "../phone/worlds";
import "../../styles/tokens.css";
import "../../../../design/fonts.css";
import "../../../../design/elements.css";
import "../../styles/app.css";
import "../host/host.css";

/**
 * The TV page at `/host` (party-mode group 8): makes the Room, shows the code, then the world and the public HUD. A Host that plays on its own screen
 * joins with a second socket of its own (its own seat and token), kept apart from the Host's token (which can only end the Room).
 */
function App(): React.ReactNode {
  const wire = useMemo(() => {
    const deps = browserDeps(location, { fetch: (u, i) => fetch(u, i), WebSocket: WebSocket as never, sessionStorage });
    const port = new RoomHostPort(deps);
    port.restore();
    const audio = browserAudio({ ...(typeof AudioContext === "undefined" ? {} : { AudioContext }), fetch: (u: RequestInfo | URL, i?: RequestInit) => fetch(u, i) });
    const hostAudio = browserHostAudioSupport();
    const padPort = new RoomSocketPort(deps);
    const soundDeps = { play: audio.play, vibrate: () => undefined, available: soundAvailability(SOUND_IDS), canVibrate: false, reducedMotion: prefersReducedMotion(), now: Date.now, setTimer: (f: () => void, ms: number) => setTimeout(f, ms), clearTimer: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
    const extras: HostExtras = {
      origin: location.origin, reducedMotion: prefersReducedMotion(), soundDeps,
      narration: { fetchSpeech: fetchHostSpeech((u, i) => fetch(u, i)), createAudio: hostAudio.createAudio, unlockAudio: hostAudio.unlockAudio, fallbackSpeak: hostAudio.fallbackSpeak },
      framePhotos: { fetch: (u, i) => fetch(u, i), urls: { make: (b) => URL.createObjectURL(b), revoke: (u) => URL.revokeObjectURL(u) } },
      mountViewer: async (container, worldId) => {
        const handle = await mountViewer({ container, worldId, onMessage: (raw) => { const m = parseViewerMessage(raw); if (m?.t === "pose") port.reportPose(m.pos, m.yaw); } });
        return { send: (m) => handle.send(m), move: (m) => handle.send(remoteInputMessage(m)), dispose: () => handle.dispose(), anchorGround: () => handle.anchorGround?.() };
      },
      whisper: { playClip: async (c) => { const bin = atob(c.audio); const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0)); const url = URL.createObjectURL(new Blob([bytes], { type: c.contentType })); try { const el = new Audio(url); await new Promise<void>((resolve, reject) => { el.onended = () => resolve(); el.onerror = () => reject(new Error("audio")); void el.play().catch(reject); }); } finally { URL.revokeObjectURL(url); } } },
      playHere: { port: padPort, extras: { worlds: [], storage: localStorage, unlock: audio.unlock, soundDeps } },
    };
    void loadWorldChoices;
    return { port, extras };
  }, []);
  return <HostPage port={wire.port} extras={wire.extras} />;
}

const root = document.getElementById("root");
if (root !== null) createRoot(root).render(<StrictMode><App /></StrictMode>);
