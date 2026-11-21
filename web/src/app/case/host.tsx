import { doorProblemLines } from "@hauntology/shared/party/doors";
import { parseViewerMessage, type ShellToViewer } from "@hauntology/shared/app/events";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { createRoomSongsController, type RoomSongsController } from "../songs/room-songs";
import { SongControls } from "../songs/SongControls";
import { browserHostAudioSupport, createHostAudio, fetchHostSpeech, type HostAudio, type HostAudioDeps } from "./host-voice";
import { browserRoomDeps, checkWorld, RoomError, startSolo, type RoomClient, type RoomDeps } from "./room-client";
import type { HostHandle, HostSetup } from "./types";
import type { ViewerHandle } from "../viewer/types";
import { GameSections } from "../../party/GameSections";
import { eventLine, namesOf, secondsLeft } from "./words";
import { Ending } from "./Ending";
import { SoloLockLayer } from "./SoloLockLayer";

/**
 * The real Host for "Play a case" (integration 4.1, 4.2; party-mode 8.15): a real Room on the server, the visitor in
 * seat 1 as the Master, the Bots added and the game started. Everything is on this one screen: the table, the pad
 * (Go, Search, Ask, End turn), the hand, the notebook and the log. No Room Code, no QR, no phone. The 3D world view
 * joins later; this page plays a whole case without it.
 */
export async function mountHost(setup: HostSetup, deps: RoomDeps = browserRoomDeps()): Promise<HostHandle> {
  let client: RoomClient;
  try {
    await checkWorld(deps, setup.worldId, setup.setup);
    client = await startSolo(deps, setup.setup);
  } catch (e) {
    // The Room's own reason (too small, rooms full, party off) goes back to Haunt, which says why in one line.
    if (!(e instanceof RoomError)) throw e;
    queueMicrotask(() => setup.onMessage({ t: "refused", code: e.code }));
    return { playAgain() {}, async dispose() {} };
  }
  // The world beside the table (integration 4.2). It shows the Haunt rising; the table holds every control.
  const split = document.createElement("div");
  split.className = "case-split";
  const worldBox = document.createElement("div");
  worldBox.className = "case-world";
  const tableBox = document.createElement("div");
  split.append(worldBox, tableBox);
  setup.container.append(split);
  const root = createRoot(tableBox);
  root.render(<SoloTable client={client} fetchSpeech={fetchHostSpeech(deps.fetch)} />);
  let viewer: ViewerHandle | null = null;
  if (setup.loadViewer) {
    try {
      viewer = await (await setup.loadViewer()).mountViewer({
        container: worldBox,
        worldId: setup.worldId,
        onMessage: (raw) => {
          const parsed = parseViewerMessage(raw);
          if (parsed?.t === "clue_seen") client.send({ t: "clueSeen", sign: parsed.sign });
        },
      });
    } catch {
      viewer = null; // no world view: the case plays on the table alone
      worldBox.remove();
    }
  }
  let lastHaunt = -1;
  let lastWorldClues: string | null = null;
  const showHaunt = (): void => {
    const v = client.getSnapshot().public;
    if (viewer === null || v === null) return;
    if (v.worldClues !== undefined || lastWorldClues !== null) {
      const nextClues = v.worldClues ?? [];
      const encoded = JSON.stringify(nextClues);
      if (encoded !== lastWorldClues) {
        lastWorldClues = encoded;
        viewer.send({ t: "set_world_clues", clues: nextClues as Extract<ShellToViewer, { t: "set_world_clues" }>["clues"] });
      }
    }
    const level = v.haunt.max > 0 ? Math.min(1, v.haunt.level / v.haunt.max) : 0;
    if (level === lastHaunt) return;
    lastHaunt = level;
    viewer.send({ t: "apply_view", found: [], anchors: [], hauntLevel: level, ghostVisible: false });
  };
  const stopHaunt = client.subscribe(showHaunt);
  showHaunt();

  // Tell the shell what happens, through the same messages the stand-in used.
  let last = client.getSnapshot().status;
  let scripted = false;
  const stop = client.subscribe(() => {
    const s = client.getSnapshot();
    if (s.status === last) return;
    if (s.status === "playing") {
      setup.onMessage({ t: "started" });
      if (!scripted) { scripted = true; setup.onMessage({ t: "scripted" }); }
    }
    if (s.status === "ended") setup.onMessage({ t: "ended" });
    if (s.status === "closed" && last !== "closed") setup.onMessage({ t: "refused", code: "case_failed" });
    last = s.status;
  });

  let up = true;
  return {
    playAgain: () => client.send({ t: "playAgain" }),
    async dispose() {
      if (!up) return;
      up = false;
      stop();
      stopHaunt();
      client.close();
      root.unmount();
      await viewer?.dispose();
      split.remove();
    },
  };
}


