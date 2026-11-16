# Design Document

## Overview

Errands are a small layer on the Party Service. The pure logic lives in `shared/src/party/errands.ts` (choose an Errand, settle Done and Caught, score); the `PartyRoom` keeps open Errands in its private state and sends each one only to its Poltergeist. Nothing in the deal, the Turn loop or the Accusation path reads an Errand.

```ts
export const ERRAND_OBJECTS = ['spoon', 'mug', 'cushion', 'sock', 'pen', 'book', 'remote', 'glass of water', 'tea towel', 'apple', 'coat', 'key ring'] as const;
export type ErrandObject = (typeof ERRAND_OBJECTS)[number];
export type Errand = { id: number; from: Seat; target: Seat; object: ErrandObject; givenRound: number; doneTriedRound: number | null };
export function nextErrand(seed: number, from: Seat, given: number, targets: readonly Seat[], open: readonly Errand[], preferred: ErrandObject | null): Errand | null;
export function settleDone(e: Errand, answer: 'yes' | 'no' | 'timeout'): { done: boolean; scare: number };
export function settleCaught(open: readonly Errand[], caller: Seat, poltergeist: Seat, object: ErrandObject): { closed: Errand | null; bonusMs: number };
```

The Target's Yes/No is a private prompt, like the Rattle accept. The public log line never names the sender; the ending recap does, as with Frames.

## Correctness Properties

### Property 1: Errands pick only fair Targets
For every seed and seating, `nextErrand` returns null or an Errand whose Target is a human Detective who has not opted out, is never the sender, and does not repeat an open Errand's Target and object pair.
**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Errands never touch the case
For every game with Errands on or off and the same seed and actions, the Solution, every Hand, the Turn order and the winners are the same.
**Validates: Requirements 4.4**

### Property 3: Done and Caught settle once
An Errand is settled at most once; Done scores two Scare points only on Yes; a matching Caught closes it with no Scare points and 10 000 ms of Bonus Seconds; a wrong Caught changes nothing but the caller's call for the Round.
**Validates: Requirements 2.1, 2.2, 2.3, 3.2, 3.3**

## Testing

Property tests with fast-check for Properties 1 to 3; example tests for the photo preference (1.4), the recap (2.4), the setting and opt-out (4.1, 4.3) and the Controller screens (3.1, 4.2).

## Integration notes (2026-11-15)

Errands join in Phase 7 of the `integration` spec, through the Engine, behind the `errands` setting. The messages are listed in the `party-mode` design's integration notes.

## Shared look (design system, 2026-11-15)

The screens of this spec are built from `design/elements.css`, with the values of `design/tokens.json`; every element is shown, with its markup, on `design/catalogue.html` (run `pnpm voice-demo` and open `/design/`). The play-through in `tools/voice-demo` is the reference screen. Rules: `.kiro/steering/design-system.md`.

| Part of this spec | Elements |
|---|---|
| Errand card and the safety line | `ui-card ui-hint ui-button` |
| Caught picker | `ui-field ui-field-label ui-select ui-button--primary` |
| Opt out of being a Target | `ui-field--check ui-check` |

A screen's own style says only where things go. A piece that is missing is added to the elements and the catalogue first. The Controller screens are not built yet, so they are built from the elements the first time.
