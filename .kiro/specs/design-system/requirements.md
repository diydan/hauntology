# Requirements Document

## Introduction

Hauntology has one look: black, dark brown, yellow as the main colour and a little green, with a mono face for the interface and a serif for what a ghost says. This spec makes that look something every screen is built from, instead of something each screen copies. The look is written down once as **design tokens** (`design/tokens.json`) and as reusable **elements** (`design/elements.css`, shown on `design/catalogue.html`). The play-through mockup (`tools/voice-demo`) was the first page built from them and is the visual reference.

## Glossary

- **Token**: one named value of the look (a colour, a text size, a space step, a corner, a time). Written once in `design/tokens.json`.
- **Palette**: the colours by their own names (`--ink`, `--wood`, `--lantern`, `--ghost`...).
- **Role**: a job a colour does (`--text`, `--surface-raised`, `--accent`, `--danger`...), pointing at one palette colour. Elements use roles.
- **Element**: a reusable piece of screen, a `ui-` class in `design/elements.css` (a button, a stage, a lamp, a sheet). A **variant** is `ui-button--primary`; a **state** is a class set from script, such as `is-on`.
- **Catalogue**: `design/catalogue.html`, the page that shows every element and every token. Served at `/design/` by `pnpm voice-demo`.
- **Mockup**: the play-through page in `tools/voice-demo`.
- **Generated files**: `web/src/styles/tokens.css` and `shared/src/design/tokens.ts`, written from the token file.
- Other terms (Play screen, Host, Controller, Wander, Haunt) are as in the `party-mode` and `haunwallker` specs.

## Requirements

### Requirement 1

**User Story:** As the owner, I want every colour, size and time written down once, so that a change to the look is one edit and nothing drifts.

#### Acceptance Criteria

1. THE project SHALL keep every colour, role, font, text size, space step, corner, stroke, glow, shadow, motion time, touch size, breakpoint and layer in `design/tokens.json`, SHALL write `web/src/styles/tokens.css` and `shared/src/design/tokens.ts` from it with `pnpm build-tokens`, and SHALL not edit those two files by hand.
2. WHEN a generated file differs from what the token file makes, or a name is not lowercase words, or a colour is not a 6 digit hex, or a token has no note, or two tokens write one CSS name THEN `pnpm check-tokens` SHALL fail and SHALL write nothing.
3. THE six colours `.kiro/steering/visual-style.md` names (`--ink`, `--bone`, `--lantern`, `--ghost`, `--dust`, `--alarm`) SHALL keep their names and values, and the names the app already uses (`--fade`, `--target`, `--font-ui`, `--font-ghost`) SHALL keep working.
4. WHERE code cannot read a CSS variable (an SVG or canvas picture, a Three.js colour) THEN it SHALL take its colours from `shared/src/design/tokens.ts`, and the memory card SHALL do so.

### Requirement 2

**User Story:** As a Player, I want the game to look like one place, so that every screen feels like the same haunted house.

#### Acceptance Criteria

1. THE look SHALL be black (the page), dark brown in four steps (panel, raised, hovered, and the borders) with a stronger brown for dividers, cream text, yellow as the main colour, green as a rare accent and red for warnings.
2. THE elements SHALL use roles and not palette names, except for the light colours (the orb, the warm glow, true black).
3. THE only solid yellow controls SHALL be the one main button and the skip link; a choice that starts something (a story card) SHALL be brown with a yellow edge; green SHALL be used only for the Whisper (its light, glow, nameplate edge and orb) and the tick box; red SHALL be used only for warnings, Stop and the last Haunt segment.
4. THE stage SHALL be lit by whoever speaks: green for the Whisper, yellow for the Keeper, cream for a Suspect, and a portrait SHALL always be round.

### Requirement 3

**User Story:** As a Player with a small phone, poor eyesight or a need for less motion, I want every screen to be readable and reachable, so that nothing is lost on me.

