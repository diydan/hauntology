# Design Document

## Overview

The Spirit table is a view of the case, not a part of it. The Room already sends the phone everything the table draws: `publicView.pool` (the six Zones, Suspects and Relics), `players` (seat, nickname, Poltergeist, connected), `turnSeat`, `haunt` (level, maximum, Cold Spot), the public `log` (a `suggest` or `inspect` event names the seat and the Zone) and, only when the game has ended, the Solution; and `privateView` (the Player's own Hand, shown cards and found Residue); and the phone's own notebook. So there is no new route, message, field or stored state. The pure parts live in `shared/src/table/` (no clock, sensor or network inside); the drawing is a three.js scene in `web/src/table/` that the web app already has the library for, loaded as a lazy chunk when the switch is on.

This spec builds on the Spirit lens of `party-mode` (Requirement 16) without changing it: the lens draws a layer around the Player and uses no camera; the Table is an object on a table and may show the camera behind it, as `puzzles` 15.10 allows for Spirit clues. The party-mode design says that lining a layer up with the TV picture needs the camera and markers and is outside that spec; the Table does not line up with the TV at all.

## The mockup and this spec

`tools/playtest/ar.html` (live on the playtest site at `/ar`) is the look reference. It was built with sample data, and it differs from this spec on purpose:

| The mockup does | This spec says |
|---|---|
| Stands Suspects in rooms. | A Line-up along the front edge (2.3): no Suspect has a place in the rules, and a Suspect in a room would look like a clue. |
| Puts three relics in rooms. | The six Relics on a Shelf (2.3). |
| Names six fixed rooms (Library, Study...). | The six Zone names of the pool, in a layout seeded from the Room Code (2.1). |
| Shows two sample notes on rooms. | The Player's own Marks, tied to Zones, Suspects and Relics (3.2). |
| Tours the Whisper through a fixed list. | Over the Cold Spot room, else a seeded tour, glowing with the Haunt level (2.4). |
| Draws at full speed and always runs. | At most 30 frames a second, paused face down or hidden (6.1). |
| Has a Camera button. | The same, with an indicator and a stop control, off each time (5.1). |
| Points an arrow to the board when it is out of view. | The same (4.6). |
| Is a stand-alone page with its own list. | A Controller layer with a Table list (6.3). |
| Lets you drag a character onto a room, with a rag-doll swing, and keeps the mark for the page's lifetime. | The same (Requirement 8), but the mark is a Theory mark kept in the Player's own notebook, and the Table list has a way to set it without dragging (8.5). |

What the mockup proved: the board, the standees and the Whisper read well at 390 by 844 and at 320 by 568 CSS pixels; a tap picks a piece; the tilt, drag and fake-camera paths work in a desktop browser. What it did not prove: tilt drift, battery, heat and the camera on real phones (Spike spirit-table 1.1).

## Pure logic (`shared/src/table/`)

```ts
type Mark = 'ruled_out' | 'maybe';
type TableData = {
  rooms: { zone: string; name: string; slot: number; coldSpot: boolean; inspected: boolean; mark?: Mark }[];
  pawns: { seat: number; nickname: string; zone: string | 'door'; active: boolean; mono: boolean }[];
  suspects: { card: string; name: string; mark?: Mark; placedIn?: string }[];   // Line-up order is the pool order; placedIn is the Player's own Theory mark
  relics: { card: string; name: string; mark?: Mark }[];     // Shelf order is the pool order
  haunt: { level: number; max: number };
  ended?: { zone: string; suspect: string; relic: string };  // only when phase === 'ended'
};
tableData(pub: PublicView, priv: PrivateView, notebook: Notebook): TableData
tableLayout(roomCode: string, zones: readonly string[]): { zone: string; slot: number }[]
whisperAt(roomCode: string, zones: readonly string[], coldSpot: string | null, haunt: { level: number; max: number }, tMs: number, reducedMotion: boolean): { x: number; z: number; height: number; glow: number }
placeTable(dir: { x: number; y: number; z: number }, lastHeading: { x: number; z: number }): { x: number; y: number; z: number; facing: number }
tablePlan(i: { sensors: boolean; faceDown: boolean; hidden: boolean; reducedMotion: boolean; webgl: boolean; now: number }): { draw: boolean; frameMs: number; view: 'sensors' | 'drag' | 'list'; still: boolean }
```

**The Room seed never reaches a phone**, because the Solution can be derived from it. So the cosmetic layout and the Whisper's tour use a hash of the Room Code (which every phone already has) and the Zone ids, never the seed. `tableData` takes the two views and the notebook and nothing else, so a hidden fact cannot reach it by type, and a source-level test fails the build if a file in `shared/src/table/` imports `party/solution`, a Hand, a Residue position or the Room seed.

**Pawns.** A Pawn's room is the Zone of that seat's newest public `suggest` or `inspect` event, else `door`. The Public View has no per-Player position (the Host reports one shared camera), so "last seen" is the honest public fact. A Pawn is `mono` exactly when the seat is a Poltergeist, and the set of Poltergeists only grows (as `seatLook` in `party-mode`).

**Line-up and Shelf.** Pool order. A sort by anything else (a Hand, a Mark, the Solution) would leak, so the order is not allowed to be a function of anything but the pool.

**Layout.** Six slots in a 3 by 2 grid; the Zone to slot assignment is a seeded shuffle of the Zone ids by the Room Code hash, the same on every phone in the Room and meaningless in the world.

**The Whisper.** `whisperAt` is continuous in time: it eases between rooms over 3 seconds and rests 4.5, hovers over the Cold Spot room when there is one, floats 8.5 centimetres above the floor with a small bob (none under reduced motion), and `glow` rises with `haunt.level / haunt.max`.

**Place.** `placeTable` takes the unit direction the phone points, read from the phone's own orientation at the moment of the tap. The Table goes along that direction: its height is `dir.y × 0.85` but never above -0.28 metres (a table 28 centimetres below the phone, so its top is in view even when the phone is held upright), its distance across the floor is the rest of 0.85 metres but at least 0.3 metres, and its heading is the direction flattened onto the floor (the last heading when the phone points almost straight up or down, where the flat part is under 0.2). `facing` turns the front edge to the Player. **Aim before you place:** the first mockup placed the Table from the drag view that was on screen before Tilt switched on, so the Table landed behind the Player (98 degrees off) whenever the phone's compass heading was not zero. The direction must be read from the orientation the Player is using at the tap. The mockup now keeps this rule in `tools/playtest/js/ar-place.js` with a test.

**Plan.** `tablePlan` returns `draw` false when the phone is face down or the page is hidden, `frameMs` at least 33, `view` as `sensors` with a sensor and Tilt on, `drag` otherwise, and `list` when WebGL is missing, and `still` under reduced motion.

## Drag to mark (Requirement 8)

The pure parts are small. `roomAtPoint(x, z)` says which of the six rooms a point on the board is over (or none); `lineupPos(i, n)` and `slotPos(k)` give where a Suspect stands in the Line-up or in a room (three across, two rows, so six fit); and `applyDrop(marks, suspect, room | null)` returns the new set of Theory marks: it sets the Suspect's one room, or clears it, and touches no other Suspect. Dropping on a room sets, dropping anywhere else clears.

**The finger holds the head.** The finger's ray is cut with a flat plane at the height of the Suspect's head (a little above the board), and the Suspect hangs below that point. So the feet are in front of the finger on the screen, and the room under the *feet* is the one that counts. The room lights up and a ring on the floor shows the landing place, so the Player sees what a drop will do before it happens.

**Rag doll (`rag.ts`).** A chain of seven points hangs from the held point and is simulated in one fixed frame (not the figure's own), so the body lags when the finger moves. Each step does a Verlet move with damping, then eight rounds of keeping every link its length and a mild stiffness (so the body bends and does not fold), and floor clamping. The flat picture has 14 rows; each row is placed on the chain and turned to its tangent, so a chain hanging straight gives back exactly the flat picture (tested). When let go the top is no longer held, the body goes limp and falls 3 centimetres with one small bounce, and then a spring toward the upright pose ramps up over 0.45 seconds while gravity fades out; the figure is flat and still again about 1.1 seconds after it lands (measured), so the spec says two seconds. Bad input (an unreadable finger position, a huge time step) changes nothing or resets the chain, and never gives a point that is not a number. Reduced motion skips the chain: the Suspect lifts and drops with no swing.

**Notebook.** The Theory mark lives in the notebook the Controller already keeps on the phone. The Table reads it into `tableData` as `placedIn` and asks the notebook to set or clear it; the Table keeps nothing of its own (3.4). The Table list's room choice per Suspect (8.5) calls the same two functions, so the drag and the list can never disagree.

## The phone (`web/src/table/`)

`SpiritTable.tsx` builds a three.js scene at the Table's real size: a slab with an inlay, six floors with a rug and a label each, low interior walls with door gaps, tall back and side walls and an open front, a soft contact shadow, flat standees with a small base, a Whisper plane with a faded hem, a glow and a few mist points, Mark tags with a stem, and a ring under the picked piece. Lights are physical units (the Table is small, so candela values are small). `TableList.tsx` is the text twin. The backdrop is a canvas drawn once, or the camera in a `<video>` element under the three.js canvas, started with `getUserMedia({ video: { facingMode: 'environment' }, audio: false })` from the Camera tap only (`puzzles` 15.10). The controls are one row of four buttons: Camera, Place, Tilt and Clues.

Pictures come from the Seat Portraits and Ghost Profiles the Room already holds, shrunk to at most 120 kilobytes each. A cut-out (transparent background) is used where one exists, a round card where not.

## Changes this spec needs in other specs (not made here)

| Where | Change |
|---|---|
| `party-mode` Requirement 7.6 (solo case) | Add the Spirit table to what is absent in a solo case. |
| `party-mode` Controller settings | One device switch, "Spirit table", off by default, next to the Spirit lens switch. |
| `party-mode` Spirit lens (16.4) | None: the lens keeps "neither the camera nor markers". |
| `puzzles` Requirement 15 | None: the Clue ring only has to hang round the same viewpoint (7.1). |
| `party-mode` notebook (Controller) | One more local mark: a Theory mark, "this Suspect, maybe in this Zone", at most one per Suspect, never sent. The notebook's existing marks (ruled out, maybe) are unchanged. |
| `shared/src/app/csp.ts` | `Permissions-Policy` now allows `camera=(self)` (done 2026-11-15, with its tests). |
| `tech.md` | The unverified assumptions below; `SPIRIT_TABLE_ENABLED`. |
| `structure.md` | The `shared/src/table/` and `web/src/table/` folders. |

## Unverified assumptions (each retired by a spike)

T1. Tilt only: how far a Table drifts over 30 seconds of turning, worst on iPhone, and whether Place is enough to put it right.
T2. Size and distance: whether 40 centimetres wide and 0.5 to 1.4 metres away is comfortable, and whether the tap targets are big enough for a thumb.
T3. Cost: battery and warmth over a 20 minute game at 30 frames a second, with and without the camera behind it.
T4. Camera: whether the rear camera backdrop works in the installed web app on iPhone, and what the permission prompt looks like there.

## Left out on purpose

- Showing the Table on the TV or sharing it between phones: it is private by design.
- Pieces that move by game rules, a Suspect standing in a Zone by itself (only the Player's own Theory mark puts one there), or any piece that depends on the Solution, a Hand or a Residue position.
- Pinning the Table to the real room with WebXR or markers (Android only, and the owner put WebXR out of scope).
- Walking around the Table: three degrees of freedom do not track steps.
- A sound for the Table: it makes none.

## Error handling

- No sensor, a denied permission or Tilt off is not an error: the Player drags, and the Table stands in one fixed place.
- No WebGL: the Table list is the only view, with one line saying why.
- A refused or missing camera: one line of text and the stand-in table.
- A Public View without a pool yet (the lobby): the Spirit table switch is shown but the Table waits for the game to start.

## Testing strategy

- Property tests in `shared/src/table/`, seeded, at least 100 runs, with generators for Public Views, Private Views, notebooks, Room Codes, view directions and sensor states.
- The leakage test builds two states that differ only in hidden data (another Player's Hand, the Residue, the Solution before the end, another Player's notebook, the Room seed) and asserts the Table data is equal.
- A source-level check fails the build if `shared/src/table/` imports `party/solution`, a Hand, a Residue position or the Room seed, or if `web/src/table/` uses `MediaRecorder`, `ImageCapture` or `getDisplayMedia`, or draws the video to a canvas.
- Web tests use fakes for the orientation sensor, WebGL and the camera; a jsdom pass checks the Table list, the controls and the text labels.
- A real-browser pass at 320 by 568 and 390 by 844 CSS pixels checks that every control is 48 pixels and the four controls share one row.
- No test touches a real sensor, camera or network.

## Correctness Properties

### Property 1: The table reads only what the phone may already see
*For any* two game states that differ only in hidden data (another Player's Private View, Hand or notebook, a Residue position, the Room seed, or the Solution before the game has ended), `tableData` gives equal output for the same Public View, Private View and notebook, and shows the Solution only when the Public View says the game has ended.
**Validates: Requirements 3.1, 3.2, 3.3**

### Property 2: The layout is the same everywhere and says nothing
*For any* Room Code and six Zone ids, `tableLayout` gives the same slots every time, gives each Zone one of six different slots, uses no Room seed, and `tableData` lists the Suspects and Relics in exactly the pool's order and puts none in a room.
**Validates: Requirements 2.1, 2.3**

### Property 3: Pawns stand where the public log says
*For any* Public View, each Pawn is in the Zone of its seat's newest `suggest` or `inspect` event or at the door when there is none, exactly one Pawn exists for each seat, a Pawn is black and white exactly when its seat is a Poltergeist and never turns back, and exactly the seat whose Turn it is is ringed.
**Validates: Requirements 2.2**

### Property 4: The Whisper's tour reads nothing hidden
*For any* Room Code, Zones, Cold Spot, Haunt and time, `whisperAt` is the same every time, stays inside the Table's bounds, never jumps further than a small step between two moments a frame apart, hovers over the Cold Spot room when there is one, glows no less at a higher Haunt level, and is still under reduced motion.
**Validates: Requirements 2.4**

### Property 5: Place puts the table in front of the player
*For any* view direction (including straight up and straight down) and last heading, `placeTable` returns a position 0.85 to 0.92 metres from the phone in a straight line, at least 28 centimetres below it, within 30 degrees of the way the phone points whenever that is level or down, with the front edge turned to the Player, the same distance and height for the same view at any heading, and the same answer for the same input.
**Validates: Requirements 4.1**

### Property 6: The table obeys its limits
*For any* sensor state, visibility, WebGL and reduced-motion setting, `tablePlan` draws at most 30 frames a second, does not draw when the phone is face down or the page is hidden, gives the drag view without sensors, the list view without WebGL, and a still view under reduced motion.
**Validates: Requirements 4.3, 6.1**

## Shared look (design system, 2026-11-15)

The screens of this spec are built from `design/elements.css`, with the values of `design/tokens.json`; every element is shown, with its markup, on `design/catalogue.html` (run `pnpm voice-demo` and open `/design/`). The play-through in `tools/voice-demo` is the reference screen. Rules: `.kiro/steering/design-system.md`.

| Part of this spec | Elements |
|---|---|
| Controls and notes | `ui-button ui-notice ui-status` |
| The board, ghost and clues (3D or canvas) | colours from `shared/src/design/tokens.ts` |
| The list view | `ui-panel ui-log` |

A screen's own style says only where things go. A piece that is missing is added to the elements and the catalogue first. A screen built before this section moves onto the elements when it is next changed.

### Property 7: A drop only sets or clears the player's own theory mark
*For any* set of Theory marks, Suspect and drop point, `applyDrop` with a room gives exactly that Suspect that one room and leaves every other Suspect's mark as it was, with no room it clears that Suspect's mark and nothing else, never changes its input, and `roomAtPoint` finds each of the six rooms from any point inside it and no room from a point outside the board; and `tableData` puts a Suspect in a room only when its Theory mark says so, in a distinct place inside that room, and otherwise in the Line-up.
**Validates: Requirements 2.3, 8.2, 8.3**

### Property 8: The rag doll keeps its shape and stands back up
*For any* finger path and release, the rag doll's links stay within 8 percent of their length while held, no point is ever below the floor or not a number, a chain hanging straight bends the picture into exactly the flat picture, and after release the figure is upright and still within two seconds of landing.
**Validates: Requirements 8.1, 8.4**
