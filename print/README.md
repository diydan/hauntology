# Hauntology 3D Print Kit & Tabletop Props (`print/`)

> **Printing is 100% optional.** Every Hauntology Party Mode room, solo case, Suspect selection, Relic selection, and Display mode works in full on phones and screens alone without printing any 3D piece or building any hardware prop (Requirement 8.5). When you do print the kit, the pieces bring tactile Victorian séance miniatures, scannable `hw:r1`–`hw:r6` Relic tokens, a Pepper's-ghost pyramid frame, Suspect standees, and seven ESP32 + SG90 tabletop props to the table.

---

## 1. Ground Rules & Slicer Settings

Every model in `print/scad/` and `print/stl/` is authored to print cleanly on a single-extruder FDM printer (such as a Bambu Lab A1 Mini, Prusa MINI+, or Ender 3):

- **Build Volume:** Every piece fits comfortably inside a **`180 × 180 mm`** bed (`<= 174 mm` longest dimension).
- **Nozzle & Layer Height:** `0.4 mm` nozzle at **`0.20 mm`** standard layer height (`0.16 mm` optional for the 6 Relic miniatures).
- **Walls & Infill:** `3` perimeter walls (`>= 1.6 mm` minimum wall thickness across all structural models), `15%` gyroid or grid infill, `4` top / `4` bottom solid layers.
- **Moving Clearances:** `0.30 mm` radial/sliding clearance on all hinges, levers, dovetails, and snap tabs; `0.15 mm` press-fit interference on SG90 servo horns.
- **One Solid Spool Colour per STL:** No multi-material AMS/MMU required. All lettering, dial ticks, wood planks, portraits, and resistor bands live on the **1:1 scale printable SVG sticker sheets** in [`print/stickers/`](./stickers/), which sit inside **`0.4 mm` recessed pockets** on the 3D prints so sticker edges never peel.
- **Validation Command:** Run `node tools/build-print.mjs --check` at any time to verify that all **42 STL files** in `print/stl/` and `dist/print/` are binary STLs, watertight 2-manifolds (`0` open/non-manifold edges, `0` degenerate triangles), positive volume, and within bed bounds.

---

## 2. Six-Spool Filament Palette

The entire 42-piece collection prints from a core palette of **six PLA / Matte PLA spools**. These hex values are this print set's own colours. They are **not** the hex values in `design/tokens.json`. Each spool takes the same job as one game colour, shown in the second column. Buy the nearest spool you can find; the game never reads these colours.

(The preview colours inside `scad/_common.scad` are the `design/tokens.json` ones, so a raw OpenSCAD preview looks a little different from the renders in `renders/`.)

