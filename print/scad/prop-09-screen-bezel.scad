// Hauntology Tabletop Print Kit — Prop #9: Curtain Reveal (Backstage 1.8" Screen Bezel & ESP32 Cradle)
// Colour: Ink (#0b0d10, matte black)
// Size: 114 W x 102 H x 16 D mm
// Hardware: Holds 1.8" ST7735 TFT display (36 x 47 mm active window) or printed test card + ESP32 DevKitC
// Print orientation: Flat on front bezel face (Z = 0), zero supports.

include <_common.scad>

bezel_w = 114.0;
bezel_h = 102.0;

module prop_09_screen_bezel() {
  difference() {
    union() {
      // 1. Main matte-black backstage shadow-box mask plate (114 x 102 x 4.0 mm)
      chamfer_box(bezel_w, bezel_h, 4.0, r = 3.0, ch_bot = 0.6, ch_top = 0.4);

      // 2. Rear 1.8" ST7735 TFT Module Frame & Fallback Card Guides (Z = 4.0..12.0)
      translate([0, 6.0, 4.0])
        chamfer_box(46.0, 64.0, 8.0, r = 2.0, ch_bot = 0, ch_top = 0.4);

      // 3. Lower ESP32 DevKitC Mounting Cradle (Y = -33, Z = 4.0..12.0)
      translate([0, -33.0, 4.0])
        chamfer_box(esp32_w + 5.2, esp32_d + 4.8, 8.0, r = 2.0, ch_bot = 0, ch_top = 0.4);
    }

    // 4. Bevelled 1.8" Screen Active Viewport Window (35.0 x 46.0 mm opening)
    translate([0, 6.0, -0.5])
      hull() {
        linear_extrude(height = 0.6) rrect2d(38.0, 49.0, r = 2.0);
        translate([0, 0, 3.2]) linear_extrude(height = 2.0) rrect2d(34.6, 45.6, r = 1.4);
      }

    // 5. Rear PCB Pocket for 1.8" ST7735 Display (36.0 x 58.0 mm)
    translate([0, 6.0, 3.6])
      linear_extrude(height = 9.5)
        rrect2d(36.4, 58.4, r = 1.2);

    // 6. Four M2 Mounting Standoff Holes for ST7735 PCB
    for (sx = [-15.0, 15.0], sy = [6.0 - 25.5, 6.0 + 25.5]) {
      translate([sx, sy, 1.6])
        cylinder(h = 11.0, d = 1.8);
    }

    // 7. ESP32 DevKitC Cavity & Ribbon Cable Channel
    translate([0, -33.0, 5.6])
      linear_extrude(height = 8.0)
        rrect2d(esp32_w, esp32_d, r = 1.0);
    translate([0, -14.0, 6.0])
      cube([18.0, 20.0, 8.0], center = true);
  }
}

color(col_ink) prop_09_screen_bezel();
