// Hauntology Tabletop Print Kit — Prop #9: Curtain Reveal (Backstage 1.8" Screen Bezel & ESP32 Cradle)
// Colour: Ink (#0b0d10, matte black)
// Size: 114 W x 102 H x 12 D mm
// Hardware: Holds 1.8" ST7735 TFT display (36 x 47 mm active window) or printed test card + ESP32 DevKitC with USB-C exit
// Print orientation: Flat on front bezel face (Z = 0), zero supports.

include <_common.scad>

bezel_w = 114.0;
bezel_h = 102.0;

module prop_09_screen_bezel() {
  difference() {
    union() {
      // 1. Main matte-black backstage shadow-box mask plate (114 x 102 x 4.0 mm)
      chamfer_box(bezel_w, bezel_h, 4.0, r = 3.0, ch_bot = 0.6, ch_top = 0.4);

      // 2. Rear 1.8" ST7735 TFT Module Frame & Fallback Card Guides (Z = 3.5..12.0)
      translate([0, 6.0, 3.5])
        chamfer_box(46.0, 64.0, 8.5, r = 2.0, ch_bot = 0, ch_top = 0.4);

      // 3. Lower ESP32 DevKitC Mounting Cradle (Y = -33, Z = 3.5..14.5 — deep enough for soldered header pins!)
      translate([0, -33.0, 3.5])
        chamfer_box(esp32_w + 5.2, esp32_d + 4.8, 11.0, r = 2.0, ch_bot = 0, ch_top = 0.4);
    }

    // 4. Bevelled 1.8" Screen Active Viewport Window (35.0 x 46.0 mm opening)
    translate([0, 6.0, -0.5])
      hull() {
        linear_extrude(height = 0.6) rrect2d(38.0, 49.0, r = 2.0);
        translate([0, 0, 3.2]) linear_extrude(height = 2.0) rrect2d(34.6, 45.6, r = 1.4);
      }

    // 5. Rear PCB Pocket for 1.8" ST7735 Display (36.4 x 58.4 mm)
    translate([0, 6.0, 3.6])
      linear_extrude(height = 9.5)
        rrect2d(36.4, 58.4, r = 1.2);

    // 6. Four M2 Mounting Standoff Holes for ST7735 PCB + Four Ø3.4 mm Corner Mounting Holes to prop-09-stage-frame cleats!
    for (sx = [-15.0, 15.0], sy = [6.0 - 25.5, 6.0 + 25.5]) {
      translate([sx, sy, 1.6])
        cylinder(h = 11.0, d = 1.8);
    }
    for (sx = [-46.0, 46.0], sy = [-44.0, 45.0]) {
      translate([sx, sy, -0.5])
        cylinder(h = 6.0, d = 2.75);
    }

    // 7. ESP32 DevKitC Cavity (with 4 corner standoffs at Z = 10.6 + deep pin-header relief down to Z = 2.0) & Right-End USB-C Cutout
    translate([0, -33.0, 10.6])
      linear_extrude(height = 6.0)
        rrect2d(esp32_w, esp32_d, r = 1.0);
    difference() {
      translate([0, -33.0, 2.0])
        linear_extrude(height = 9.0)
          rrect2d(esp32_w - 2.0, esp32_d - 1.6, r = 1.0);
      for (sx = [-1, 1], sy = [-1, 1]) {
        translate([sx * (esp32_w / 2 - 3.6), -33.0 + sy * (esp32_d / 2 - 2.8), 1.8])
          chamfer_box(7.6, 6.0, 9.0, r = 1.0, ch_bot = 0, ch_top = 0);
      }
    }
    for (sx = [-1, 1], sy = [-1, 1]) {
      translate([sx * esp32_hole_w / 2, -33.0 + sy * esp32_hole_d / 2, 2.0])
        cylinder(h = 10.0, d = sg90_m2_pilot_d);
    }
    translate([0, -14.0, 10.0])
      cube([18.0, 20.0, 9.0], center = true);
    // USB-C connector port opening on +X end of ESP32 cradle
    translate([esp32_w / 2 + 2.0, -33.0, 12.2])
      cube([8.0, esp32_usb_w + 1.0, 7.5], center = true);
  }
}

color(col_ink) prop_09_screen_bezel();
