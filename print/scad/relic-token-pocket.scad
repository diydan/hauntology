// Hauntology Tabletop Print Kit — Relic Token Base with 36x36 mm QR Sticker Pocket & Centre Connector Socket
// Colour: Ink (#0b0d10, matte black)
// Size: 40 x 40 x 6 mm rounded plate, 36.4 x 36.4 x 0.4 mm recessed QR sticker pocket,
//       plus central socket that accepts any Relic miniature's centre connector (no Relic base plates).
// Print orientation: Flat on base (Z = 0), no supports.

include <_common.scad>

module relic_token_pocket() {
  difference() {
    // Main 40 x 40 x 6 mm smoothly rounded tabletop plinth plate
    chamfer_box(token_side_mm, token_side_mm, token_height_mm, r = 4.2, ch_bot = 1.0, ch_top = 1.0);

    // 1. 0.4 mm recessed pocket for 36 x 36 mm QR sticker on top face (Z = 5.6..6.0)
    translate([0, 0, token_height_mm - sticker_depth])
      linear_extrude(height = sticker_depth + 0.5)
        rrect2d(token_qr_mm, token_qr_mm, r = 1.4);

    // 2. Central Relic Connector Socket (13.9 mm ID x 2.0 mm deep below sticker pocket, with +Y anti-rotation keyway)
    translate([0, 0, token_height_mm - sticker_depth - relic_conn_plug_h - 0.1]) {
      cylinder(h = relic_conn_plug_h + sticker_depth + 0.5, d = relic_conn_sock_d);
      translate([0, relic_conn_sock_d / 2 - 0.1, (relic_conn_plug_h + sticker_depth) / 2])
        cube([2.4 + 2 * clear_fit, 1.4 + 2 * clear_fit, relic_conn_plug_h + sticker_depth + 0.6], center = true);
    }
    // Bevelled lead-in mouth around top of centre socket
    translate([0, 0, token_height_mm - sticker_depth - 0.6])
      cylinder(h = 0.8, d1 = relic_conn_sock_d, d2 = relic_conn_sock_d + 1.0);
  }
}

color(col_ink) relic_token_pocket();
