# Requirements Document

## Introduction

The world viewer lets a visitor walk through a World Bundle in the browser (desktop and phone) and adds the "haunt layer": a tonal grade, gentle flicker, memory orbs and a ghost billboard. It consumes the manifest produced by the world pipeline and exchanges a small set of events with the ghost engine. It must stay comfortable (performance, photosensitivity, accessibility) and degrade gracefully when WebGL2 or the collider is unavailable.

## Glossary

- **Viewer**: the `web/src/viewer` feature (three.js + Spark).
- **Manifest**: the validated `world.json` from the world pipeline.
- **Splat**: the Gaussian-splat asset rendered with Spark.
- **Collider**: the invisible mesh used for collision and floor snapping.
- **Anchor**: a position where a memory can be found (supplied by the ghost engine).
- **Haunt Level**: a number from 0 to 1 set by the game that scales the haunt effects.
- **Quality Level**: a discrete rendering tier (resolution scale and splat LOD).
- **Input Mode**: `play` (movement active) or `chat` (movement suspended).
- **Atmosphere**: a frozen snapshot of the real-world conditions (weather class, time of day, moon, optional star texture) supplied by the shell through `setAtmosphere`; see the `conditions` spec.
- **Tilt to look**: turning a phone to turn the camera, as an alternative to dragging.

## Requirements

### Requirement 1

**User Story:** As a visitor, I want the world to load quickly and correctly oriented, so that I can start walking without confusion.

#### Acceptance Criteria

1. WHEN the visitor opens a world THEN the Viewer SHALL fetch the Manifest, choose a splat level of detail suited to the device from the available ones, and show labelled loading progress.
2. IF WebGL2 is unavailable or Spark fails to initialise THEN the Viewer SHALL fall back to a panorama view when a panorama exists, otherwise to the thumbnail, and the chat SHALL remain usable.
3. IF a splat download fails THEN the Viewer SHALL retry up to two times with backoff and then show an error with a link to the Gallery.
4. WHEN the splat has loaded THEN the Viewer SHALL apply the Manifest orientation fix and scale so that the world's up direction is +Y, and place the camera at the Manifest spawn pose.

### Requirement 2

**User Story:** As a visitor, I want to walk around naturally on desktop and phone, so that exploring feels effortless.

#### Acceptance Criteria

1. WHEN on a desktop THEN the Viewer SHALL support pointer-lock mouse look, WASD and arrow-key movement, Shift to sprint, and Esc to release the pointer.
2. WHEN on a touch device THEN the Viewer SHALL provide a left-side movement stick and right-side drag to look, and SHALL prevent page scrolling and zooming during play.
3. WHILE moving THEN the Viewer SHALL keep a constant eye height above the floor, use a walking speed of 1.4 m/s and a sprint multiplier of 1.6 in scaled world units, and produce the same path regardless of frame rate within a small tolerance.
4. WHERE a Collider is available THEN the Viewer SHALL prevent the player capsule from passing through geometry, snap the player to the floor, and allow slopes up to 35 degrees.
5. WHERE no Collider is available THEN the Viewer SHALL confine the player to a disc of fixed radius around the spawn at constant eye height.
6. IF the player position leaves the world bounds or falls below the floor margin THEN the Viewer SHALL return the player to the last safe position.

### Requirement 3

**User Story:** As a visitor, I want the place to feel haunted but gentle, so that it is atmospheric without being unpleasant.

#### Acceptance Criteria

1. WHEN the Haunt Level changes THEN the Viewer SHALL scale desaturation, vignette, film grain and dimming smoothly between their off and full values.
2. THE Viewer SHALL limit light flicker to at most three flashes in any one-second window with luminance change of at most 20%, and SHALL disable flicker when the visitor prefers reduced motion.
3. WHEN anchors are provided THEN the Viewer SHALL draw an orb at each unfound anchor whose intensity increases as the player approaches and drops to zero once the memory is found.
4. WHEN the ghost is present THEN the Viewer SHALL draw the ghost sprite as a camera-facing, vertically locked billboard placed at least 1.2 m from the player and inside the world bounds, with a gentle bob.
5. WHERE ambient audio is enabled THEN the Viewer SHALL start a procedurally generated drone only after a user gesture, provide a mute control, and lower the volume while the chat is open.
6. WHEN the shell sends `setAtmosphere` THEN the Viewer SHALL tint and fog the world by weather class and time of day, draw rain or snow within a capped particle count (lower under a low Quality Level or reduced motion), show a sky from the supplied star texture at dusk and night, and SHALL change nothing about movement, collision, anchors or the Haunt Level.

