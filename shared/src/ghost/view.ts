import type { Atmosphere } from "../conditions/types";
import type { PlayView, WanderLockView } from "../app/api";
import type { Anchor, GameState } from "./types";

/**
 * What the client may know of a game (Requirement 1.1): where the anchors are, which are found, the journal of what was found, whether it has ended,
 * and the look of the place. Never a seed, a hook or an unfound memory: the view is built field by field from the state's found memories only, and
 * the seeds are not even a parameter.
 */
export function clientView(input: {
  state: GameState;
  anchors: readonly Anchor[];
  atmosphere: Atmosphere | null;
  lock?: WanderLockView | undefined;
  locks?: { on: boolean; seen: string[] } | undefined;
}): PlayView {
  const { state, anchors, atmosphere, lock, locks } = input;
  return {
    found: [...state.found],
    anchors: anchors.map((a) => ({ id: a.id, pos: [a.pos[0], a.pos[1], a.pos[2]], radius: a.radius })),
    hauntLevel: Math.round((0.15 + (0.85 * state.found.length) / 3) * 100) / 100,
    ghostVisible: true,
    ended: state.ended,
    journal: state.memories.filter((m) => state.found.includes(m.anchorId)).map((m) => ({ anchorId: m.anchorId, text: m.text })),
    atmosphere: atmosphere === null ? null : { ...atmosphere },
    ...(lock !== undefined ? { lock } : {}),
    ...(locks !== undefined ? { locks } : {}),
  };
}
