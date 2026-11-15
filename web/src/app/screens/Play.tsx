import { useSyncExternalStore, useEffect, useRef, useState } from "react";
import { useBoot, useRouterState, useShell } from "../context";
import { useAnnounce } from "../LiveRegion";
import { RetryButton } from "../RetryButton";
import { ScreenHeading } from "../RouteFocus";
import { DeletePlace } from "../haunt/DeletePlace";
import { Chat } from "../play/Chat";
import { ContentNotice } from "../play/ContentNotice";
import { createPlayController, type PlayController, type ViewerPort } from "../play/controller";
import { Hud, TOTAL_MEMORIES } from "../play/Hud";
import { Journal } from "../play/Journal";
import { createVoice } from "../play/voice";
import type { ViewerHandle } from "../viewer/types";
import { errorCopy } from "@hauntology/shared/app/errors-copy";

/**
 * Play (Requirements 6.1 to 6.4, 6.7, 6.8, 10.1, 10.2, 12.3). It puts the Viewer, the HUD and the
 * Chat on one page and leaves the work to `PlayController`: the content notice comes first, the
 * Viewer loads (by dynamic import) only after the visitor goes in, and leaving releases the Viewer
 * before the next Screen mounts.
 */

export const DEGRADED_TEXT: Record<"pano" | "thumb", string> = {
  pano: "Showing a flat panorama instead of the 3D view. You can still talk to the ghost.",
  thumb: "Showing a still picture. The 3D view could not start. You can still talk to the ghost.",
};

