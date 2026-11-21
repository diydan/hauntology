# Spirit table: the spike on real phones (spirit-table task 1.2) and the checks that need a browser

Written 2026-11-21. **Status: not run.** Everything the Table does that a jsdom test can prove is tested (`web/src/table/`, `shared/src/table/`); what needs a real phone or a real GPU is listed here as steps, with the answer to record. Nothing below has been done by the agent that wrote it.

Build under test: the branch `feat/overnight-spirit-voice-play`, the Controller demo page (`web/controller-demo.html`) with a Room that gives the Controller a `table` feed (`StandInPort.setTable`).

## What the tests already cover

| Check | Covered by | What it cannot see |
|---|---|---|
| At most 30 frames a second, no draw when hidden or face down, still under reduced motion, the list when WebGL is missing | `web/src/table/SpiritTable.test.tsx` (fake renderer and clock) | the real frame rate and heat |
| Place reads the way the phone points at the tap and puts the Table 0.85 m along it, facing the Player; the board arrow after 2 s | `view.test.ts`, `SpiritTable.test.tsx` | whether the compass heading is right on a real phone |
| The 8 pixel carry threshold, the drop making or taking back the Theory mark, the rag doll standing back up within 2 s | `carry.test.ts` (with a property test), `SpiritTable.test.tsx` | how it feels under a thumb |
| The scene graph (six rooms, standees, relics, tags) and its sync | `threeScene.test.ts` (no renderer) | what the GPU draws: the one file that is unverified is `renderer.ts` |
| The camera backdrop is off until tapped, stops on hide and close, one line on refusal | `camera.test.tsx`, `SpiritTable.test.tsx` | the real permission prompt |
| Nothing is sent or stored, no picture or sound of its own, loaded only when switched on | `source.test.ts`, `SpiritTable.wiring.test.tsx` | |

## 1. T1 to T4 on a real phone (task 1.2)

Do these on one Android phone and one iPhone (Safari and the installed web app), each with and without the camera.

| Assumption | Steps | Record |
|---|---|---|
| T1 drift | Turn Tilt on, tap Place, then hold the phone still for 30 seconds and turn it away and back twice. | How far the Table moved (degrees or what you see), and whether one Place tap puts it right. |
| T2 size | Look at the Table at arm's length. | Is 40 cm wide at 0.85 m comfortable; can a thumb hit a Suspect, a Pawn and the four controls. |
| T3 cost | Play 20 minutes with the Table on at 30 frames a second, once with the camera. | Battery used and how warm the phone gets. |
| T4 camera | In the installed web app on iPhone, tap Camera. | Does the prompt appear, does the backdrop show, does Stop and closing the Table stop the camera light. |

## 2. Real-browser access pass (task 4.1)

At 320 by 568 and at 390 by 844 CSS pixels: the four controls (Camera, Place, Tilt, Clues) are 48 px tall and share one row; no sideways scroll; no console error; the Table list is one tap away; with WebGL turned off the list is the only view and says why. (`table.css` is tested to say 48 px and four equal columns; only a browser can show the result.)

## 3. Drag to mark in a real browser (task 6.8)

At both sizes: put a finger on a Suspect and move it a little (under 8 px: it is a tap; over: it lifts, the phone buzzes once, the room under its feet lights, a ring shows where it will stand); let go over a room (a "maybe here" tag) and anywhere else (the mark goes, the Suspect goes back to the line-up); it swings like a limp doll and is upright again within 2 s; with reduced motion on it lifts and drops with no swing.

## 4. Shared look (tasks 5.3)

Next to the play-through (`pnpm voice-demo`) at 390 px and 1280 px: contrast, 44 px targets (these are 48), the focus ring, reduced motion, one solid yellow button.
