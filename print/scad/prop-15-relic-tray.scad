// Hauntology Tabletop Print Kit — Prop #15: Relic Vault (6-Pocket Relic Tray Insert)
// Colour: Ink (#0b0d10, matte black)
// Size: 150 W x 100 D x 15 H mm (fits inside the Relic Vault chest)
// Sticker details: Six 20 x 20 mm 0.4 mm recessed relic-icon sticker pockets in the floor of each bay
// Mechanism: Holds all six 40 x 40 mm Relic Tokens in a 3 x 2 grid with finger-lift scoops
// Print orientation: Flat on tray bottom (Z = 0), zero supports.

include <_common.scad>

tray_w = 150.0;
tray_d = 100.0;
tray_h = 15.0;
bay_mm = 41.2; // 40 x 40 mm token + 0.6 mm per-side finger clearance

module prop_15_relic_tray() {
  difference() {
    union() {
      // 1. Main 3x2 tray block with bevelled outer rim
      chamfer_box(tray_w, tray_d, tray_h, r = 3.2, ch_bot = 0.8, ch_top = 0.8);

      // Side lift handles at left and right ends
      for (sx = [-1, 1]) {
        translate([sx * (tray_w / 2 - 2.0), 0, tray_h - 3.0])
          chamfer_box(6.0, 32.0, 3.0, r = 1.5, ch_bot = 0.4, ch_top = 0.4);
      }
    }

    // 2. Six 41.2 x 41.2 x 11.5 mm Relic Token Pockets (3 columns x 2 rows)
    for (col = [-1, 0, 1], row = [-1, 1]) {
      bx = col * 46.5;
      by = row * 23.5;

      // Token bay pocket (Z = 3.5..15.0)
      translate([bx, by, 3.5])
        linear_extrude(height = tray_h)
          rrect2d(bay_mm, bay_mm, r = 2.4);

      // Recessed 0.4 mm Relic Icon Sticker Pocket in the floor of each bay (22 x 22 mm, Z = 3.1..3.6)
      translate([bx, by, 3.5 - sticker_depth])
        linear_extrude(height = sticker_depth + 0.5)
          rrect2d(22.0, 22.0, r = 1.6);
    }

    // 3. Finger-Lift Scoops between Rows so Tokens lift out effortlessly
    for (col = [-1, 0, 1]) {
      translate([col * 46.5, 0, tray_h])
        rotate([0, 90, 0])
          cylinder(h = 16.0, d = 14.0, center = true);
    }
  }
}

color(col_ink) prop_15_relic_tray();
