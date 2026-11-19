import type { SongsSetting } from "@hauntology/shared/songs/lyrics";
import type { RoomSongUi } from "./room-songs";

/**
 * Song captions and Master/Player controls (game-songs 3.3, 4.1, Requirements 3.1, 4.1, 4.2, 5.1, 5.3).
 *
 * Built strictly from the shared `ui-` design-system elements (`ui-segments`, `ui-button`, `ui-speech`,
 * `ui-hint`, `ui-field--check`, `ui-check`) so there is no inline styling or custom CSS tokens.
 */
const SETTINGS: ReadonlyArray<{ value: SongsSetting; label: string }> = [
  { value: "off", label: "Off" },
  { value: "stock", label: "Stock only" },
  { value: "on", label: "On" },
];

export function SongControls({
  ui,
  isMaster,
  onSetting,
  onMute,
  onSkip,
  onSingMyName,
}: {
  ui: RoomSongUi;
  isMaster: boolean;
  onSetting: (setting: SongsSetting) => void;
  onMute: (muted: boolean) => void;
  onSkip: () => void;
  onSingMyName: (on: boolean) => void;
}) {
  return (
    <section className="ui-panel ui-stack" aria-label="Game songs">
      {isMaster ? (
        <div className="ui-stack" role="group" aria-label="Songs setting">
          <div className="ui-segments" role="radiogroup" aria-label="Songs mode">
            {SETTINGS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={ui.setting === opt.value}
                className={`ui-segment${ui.setting === opt.value ? " is-active" : ""}`}
                onClick={() => onSetting(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="ui-row">
            <button
              type="button"
              className="ui-button"
              aria-pressed={ui.muted}
              onClick={() => onMute(!ui.muted)}
            >
              {ui.muted ? "Unmute songs" : "Mute songs"}
            </button>
            <button
              type="button"
              className="ui-button ui-button--quiet"
              disabled={ui.playing === null}
              onClick={onSkip}
            >
              Skip song
            </button>
          </div>
        </div>
      ) : null}

      <div className="ui-field ui-field--check">
        <input
          className="ui-check"
          id="song-sing-my-name"
          type="checkbox"
          checked={ui.singMyName}
          onChange={(e) => onSingMyName(e.target.checked)}
        />
        <label className="ui-field-label" htmlFor="song-sing-my-name">
          Sing my name
        </label>
      </div>

      <div aria-live="polite" data-song-captions>
        {ui.captions !== null ? (
          <p className="ui-speech ui-hint">
            {ui.playing ? `${ui.playing.title}: ` : ""}
            {ui.captions}
          </p>
        ) : null}
      </div>
    </section>
  );
}
