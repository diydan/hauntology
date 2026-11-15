// Hauntology Tabletop Print Kit — Prop #1: Ghost in the Box (Coffered Lid)
// Colour: Leather (#6b4d33)
// Size: 162 W x 92 D x 18 H mm
// Mechanism: Rear hinge barrels mate with chest knuckles; underside cam ramp lifted by servo (0-30 deg)
// Print orientation: Flat on outer lid top (Z = 0 in this file), zero supports.

include <_common.scad>

lid_w = 162.0;
lid_d = 92.0;
lid_h = 18.0;

module prop_01_chest_lid() {
  difference() {
    union() {
      // 1. Main lid shell (printed upside-down: outer top sits on Z = 0, rim rises to Z = lid_h)
      chamfer_box(lid_w, lid_d, lid_h, r = 3.6, ch_bot = 1.0, ch_top = 0.6);

      // 2. Rear hinge barrels (positioned inboard of the chest body's +/-52 mm knuckles with 0.3 mm clearance)
      for (hx = [-35.5, 35.5]) {
        hull() {
          translate([hx, lid_d / 2 + 1.2, lid_h - 2.5])
            rotate([0, 90, 0])
              cylinder(h = 15.0, d = 8.4, center = true);
          translate([hx, lid_d / 2 - 2.0, lid_h - 9.0])
            cube([15.0, 2.0, 2.0], center = true);
        }
      }
    }

    // 3. Recessed underside coffer cavity (with 3.2 mm roof and 3.2 mm walls)
    translate([0, 0, 3.6])
      chamfer_box(lid_w - 7.2, lid_d - 7.2, lid_h, r = 2.0, ch_bot = 0.8, ch_top = 0);

    // 4. Plank grooves on front, back and side skirts
    for (sy = [-1, 1])
      translate([0, sy * (lid_d / 2 + 0.1), lid_h * 0.55])
        rotate([45, 0, 0])
          cube([lid_w - 14, 1.3, 1.3], center = true);
    for (sx = [-1, 1])
      translate([sx * (lid_w / 2 + 0.1), 0, lid_h * 0.55])
        rotate([0, 45, 0])
          cube([1.3, lid_d - 14, 1.3], center = true);

    // 5. Hinge pin bores (3.2 mm ID with teardrop crown for support-free printing)
    for (hx = [-35.5, 35.5]) {
      translate([hx, lid_d / 2 + 1.2, lid_h - 2.5])
        rotate([0, 90, 0])
          cylinder(h = 18.0, d = 3.2, center = true);
    }
  }

  // 6. Underside Servo Cam Follower Ramp (at X = -28, engaged by servo lever from 0 to 30 deg)
  translate([-28.0, 6.0, 3.6]) {
    hull() {
      translate([0, -14.0, 0]) cube([6.0, 28.0, 1.0], center = true);
      translate([0, -6.0, 11.5]) cube([6.0, 12.0, 1.0], center = true);
    }
  }
}

color(col_leather) prop_01_chest_lid();
