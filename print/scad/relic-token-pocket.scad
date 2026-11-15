// Hauntology Tabletop Print Kit — Relic Token Base with 36x36 mm QR Sticker Pocket
// Colour: Ink (#0b0d10, matte black)
// Size: 40 x 40 x 6 mm plate, 36.4 x 36.4 x 0.4 mm recessed QR sticker pocket
// Print orientation: Flat on base (Z = 0), no supports.

include <_common.scad>

module relic_token_pocket() {
  difference() {
    union() {
      // Main 40 x 40 x 6 mm bevelled tabletop plinth plate
      chamfer_box(token_side_mm, token_side_mm, token_height_mm, r = 3.2, ch_bot = 0.8, ch_top = 0.8);
    }
    // 0.4 mm recessed pocket for 36 x 36 mm QR sticker on top face
    translate([0, 0, token_height_mm - sticker_depth])
      linear_extrude(height = sticker_depth + 0.5)
        rrect2d(token_qr_mm, token_qr_mm, r = 1.0);

    // Subtle 45-degree chamfered corner registration marks outside pocket
    for (sx = [-1, 1], sy = [-1, 1]) {
      translate([sx * 17.2, sy * 17.2, token_height_mm - 0.3])
        cylinder(h = 0.5, d1 = 0.6, d2 = 1.2);
    }
  }
}

color(col_ink) relic_token_pocket();
