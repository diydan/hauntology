# Hauntology Print Batches by Spool Color

Clean production slicer folder containing **only the 42 active lightweight STLs** (`~861 g` total PLA across 6 filament colors, **`0` supports needed on every file**, all sized `<= 175.6 × 169.8 mm` for `180 × 180 mm` beds, running on just **3 ESP32 controllers** across the whole table: **4-Lock Master Haunted Chest**, **3-in-1 Clocktower Stage**, and **Haunting Flipper**). All superseded standalone enclosures and unused alternates have been removed.

## Recommended Slicer Settings
- **Nozzle & layer height:** `0.4 mm` nozzle, `0.20 mm` layers (`0.16 mm` optional on `relic-*` miniatures)
- **Walls & infill:** `2` walls + `10%` adaptive cubic infill on large enclosures; `3` walls + `15%` infill on moving levers, hinges, clasps, knobs, and plugs; `4` top / `4` bottom layers
- **Supports:** **OFF** (`0` supports required on all 42 files)
- **Multi-copy filenames:** Any file needing more than 1 print is **prefixed with `<count>x-`** (`2x-`, `3x-`, `6x-`) so it sorts straight to the top of its folder; every unprefixed file prints `1x`.

---

## 1. `wood-brown/` — Wood / Walnut Brown PLA (`#422818` · `~409 g` · `~13.3 hrs` fast)
6 STL files (6 total prints):

| File | Qty | Est. PLA | Notes |
|---|---:|---:|---|
| `prop-01-chest-body.stl` | `1x` | `180 g` | **4-Lock Master Haunted Chest Body** (`#1` Left Ghost + `#15` Front Phone Lock + `#20` Back Cut-Wires + Right `4× MTS-103` Toggle Bank & Submit + Left `KY-040` Safe Dial + 4-side WS2812B active-lock lancets) |
| `prop-01-chest-lid.stl` | `1x` | `36 g` | Left split self-closing Ghost lid (prints upside-down as exported) |
| `prop-15-vault-lid.stl` | `1x` | `23 g` | Right split spring-latched Lockbox lid (prints upside-down as exported) |
| `prop-09-stage-frame.stl` | `1x` | `167 g` | **Master 3-in-1 Clocktower Stage** (`#3` Haunt Meter saddle & M3 yoke + `#9` Curtain Proscenium + `#12` Rafter Bats + top/bottom WS2812B coves) |
| `prop-20-plug-head.stl` | `1x` | `2.3 g` | Cut-Wires resistor plug `#5` (`22 kΩ`, 1 barrel + 1 snap-in cap) |
| `relic-planchette.stl` | `1x` | `2.4 g` | Relic `r4` (add 4–5 mm brim) |

---

## 2. `matte-black/` — Matte Black / Charcoal PLA (`#262229` · `~274 g` · `~10.1 hrs` fast)
8 STL files (17 total prints):

| File | Qty | Est. PLA | Notes |
|---|---:|---:|---|
| `2x-prop-09-curtain-panel.stl` | `2x` | `16 g` | Print `2x` — left & right pleated theatre curtain wings |
| `3x-prop-05-plinth-2seat.stl` | `3x` | `149 g` | Print `3x` — interlocking 2-seat Haunting Flipper plinths (`6` seats total) |
| `6x-relic-token-pocket.stl` | `6x` | `16 g` | Print `6x` — `3.2 mm` Gothic rose-tracery QR Relic Stands (`~2.7 g` each) |
| `prop-01-lever-arm.stl` | `1x` | `6 g` | `#1` Left-Bay dual-stage Ghost/Lid cam lever (`3` walls, `15%` infill) |
| `prop-03-dial-plate.stl` | `1x` | `66 g` | `#3` Slim `16.4 mm` Clocktower Crest Dial (bolts atop `prop-09-stage-frame` via `2× M3` screws; SG90 wired to Stage ESP32) |
| `prop-09-rail-and-pulley.stl` | `1x` | `7 g` | `1` plate = `3` parts (curtain rail bar + idler wheel + SG90 capstan drum) |
| `prop-12-bats-mobile.stl` | `1x` | `6 g` | `1` plate = `4` parts (gnarled branch spreader + 3 gothic bats; hangs on `#9` stage) |
| `pyramid-holder.stl` | `1x` | `9 g` | Pepper's-ghost phone collar frame |

---

## 3. `warm-white/` — Warm White / Bone Ivory PLA (`#e8dec8` · `~80 g` · `~6.2 hrs` fast)
10 STL files (15 total prints):

