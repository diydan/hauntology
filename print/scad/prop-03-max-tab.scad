// Hauntology Tabletop Print Kit — Prop #3: Haunt Needle (Hand-Clipped Red MAX Tab)
// Colour: Alarm (#d4604a, brick red)
// Size: 28 L x 15 W x 9 H mm
// Sticker details: Recessed "MAX" label sticker pocket (15 x 7.5 mm)
// Mechanism: Clips by hand onto dial plate rim detents at 8 (Quick), 10 (Classic), or 12 (Gentle)
// Print orientation: Flat on base (Z = 0), zero supports.

include <_common.scad>

module prop_03_max_tab() {
  difference() {
    union() {
      // 1. Outer flag body with recessed "MAX" sticker pocket (X = 0..18)
      translate([9.0, 0, 0])
        chamfer_box(18.0, 14.0, 5.2, r = 2.0, ch_bot = 0.5, ch_top = 0.5);

      // 2. Inward pointer arrow tip & detent key (X = -9..0)
      hull() {
        translate([0, 0, 0]) cylinder(h = 5.2, d = 11.0);
        translate([-8.5, 0, 0]) cylinder(h = 5.2, d = 2.2);
      }

      // 3. Detent key tooth & rear retention hook (clips onto dial plate rim with 0.3 mm clearance)
      translate([-2.0, 0, 0])
        chamfer_box(3.4, 3.8, 9.2, r = 0.6, ch_bot = 0.3, ch_top = 0.4);
      translate([5.6, 0, 0])
        chamfer_box(3.2, 10.0, 9.2, r = 0.8, ch_bot = 0.3, ch_top = 0.4);
    }

    // 4. Top 0.4 mm recessed sticker pocket for "MAX" label (14 x 9 mm)
    translate([9.6, 0, 5.2 - sticker_depth])
      linear_extrude(height = sticker_depth + 0.5)
        rrect2d(14.0, 9.0, r = 1.0);
  }
}

color(col_alarm) prop_03_max_tab();
