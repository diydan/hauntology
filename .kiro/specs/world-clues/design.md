# Design Document

## Overview

World clues reuse the Sight payloads of `shared/src/puzzles/sight.ts`: a World Clue is a Sight with a Sign and a Zone, drawn by the Viewer instead of a phone card. Placement is pure logic in `shared/src/puzzles/world-clues.ts`; the `PartyRoom` adds the placed clues to the Public View; the Viewer draws them as props near their Zone anchors; the Lock prompt gains the Sign.

```ts
export const SIGNS = ['moon', 'key', 'eye', 'hand', 'star', 'bell'] as const;
export type Sign = (typeof SIGNS)[number];
export type WorldClue = { lockZone: string | null; zone: string; sign: Sign; sight: SightPayload }; // lockZone null: a Decoy
export function placeWorldClues(seed: number, zones: readonly string[], locks: readonly { zone: string; lock: Lock }[]): WorldClue[];
export function decoyFor(r: Rng, lock: Lock): SightPayload; // same Kind, different answer
```

A game has up to five Memory Kind Locks, and a real clue plus a Decoy for each would need ten Signs. So the Room puts at most three Locks in the world (three real clues, three Decoys, six Signs), chosen by seed; the other Memory Kind Locks keep phone Sights. Every Sign stays unique (1.2).

Nearness reuses the orb rule of `world-viewer`: the Viewer already knows the camera pose and each anchor; an answer fades in within 3 metres while the clue is in the view cone.

## Correctness Properties

### Property 1: World clues are placed fairly
For every seed and Zone set, `placeWorldClues` gives each chosen Lock exactly one World Clue and one Decoy, all in different Zones from the Lock and each other, with unique Signs, Decoy answers different from the real ones, and a result that does not change when the Solution changes.
**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: The Lock and its World Clue agree
For every placed real World Clue, the Lock it names accepts the answer drawn on that clue, and rejects the answer drawn on its Decoy.
**Validates: Requirements 1.2, 3.1**

## Testing

Property tests for Properties 1 and 2. Example tests for the `phone` setting (1.4), the Public View content (2.2), Assist and Faded (3.2, 3.3) and Bots (3.4). Viewer checks for nearness, stillness and labels (2.1, 2.3) in the world-viewer harness.

## Integration notes (2026-11-15)

World Clues join in Phase 7 of the `integration` spec, through the Engine. The placed clues and Decoys go into the Public View as `worldClues` (Zone, Sign, Sight) only when `cluePlace` is `world`; the Viewer draws them as props by the `world-viewer` rules for anchors, and the clue props must fit that spec's budget for objects in the world.