#### Acceptance Criteria

1. THE token file SHALL list the text colours that may sit on each surface and `pnpm check-tokens` SHALL fail WHEN one is below 4.5 to 1; `--dust`, the line colours and the other shape colours SHALL never be text, and red text SHALL not sit on the hovered brown (4.18 to 1).
2. EVERY control SHALL be at least 44 CSS pixels tall (the main controls at least 52 on a phone), the words of a tick box SHALL be a target too, and the focus ring SHALL be the lantern.
3. EVERY transition SHALL use one of the three fade tokens (300, 400 and 600 ms), every fade SHALL be 0 ms WHEN the Player prefers reduced motion, the looping orb SHALL stop, and no element SHALL shake, flash or flicker.
4. TEXT sizes SHALL be in rem so the Player's own text size works, the interface SHALL be IBM Plex Mono and what a ghost says SHALL be Newsreader, both self-hosted in `design/fonts/` with their licences, and no screen SHALL request a font from another origin.

### Requirement 4

**User Story:** As a developer, I want a set of ready elements, so that a new screen is built by putting them together and looks right the first time.

#### Acceptance Criteria

1. THE elements SHALL be `ui-` classes in `design/elements.css`, named block, part, variant and `is-` state, and SHALL be made only of tokens: no raw colour, no raw gap, corner, text size or time (a test reads the file).
2. THE catalogue SHALL show every element with its class names and states and SHALL read its token tables from `design/tokens.json`, and a test SHALL fail WHEN an element is in `design/elements.css` and not on the catalogue.
3. A PAGE SHALL load `tokens.css`, `fonts.css` and `elements.css`, SHALL put `ui-page` on its body, and its own style SHALL say only where things go (grid areas, widths), never a colour, a type size or a corner; a test SHALL fail WHEN a page uses a `ui-` class or an `is-` state the elements do not define.
4. WHEN a screen needs a piece the elements do not have THEN the piece SHALL be added to `design/elements.css` and `design/catalogue.html` in the same change, made of tokens, and then used; it SHALL NOT be written in the screen's own style.
5. THE elements SHALL include the page and header, the text styles, the panel, card and modal, the buttons (default, main, primary, danger, quiet, story and transport), the fields, the stage with its portrait, orb, nameplate and dialogue, the HUD (lamps, compass, bars, Haunt meter and chips), the transport bar, the progress dots, the sheet with its folds, and the journal log.
6. THE sheet SHALL be a bottom sheet on a phone and a side panel from 900 pixels, and the breakpoints in `design/elements.css` SHALL be the ones in the token file.

### Requirement 5

**User Story:** As the owner, I want the mockup and the real game to share one look, so that what I approve in the mockup is what ships.

#### Acceptance Criteria

1. THE mockup SHALL be built only from the tokens and the elements, SHALL be the visual reference of the look, and SHALL show the catalogue at `/design/`.
2. THE web app SHALL load `design/fonts.css` and `design/elements.css` after `tokens.css`, and a screen built after this spec SHALL use the elements.
3. WHEN a screen built before this spec is changed THEN the change SHALL move that screen onto the tokens and the elements, and the first things to move are the raw hex colours in `web/src/puzzles/puzzles.css`.

### Requirement 6

**User Story:** As the owner, I want every spec with a screen to say so, so that the next person to build one is told to use the shared look.

#### Acceptance Criteria

1. EVERY spec that has a screen (`haunwallker`, `puzzles`, `party-mode`, `world-viewer`, `spirit-table`, `ghost-voice`, `integration`, `ghost-creator`) SHALL carry a Requirement named "Shared look" that points at `design/tokens.json` and `design/elements.css`, a section in its design that names the elements its screens use and points at `design/catalogue.html`, and a task that builds or moves its screens onto them.
2. THE steering file `.kiro/steering/design-system.md` SHALL tell a person or an agent building a screen to use the tokens and the elements, and when a new element may be added.
