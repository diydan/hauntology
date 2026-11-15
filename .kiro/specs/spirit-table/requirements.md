# Requirements Document

## Introduction

The Spirit table is an optional private layer of Party Mode: a small 3D haunted house that stands on the Player's own table when they look through their phone. Its six rooms are the six Zones, the six Suspects stand in a line-up at the front, the six Relics sit on a shelf, every Player has a pawn, and the Whisper floats above. Nobody else sees it and the TV does not show it. It is drawn only from what the phone may already see (the Public View, the Player's own Private View and the Player's own notebook), so it adds no hidden information, no message and no rule: it is a more atmospheric way to look at the case, and a place for the Spirit clues of the `puzzles` spec to hang around. The phone's tilt turns the view, and the Player may choose to see their own camera behind it (the camera was allowed for Spirit clues by the owner on 2026-11-15, under the rules of `puzzles` 15.10). Every part has a text twin. A mockup, `tools/playtest/ar.html`, is the reference for the look; its people, rooms and notes are sample data.

## Glossary

- **Spirit table**: the optional private 3D layer described above.
- **Table**: the miniature house: a slab with six rooms, about 40 centimetres wide.
- **Piece**: anything drawn on the Table: a room, a Pawn, a Suspect standee, a Relic, the Whisper, a Mark, a Cold Spot glow.
- **Pawn**: the standee of one Player (a Bot too): their Seat Portrait, or a nickname chip.
- **Line-up**: the row of six Suspect standees along the front edge. **Shelf**: the row of six Relics at the side.
- **Mark**: one of the Player's own notebook marks (ruled out, or maybe), drawn as a floating tag tied to the Zone, Suspect or Relic it belongs to.
- **Place**: the tap that puts the Table in front of the Player, facing them, where the middle of the view meets an assumed table.
- **Table list**: the text twin of the Table: every Zone, Player, Suspect and Relic with its Marks.
- **Table data**: the only input of the drawing, `tableData(publicView, privateView, notebook)`.
- Other terms (Zone, Suspect, Relic, Player, Poltergeist, Haunt, Cold Spot, Public View, Private View, Room Code, Seat Portrait, solo case, Spirit lens) are as in the `party-mode` spec, and (Spirit clue, Clue ring, Clue list) as in the `puzzles` spec.

## Requirements

### Requirement 1

**User Story:** As a Player, I want to turn on a private 3D table that only my phone shows, so that the case feels like a real thing in front of me.

#### Acceptance Criteria

1. THE Spirit table SHALL be off by default and offered as a device switch on the Controller, a Player SHALL turn it on for themselves from an explicit tap that also asks for motion permission, and the Master SHALL have no way to turn it on for anyone.
2. THE Spirit table SHALL be absent in a solo case (the rule that removes the Spirit lens) and WHEN `SPIRIT_TABLE_ENABLED` is false, and every rule of the game SHALL run the same with it on, off or absent.
3. THE Spirit table SHALL show nothing on the Host, the Display or any other phone, SHALL send nothing to the Room, and SHALL NOT pause, add to or change the Turn Clock, Resolve, a Cue or any rule.
4. THE Spirit table SHALL load only when it is switched on, so that a phone that never turns it on downloads none of its code or pictures.

### Requirement 2

**User Story:** As a Player, I want to see the rooms, the suspects and the Whisper as small pieces on a table, so that I can think about the case by looking at it.

#### Acceptance Criteria

1. THE Table SHALL have six rooms, one for each Zone of the Public View's pool, each labelled with the Zone's name, in a seeded cosmetic layout that says nothing about where the Zones are in the world.
2. THE Table SHALL stand a Pawn for every Player in the room of the Zone named by that Player's latest public `suggest` or `inspect` event, or beside the front door WHEN there is none, SHALL draw the Pawn of a Poltergeist in black and white for the rest of the game, and SHALL ring the Pawn of the Player whose Turn it is.
3. THE Table SHALL stand the six Suspects in a Line-up along the front edge and the six Relics on a Shelf at the side, in the order of the Public View's pool, and SHALL NOT put a Suspect or a Relic in a room, because no Suspect or Relic has a place in the rules and a standee in a room would look like a clue.
4. WHERE the Haunt has a Cold Spot THEN the Table SHALL draw a pale cold glow over that room, and the Whisper SHALL float above the Table, hovering over the Cold Spot room when there is one and otherwise drifting from room to room on a seeded tour, glowing more as the Haunt level rises, and none of this SHALL depend on the Solution, a Hand or a Residue position.
5. THE Controller SHALL draw each Suspect and Pawn as a flat standee of its picture, with a round card where the picture has no cut-out background, that turns about its up axis only to face the Player, and SHALL use no picture, voice or model that the Room does not already hold.
6. WHEN the Player taps a piece THEN a card SHALL name it and say what the Player may know of it: for a room its Pawns, the Player's own Marks and whether the Player inspected it, for a Suspect or a Relic the Player's own Marks, and for a Pawn the nickname and whether they have joined the haunting.

### Requirement 3

**User Story:** As a Player, I want the table never to give anything away, so that it is fair for everyone at the real table.

#### Acceptance Criteria

1. THE drawing SHALL take only Table data: the Public View, the Player's own Private View and the Player's own notebook, and SHALL depend on no other Player's Private View, Hand, notebook or Residue position, and on the Solution only WHEN it is public at the end of the game.
2. THE Table SHALL draw the Player's own Marks as floating tags tied by a thin line to their Zone, Suspect or Relic, SHALL show the Zones the Player inspected with a light mark, and SHALL never draw a Mark for anyone else.
3. WHEN the game has ended and the Solution is public THEN the Table MAY light the Solution's Zone, Suspect and Relic, and before that it SHALL NOT.
4. THE Spirit table SHALL keep nothing: no Mark, direction, picture or reading SHALL be stored or sent, and it SHALL add nothing to the telemetry.