export default function Play() {
  const shell = useShell();
  const { api, router, quota, memory, platform } = shell;
  const boot = useBoot();
  const worldId = useRouterState().route.worldId ?? "";
  const container = useRef<HTMLDivElement>(null);

  // One controller and one voice per visit to this Screen. Creating them has no side effect; `begin` runs in an effect and runs once.
  const [parts] = useState(() => {
    let handle: ViewerHandle | null = null;
    // eslint-disable-next-line prefer-const
    let controller: PlayController;
    const port: ViewerPort = {
      async start() {
        const mod = await platform.loadViewer();
        if (container.current === null) throw new Error("no container");
        handle = await mod.mountViewer({ container: container.current, worldId, onMessage: (m) => controller.onViewerMessage(m) });
      },
      send: (m) => handle?.send(m),
      async dispose() {
        const h = handle;
        handle = null;
        await h?.dispose();
      },
    };
    const session = boot.status === "ready" ? boot.session : { ackNotice: false };
    controller = createPlayController({
      api, worldId, memory, session, port,
      navigate: (route) => router.navigate(route),
      setFlow: (patch) => router.setFlow(patch),
      onNoticeAcked: () => quota.setNoticeAcked(),
    });
    const voice = createVoice({
      api, recorder: platform.voice.recorder, createAudio: platform.voice.createAudio, unlockAudio: platform.voice.unlockAudio,
      onTranscript: (text) => void controller.submit({ text }),
    });
    return { controller, voice };
  });
  const { controller, voice } = parts;

  const ui = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const voiceUi = useSyncExternalStore(voice.subscribe, voice.getSnapshot, voice.getSnapshot);
  const announce = useAnnounce();
  const voiceAvailable = boot.status === "ready" && boot.session.flags.voiceEnabled;

  useEffect(() => {
    void controller.begin();
    return () => {
      voice.destroy();
      void controller.destroy();
    };
  }, [controller, voice]);

  // Each ghost line is a subtitle in the live region, spoken or not; then the voice, if it is on.
  const lastReply = useRef(0);
  useEffect(() => {
    const reply = ui.reply;
    if (reply === null || reply.n === lastReply.current) return;
    lastReply.current = reply.n;
    announce(reply.text);
    const playId = memory.get().playId;
    if (voiceAvailable && reply.voice !== undefined && playId !== undefined) void voice.playLine(playId, reply.voice.lineId);
  }, [ui.reply, announce, voice, voiceAvailable, memory]);

  // A note in the Chat (a failed turn) is announced too; a new memory is announced as it is found.
  const lastLines = useRef(0);
  useEffect(() => {
    const line = ui.lines[ui.lines.length - 1];
    if (ui.lines.length !== lastLines.current && line?.who === "system") announce(line.text);
    lastLines.current = ui.lines.length;
  }, [ui.lines, announce]);
  const foundCount = ui.view?.found.length ?? 0;
  const lastFound = useRef(foundCount);
  useEffect(() => {
    if (foundCount > lastFound.current && foundCount < TOTAL_MEMORIES) announce(`Memory ${foundCount} of ${TOTAL_MEMORIES} found.`);
    lastFound.current = foundCount;
  }, [foundCount, announce]);

  useEffect(() => {
    if (voiceUi.mic === "recording") announce("Listening.");
  }, [voiceUi.mic, announce]);

  // A game that could not start or be restored is said aloud as well as shown (Requirement 8.2).
  const failure = ui.phase === "failed" ? ui.failure : null;
  useEffect(() => {
    if (failure === null) return;
    const copy = errorCopy(failure.code);
    announce(`${copy.title}. ${copy.body}`);
  }, [failure, announce]);

  // A still picture of the place, when the Viewer cannot show it.
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    if (ui.play.degraded !== "thumb" || thumb !== null) return;
    let live = true;
    void api.world(worldId).then((w) => {
      if (live && w.ok && w.value.thumbUrl) setThumb(w.value.thumbUrl);
    });
    return () => {
      live = false;
    };
  }, [ui.play.degraded, thumb, api, worldId]);

  // Enter accepts the interaction prompt (Requirement 6.2), unless the key was meant for a control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The reducer ignores a second open and an open before the notice, so only the prompt matters here.
      if (e.key !== "Enter" || ui.prompt === null) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest("button, a, input, textarea, select")) return;
      voice.unlock();
      controller.openChat();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [ui.prompt, controller, voice]);

  const talk = () => {
    voice.unlock();
    controller.openChat();
  };

  if (ui.phase === "failed" && ui.failure) {
    const copy = errorCopy(ui.failure.code);
    return (
      <main className="screen ui-stack">
        <ScreenHeading>Wander</ScreenHeading>
        <h2 className="ui-heading">{copy.title}</h2>
        <p>{copy.body}</p>
        <p>
          Code: <code>{ui.failure.code}</code>
        </p>
        <p className="ui-row">
          <RetryButton retryAfterSec={ui.failure.retryAfterSec} onRetry={() => void controller.retry()} />{" "}
          <button className="ui-button" type="button" onClick={() => void controller.exit("home")}>
            Home
          </button>
        </p>
      </main>
    );
  }

  const chatOpen = ui.play.mode === "chat";
  return (
    <div className="play-layout">
      <main className="play-main ui-stack">
        <ScreenHeading>Wander</ScreenHeading>
        {ui.phase === "loading" ? <p aria-busy="true">Opening the door…</p> : null}
        {ui.phase === "ready" ? (
          <>
            <Hud
              found={foundCount} prompt={ui.prompt} chatOpen={chatOpen}
              onTalk={talk} onJournal={() => controller.openJournal()} onExit={() => void controller.exit("home")}
            />
            {!ui.play.noticeAcked ? (
              <ContentNotice
                onGoIn={() => {
                  voice.unlock();
                  void controller.acknowledgeNotice();
                }}
              />
            ) : null}
            {ui.play.degraded !== undefined ? (
              <p className="ui-notice" data-degraded>
                {DEGRADED_TEXT[ui.play.degraded]}
              </p>
            ) : null}
            {ui.play.degraded === "thumb" && thumb !== null ? (
              <div className="viewer-fallback ui-figure">
                <img src={thumb} alt="A still picture of the place" />
              </div>
            ) : null}
            {ui.scripted ? <small className="scripted ui-hint">scripted ghost</small> : null}
            <DeletePlace worldId={worldId} leave={() => controller.exit("home")} />
          </>
        ) : null}
        <div ref={container} className="viewer ui-figure" data-viewer />
      </main>
      {chatOpen ? (
        <Chat
          ui={ui} voice={voiceUi} voiceAvailable={voiceAvailable}
          onSubmit={(input) => {
            voice.unlock();
            void controller.submit(input);
          }}
          onClose={() => controller.closeChat()}
          onSpeak={(on) => {
            voice.unlock();
            voice.setSpeak(on);
          }}
          onPress={() => void voice.pressTalk()}
          onRelease={() => void voice.releaseTalk()}
        />
      ) : null}
      {ui.journalOpen ? <Journal entries={ui.view?.journal ?? []} onClose={() => controller.closeJournal()} /> : null}
    </div>
  );
}
