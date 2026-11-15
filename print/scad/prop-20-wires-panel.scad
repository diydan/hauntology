// Hauntology Tabletop Print Kit — Prop #20: Cut Wires Board (Main Fuse-Box Panel)
// Colour: Leather (#6b4d33)
// Size: 150 W x 120 H x 30 D mm
// Sticker details: Recessed number pockets 1 to 5 (11 x 13 mm), "SET" pocket (36 x 11 mm), "paired" pocket (26 x 8 mm)
// Hardware: Five wire-anchor wells, five terminal sockets, 16 mm SET button hole, 5 mm LED hole, rear ESP32 bay
// Print orientation: Flat on top face (flipped so panel top is at Z = 0, or upright with open underside bay).
// Here we print it flat on its top face (Z = 0..30) or with open top deck & underside ribs;
// wait: if printed upright with an open underside wiring bay accessed from below and 45-deg vaulted ribs,
// or printed upside-down (face on Z = 0) with raised sticker frames on top:
// Let's make the bottom perimeter sit flat on Z = 0 with a vaulted 45-deg underside electronics bay
// OR make the wiring tray open from the back with a flat Z = 0 backplate and open cable routing channels on top!
// Even better: a solid floor at Z = 0..3.6, recessed internal wiring channels with top cover grooves, and top face at Z = 30!

include <_common.scad>

panel_w = 150.0;
panel_h = 120.0;
panel_d = 30.0;

module prop_20_wires_panel() {
  difference() {
    union() {
      // 1. Main fuse-box enclosure body (150 x 120 x 30 mm)
      chamfer_box(panel_w, panel_h, panel_d, r = 5.0, ch_bot = 0.8, ch_top = 0.8);

      // 2. Raised Victorian perimeter framing moulding on top deck (Z = 30..32)
      difference() {
        translate([0, 0, panel_d - 1.0])
          chamfer_box(panel_w - 2.0, panel_h - 2.0, 3.0, r = 4.6, ch_bot = 0.2, ch_top = 0.6);
        translate([0, 0, panel_d - 1.5])
          linear_extrude(height = 4.5)
            rrect2d(panel_w - 12.0, panel_h - 12.0, r = 3.0);
      }
    }

    // 3. Five Left-Side Wire Anchor Socket Wells (at X = -56, Y = 36, 18, 0, -18, -36; 10.4 x 10.4 mm square)
    for (i = [0 : 4]) {
      wy = 36.0 - i * 18.0;
      translate([-56.0, wy, 6.0])
        linear_extrude(height = panel_d)
          rrect2d(10.4, 10.4, r = 1.2);
      // Wire channel down into the underside bay
      translate([-56.0, wy, -0.5])
        cylinder(h = 10.0, d = 5.0);
    }

    // 4. Five Right-Side Terminal Socket Wells (at X = 38, Y = 36, 18, 0, -18, -36; 14.3 mm ID)
    for (i = [0 : 4]) {
      wy = 36.0 - i * 18.0;
      translate([38.0, wy, 6.0])
        cylinder(h = panel_d, d = 14.3);
      translate([38.0, wy, -0.5])
        cylinder(h = 10.0, d = 8.4);

      // Recessed 0.4 mm Number Sticker Pocket (1 to 5) beside each terminal (at X = 56, 11 x 13 mm)
      translate([56.0, wy, panel_d - sticker_depth])
        linear_extrude(height = sticker_depth + 0.6)
          rrect2d(11.0, 13.0, r = 1.2);
    }

    // 5. 16 mm SET Pushbutton Mounting Hole (16.2 mm ID at X = -8, Y = -46) + "SET" Sticker Pocket
    translate([-8.0, -46.0, -0.5])
      cylinder(h = panel_d + 2.0, d = 16.2);
    translate([-34.0, -46.0, panel_d - sticker_depth])
      linear_extrude(height = sticker_depth + 0.6)
        rrect2d(26.0, 11.0, r = 1.2);

    // 6. 5 mm "paired" LED Mounting Hole (5.2 mm ID at X = -56, Y = 50) + "paired" Sticker Pocket
    translate([-56.0, 50.0, -0.5])
      cylinder(h = panel_d + 2.0, d = 5.2);
    translate([-34.0, 50.0, panel_d - sticker_depth])
      linear_extrude(height = sticker_depth + 0.6)
        rrect2d(30.0, 8.0, r = 1.0);

    // 7. Vaulted Underside Electronics & Wiring Bay (45-deg self-supporting roof so it prints flat on Z = 0 with zero supports!)
    // a) Left-to-right wiring bus & ESP32 chamber
    translate([-6.0, 4.0, -0.1])
      hull() {
        linear_extrude(height = 12.0) rrect2d(116.0, 86.0, r = 3.0);
        translate([0, 0, 22.0]) linear_extrude(height = 0.5) rrect2d(72.0, 42.0, r = 2.0);
      }

    // b) Rear USB cable exit notch at Y = panel_h / 2
    translate([0, panel_h / 2, 5.0])
      rotate([90, 0, 0])
        hull() {
          cube([12.0, 7.0, 16.0], center = true);
          translate([0, 5.0, 0]) cylinder(h = 16.0, d = 2.0, center = true);
        }
  }
}

color(col_leather) prop_20_wires_panel();
