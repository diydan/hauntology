# Requirements Document

## Introduction

World clues move some puzzle clues out of the phone and into the shared haunted world on the TV, in the spirit of Myst: the stopped clock, the plaque with a code, the fuse box, the shelf and the photo stand in the rooms themselves. Everyone can see them, so watching the active Player walk the house becomes part of the game. Each clue carries a small sign, and the Lock names the sign it needs; a second clue of the same kind with another sign and another answer makes noticing not enough: you have to remember which is which. The phone Sights of the `puzzles` spec stay, and the Master chooses where clues live.

## Glossary

- **World Clue**: a clue for one Memory Kind Lock, drawn as an object in the shared world (a wall clock, a plaque, a fuse box, a shelf, a framed picture) near a Zone.
- **Sign**: one of six simple marks (moon, key, eye, hand, star, bell) drawn on a World Clue and shown by the Lock it belongs to.
- **Decoy**: a World Clue of the same Kind as a real one, with a different Sign and a different answer, that belongs to no Lock.
- **Clue place setting**: a Room setting, `phone` (Sights as today) or `world` (World Clues), set by the Master.
- Other terms (Lock, Memory Kind, Sight, Faded, Assist, Zone, Host, Viewer, Public View, Private View, Bot) are as in the `puzzles`, `party-mode` and `world-viewer` specs.

## Requirements

### Requirement 1

**User Story:** As a Player, I want clues in the house itself, so that looking around the world matters.

#### Acceptance Criteria

1. WHERE the Clue place setting is `world` and a game starts THEN the Room SHALL choose up to three Memory Kind Locks by seed (the others keep phone Sights) and SHALL place, for each, one World Clue showing its answer and one Decoy of the same Kind, each in a different Zone from the Lock and from each other, deterministically from the seed.
2. THE Room SHALL give every World Clue and Decoy in a game a different Sign, and SHALL give every Decoy an answer different from its real clue.
3. THE Room SHALL choose World Clues, Decoys, Signs and places without reading the Solution, a Hand or a Residue position, and a World Clue SHALL show only a puzzle answer, never a card.
4. WHERE the Clue place setting is `phone` THEN the Room SHALL give Sights exactly as the `puzzles` spec says and place no World Clue.

### Requirement 2

**User Story:** As a Player watching the TV, I want world clues to be readable but not free, so that walking and remembering both count.

#### Acceptance Criteria

1. THE Viewer SHALL draw each World Clue and Decoy as a still object in the world with its Sign on it, and SHALL show its answer clearly only while the shared camera is within 3 metres and facing it, as an orb grows clearer when the camera comes near.
2. THE Host SHALL read the answer of a World Clue only from the Public View, which SHALL hold World Clues and Decoys and no Lock answer that is not drawn in the world.
3. A World Clue SHALL use no flashing and no animation beyond a slow glow, within the photosensitivity limits of the `party-mode` spec, and its answer SHALL never be shown by colour alone.

### Requirement 3

**User Story:** As a Player at a Lock, I want to know which clue I need, so that the puzzle is fair.

#### Acceptance Criteria

1. WHEN a Memory Kind Lock opens with the Clue place setting `world` THEN the Lock SHALL show the Sign it needs and a prompt such as "Set the clock marked with the moon", and SHALL show no answer.
2. WHERE Assist is on THEN the notebook SHALL keep a picture of each World Clue and Decoy that was within reach of the shared camera during that Player's own Turn, and the Lock SHALL offer "See the clue again" for those only.
3. WHERE a Player opens a Lock whose World Clue was never in view during the game THEN the Lock SHALL run Faded, as the `puzzles` spec says.
4. A Bot SHALL never use a World Clue, and its Inspect SHALL stay a plain Inspect.

### Requirement 4

**User Story:** As a Player, I want the Lock, the notebook and the clues in the world to look and behave like the rest of the game, so that they feel like one place. (Shared look)

#### Acceptance Criteria

1. THE screens of this spec (the Lock and the notebook on the Controller; the clues drawn in the Viewer) SHALL be built from the design system: the colours, sizes, gaps, corners and times of `design/tokens.json` (through `web/src/styles/tokens.css`), the shared `ui-` elements of `design/elements.css` and the fonts of `design/fonts.css`, and SHALL write no colour, gap, corner, text size or time of their own.
2. WHEN a screen of this spec needs a piece the elements do not have THEN the piece SHALL be added to `design/elements.css` and `design/catalogue.html` in the same change and then used, and the screen's own style SHALL say only where things go.
3. THE Lock SHALL show the Sign it needs and its prompt with `ui-prompt` and the Sign's name in words (`ui-chip`) beside its mark, THE notebook SHALL list each kept clue picture in a `ui-panel` with `ui-log` rows, and THE clues drawn in the Viewer SHALL take their colours and glow from `shared/src/design/tokens.ts`, never from a value of their own, and SHALL still show their answer by more than colour.
4. THE screens SHALL keep the rules of the `design-system` spec: text at least 4.5 to 1, every control at least 44 CSS pixels, a lantern focus ring, every fade one of the three fade tokens and none under reduced motion, yellow as the main colour, and green only for the Whisper and the tick box.
