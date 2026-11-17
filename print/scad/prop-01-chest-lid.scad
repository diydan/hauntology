// Hauntology Tabletop Print Kit — Master 3-in-1 Haunted Chest: Left Split Lid (#1 Self-Closing Ghost Lid)
// Colour: Leather / Wood Brown (#6b4d33)
// Size: ~107 W x 123 D x 25.3 H mm (covers Left #1 Ghost bay X = -86.5..+19.7; gravity self-closing!)
// Mechanism: Coaxial rear hinge barrels at Y = +62.2, Z = 69.0; underside cam ramp lifted by #1 XZ lever
// Print orientation: Flat on outer lid top (Z = 0 in this file), zero supports.

include <_common.scad>

lid_w = 110.2;
lid_d = 114.0;
lid_h = 20.0;

module prop_01_chest_lid() {
  difference() {
    union() {
      // 1. Left split lid shell (printed upside-down: outer top on Z = 0, rim rises to Z = lid_h)
      chamfer_box(lid_w, lid_d, lid_h, r = 3.2, ch_bot = 0.9, ch_top = 0.5);

      // Outer left & front iron corner bolsters + front strap bands
      translate([-(lid_w / 2 - 4.6), lid_d / 2 - 4.6, 0])
        chamfer_box(10.8, 10.8, lid_h - 0.5, r = 1.8, ch_bot = 0.9, ch_top = 0.5);
      translate([-(lid_w / 2 - 3.8), -(lid_d / 2 - 4.6), 0])
        chamfer_box(9.4, 9.4, lid_h - 0.5, r = 1.8, ch_bot = 0.9, ch_top = 0.5);
      for (fx = [-28.0, 28.0]) {
        translate([fx, lid_d / 2 - 1.3, 0])
          chamfer_box(4.8, 4.2, lid_h - 0.6, r = 0.8, ch_bot = 0.7, ch_top = 0.4);
      }

      // 2. Rear hinge barrels (at X_local = -29.1, +29.9 -> X_world = -60.5, -1.5 with exact 0.50 mm axial constraint inside
      //    chest knuckles -82..-68 and +6..+20 so the lid can never slide sideways into the Right Lid or wander off the cam lever!)
      for (hx = [-29.1, 29.9]) {
        hull() {
          translate([hx, -(lid_d / 2 + 5.2), lid_h + 1.3])
            rotate([0, 90, 0])
              cylinder(h = 14.0, d = 8.0, center = true);
          translate([hx, -(lid_d / 2 - 0.8), lid_h - 10.5])
            cube([14.0, 2.4, 2.0], center = true);
        }
      }
    }

    // 3. Lightweight Thin-Shell Underside Cavity (1.9 mm crown, 2.2 mm skirts)
    difference() {
      translate([0, 0, 1.9])
        chamfer_box(lid_w - 4.4, lid_d - 4.4, lid_h, r = 2.2, ch_bot = 0.7, ch_top = 0);
      translate([-28.0, 0, 2.6]) cube([1.8, lid_d - 6.0, 1.6], center = true);
      translate([ 26.0, 0, 2.6]) cube([1.8, lid_d - 6.0, 1.6], center = true);
    }

    // 4. Shallow Crooked Timber V-grooves
    translate([0, lid_d / 2 + 0.1, lid_h * 0.55])
      rotate([0, 2.0, 0]) rotate([45, 0, 0]) cube([lid_w - 18, 0.95, 0.95], center = true);
    for (ty = [-26, 0, 26]) {
      translate([0, ty, 0])
        rotate([0, 0, ty == 0 ? 1.8 : -2.0]) rotate([45, 0, 0]) cube([lid_w - 16, 0.85, 0.85], center = true);
    }

    // 5. Hinge pin bores (Ø3.5 mm teardropped ID)
    for (hx = [-29.1, 29.9]) {
      hull() {
        translate([hx, -(lid_d / 2 + 5.2), lid_h + 1.3])
          rotate([0, 90, 0]) cylinder(h = 18.0, d = 3.5, center = true);
        translate([hx, -(lid_d / 2 + 5.2), lid_h + 2.4])
          rotate([0, 90, 0]) cylinder(h = 18.0, d = 0.8, center = true);
      }
    }
  }

  // 6. Underside Servo Cam Follower Ramp aligned with #1 lever plane (X_world = xg_01 - 39..-15 = -55.0..-31.0 ->
  //    X_lid = X_world - xl_01 = -23.6..+0.4; Y_world = yg_01 - 8.75 = -12.55 -> Y_lid = +12.5..+23.0 engages lever across 0..25 deg & clears at 30 deg!)
  hull() {
    translate([-11.6, 17.75, 2.2]) cube([24.0, 10.5, 1.4], center = true);
    translate([-19.0, 17.75, 11.2]) cube([8.0, 10.5, 1.0], center = true);
  }
}

color(col_leather) prop_01_chest_lid();
