import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../../styles/tokens.css";
import "../../../../../design/fonts.css";
import "../../../../../design/elements.css";
import { SongControls } from "../SongControls";
import type { RoomSongUi } from "../room-songs";

// A development page for the song captions and controls with fixed state (game-songs 4.3): the Master's controls with a song playing, and a Player's
// view with a caption showing. Not part of the production build (the build's pages are listed in vite.config.ts).
const none = (): void => undefined;
const playing = { title: "The Hour Before", songKey: "demo" } as unknown as RoomSongUi["playing"];
const master: RoomSongUi = { setting: "on", muted: false, singMyName: true, playing, captions: "The hall holds its breath, and so do we." };
const player: RoomSongUi = { setting: "stock", muted: true, singMyName: false, playing: null, captions: "Someone is humming in the attic." };

// The checkbox has a fixed id, so one view at a time: `?view=player` for the Player's.
const asPlayer = new URLSearchParams(location.search).get("view") === "player";
const root = document.getElementById("root");
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <main className="ui-stack">
        <h1 className="ui-heading">Game songs</h1>
        {asPlayer
          ? <SongControls ui={player} isMaster={false} onSetting={none} onMute={none} onSkip={none} onSingMyName={none} />
          : <SongControls ui={master} isMaster onSetting={none} onMute={none} onSkip={none} onSingMyName={none} />}
      </main>
    </StrictMode>,
  );
}
