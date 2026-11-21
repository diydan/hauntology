# Spike knock-door 7.1: the collider box across a doorway (a fake run, not the spike)

Written 2026-11-21 by an agent with no browser and no Gallery world. **Status: the real spike has not been run; task 7.1 stays open.** What a test can say about the maths is in `web/src/app/viewer/door-spike.test.ts`, which runs the Viewer's own `stepMovement` (so the real step clamp of 50 ms, the walk speed 1.4 m/s and the sprint multiplier 1.6) and its own door boxes (`createDoorColliders`) against a wall with a doorway in it. The wall is two long boxes of the same collider code standing in for a Gallery world's Collider mesh. The capsule radius is the Viewer's 0.35 m; the door box is 0.2 m thick.

## What the fake run found

| Question of the task | Fake result | Why |
|---|---|---|
| Does the walker stop cleanly? | Yes, head on, walking or sprinting, at 60, 30 and 20 frames a second: the eye stops 0.45 m from the box's middle (the capsule just touching it, within 2 cm), with no sideways drift. | The capsule is pushed out along the box's thin axis every step. |
| Does the walker slide? | Yes, along the wall when the approach is slanted (20, 45 and 70 degrees); it keeps moving along the wall and never enters it. | Only the part of the move across the box is pushed back. |
| Does the walker snag? | No snag in the fake: a walker pressed into the corner where the box meets the wall stays on its own side, and walks back out at once. A grid of 289 start points around that corner all end outside the door box and both wall boxes. | Two boxes of the same thickness meet square; the push out of one never pushes into the other by more than a pass can undo. |
| Does the walker step through at speed? | No. The longest step the Viewer allows (a 50 ms frame while sprinting) is 0.112 m, against 0.45 m from a stopped walker's centre to the box's middle plane. Frames of 50, 200 and 1000 ms (`stepMovement` cuts each to 50 ms) never cross. | A walker would have to move more than 0.45 m in one step to be pushed to the far side. |
| Is a walker caught inside the box when the door shuts? | Pushed out by the nearest face: the near half goes out the near side, the far half the far side. | Same push, from inside. |

## What the real spike must still do

1. In a **real Gallery world**, with its real Collider mesh round a real doorway: does the box sit where the doorway is (the door's place and wall angle come from the world's manifest and the Zone places, and the Room does not send Zone places yet, so the wall angle is 0 until it does)? Does the BVH Collider's own doorway edge snag against the box?
2. The **real frame rate** of a phone and a TV laptop: the fake covers 20 to 60 frames a second and any frame the Viewer clamps.
3. How the **stop feels**: a hard wall, with no sound of its own. The TV shows the door's marker and says so in words; whether that is enough is a person's call.
4. A **door shutting on a standing Player** (a Slam): the Slam rule shuts only a door nobody stands behind, but a walker who steps into the doorway the moment it shuts is pushed out by the nearest face.

Not found by the fake, so not claimed: that `PASSES = 3` in `door-colliders.ts` is needed (the one-pass version passes the same tests, because square boxes need one pass); it is a safety margin for angled walls.
