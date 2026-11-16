// Hauntology Tabletop Print Kit — Prop #1: Ghost in the Box (Coffered Lid)
// Colour: Leather (#6b4d33)
// Size: 162 W x 92 D x 20 H mm
// Mechanism: Rear hinge barrels mate with chest knuckles at Y = +51.2, Z = 69.0; underside cam ramp lifted by XZ lever
// Print orientation: Flat on outer lid top (Z = 0 in this file), zero supports.

include <_common.scad>

lid_w = 162.0;
lid_d = 92.0;
lid_h = 20.0;

module prop_01_chest_lid() {
  difference() {
    union() {
      // 1. Main lid shell (printed upside-down: outer top sits on Z = 0, rim rises to Z = lid_h)
      chamfer_box(lid_w, lid_d, lid_h, r = 3.6, ch_bot = 1.0, ch_top = 0.6);

      // Gothic Iron Corner Strap Bolsters on front & left/right corners (rear -Y kept clear for chest knuckles!)
      for (sx = [-1, 1]) {
        translate([sx * (lid_w / 2 - 5.0), lid_d / 2 - 5.0, 0])
          chamfer_box(12.2, 12.2, lid_h - 0.6, r = 2.0, ch_bot = 1.0, ch_top = 0.6);
        translate([sx * (lid_w / 2 - 4.0), -(lid_d / 2 - 5.0), 0])
          chamfer_box(10.6, 10.6, lid_h - 0.6, r = 2.0, ch_bot = 1.0, ch_top = 0.6);
      }
      // Front iron strap bands climbing cleanly from Z = 0 (avoiding hinge side!)
      for (fx = [-38.0, 38.0]) {
        translate([fx, lid_d / 2 - 1.5, 0])
          chamfer_box(6.0, 5.2, lid_h - 0.8, r = 1.0, ch_bot = 0.8, ch_top = 0.5);
      }

      // 2. Rear hinge barrels (at Y_lid = -(lid_d/2 + 5.2) = -51.2 mm, Z_lid = lid_h + 1.3 = 21.3 mm;
      //    when flipped right-way up via rotate([180,0,0]) onto Z_rim = 70.3 (0.3 mm clear of Z_chest = 70.0),
      //    this sits at Y = +51.2, Z = 69.0 mm — 100% coaxial with the chest body's hinge knuckles!)
      for (hx = [-35.5, 35.5]) {
        hull() {
          translate([hx, -(lid_d / 2 + 5.2), lid_h + 1.3])
            rotate([0, 90, 0])
              cylinder(h = 15.0, d = 7.8, center = true);
          translate([hx, -(lid_d / 2 - 0.5), lid_h - 10.5])
            cube([15.0, 3.0, 2.0], center = true);
        }
      }
    }

    // 3. Recessed underside coffer cavity (with 3.6 mm roof and 3.6 mm walls)
    translate([0, 0, 3.6])
      chamfer_box(lid_w - 7.2, lid_d - 7.2, lid_h, r = 2.4, ch_bot = 0.8, ch_top = 0);

    // 4. Crooked Coffin Timber V-grooves on skirts + diagonal seam grooves on lid top (Z = 0)
    for (sy = [-1, 1])
      translate([0, sy * (lid_d / 2 + 0.1), lid_h * 0.55])
        rotate([0, sy * 2.2, 0])
          rotate([45, 0, 0])
            cube([lid_w - 16, 1.4, 1.4], center = true);
    for (sx = [-1, 1])
      translate([sx * (lid_w / 2 + 0.1), 0, lid_h * 0.55])
        rotate([sx * 2.4, 0, 0])
          rotate([0, 45, 0])
            cube([1.4, lid_d - 16, 1.4], center = true);
    for (ty = [-22, 0, 22]) {
      translate([0, ty, 0])
        rotate([0, 0, ty == 0 ? 1.8 : -2.2])
          rotate([45, 0, 0])
            cube([lid_w - 22, 1.1, 1.1], center = true);
    }

    // 5. Hinge pin bores (3.2 mm ID, coaxial with chest body at Y = -51.2, Z_lid = lid_h + 1.3)
    for (hx = [-35.5, 35.5]) {
      translate([hx, -(lid_d / 2 + 5.2), lid_h + 1.3])
        rotate([0, 90, 0])
          cylinder(h = 18.0, d = 3.2, center = true);
    }
  }

  // 6. Underside Servo Cam Follower Ramp (X = -39..-21, Y_stl = +8.75 -> Y_world = -8.75 when flipped,
  //    in the exact Y = -11.0..-6.5 lever sweep plane! Clear of closed cam at X = -6.4)
  translate([0, 8.75, 3.6]) {
    hull() {
      translate([-30.0, 0, 0]) cube([18.0, 4.5, 1.0], center = true);
      translate([-36.0, 0, 12.0]) cube([6.0, 4.5, 1.0], center = true);
    }
  }
}

color(col_leather) prop_01_chest_lid();
