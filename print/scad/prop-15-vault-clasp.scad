// Hauntology Tabletop Print Kit — Prop #15: Relic Vault (Lantern Clasp Escutcheon & Latch Hasp)
// Colour: Lantern (#e0a43a, amber/matte gold)
// Size: 68 W x 28 D x 12 H mm (2 pieces on one plate: chest escutcheon plate + lid keeper hasp)
// Sticker details: Recessed clasp detail sticker pocket (30 x 18 mm)
// Print orientation: Flat on bed (Z = 0), zero supports.

include <_common.scad>

module prop_15_vault_clasp() {
  // 1. Chest Front Escutcheon Plate (at X = -16, 36 x 24 x 4.2 mm)
  translate([-16.0, 0, 0])
  difference() {
    union() {
      chamfer_box(36.0, 24.0, 4.2, r = 2.4, ch_bot = 0.5, ch_top = 0.6);
      // Rear locating boss that drops into the vault chest front recess
      translate([0, 0, 4.2])
        chamfer_box(35.6, 23.6, 1.0, r = 2.0, ch_bot = 0, ch_top = 0.3);
    }
    // Front 0.4 mm sticker pocket for brass clasp rivets & engraving (30 x 18 mm)
    translate([0, 0, -0.1])
      linear_extrude(height = sticker_depth + 0.5)
        rrect2d(30.0, 18.0, r = 1.4);
    // Center keeper slot where the lid hasp loop enters
    translate([0, 4.0, -0.5])
      cube([18.0, 8.0, 7.0], center = true);
  }

  // 2. Lid Keeper Hasp Loop (at X = 20, 24 x 26 x 4.6 mm; engages the SG90 servo latch bolt)
  translate([20.0, 0, 0])
  difference() {
    union() {
      // Upper mounting tab that presses into the vault lid mortise
      translate([0, 6.5, 0])
        chamfer_box(24.0, 12.0, 3.6, r = 1.6, ch_bot = 0.4, ch_top = 0.4);
      // Lower keeper loop tongue
      translate([0, -4.5, 0])
        chamfer_box(16.8, 14.0, 4.6, r = 2.0, ch_bot = 0.4, ch_top = 0.5);
    }
    // Latch bolt catch window (9.6 x 6.4 mm)
    translate([0, -5.0, -0.5])
      linear_extrude(height = 6.0)
        rrect2d(9.6, 6.4, r = 1.0);
  }
}

color(col_lantern) prop_15_vault_clasp();