### Requirement 4

**User Story:** As a visitor, I want clear, unobtrusive controls, so that I always know what I can do.

#### Acceptance Criteria

1. WHEN the player is within an anchor's radius or within 4 m of the ghost THEN the Viewer SHALL show an interaction prompt to speak with the ghost.
2. WHEN the chat opens THEN the Viewer SHALL release pointer lock and ignore movement input until the chat closes, and WHEN the chat closes THEN the Viewer SHALL restore play input.
3. WHILE playing THEN the Viewer SHALL show how many of the three memories have been found and provide access to the journal.
4. THE Viewer SHALL always display an Exit control.

### Requirement 5

**User Story:** As a visitor on modest hardware, I want smooth movement, so that I do not feel sick or give up.

#### Acceptance Criteria

1. WHEN rendering at the default level THEN the Viewer SHALL target at least 30 frames per second on an integrated-GPU laptop and at least 20 on a mid-range phone, and SHALL expose a debug overlay with frame rate when `?debug=1` is set.
2. WHEN the smoothed frame rate stays below 24 for 3 seconds THEN the Viewer SHALL step quality down one level, at most once every 5 seconds, never below the minimum level, and SHALL NOT step quality up within 30 seconds of a step down.
3. WHILE the page is hidden THEN the Viewer SHALL pause rendering.
4. WHEN the visitor leaves the world THEN the Viewer SHALL dispose all GPU resources and event listeners.

### Requirement 6

**User Story:** As a visitor with accessibility needs, I want to use the experience in my own way, so that it is not closed to me.

#### Acceptance Criteria

1. THE Viewer SHALL be fully operable with the keyboard alone, with all HUD controls focusable and a visible focus indicator.
2. WHERE the visitor prefers reduced motion THEN the Viewer SHALL disable flicker and camera bob and slow orb pulsing.
3. WHEN the visitor first enters a world THEN the Viewer SHALL show a content notice (dim, may flicker, press Esc or Exit at any time) and require acknowledgement.
4. THE Viewer SHALL present all ghost speech as text in a polite live region, never as audio only.
5. THE Viewer SHALL keep HUD text at a contrast ratio of at least 4.5:1 against its background.

### Requirement 7

**User Story:** As a visitor who finished, I want a keepsake, so that I can share what I found.

#### Acceptance Criteria

1. WHEN the visitor chooses "Save memory card" THEN the Viewer SHALL render an image containing the world thumbnail and the excerpts of exactly the memories found, truncated to a fixed length, and containing no personal metadata.

### Requirement 8

**User Story:** As a visitor on a phone, I want to turn the phone to look around, so that looking feels natural.

#### Acceptance Criteria

1. WHERE the Viewer runs on a phone THEN the Viewer MAY offer tilt to look, asking for motion permission once from an explicit tap, using a tap to calibrate the forward direction, ignoring wobbles below a threshold, changing only the look direction and never movement or collision, and keeping drag-to-look as the fallback when permission is denied or no sensor exists.

### Requirement 9

**User Story:** As a Player, I want the screens of this feature to look and behave like the rest of the game, so that it feels like one place. (Shared look)

#### Acceptance Criteria

1. THE screens of this spec (Play) SHALL be built from the design system: the colours, sizes, gaps, corners and times of `design/tokens.json` (through `web/src/styles/tokens.css`), the shared `ui-` elements of `design/elements.css` and the fonts of `design/fonts.css`, and SHALL write no colour, gap, corner, text size or time of their own.
2. WHEN a screen of this spec needs a piece the elements do not have THEN the piece SHALL be added to `design/elements.css` and `design/catalogue.html` in the same change and then used, and the screen's own style SHALL say only where things go.
3. THE Play screen SHALL show the memory lamps, the Hint's compass and bars with `ui-lamps`, `ui-compass` and `ui-bars`, the ghost's speech with `ui-dialogue`, `ui-speech` and `ui-nameplate`, the Chat with `ui-sheet` and `ui-log`, and an always visible Exit with `ui-button`; and the memory card SHALL draw with `shared/src/design/tokens.ts`.
4. THE screens SHALL keep the rules of the `design-system` spec: text at least 4.5 to 1, every control at least 44 CSS pixels, a lantern focus ring, every fade one of the three fade tokens and none under reduced motion, yellow as the main colour, and green only for the Whisper and the tick box.
