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

    // 5. 16 mm SET Pushbutton Mounting Hole (16.2 mm ID at X = 12, Y = -46) + 45-deg Vaulted Underside Nut Chamber (leaves 4.5 mm panel!)
    translate([12.0, -46.0, -0.5])
      cylinder(h = panel_d + 2.0, d = 16.2);
    translate([12.0, -44.0, -0.1])
      hull() {
        linear_extrude(height = 19.5) rrect2d(22.4, 24.0, r = 2.0);
        translate([0, -2.0, 25.4]) cylinder(h = 0.3, d = 16.4);
      }
    translate([-14.0, -46.0, panel_d - sticker_depth])
      linear_extrude(height = sticker_depth + 0.6)
        rrect2d(26.0, 11.0, r = 1.2);

    // 6. 5 mm "paired" LED Mounting Hole (5.2 mm ID at X = -44, Y = 50) + 45-deg Underside LED Pocket & Wire Trench into ESP32 Bay!
    translate([-44.0, 50.0, -0.5])
      cylinder(h = panel_d + 2.0, d = 5.2);
    translate([-44.0, 50.0, -0.1])
      hull() {
        linear_extrude(height = 19.5) rrect2d(12.0, 12.0, r = 1.6);
        translate([0, 0, 24.0]) cylinder(h = 0.3, d = 5.6);
      }
    hull() {
      translate([-31.0, 48.0, 1.5]) cube([28.0, 5.2, 3.2], center = true);
      translate([-31.0, 48.0, 4.1]) cube([28.0, 1.2, 0.4], center = true);
    }
    translate([-18.0, 50.0, panel_d - sticker_depth])
      linear_extrude(height = sticker_depth + 0.6)
        rrect2d(30.0, 8.0, r = 1.0);

    // 7. Central 45-Degree Vaulted Underside ESP32 & Wiring Bay (28.8 mm self-centering PCB pocket at Z = 0..9.5,
    //    tapering at <= 44 deg to a 2.0 mm ridge at Z = 24.0 -> seats 27.9 mm ESP32 PCB at Z = 10.0 with zero supports!)
    translate([-4.0, 6.0, -0.1])
      hull() {
        linear_extrude(height = 9.6) rrect2d(28.8, 90.0, r = 2.0);
        translate([0, 0, 24.0]) linear_extrude(height = 0.4) rrect2d(2.0, 62.0, r = 0.8);
      }

    // Four M2 self-tapping pilot bores piercing directly into the 44-deg side bevels behind the Z = 10.0 ESP32 PCB
    for (sx = [-1, 1], sy = [-1, 1]) {
      translate([-4.0 + sx * esp32_hole_d / 2, 12.0 + sy * esp32_hole_w / 2, 10.5])
        cylinder(h = 11.5, d = sg90_m2_pilot_d);
    }

    // 8. Rear 45-deg Gabled USB-C cable exit notch at Y = panel_h / 2 (aligned with Z = 10.0 ESP32 PCB, <= 44-deg roof!)
    translate([-4.0, panel_h / 2, 6.8])
      rotate([90, 0, 0])
        hull() {
          cube([esp32_usb_w, esp32_usb_h, 44.0], center = true);
          translate([0, esp32_usb_h / 2 + 5.6, 0]) cylinder(h = 44.0, d = 1.6, center = true);
        }
  }
}

color(col_leather) prop_20_wires_panel();