### Requirement 4

**User Story:** As a Player, I want to put the table down and look around it by turning my phone, so that it feels like it is really there.

#### Acceptance Criteria

1. WHEN the Player taps Place THEN the Controller SHALL read the way the phone points at that moment (from the phone's own orientation, never from an earlier view) and put the Table along it, 0.85 metres from the phone in a straight line, facing the Player, never higher than a table 28 centimetres below the phone and never closer than 30 centimetres across the floor, so that it is in view whenever the phone points level or down, with one soft ring pulse that reduced motion leaves out, and a second Place SHALL put it where the view now points.
2. WHILE the Player turns the phone THEN the view SHALL turn with it, from the orientation sensor, and the Table SHALL stay in the same direction (three degrees of freedom), SHALL NOT follow the Player's steps, SHALL use no marker and no tracking of the room, and the Controller SHALL say once that it can drift and that Place centres it again.
3. WHERE there is no motion sensor, the permission is denied or Tilt is off THEN the Player SHALL turn the view by dragging, and the Table SHALL stand in one fixed place.
4. THE Table SHALL be about 40 centimetres wide, with Pawns and Suspects about 10 centimetres tall and the Whisper about 20 centimetres tall, so that the whole Table fits a portrait phone that is 320 CSS pixels wide held at arm's length.
5. WHEN the Player taps THEN the Controller SHALL pick the piece under the finger, preferring a Pawn, a Suspect, a Relic or the Whisper to the room beneath it, and the Whisper's tap area SHALL be narrower than her picture so that she does not block the rooms behind her.
6. WHEN the Table has been out of the view for 2 seconds THEN the Controller SHALL show an arrow at the edge of the view, labelled "board", pointing towards it, until it is back in view.

### Requirement 5

**User Story:** As a Player, I want to choose whether my own camera shows behind the table, so that it can sit on my real table or on a plain dark one.

#### Acceptance Criteria

1. THE Table SHALL be drawn over a dark stand-in table by default and, only from the Player's own tap on "Camera", over the phone's rear camera under the rules of `puzzles` 15.10: off each time the layer opens, shown in a video element only and never recorded, stored, copied to a canvas, analysed or sent, with a visible indicator and a stop control, stopped when the Table closes, the page is hidden or the Player stops it, and WHERE the permission is refused or there is no camera THEN one line of text SHALL say so and the stand-in table SHALL stay.
2. THE Table SHALL look and work the same over both backdrops.

### Requirement 6

**User Story:** As a Player with any phone, hands and eyes, I want the table to be comfortable and to have a plain-text way in, so that it never locks me out.

#### Acceptance Criteria

1. THE Table SHALL draw at most 30 frames a second, SHALL pause when the phone is face down or the page is hidden, SHALL be still under reduced motion (no Whisper drift, bob, mist, sway or ring pulse), and SHALL show one fixed view where there are no sensors.
2. EVERY control (Camera, Place, Tilt, Clues, and the card's Close) SHALL have a touch target of at least 48 CSS pixels and SHALL sit side by side in one row at 320 CSS pixels wide, and no piece SHALL be told apart by colour alone: a Pawn has a nickname, a ruled-out Mark has a cross and a maybe Mark has a question mark.
3. THE Table list SHALL give every room (with its Pawns and the Player's Marks), Suspect and Relic as text, SHALL be one tap away, SHALL be the only view WHEN WebGL is missing, and EVERY piece SHALL have a text label for a screen reader.
4. THE Spirit table SHALL make no paid call and no model call, SHALL use no SpendTicket and no new sound file, and every picture it loads SHALL be at most 120 kilobytes.

### Requirement 7

**User Story:** As a Player, I want the Spirit clues of a puzzle to hang around my table, so that the clues and the case are in one place.

#### Acceptance Criteria

1. WHEN Spirit clues (`puzzles` Requirement 15) are on THEN the Clue ring SHALL hang round the same viewpoint as the Table and turn with the same view, the Clues control SHALL show how many clues are read, and this spec SHALL define nothing about the clues, their placement or their reading.

### Requirement 8

**User Story:** As a Player, I want the screens of this feature to look and behave like the rest of the game, so that it feels like one place. (Shared look)

#### Acceptance Criteria

1. THE screens of this spec (phone) SHALL be built from the design system: the colours, sizes, gaps, corners and times of `design/tokens.json` (through `web/src/styles/tokens.css`), the shared `ui-` elements of `design/elements.css` and the fonts of `design/fonts.css`, and SHALL write no colour, gap, corner, text size or time of their own.
2. WHEN a screen of this spec needs a piece the elements do not have THEN the piece SHALL be added to `design/elements.css` and `design/catalogue.html` in the same change and then used, and the screen's own style SHALL say only where things go.
3. THE phone screens SHALL use `ui-panel`, `ui-button`, `ui-notice` and `ui-status`, SHALL draw the Table, the ghost and the clues with colours from `shared/src/design/tokens.ts`, and SHALL keep every control at least 44 CSS pixels.
4. THE screens SHALL keep the rules of the `design-system` spec: text at least 4.5 to 1, every control at least 44 CSS pixels, a lantern focus ring, every fade one of the three fade tokens and none under reduced motion, yellow as the main colour, and green only for the Whisper and the tick box.