| File | Qty | Est. PLA | Notes |
|---|---:|---:|---|
| `6x-prop-05-flap-pawn.stl` | `6x` | `35 g` | Print `6x` — two-sided Detective / Ghost portrait flaps (`1` per seat) |
| `prop-20-plug-head.stl` | `1x` | `2.3 g` | Cut-Wires resistor plug `#3` (`4.7 kΩ`, 1 barrel + 1 snap-in cap) |
| `relic-wax-hand.stl` | `1x` | `3.0 g` | Relic `r2` (add 4–5 mm brim) |
| `relic-ghost.stl` | `1x` | `4.7 g` | Relic Ghost figure (add 4–5 mm brim) |
| `standee-s1-percy.stl` | `1x` | `5.9 g` | Suspect 1 standee (add 4–5 mm brim) |
| `standee-s2-thorne.stl` | `1x` | `6.1 g` | Suspect 2 standee (add 4–5 mm brim) |
| `standee-s3-pike.stl` | `1x` | `5.8 g` | Suspect 3 standee (add 4–5 mm brim) |
| `standee-s4-cora.stl` | `1x` | `5.9 g` | Suspect 4 standee (add 4–5 mm brim) |
| `standee-s5-vane.stl` | `1x` | `6.0 g` | Suspect 5 standee (add 4–5 mm brim) |
| `standee-s6-dunmore.stl` | `1x` | `5.9 g` | Suspect 6 standee (add 4–5 mm brim) |

---

## 4. `gold/` — Silk Gold / Antique Brass PLA (`#d4a84b` · `~44 g` · `~2.1 hrs` fast)
6 STL files (6 total prints):

| File | Qty | Est. PLA | Notes |
|---|---:|---:|---|
| `prop-15-vault-clasp.stl` | `1x` | `4.1 g` | `1` plate = `3` parts (front escutcheon + lid hasp + SG90 rotary latch hook) |
| `prop-09-screen-bezel.stl` | `1x` | `29 g` | Backstage `1.8"` ST7735 screen + shared ESP32 cradle for `#3+#9+#12` Clocktower Stage |
| `prop-20-plug-head.stl` | `1x` | `2.3 g` | Cut-Wires resistor plug `#1` (`1 kΩ`, 1 barrel + 1 snap-in cap) |
| `relic-bell.stl` | `1x` | `4.3 g` | Relic `r6` (add 4–5 mm brim) |
| `relic-locket.stl` | `1x` | `2.8 g` | Relic `r3` locket stand (add 4–5 mm brim) |
| `relic-locket-lid.stl` | `1x` | `1.6 g` | Relic `r3` hinged cameo door (`1.75 mm` filament hinge pin) |

---

## 5. `silver/` — Tarnished Silver / Pewter PLA (`#c9c9d4` · `~40 g` · `~2.7 hrs` fast)
9 STL files (9 total prints):

| File | Qty | Est. PLA | Notes |
|---|---:|---:|---|
| `prop-01-safe-knob.stl` | `1x` | `3.2 g` | Knurled Gothic Safe-Cracker Dial Knob (`6.0 mm` `KY-040` D-shaft, hides M7 nut, preserves push-click) |
| `prop-03-bezel-ring.stl` | `1x` | `12 g` | `#3` Haunt Needle arched silver gauge bezel |
| `prop-03-needle.stl` | `1x` | `1.6 g` | `#3` skeletal pointer needle (pierce `0.25 mm` bridge in M2 bore with screw) |
| `prop-03-max-tab.stl` | `1x` | `3.0 g` | `#3` clip-on `MAX` marker (`8 / 10 / 12` game-length detent) |
| `prop-20-terminal-blocks.stl` | `1x` | `7.2 g` | `1` plate = `6` parts (`5` press-fit terminal sockets + `1` `SET` button bezel) |
| `prop-20-plug-head.stl` | `1x` | `2.3 g` | Cut-Wires resistor plug `#2` (`2.2 kΩ`, 1 barrel + 1 snap-in cap) |
| `relic-music-box.stl` | `1x` | `6.2 g` | Relic `r1` casket body |
| `relic-music-box-lid.stl` | `1x` | `2.7 g` | Relic `r1` coffin lid (prints upside-down as exported) |
| `relic-silver-key.stl` | `1x` | `1.9 g` | Relic `r5` (add 4–5 mm brim) |

---

## 6. `glow-green/` — Glow / Translucent Mint PLA (`#5ce6b8` · `~14 g` · `~0.9 hrs` fast)
3 STL files (8 total prints):

| File | Qty | Est. PLA | Notes |
|---|---:|---:|---|
| `6x-prop-05-resolve-insert.stl` | `6x` | `3.2 g` | Print `6x` — bottom-entry Resolve LED window diffuser strips |
| `prop-01-ghost-figure.stl` | `1x` | `8.0 g` | `#1` Left-Bay pop-up Hero Ghost |
| `prop-20-plug-head.stl` | `1x` | `2.3 g` | Cut-Wires resistor plug `#4` (`10 kΩ`, 1 barrel + 1 snap-in cap) |
