// Hauntology Tabletop Print Kit — Relic Token Base with 36x36 mm QR Sticker Pocket
// Colour: Dark Iron
// Size: 40 x 40 x 6 mm plate, 36.4 x 36.4 x 0.4 mm recessed QR sticker pocket, 5.6 mm centre peg (3 mm above the top face)
// The QR sticker gets a 6 mm hole punched in its middle for the peg (a QR code with a 6 mm hole still scans; 13.9 mm did not).
// Print orientation: Flat on base (Z = 0), no supports.

include <_common.scad>

module relic_token_pocket() {
  union() {
    difference() {
      // Main 40 x 40 x 6 mm rounded tabletop plate
      chamfer_box(token_side_mm, token_side_mm, token_height_mm, r = 3.2, ch_bot = 0.8, ch_top = 0.8);
      // 0.4 mm recessed pocket for the 36 x 36 mm QR sticker on the top face
      translate([0, 0, token_height_mm - sticker_depth])
        linear_extrude(height = sticker_depth + 0.5)
          rrect2d(token_qr_mm, token_qr_mm, r = 1.4);
      // Subtle 45-degree chamfered corner registration marks outside the pocket
      for (sx = [-1, 1], sy = [-1, 1]) {
        translate([sx * 17.2, sy * 17.2, token_height_mm - 0.3])
          cylinder(h = 0.5, d1 = 0.6, d2 = 1.2);
      }
    }
    // Generic centre peg that every Relic's socket drops onto (rises from the pocket floor)
    translate([0, 0, token_height_mm - sticker_depth - 0.01])
      cylinder(h = sticker_depth + relic_peg_h - 0.5 + 0.01, d = relic_peg_d);
    translate([0, 0, token_height_mm + relic_peg_h - 0.5])
      cylinder(h = 0.5, d1 = relic_peg_d, d2 = relic_peg_d - 1.0);
  }
}

color(col_ink) relic_token_pocket();
