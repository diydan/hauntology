# Requirements Document

## Introduction

The ghost creator lets the visitor design the ghost that haunts their place. Chosen traits and a short free-text detail feed three things: a portrait generated with FLUX.2 klein 9B on Workers AI, a transparent sprite (background removed) used as the chat portrait and the in-world billboard, and a persona that steers the ghost's voice in the chat. It must be safe, deterministic where possible, bounded in cost, and never block the game: if generation is unavailable a preset ghost is used.

## Glossary

- **Creator**: the `web/src/creator` UI plus its API routes and `shared/src/creator` logic.
- **Traits**: the structured choices (era, temperament, relationship to the place, palette, translucency, accessories, voice) and an optional free-text detail.
- **Portrait Candidate**: an image returned by the image model (FLUX.2) for the traits.
- **Sprite**: an RGBA PNG of the chosen ghost with the background removed.
- **Persona**: the structured voice description derived from Traits and the Place Brief.
- **Ghost Profile**: Traits, Sprite reference, Persona and a stable id.
- **Preset Ghost**: a pre-made Ghost Profile shipped with the app.

## Requirements

### Requirement 1

**User Story:** As a visitor, I want to design my ghost with simple choices, so that the haunting feels like mine.

#### Acceptance Criteria

1. WHEN the visitor opens the Creator THEN the Creator SHALL offer era (six options), temperament (six), relationship to the place (six), palette (six), translucency (30 to 80 percent in steps of 10), up to two accessories from eight, and voice (two: soft, spoken by the Whisper, or dry, spoken by the Keeper; the third character, the Lodger, speaks for every Suspect and is not a choice).
2. WHEN the visitor wants to add a personal touch THEN the Creator SHALL accept an optional free-text detail of at most 140 characters, prompted as "who were they to this place?".
3. WHEN the visitor taps Randomise or picks one of three presets THEN the Creator SHALL fill all traits with a valid combination.
4. IF the visitor skips the Creator THEN the Creator SHALL derive a default Ghost Profile deterministically from the world id so the same world always gets the same default ghost.
5. WHEN any trait value is outside its domain THEN the Creator SHALL reject it and show an error for that field only.

### Requirement 2

**User Story:** As the operator, I want free text made safe, so that it cannot break prompts or produce unsuitable content.

#### Acceptance Criteria

1. WHEN free text is submitted THEN the Creator SHALL strip control characters, markup characters and URLs, collapse whitespace, and enforce the 140-character limit.
2. WHEN sanitised free text is non-empty THEN the Creator SHALL obtain a safety verdict from a text-capable model and SHALL reject the text with a neutral message if the verdict is unsafe, and SHALL fail closed if the call fails.
3. WHEN free text is used in any prompt THEN the Creator SHALL place it only inside a delimited data block and SHALL NOT treat it as instructions.

### Requirement 3

**User Story:** As a visitor, I want to see my ghost's portrait and choose one, so that the ghost looks the way I imagined.

#### Acceptance Criteria

1. WHEN the visitor taps Generate THEN the Creator SHALL build the portrait prompt deterministically from the Traits and request two Portrait Candidates with two text-to-image calls to the image model, metered against the image quota.
2. WHEN candidates are shown THEN the Creator SHALL display the remaining image quota and let the visitor pick one or regenerate, where regenerate consumes quota.
3. IF the image quota is exhausted or generation fails THEN the Creator SHALL offer the Preset Ghosts instead and SHALL NOT block progress to the world.
4. THE Creator SHALL keep every portrait prompt within 900 characters and always include a fixed negative prompt excluding text, watermarks, extra limbs and gore.

### Requirement 4

**User Story:** As the Viewer, I want a clean transparent sprite, so that the ghost can stand in the world.

#### Acceptance Criteria

1. WHEN the visitor picks a Portrait Candidate THEN the Creator SHALL run background removal (Cloudflare Images `segment=foreground`), downscale to at most 768 px tall, and store an RGBA PNG of at most 1 MB.
2. IF the resulting alpha mask covers less than 8% or more than 85% of the image, or the subject touches the left or right edge, THEN the Creator SHALL retry once with a different seed and otherwise fall back to a Preset Ghost.
3. WHEN a Sprite is accepted THEN the Creator SHALL produce a Ghost Profile with a stable id containing the Traits, Sprite reference and Persona.

### Requirement 5

**User Story:** As a visitor, I want the ghost to sound like the person I designed, so that the conversation feels coherent.

#### Acceptance Criteria

1. WHEN a Persona is built THEN the Creator SHALL derive it purely from the Traits and Place Brief so that equal inputs give equal Personas.
2. WHEN a Persona is built THEN the Creator SHALL choose its name from a curated list for the selected era.
3. WHEN a Persona is built THEN the Creator SHALL include between three and six speech-style rules, a want, an avoidance, and exactly three memory archetypes: sound, person and promise.

### Requirement 6

**User Story:** As a visitor, I want my ghost to carry through the whole experience, so that it feels like one character.

#### Acceptance Criteria

1. WHEN a Ghost Profile exists THEN the Web app SHALL use the Sprite as the circular chat portrait with descriptive alt text and as the in-world billboard texture.
2. WHEN the visitor reloads THEN the Web app SHALL restore the same Ghost Profile for that world from storage.
3. WHEN the Creator finishes THEN the Web app SHALL show a short scripted "meet your ghost" line in the Persona's voice without calling any paid model.

### Requirement 7

**User Story:** As a Player, I want the screens of this feature to look and behave like the rest of the game, so that it feels like one place. (Shared look)

#### Acceptance Criteria

1. THE screens of this spec (Creator) SHALL be built from the design system: the colours, sizes, gaps, corners and times of `design/tokens.json` (through `web/src/styles/tokens.css`), the shared `ui-` elements of `design/elements.css` and the fonts of `design/fonts.css`, and SHALL write no colour, gap, corner, text size or time of their own.
2. WHEN a screen of this spec needs a piece the elements do not have THEN the piece SHALL be added to `design/elements.css` and `design/catalogue.html` in the same change and then used, and the screen's own style SHALL say only where things go.
3. THE Creator SHALL be built from `ui-card`, `ui-field`, `ui-select`, `ui-range` and `ui-button` (one `ui-button--primary`), with the picture of the ghost in a `ui-portrait`.
4. THE screens SHALL keep the rules of the `design-system` spec: text at least 4.5 to 1, every control at least 44 CSS pixels, a lantern focus ring, every fade one of the three fade tokens and none under reduced motion, yellow as the main colour, and green only for the Whisper and the tick box.
