// Hauntology Tabletop Print Kit — Prop #3: Haunt Needle (Hand-Clipped Red MAX Tab)
// Colour: Tarnished Silver (#c9c9d4)
// Size: 20.8 W x 18.0 D x 24.8 H mm
// Sticker details: Recessed "MAX" label sticker pocket (14 x 9 mm) facing forward (+Z of dial)
// Mechanism: Clips radially onto dial plate rim detents at 8 (Quick), 10 (Classic), or 12 (Gentle),
//            clearing prop-03-bezel-ring (Z <= 30.6) cleanly at Z >= 31.0 and r >= 83.6
// Print orientation: Flat on outer butt edge (Z = 0), zero supports.

include <_common.scad>

module prop_03_max_tab() {
  // Local axes at print time:
  //   X = dial Z offset (X = 0..20.8 corresponds to Z_plate = 14.4..35.2; dial front = 12.0, bezel top = 16.2)
  //   Y = arc tangent width (-9.0..+9.0 mm)
  //   Z = radially inward height from outer butt r = 98.0 (Z = 0 -> r = 98.0, Z = 14.4 -> r = 83.6, Z = 24.8 -> r = 73.2)
  difference() {
    union() {
      // 1. Outer Flag Body with Jagged Gothic Crown Edges (r = 83.6..98.0, clear outside bezel_r_out = 83.0)
      translate([10.4, 0, 0])
        chamfer_box(20.8, 18.0, 14.4, r = 1.6, ch_bot = 0.4, ch_top = 0);
      for (sy = [-1, 1]) {
        hull() {
          translate([9.5, sy * 7.5, 0]) cube([14.0, 2.0, 10.0], center = false);
          translate([4.0, sy * 9.8, 0]) cube([8.0, 1.4, 6.0], center = false);
        }
      }

      // 2. Detent Key Tongue (r = 78.8..83.8, Z_plate = 15.4..26.0, width 3.8 mm fits 4.4 mm slot with 0.3 mm clr)
      translate([6.3, 0, 14.2])
        chamfer_box(10.6, 3.8, 5.0, r = 0.6, ch_bot = 0, ch_top = 0.4);

      // 3. Raised Front Gothic Dagger Pointer Bridge (r = 73.2..83.8, Z_plate = 31.0..35.2 -> 0.4 mm clear above bezel top 30.6!)
      translate([18.7, 0, 14.2])
      hull() {
        chamfer_box(4.2, 14.0, 1.0, r = 1.0, ch_bot = 0, ch_top = 0);
        translate([0, 0.8, 10.6])
          chamfer_box(4.2, 2.0, 0.4, r = 0.4, ch_bot = 0, ch_top = 0);
      }
    }

    // 4. Forward-facing 0.4 mm Recessed Sticker Pocket for "MAX" Label (14.0 x 9.0 mm on X = 20.8 face)
    translate([20.8 - sticker_depth, 0, 7.2])
      rotate([0, 90, 0])
        linear_extrude(height = sticker_depth + 0.5)
          rrect2d(9.0, 14.0, r = 1.0);
  }
}

color(col_silver) prop_03_max_tab();
