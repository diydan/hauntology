import type { ReactNode } from "react";
import type { GameView } from "../game-view";

/**
 * The room's spoken-narration switch as every other phone sees it (ghost-voice 4.1, Multiplayer): the Master's phone changes it in the Master's
 * menu; here it is shown, not changeable (a disabled switch, with the reason in words). It reads the Room's own `speech` message
 * (`game.speechOn`), so the phone never guesses. Nothing is shown before the lobby exists or on the Master's own phone.
 */
export function SpeechRoomSwitch({ game, me }: { game: GameView; me: number }): ReactNode {
  const lobby = game.lobby;
  if (lobby === null || lobby.masterSeat === me) return null;
  const on = game.speechOn === true;
  return (
    <div className="ui-stack--tight" data-speech-room-switch>
      <button type="button" role="switch" aria-checked={on} aria-describedby="speech-room-note" disabled className="ui-button ui-switch">
        <span className="ui-switch-name">Spoken narration</span><span className="ui-switch-state">{on ? "On" : "Off"}</span>
      </button>
      <p className="ui-note" id="speech-room-note">Only the Master can change this.</p>
    </div>
  );
}
