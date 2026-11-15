# Hauntology table props: 3D design brief

For the 3D designers. Status: first draft, 2026-11-15. Every size below is a proposal. Change it if the mechanism needs it, and tell us what you changed.

**What we want back:** one STEP or STL per piece, the print orientation, and a 1:1 sticker outline (SVG or PDF) for every sticker area.

To see how each prop moves, open the matching page in `mockups/` (they are standalone HTML, no install). They are drawings, not real sizes.

## 1. Ground rules

1. **One colour per printed piece.** No painting and no multi-colour prints. Where a piece needs detail (faces, labels, wires, dials), leave a flat or 0.4 mm recessed **sticker area**. We print the detail on sticker paper.
2. **Bed limit 180 x 180 mm** (the game's own print checks use this). Split anything bigger with a dovetail or pin joint. Confirm our printer before you rely on it.
3. **Hardware is real.** Servos are SG90-class (body 23 x 12.2 x 29 mm, 32.5 mm across the tabs, two M2 screws). The controller is an ESP32 dev board. Keep a cable path and a screw boss for both. **Models to confirm: see section 5.**
4. **Make it printable:** PLA at 0.2 mm layers, 0.4 mm nozzle, walls at least 1.6 mm, no supports where you can avoid them. Moving parts need 0.3 mm of clearance. Screws (M2, M3) and snap fits are fine.
5. **Original shapes only.** Nothing that copies another game's pieces or art.
6. **Nothing printed is required to play.** The game works with no props, so props can be rough first drafts.

## 2. Colours

Colours come from the game's own palette (`design/tokens.json`) so the table matches the screen.

**Core set: 6 spools.**

| Name | Hex | Filament | Used for |
|---|---|---|---|
| Ink | `#0b0d10` | matte black | dial plate, pyramid holder, relic tray, stage rail, bats, standees |
| Leather | `#6b4d33` | mid brown (wood look is fine) | boxes, bases, stage frame, wires board, beam |
| Bone | `#e9e4d8` | warm white | flaps, seat plinths, wax hand, doll |
| Lantern | `#e0a43a` | amber or matte gold | needle, bezel, clasp, locket, bell, chandelier |
| Ghost glow | `#9fe8d0` | glow-in-the-dark green | ghost pieces only (a rare accent). Abrasive: needs a hardened nozzle. |
| Alarm | `#d4604a` | brick red | red max tab, curtain panels |

**Optional extras:** silver `#c9c9d4` for the silver key (or print it bone and add a silver sticker).

**Seat colours** (six players) are a **sticker disc on a bone plinth**, so you need no extra spools: `#ff6b6b` red, `#6bb6ff` blue, `#6be39a` green, `#ffd86b` yellow, `#c49bff` violet, `#ffb27a` orange. These six are our proposal. The game has not fixed them yet.

## 3. Pieces from the game itself

| Piece | Qty | Proposed size | Colour | Sticker details | Notes |
|---|---|---|---|---|---|
| **Relics:** music box, wax hand, locket, planchette, silver key, bell | 6 | 40 to 55 mm tall, one stands on each token | music box leather, wax hand bone, locket lantern, planchette leather, silver key silver or bone, bell lantern | engraving, keyhole, strings | Each needs a base that fits a Relic Token. |
| **Relic Token** (the base) | 6 | 40 x 40 x 6 mm plate | ink | **QR sticker 36 x 36 mm** in a 0.4 mm pocket | One QR per Relic. A phone scans it to pick that Relic. |
| **Pyramid holder** | 1 | four trapezoid faces: 60 mm base, 10 mm top, about 45 degrees to the screen. Make it parametric for bigger screens. | ink (matte, to cut glare) | none | Holds four clear plastic faces over a tablet or phone (the Pepper's ghost trick). |
| **Suspect standees** | 6 | silhouette about 70 mm tall, 3 mm thick, on a 40 x 15 mm base | ink | portrait sticker plus name strip | The silhouette comes from each ghost's picture, so the first batch can be blank standees with one flat sticker area. |

**QR decision:** a one-colour raised QR scans badly. Our default is a **sticker QR** in a recessed pocket.

**QR stickers: ready** in `qr/`. Six images (`hw-r1-music-box.png` to `hw-r6-bell.png`) and an A4 sheet (`qr-sticker-sheet-A4.pdf` and `.png`, two of each so one set is spare, with cut marks and a 50 mm check bar). The text in each is exactly `hw:r1` to `hw:r6`, the form the game accepts. Each is a version 1 code (21 x 21 modules), error level Q (a scratched sticker still scans), with the standard 4-module white border inside the 36 x 36 mm sticker. That gives 1.24 mm per module, above the game's 1.2 mm minimum. We decoded every image back to its text as a check.

| Id | Relic |
|---|---|
| r1 | music box |
| r2 | wax hand |
| r3 | locket |
| r4 | planchette |
| r5 | silver key |
| r6 | bell |

## 4. Pieces for the seven props

| Prop (mockup) | Parts and proposed size | Colours | Sticker details | Mechanism notes |
|---|---|---|---|---|
| **#1 Ghost in the box** | Chest body about 160 W x 90 D x 70 H, lid, ghost on a 3 mm stick (about 70 mm tall), lever arm, servo cradle | body and lid leather, ghost glow | plank lines, brass latch, ghost eyes and mouth (black) | One servo. 0 to 30 degrees lifts the lid. 20 to 90 degrees lifts the ghost up a guide slot. A rubber band returns it. |
| **#3 Haunt needle** | Dial plate about 170 W x 90 H x 15 D, bezel ring, needle, red tab clip, servo mount behind | plate ink, bezel and needle lantern, tab alarm | **dial face** (numbers 0 to 12, ticks, gold notches at 3, 6 and 9, ghost icon, "HAUNT"). Make it a replaceable sticker. | One servo turns the needle over 150 degrees. The red tab clips by hand at 8, 10 or 12. Optional clear cover. |
| **#5 Haunting flipper** | Six seat modules: plinth about 50 W x 40 D x 45 H with a servo pocket, plus a flap about 36 x 56 x 3 mm. A seat row is about 330 mm, so print **three 2-seat segments** that join. | plinth bone, flap bone | flap front: seat portrait (36 x 56). Flap back: ghost. Plinth: seat colour disc. | One servo per seat flips the flap 180 degrees. **Leave room on each plinth front for 3 small LED windows (later, see section 6).** |
| **#9 Curtain reveal** | Stage frame about 170 W x 130 H x 60 D, valance, two curtain panels (thin, with fold ribs, about 60 x 90 mm), rail with sliders, pulley, screen bezel, ESP32 cavity behind | frame leather, panels alarm, rail and bezel ink | gold trim strip on the valance, "THE SOLUTION" plate | One servo and a thread loop around a pulley pull both panels apart. **It needs a small screen behind the curtain (section 5).** |
| **#12 Rattle prop: three bats (chosen)** | Ceiling beam bracket about 120 mm wide with a servo mount and a hook. A 100 mm hanging bar. Three flat bats, about 40 mm wingspan and 1.2 mm thick, on threads of different lengths. Total weight 15 g or less. | beam leather, bar and bats ink | red eye stickers (six small dots) | One servo tugs the hanging thread and gravity swings the bar. Each bat hangs on its own thread, so they flutter apart. |
| **#15 Relic vault** | Chest about 170 W x 120 D x 80 H (inside 150 x 100 for six Relics in 3 x 2), lid hinged at the back with a spring, latch plate, relic tray insert with six pockets, a keypad pod | chest and lid leather, clasp lantern, tray ink | plank lines, clasp details, a relic icon in each pocket, "enter PIN" label | One servo is the latch. A spring lifts the lid. The 3 x 4 keypad is on a side pod. |
| **#20 Cut wires board** | Panel about 150 W x 120 H x 30 D, five terminals, five wire anchors, five plug heads, a SET button hole (16 mm), an LED hole | panel leather, plug heads one colour each: red, blue, green, yellow, violet | numbers 1 to 5, "SET", "paired" | No servo. Each plug head has a **cavity for a resistor** (1 k, 2.2 k, 4.7 k, 10 k, 22 k). Real jumper wires. |

## 5. Needed from us before you finish (open items)

1. **Exact models and sizes** of the servo, ESP32 board, 3 x 4 keypad, 1.8 inch screen and LED strip.
2. **Our printer:** bed size, nozzle and which spools we have.
3. **#9 screen:** yes or no. A printed card cannot be the Solution, because the box does not know it until the game ends.
4. **#15 PIN:** Master's phone only or every phone. We assume a keypad on the box.
5. **Sizes above** are our guess.

## 6. Later (not in the first batch)

Plan for these now so you do not redo the seat plinth: **Resolve lamps** (3 LED windows on each seat plinth, a translucent white insert), an **hour bell** (a real bell and a servo hammer on a bracket), a **seat shiver** (reuses the flipper servos) and a **Blackout lamp** (a lamp with a servo shade flap).

## 7. Sticker sheet (rough count)

Six QR stickers (36 x 36), one dial face, six flap portraits and six flap ghosts (36 x 56), six seat discs, six standee portraits and name strips, one ghost face, one chest plank and latch set, one vault plank set and six relic icons, one curtain trim and nameplate, one wires board label sheet, plus six small red bat-eye stickers for #12.
