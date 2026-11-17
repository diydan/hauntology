// Hauntology Tabletop Print Kit — Relic Token Base with 36x36 mm QR Sticker Pocket
// Colour: Dark Iron
// Size: ~43 x 43 x 9 mm gothic coaster plate, 36.4 x 36.4 x 0.4 mm recessed QR pocket, 5.6 mm centre peg
// The QR sticker gets a 6 mm hole punched in its middle for the peg (a QR code with a 6 mm hole still scans).
// Print orientation: Flat on base (Z = 0), no supports.

include <_common.scad>

module relic_token_pocket() {
  union() {
    difference() {
      union() {
        // 1. Main 40 x 40 x 6 mm gothic bevelled coaster plate
        chamfer_box(token_side_mm, token_side_mm, token_height_mm, r = 3.0, ch_bot = 0.8, ch_top = 0.8);

        // 2. Four splayed Tim Burton coffin-corner iron lug ears (flat Z = 0..5.2, clear of 36.4x36.4 pocket!)
        for (sx = [-1, 1], sy = [-1, 1]) {
          hull() {
            translate([sx * 17.5, sy * 17.5, 0]) cylinder(h = token_height_mm - 0.8, d = 5.2);
            translate([sx * 20.6, sy * 20.6, 0]) cylinder(h = token_height_mm - 1.4, d = 2.4);
          }
        }
      }

      // 3. 0.4 mm recessed pocket for the 36 x 36 mm QR sticker on the top face (1:1 preserved)
      translate([0, 0, token_height_mm - sticker_depth])
        linear_extrude(height = sticker_depth + 0.5)
          rrect2d(token_qr_mm, token_qr_mm, r = 1.4);

      // 4. Gothic side edge notch cuts along midpoint of all 4 rim edges
      for (ang = [0, 90, 180, 270]) {
        rotate([0, 0, ang])
          translate([0, token_side_mm / 2 + 0.1, token_height_mm * 0.55])
            rotate([45, 0, 0])
              cube([12.0, 1.0, 1.0], center = true);
      }

      // 5. Subtle 45-degree chamfered corner registration marks outside the pocket
      for (sx = [-1, 1], sy = [-1, 1]) {
        translate([sx * 17.2, sy * 17.2, token_height_mm - 0.3])
          cylinder(h = 0.5, d1 = 0.6, d2 = 1.2);
      }
    }

    // 6. Generic centre peg that every Relic's socket drops onto (rises from pocket floor, with 0.3 mm base fillet inside Ø6 mm QR hole)
    translate([0, 0, token_height_mm - sticker_depth - 0.01])
      cylinder(h = 0.31, d1 = relic_peg_d + 0.35, d2 = relic_peg_d);
    translate([0, 0, token_height_mm - sticker_depth + 0.29])
      cylinder(h = sticker_depth + relic_peg_h - 0.8 + 0.01, d = relic_peg_d);
    translate([0, 0, token_height_mm + relic_peg_h - 0.5])
      cylinder(h = 0.5, d1 = relic_peg_d, d2 = relic_peg_d - 1.0);
  }
}

color(col_ink) relic_token_pocket();
