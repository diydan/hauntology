import { useMemo, type ReactNode } from "react";
import type { GameView } from "../game-view";
import { lightLevel, usePhoneSound, type SoundDeps } from "./phone-sound";

/**
 * The phone's sound and light, drawn behind everything (party-mode 9.14, 9.18): a flash overlay for a cue the phone cannot play (nothing under
 * reduced motion) and the grey of the light bar. Both are `aria-hidden` and take no touch; the log line is the words. The overlay colours are
 * the page's own tokens, never a colour of this file.
 */
export function PhoneEffects({ game, offsetMs, nowMs, deps, lightOn }: { game: GameView; offsetMs: number; nowMs: number; deps: SoundDeps; lightOn: boolean }): ReactNode {
  const flashing = usePhoneSound(game.sounds, offsetMs, deps);
  const level = useMemo(() => (lightOn ? lightLevel(game.lights, nowMs, offsetMs, deps.reducedMotion) : 0), [lightOn, game.lights, nowMs, offsetMs, deps.reducedMotion]);
  return (
    <>
      {flashing && !deps.reducedMotion ? <div className="pc-flash" aria-hidden="true" data-testid="pc-flash" /> : null}
      {level > 0 ? <div className="pc-light" aria-hidden="true" data-testid="pc-light" style={{ opacity: level }} /> : null}
    </>
  );
}