export type SoloAudioDeps = Partial<Pick<HostAudioDeps, "fetchSpeech" | "createAudio" | "unlockAudio" | "fallbackSpeak" | "deadlineMs">>;

export function SoloTable({ client, ...audioOverrides }: { client: RoomClient } & SoloAudioDeps) {
  const snap = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const [now, setNow] = useState(() => Date.now());
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const audioRef = useRef<HostAudio | null>(null);
  const lastVoiceSeq = useRef(0);
  const [songHints, setSongHints] = useState<string[]>([]);
  const [songsCtrl] = useState<RoomSongsController>(() =>
    createRoomSongsController({
      onPublicLog: (line) => setSongHints((prev) => [...prev, line]),
    }),
  );
  const songUi = useSyncExternalStore(songsCtrl.subscribe, songsCtrl.getSnapshot, songsCtrl.getSnapshot);
  const lastSongSeq = useRef(0);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!snap.code || !snap.hostToken) {
      audioRef.current = null;
      return;
    }
    const browser = browserHostAudioSupport();
    const ha = createHostAudio({
      roomCode: snap.code,
      hostToken: snap.hostToken,
      fetchSpeech: audioOverrides.fetchSpeech ?? fetchHostSpeech(),
      createAudio: audioOverrides.createAudio ?? browser.createAudio,
      unlockAudio: audioOverrides.unlockAudio ?? browser.unlockAudio,
      fallbackSpeak: audioOverrides.fallbackSpeak ?? browser.fallbackSpeak,
      ...(audioOverrides.deadlineMs !== undefined ? { deadlineMs: audioOverrides.deadlineMs } : {}),
      onSubtitle: setSubtitle,
    });
    audioRef.current = ha;
    return () => {
      ha.dispose();
      if (audioRef.current === ha) audioRef.current = null;
    };
  }, [snap.code, snap.hostToken]);

  useEffect(() => {
    const ha = audioRef.current;
    if (ha === null) return;
    if (snap.speechOn === false) ha.stop();
  }, [snap.speechOn]);

  useEffect(() => {
    const ha = audioRef.current;
    if (ha === null || !snap.prefetch || snap.prefetch.length === 0) return;
    void ha.prefetch(snap.prefetch);
  }, [snap.prefetch]);

  useEffect(() => {
    const ha = audioRef.current;
    const cue = snap.voice;
    if (ha === null || cue === null || cue === undefined || cue.seq === lastVoiceSeq.current) return;
    lastVoiceSeq.current = cue.seq;
    void ha.onVoiceCue(cue);
  }, [snap.voice]);

  useEffect(() => {
    if (snap.songsSetting !== undefined) songsCtrl.setSetting(true, snap.songsSetting);
  }, [snap.songsSetting, songsCtrl]);

  useEffect(() => {
    if (snap.songMuted !== undefined) songsCtrl.setMuted(true, snap.songMuted);
  }, [snap.songMuted, songsCtrl]);

  useEffect(() => {
    const song = snap.activeSong;
    if (song === undefined) return;
    if (song === null) {
      songsCtrl.skip(true);
      return;
    }
    if (song.seq === lastSongSeq.current) return;
    lastSongSeq.current = song.seq;
    songsCtrl.startSong(song, { soundConsent: audioUnlocked });
  }, [snap.activeSong, audioUnlocked, songsCtrl]);

  useEffect(() => {
    if (snap.status === "ended" || snap.status === "closed" || snap.public?.phase === "ended") {
      audioRef.current?.dispose();
      songsCtrl.destroy();
    }
  }, [snap.status, snap.public?.phase, songsCtrl]);

  const view = snap.public;
  if (view === null) return <p aria-busy="true">Setting the table…</p>;
  const me = snap.private;
  const n = namesOf(view, snap.seat);
  const mine = view.active !== null && view.active === snap.seat;
  const left = secondsLeft(view, now);
  const lines = view.events.map((e) => eventLine(e, n)).filter((x): x is string => x !== null).slice(-8);

  // A Lock or a Sight from the Room comes first: the puzzle fills the shared screen, played by touch or mouse (integration 5.3).
  if (view.phase === "playing" && (snap.lock !== null || snap.sight !== null)) return <SoloLockLayer client={client} lock={snap.lock} sight={snap.sight} />;

  if (view.phase === "ended" && view.ending) {
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    return <Ending view={view} n={n} reducedMotion={reduced} songLine={snap.activeSong ?? null} />;
  }

  return (
    <div className="solo-table ui-stack">
      <p className="ui-status" role="status">
        Round {view.round} · {mine ? "Your turn" : `${n.seat(view.active)}'s turn`}
        {left !== null ? ` · ${left} s` : view.paused ? " · clock paused" : ""} · Haunt {view.haunt.level} of {view.haunt.max}
      </p>
      {snap.hostToken ? (
        <div className="ui-row" role="group" aria-label="Host voice controls">
          {!audioUnlocked ? (
            <button
              type="button" className="ui-button"
              onClick={() => {
                audioRef.current?.unlock();
                setAudioUnlocked(true);
              }}
            >
              Enable sound
            </button>
          ) : null}
          {snap.seat === 1 ? (
            <button
              type="button" className="ui-button ui-button--quiet" aria-pressed={snap.speechOn === true}
              onClick={() => {
                const next = snap.speechOn !== true;
                if (next) {
                  audioRef.current?.unlock();
                  setAudioUnlocked(true);
                }
                client.send({ t: "speech", action: next ? "on" : "off" });
              }}
            >
              Ghost voice
            </button>
          ) : null}
        </div>
      ) : null}
      {snap.hostToken ? (
        <SongControls
          ui={songUi}
          isMaster={snap.seat === 1}
          onSetting={(setting) => {
            songsCtrl.setSetting(true, setting);
            client.send({ t: "songsSetting", setting });
          }}
          onMute={(muted) => {
            songsCtrl.setMuted(true, muted);
            client.send({ t: "songMute", muted });
          }}
          onSkip={() => {
            songsCtrl.skip(true);
            client.send({ t: "songSkip" });
          }}
          onSingMyName={(yes) => {
            songsCtrl.setSingMyName(yes);
            client.send({ t: "singMyName", yes });
          }}
        />
      ) : null}
      {subtitle !== null ? <p className="ui-note" aria-live="polite" data-host-subtitle>{subtitle}</p> : null}
      {snap.seat === 1 && view.doorProblems.length > 0 ? (
        <p className="ui-notice" role="status">
          Playing without doors: {doorProblemLines(view.doorProblems, n.card).join(" ")}
        </p>
      ) : null}
      <GameSections view={view} me={me} seat={snap.seat} send={(m) => client.send(m)} refused={snap.refused} />

      <section className="ui-stack" aria-label="What happened">
        <ol className="ui-log" aria-live="polite">
          {lines.map((l, i) => <li key={`${view.events.length}-${i}`} className="ui-log-row">{l}</li>)}
          {[...(snap.songHints ?? []), ...songHints].map((h, i) => <li key={`sh-${i}`} className="ui-log-row">{h}</li>)}
        </ol>
      </section>
    </div>
  );
}