| Spool Name | Same job as (`design/tokens.json`) | Hex | Recommended Filament | Used For |
|---|---|---|---|---|
| **Dark Iron** | ink `#0b0d10` | `#262229` | Matte Charcoal / Galaxy Black PLA | Enclosures, dial plate, 2-seat flipper plinth, curtain rail, bat mobile, relic tray, keypad pod, cut-wires panel, pyramid holder, relic token pocket |
| **Antique Brass** | lantern `#e0a43a` | `#d4a84b` | Silk Brass / Antique Gold PLA | Music box, locket, séance bell, dial bezel & needle, stage screen bezel, chandelier, vault clasp, terminal blocks, Dr. Pike standee |
| **Ectoplasm Mint** | ghost `#9fe8d0` | `#5ce6b8` | Translucent Mint / Glow Green PLA | Pop-up ghost figure (#1), translucent Resolve pip window inserts (#5), Captain Thorne standee |
| **Bone / Ivory** | bone `#e9e4d8` | `#e8dec8` | Matte Bone White / Warm Ivory PLA | Wax hand, silver key, haunting flipper pawns, porcelain doll, blank & Cora standees |
| **Crimson** | alarm `#d4604a` | `#d43838` | Matte Crimson Red PLA | Curtain panels (#9), Haunt max-tab (#3), banana plug heads (#20), Percy standee |
| **Warm Wood** | leather `#6b4d33` | `#422818` | Wood-Fill PLA or Matte Walnut Brown PLA | Ghost chest body & lid (#1), planchette (`r4`), stage proscenium frame (#9), beam bracket (#12), relic vault chest & lid (#15), Mrs. Dunmore standee |

---

## 3. Complete Bill of Materials & Print Orientation Table (42 STLs)

All 42 compiled binary STL files live in [`print/stl/`](./stl/) (and are mirrored to `dist/print/` for static distribution), with matching coloured preview renders in [`print/renders/`](./renders/).

### 3A. Core Game Pieces (15 STLs)

| STL File | Piece Description | Dimensions (`X × Y × Z mm`) | Spool | Print Orientation | Supports | Sticker Sheet / Notes |
|---|---|---|---|---|---|---|
| `relic-music-box.stl` | Relic `r1`: Open Victorian music box with pinned cylinder, comb, bow key & stepped plinth | `38.1 × 33.0 × 49.9` | Antique Brass | Base flat on bed (`+Z` up) | None (45° key & lid overhang) | `stickers-relics-and-standees.svg` (`15.6×6.6` keyhole + `17.6×8.6` lid score) |
| `relic-wax-hand.stl` | Relic `r2`: Sculpted fortune-teller palmistry hand with wax drips & palm medallion pocket | `33.0 × 33.0 × 54.5` | Bone / Ivory | Base flat on bed (`+Z` up) | None (fingers angled `<= 25°` from vertical) | `stickers-relics-and-standees.svg` (`10.6 mm` dia palm eye medallion) |
| `relic-locket.stl` | Relic `r3`: Ribbed Victorian oval locket with bow bail, hinge barrel & cameo frame | `33.0 × 33.0 × 50.8` | Antique Brass | Base flat on bed (`+Z` up) | None | `stickers-relics-and-standees.svg` (`15.6×21.6` oval cameo portrait) |
| `relic-planchette.stl` | Relic `r4`: Heart-shaped spirit-board pointer on 3 brass caster legs with magnifier oculus | `33.0 × 33.0 × 45.8` | Warm Wood | Base flat on bed (`+Z` up) | None (angled display struts bridge cleanly) | `stickers-relics-and-standees.svg` (`22×26` sun/moon scroll border) |
| `relic-silver-key.stl` | Relic `r5`: Gothic skeleton key with trefoil clover bow, collared stem & notched ward bit | `33.0 × 33.0 × 55.3` | Bone / Ivory | Base flat on bed (`+Z` up) | None (`45°` chamfer under bit & bow) | `stickers-relics-and-standees.svg` (`13.6×7.6` oval crest) |
| `relic-bell.stl` | Relic `r6`: Flared Victorian service bell with gadrooned dome, clapper ball & turned handle | `33.0 × 33.0 × 51.0` | Antique Brass | Base flat on bed (`+Z` up) | None (self-supporting internal bell arch) | `stickers-relics-and-standees.svg` (`13.6×5.6` `"AWAKE"` band) |
| `relic-token-pocket.stl` | Universal `40×40 mm` bevelled token base with `36.4×36.4×0.4 mm` top sticker pocket & `22.3 mm` bottom magnet/weight recess | `40.0 × 40.0 × 6.0` | Dark Iron | Bottom flat on bed (`+Z` up); print `6×` | None | Blank sticker spot: stick one QR sticker (36 × 36 mm) from `tools/prop-mockups/qr/` here. The QR holds the text `hw:r1` to `hw:r6`, not a web address |
| `pyramid-holder.stl` | Parametric 45° Pepper's-ghost collar frame (`60 mm` base, `10 mm` top) with 4 corner alignment slots & phone resting lip | `70.4 × 70.4 × 29.0` | Dark Iron | Bottom collar flat on bed (`+Z` up) | None (45° struts print support-free) | Holds 4 trapezoidal clear acetate faces (`60 mm` bottom, `10 mm` top, `35.36 mm` slant height) |
| `standee-blank.stl` | Gothic-arch Suspect standee with `0.4 mm` recessed portrait & name strip pockets on both sides | `40.0 × 15.0 × 67.8` | Bone / Ivory | Base flat on bed (`+Z` up) or flat on back | None | `stickers-relics-and-standees.svg` (6 Suspect portraits + name strips) |
| `standee-s1-percy.stl` .. `standee-s6-dunmore.stl` (6 files) | Embossed silhouette Suspect standees generated from the 6 Preset Suspect cutouts (`percy`, `thorne`, `pike`, `cora`, `vane`, `dunmore`) | `40.0 × 15.0 × 70.0` | Seat / Suspect colour | Base flat on bed (`+Z` up) | None (`0.6 mm` front silhouette relief) | Ready to use straight off the print bed with zero stickers required |

---

### 3B. Seven Tabletop Electronic Props (27 STLs)

| Prop | STL File | Piece Description | Dimensions (`X × Y × Z mm`) | Spool | Print Orientation | Supports | Sticker Sheet |
|---|---|---|---|---|---|---|---|
| **#1 Ghost in the Box** | `prop-01-chest-body.stl` | Treasure chest enclosure with internal SG90 servo cradle, ESP32 mount, USB-C port, WS2812 strip trough & 3 recessed plank pockets | `163.2 × 99.2 × 70.7` | Warm Wood | Base flat on bed (`+Z` up) | None | `stickers-prop-01-ghost-in-box.svg` |
| **#1 Ghost in the Box** | `prop-01-chest-lid.stl` | Hinged chest lid with `3.3 mm` hinge knuckles, arched side skirts & `0.4 mm` top strap pockets | `162.0 × 97.4 × 19.7` | Warm Wood | Top face down or upright (`+Z` up) | None | `stickers-prop-01-ghost-in-box.svg` |
| **#1 Ghost in the Box** | `prop-01-ghost-figure.stl` | Flat-back pop-up ghost silhouette (`8 mm` thick) with clevis pin hole & `56×84 mm` face sticker recess | `68.0 × 118.0 × 8.0` | Ectoplasm Mint | Flat back on bed (`+Z` up) | None | `stickers-prop-01-ghost-in-box.svg` |
| **#1 Ghost in the Box** | `prop-01-lever-arm.stl` | `64 mm` clevis push-arm with SG90 horn recess & lid kicker finger | `71.7 × 27.0 × 6.0` | Dark Iron | Flat side on bed (`+Z` up) | None | — |
| **#3 Haunt Needle** | `prop-03-dial-plate.stl` | Semi-circular brass-style gauge body (`170×101×30 mm`) with `0.4 mm` recessed scale pocket, SG90 mount, 3 max-tab notches (`8, 10, 12`) & weighted base | `170.0 × 101.0 × 30.0` | Dark Iron | Back flat on bed (`+Z` up) | None | `stickers-prop-03-haunt-needle.svg` |
| **#3 Haunt Needle** | `prop-03-bezel-ring.stl` | Snap-fit arched decorative bezel ring with 12 rivet bosses & threshold sight notches | `166.0 × 100.9 × 4.8` | Antique Brass | Flat back on bed (`+Z` up) | None | — |
| **#3 Haunt Needle** | `prop-03-needle.stl` | `72 mm` gothic spade pointer needle with press-fit SG90 spline hub | `84.9 × 17.6 × 6.6` | Antique Brass | Flat back on bed (`+Z` up) | None | — |
| **#3 Haunt Needle** | `prop-03-max-tab.stl` | Clip-on `"MAX"` threshold marker tab that snaps into the `8`, `10`, or `12` rim notch | `27.6 × 14.0 × 9.2` | Crimson | Flat side on bed (`+Z` up) | None | `stickers-prop-03-haunt-needle.svg` |
| **#5 Haunting Flipper** | `prop-05-plinth-2seat.stl` | Modular 2-seat plinth (`105.7×45.2×45 mm`) with male/female dovetails, 2 SG90 bays, 6 Resolve LED windows & name pockets (print `3×` for 6 seats) | `105.7 × 45.2 × 45.0` | Dark Iron | Bottom flat on bed (`+Z` up); print `3×` | None | `stickers-prop-05-haunting-flipper.svg` |
| **#5 Haunting Flipper** | `prop-05-flap-pawn.stl` | Two-sided portrait flap (`36×68.3×6.4 mm`, print `6×`) with SG90 pivot boss & `0.4 mm` recessed front/back portrait pockets (Living vs Ghost) | `36.0 × 68.3 × 6.4` | Bone / Ivory | Flat on bed (`+Z` up); print `6×` | None | `stickers-prop-05-haunting-flipper.svg` |
| **#5 Haunting Flipper** | `prop-05-resolve-insert.stl` | Diffuser strip with 3 bevelled lens pips (`8.4×5.4 mm`) that presses into each seat's front Resolve window (print `6×`) | `36.4 × 14.0 × 2.4` | Ectoplasm Mint | Flat back on bed (`+Z` up); print `6×` | None | — |
| **#9 Curtain Reveal** | `prop-09-stage-frame.stl` | Proscenium arch (`174×130×59.4 mm`) with `"THE LODGER"` header pocket, side pilaster pockets, rail slots & `100×88 mm` stage opening | `174.0 × 130.0 × 59.4` | Warm Wood | Back flat on bed (`+Z` up) | None | `stickers-prop-09-curtain-and-12-rattle.svg` |
| **#9 Curtain Reveal** | `prop-09-curtain-panel.stl` | Rigid pleated theatre curtain wing (`60×97.5×5.2 mm`, print `2×`) with top T-slider glides & gold tassel fringe pocket | `60.0 × 97.5 × 5.2` | Crimson | Flat back on bed (`+Z` up); print `2×` | None | `stickers-prop-09-curtain-and-12-rattle.svg` |
| **#9 Curtain Reveal** | `prop-09-rail-and-pulley.stl` | Overhead curtain track bar (`158 mm`), dual-sheave SG90 drive drum & idler wheel for counter-wound nylon cord | `158.0 × 36.2 × 9.0` | Dark Iron | Flat on bed (`+Z` up) | None | — |
| **#9 Curtain Reveal** | `prop-09-screen-bezel.stl` | Rear drop-in phone/Waveshare screen cradle (`114×102×12 mm`) with USB-C cable slot | `114.0 × 102.0 × 12.0` | Antique Brass | Back flat on bed (`+Z` up) | None | — |
| **#12 Rattle Prop** | `prop-12-beam-bracket.stl` | Overhead Victorian attic beam (`120×36×32 mm`) with SG90 pocket, eccentric cam horn & 3 suspension eyelets | `120.0 × 36.0 × 32.0` | Warm Wood | Top flat on bed (`+Z` up) | None | `stickers-prop-09-curtain-and-12-rattle.svg` |
| **#12 Rattle Prop** | `prop-12-bats-mobile.stl` | **Primary Option:** Spooky balance beam + 3 articulated gothic bats (`54 mm` & `44 mm` wingspans) with recessed crimson eye pockets | `137.2 × 46.2 × 3.6` | Dark Iron | Flat on bed (`+Z` up) | None | `stickers-prop-09-curtain-and-12-rattle.svg` |
| **#12 Rattle Prop** | `prop-12-chandelier.stl` | **Alternate Option A:** 4-arm gothic chandelier ring (`73.2 mm` span) with candle cups & flame tips | `73.2 × 73.3 × 38.0` | Antique Brass | Base ring flat on bed (`+Z` up) | None | — |
| **#12 Rattle Prop** | `prop-12-doll.stl` | **Alternate Option B:** Articulated porcelain doll pendant (`39.2×60.9 mm`) with cracked-face sticker pocket | `39.2 × 60.9 × 5.8` | Bone / Ivory | Flat back on bed (`+Z` up) | None | `stickers-prop-09-curtain-and-12-rattle.svg` |
| **#15 Relic Vault** | `prop-15-vault-chest.stl` | Main vault box (`169.2×124.2×80.9 mm`) with internal SG90 latch mount, tray ledges, umbilical port & wood/brass strap pockets | `169.2 × 124.2 × 80.9` | Warm Wood | Bottom flat on bed (`+Z` up) | None | `stickers-prop-15-relic-vault.svg` |
| **#15 Relic Vault** | `prop-15-vault-lid.stl` | Hinged vaulted lid (`168×123.6×23.9 mm`) with internal locking catch bar & top strap pockets | `168.0 × 123.6 × 23.9` | Warm Wood | Top flat on bed (`+Z` up) | None | `stickers-prop-15-relic-vault.svg` |
| **#15 Relic Vault** | `prop-15-vault-clasp.stl` | Front ornate lock escutcheon (`66×24.5×5.2 mm`) with keyhole slot & `30×18 mm` sticker pocket | `66.0 × 24.5 × 5.2` | Antique Brass | Back flat on bed (`+Z` up) | None | `stickers-prop-15-relic-vault.svg` |
| **#15 Relic Vault** | `prop-15-relic-tray.stl` | Removable 6-bay Relic Token organizer tray (`152×100×15 mm`) with finger scoops & `22×22 mm` bay floor icon pockets (`r1`–`r6`) | `152.0 × 100.0 × 15.0` | Dark Iron | Bottom flat on bed (`+Z` up) | None | `stickers-prop-15-relic-vault.svg` |
| **#15 Relic Vault** | `prop-15-keypad-pod.stl` | Angled desktop keypad console (`80.4×114×32 mm`) for `3×4` membrane keypad, ESP32 cradle, LED hole & `"ENTER PIN"` pocket | `80.4 × 114.0 × 32.0` | Dark Iron | Bottom flat on bed (`+Z` up) | None | `stickers-prop-15-relic-vault.svg` |
| **#20 Cut Wires** | `prop-20-wires-panel.stl` | Desktop patchbay (`150×120×32 mm`) with 10× `4 mm` banana jack holes, 6× `5 mm` LED ports, `"SET"` button port & label pockets `1`–`5` | `150.0 × 120.0 × 32.0` | Dark Iron | Top face up (`+Z` up) | None | `stickers-prop-20-cut-wires.svg` |
| **#20 Cut Wires** | `prop-20-terminal-blocks.stl` | Set of 10 screw-terminal turret surrounds + 6 flanged `5 mm` LED bezel collars on one build plate | `114.0 × 47.0 × 14.0` | Antique Brass | Bottoms flat on bed (`+Z` up) | None | — |
| **#20 Cut Wires** | `prop-20-plug-heads.stl` | Set of 10 ribbed grip shells (`5 pairs`) with internal cavity for `1/4 W` axial resistors (`1k, 2.2k, 4.7k, 10k, 22k Ω`) & `9.6 mm` top cap pockets | `115.4 × 40.5 × 22.0` | Crimson | Collars flat on bed (`+Z` up) | None | `stickers-prop-20-cut-wires.svg` |

---

## 4. Design & Mechanism Notes (Addressing `3D_BRIEF.md` Open Questions)

1. **Prop #1 (`prop-01-ghost-in-box`): Single-Servo Pop-Up + Lid Push**
   - The `64 mm` clevis lever arm (`prop-01-lever-arm.stl`) includes both an upper kicker finger that pushes the hinged chest lid open through the first `25°` of servo travel and a slotted clevis pin that drives the `118 mm` ghost figure (`prop-01-ghost-figure.stl`) upright to `85°`. One SG90 servo drives both motions smoothly.
2. **Prop #3 (`prop-03-haunt-needle`): `170 × 101 mm` Semi-Circular Dial**
   - Sized to `170 × 101 × 30 mm` so the entire dial plate prints in one piece on a `180 × 180 mm` bed while keeping the 0–12 tick numbers large enough to read across the table. Three perimeter notches at `8`, `10`, and `12` accept the clip-on `prop-03-max-tab.stl` marker for Quick (`8`), Classic (`10`), and Gentle (`12`) presets.
3. **Prop #5 (`prop-05-haunting-flipper`): Modular 2-Seat Dovetail Plinths + Resolve Windows**
   - Because a 6-seat row exceeds `180 mm`, `prop-05-plinth-2seat.stl` is a **`105.7 mm` 2-seat modular unit** with a male dovetail on the left and a female dovetail (`0.30 mm` clearance) on the right. Print `2×` for a 4-player table or `3×` for a full 6-seat row (`300 mm` assembled). Each seat includes 3 front window slots for the translucent `prop-05-resolve-insert.stl` diffuser (`0` to `3` Resolve pips).
4. **Prop #9 (`prop-09-curtain-reveal`): Counter-Wound Dual-Sheave Pulley**
   - `prop-09-rail-and-pulley.stl` includes a dual-grooved SG90 drive drum and an opposite-end idler wheel. Threading a single loop of `0.5 mm` braided nylon cord in a figure-8 (top strand pinned to the left curtain slider, bottom return strand pinned to the right curtain slider) parts both `60 mm` curtain wings (`46 mm` travel per side) with a `150°` servo sweep.
5. **Prop #12 (`prop-12-rattle`): Bat Mobile Primary + Chandelier & Doll Alternates**
   - We selected the **Bat Mobile (`prop-12-bats-mobile.stl`)** as the primary design because its wide `137 mm` balance bar and three lightweight articulated bats produce the largest visual motion from a gentle `±20°` SG90 eccentric cam shake while staying whisper-quiet. We also modelled and included `prop-12-chandelier.stl` and `prop-12-doll.stl` so builders can hang whichever silhouette matches their room theme.
6. **Prop #15 (`prop-15-relic-vault`): Internal Servo Clasp + Removable 6-Bay Tray**
   - The SG90 servo mounts inside the front wall of `prop-15-vault-chest.stl`; its horn sweeps behind `prop-15-vault-clasp.stl` to hook the catch bar on `prop-15-vault-lid.stl` with `0.30 mm` clearance. Inside, `prop-15-relic-tray.stl` holds all six `40 × 40 mm` Relic Token bases in dedicated bays (`r1`–`r6`) with finger scoops.
7. **Prop #20 (`prop-20-cut-wires`): Standard `4 mm` Banana Jacks + Axial Resistor Plug Shells**
   - `prop-20-wires-panel.stl` uses standard `8.0 mm` panel holes for commercial `4 mm` banana sockets (`5` left, `5` right), `8.2 mm` holes for `5 mm` LED bezels, and a `12.2 mm` hole for a momentary `"SET"` pushbutton. Each `prop-20-plug-heads.stl` shell has an internal `5.2 mm` bore that houses a standard `1/4 W` axial resistor (`1 kΩ`, `2.2 kΩ`, `4.7 kΩ`, `10 kΩ`, `22 kΩ`) soldered inline between the banana pin and wire.

---

## 5. Pepper's-Ghost Acetate Cutting Guide (`pyramid-holder.stl`)

To complete the Pepper's-ghost display (`pyramid-holder.stl`), cut **four identical trapezoids** from `0.3 mm`–`0.5 mm` clear overhead-projector (OHP) acetate film or clear PETG sheet:

- **Bottom edge (`baseMm`):** `60.0 mm`
- **Top edge (`topMm`):** `10.0 mm`
- **Slant height (`slantHeightMm`, 45° wall angle):** `35.36 mm`
- **Vertical height (`verticalHeightMm`):** `25.0 mm`

Slide the four trapezoids into the `45°` corner channels of `pyramid-holder.stl` (a tiny dab of clear tape along the outside seam is optional) and rest the frame over the `/party/display` calibration square on a phone or tablet.
