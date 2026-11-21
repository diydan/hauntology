import { type ReactNode } from "react";
import type { SpiritClue } from "@hauntology/shared/puzzles/clues";
import type { OrientationSource } from "../../table/orientation";
import { ClueRing, type ClueRingProps } from "./ClueRing";

/**
 * The Clue ring in place of a Sight (puzzles 10.8): the chunk that is loaded only when the Player has the "Spirit clues" switch on and a Safe code
 * Sight arrives. It is a thin frame round `ClueRing` with a title; `onDone` is the same acknowledgement a plain Sight gives, so the Turn treats
 * the ring exactly as a Sight. The Faded clue at a Lock is not this: it stays plain text (`SightCard`).
 */
export type SpiritSightProps = Readonly<{
  clues: readonly SpiritClue[];
  assist: boolean;
  orientation: OrientationSource | null;
  buzz: () => void;
  onDone: () => void;
  onRead: (read: ReadonlySet<string>) => void;
}> & Pick<ClueRingProps, "createRenderer" | "media" | "reducedMotion" | "label">;

export default function SpiritSight(p: SpiritSightProps): ReactNode {
  const { clues, assist, orientation, buzz, onDone, onRead, ...ports } = p;
  return (
    <div className="ui-panel ui-stack--tight" role="dialog" aria-label="Something to remember, in the air">
      <h2 className="ui-heading">Something to remember</h2>
      <p className="ui-hint">The clues hang in the air round you. Turn round and look at each to read it.</p>
      <ClueRing clues={clues} assist={assist} orientation={orientation} buzz={buzz} onDone={onDone} onRead={onRead} {...ports} />
    </div>
  );
}
