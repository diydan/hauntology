// Hauntology Tabletop Print Kit — Prop #20: Cut Wires Board (Main Fuse-Box Panel)
// Colour: Leather (#6b4d33)
// Size: 150 W x 120 H x 32 D mm
// Sticker details: 10 recessed number pockets 1 to 5 (left & right columns, 11 x 13 mm),
//                  "SET" pocket (26 x 11 mm), "paired" pocket (30 x 8 mm)
// Hardware: Five left wire-anchor wells (with solid Z=6.0 bottom stop shoulder), five right terminal socket wells
//           (with solid Z=6.0 bottom stop shoulder), 16 mm SET button hole, 5 mm LED hole, central vaulted ESP32 bay
// Print orientation: Flat on base (Z = 0), no supports (all underside cavities have <= 45-deg vaulted roofs).

include <_common.scad>

panel_w = 150.0;
panel_h = 120.0;
panel_d = 30.0;

module prop_20_wires_panel() {
  difference() {
    union() {
      // 1. Main fuse-box enclosure body + gothic tapered corner pilasters (150 x 120 x 30 mm)
      chamfer_box(panel_w, panel_h, panel_d, r = 5.0, ch_bot = 0.8, ch_top = 0.8);
      for (sx = [-1, 1], sy = [-1, 1]) {
        hull() {
          translate([sx * (panel_w / 2 - 4.0), sy * (panel_h / 2 - 4.0), 0])
            chamfer_box(13.0, 13.0, 8.0, r = 2.4, ch_bot = 0.8, ch_top = 0.4);
          translate([sx * (panel_w / 2 - 5.2), sy * (panel_h / 2 - 5.2), panel_d - 4.0])
            chamfer_box(10.0, 10.0, 4.0, r = 2.0, ch_bot = 0.2, ch_top = 0.6);
        }
      }

      // 2. Raised Gothic Ironwork Perimeter Framing Moulding on Top Deck (Z = 29..32) + 4 Corner Rivets
      difference() {
        translate([0, 0, panel_d - 1.0])
          chamfer_box(panel_w - 1.6, panel_h - 1.6, 3.0, r = 4.6, ch_bot = 0.2, ch_top = 0.6);
        translate([0, 0, panel_d - 1.5])
          linear_extrude(height = 4.5)
            rrect2d(panel_w - 12.0, panel_h - 12.0, r = 3.0);
      }
      for (sx = [-1, 1], sy = [-1, 1]) {
        translate([sx * (panel_w / 2 - 5.2), sy * (panel_h / 2 - 5.2), panel_d + 1.4])
          cylinder(h = 1.4, d1 = 3.8, d2 = 1.4, $fn = 4);
      }
    }

    // 3. Five Left-Side Wire Anchor Socket Wells (at X = -44, Y = 36, 18, 0, -18, -36; 10.4 x 10.4 mm square, Z = 6..30)
    //    + Five Left-Side Number Sticker Pockets (at X = -60, 11 x 13 mm)
    for (i = [0 : 4]) {
      wy = 36.0 - i * 18.0;
      translate([-44.0, wy, 6.0])
        linear_extrude(height = panel_d)
          rrect2d(10.4, 10.4, r = 1.2);
      // 5.0 mm wire through-bore leaving a full 360-deg bottom stop ledge at Z = 6.0!
      translate([-44.0, wy, -0.5])
        cylinder(h = 7.5, d = 5.0);

      // Left-Side Recessed 0.4 mm Number Sticker Pocket (1 to 5) at X = -60
      translate([-60.0, wy, panel_d - sticker_depth])
        linear_extrude(height = sticker_depth + 0.6)
          rrect2d(11.0, 13.0, r = 1.2);
    }

    // 4. Five Right-Side Terminal Socket Wells (at X = 38, Y = 36, 18, 0, -18, -36; 14.3 mm ID, Z = 6..30)
    //    + Five Right-Side Number Sticker Pockets (at X = 56, 11 x 13 mm)
    for (i = [0 : 4]) {
      wy = 36.0 - i * 18.0;
      translate([38.0, wy, 6.0])
        cylinder(h = panel_d, d = 14.3);
      // 8.4 mm wire through-bore leaving a full 360-deg bottom stop shoulder at Z = 6.0!
      translate([38.0, wy, -0.5])
        cylinder(h = 7.5, d = 8.4);

      // Right-Side Recessed 0.4 mm Number Sticker Pocket (1 to 5) at X = 56
      translate([56.0, wy, panel_d - sticker_depth])
        linear_extrude(height = sticker_depth + 0.6)
          rrect2d(11.0, 13.0, r = 1.2);

      // Narrow 45-deg vaulted underside wire trench connecting each left anchor (X=-44) & right terminal (X=38) to central ESP32 bay
      translate([-3.0, wy, -0.1])
        hull() {
          cube([84.0, 5.2, 3.2], center = true);
          translate([0, 0, 4.2]) cube([84.0, 1.2, 0.4], center = true);
        }
    }

    // 5. 16 mm SET Pushbutton Mounting Hole (16.2 mm ID at X = 12, Y = -46) + "SET" Sticker Pocket (26 x 11 mm)
    translate([12.0, -46.0, -0.5])
      cylinder(h = panel_d + 2.0, d = 16.2);
    translate([-14.0, -46.0, panel_d - sticker_depth])
      linear_extrude(height = sticker_depth + 0.6)
        rrect2d(26.0, 11.0, r = 1.2);

    // 6. 5 mm "paired" LED Mounting Hole (5.2 mm ID at X = -44, Y = 50) + "paired" Sticker Pocket (30 x 8 mm)
    translate([-44.0, 50.0, -0.5])
      cylinder(h = panel_d + 2.0, d = 5.2);
    translate([-18.0, 50.0, panel_d - sticker_depth])
      linear_extrude(height = sticker_depth + 0.6)
        rrect2d(30.0, 8.0, r = 1.0);

    // 7. Central 45-Degree Vaulted Underside ESP32 & Wiring Bay (tapers to a 3.6 mm ridge at Z = 27.5 -> no supports).
    //    The ridge used to stop at Z = 24, which made the sides 50.5 deg from vertical, not 45; the ridge is now 3.5 mm higher (46 deg),
    //    leaving 2.2 mm of skin above it.
    translate([-3.0, 4.0, -0.1])
      hull() {
        linear_extrude(height = 5.0) rrect2d(50.0, 94.0, r = 3.0);
        translate([0, 0, 27.5]) linear_extrude(height = 0.4) rrect2d(3.6, 56.0, r = 1.2);
      }

    // 8. Rear USB-C cable exit notch at Y = panel_h / 2 (h = 28.0 reaches Y = 46.0, breaking cleanly into the ESP32 bay!)
    translate([-3.0, panel_h / 2, 5.0])
      rotate([90, 0, 0])
        hull() {
          cube([esp32_usb_w, esp32_usb_h, 28.0], center = true);
          translate([0, 5.0, 0]) cylinder(h = 28.0, d = 2.0, center = true);
        }
  }
}

color(col_leather) prop_20_wires_panel();
