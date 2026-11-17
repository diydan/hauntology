// Hauntology Tabletop Print Kit — Master 3-in-1 Haunted Chest: Right Split Lid (#15 Spring-Latched Lockbox Lid)
// Colour: Leather / Wood Brown (#6b4d33)
// Size: ~67 W x 123 D x 25.3 H mm (covers Right #15 Lockbox bay X = +20.7..+86.5; pops open by torsion spring!)
// Mechanism: Coaxial rear hinge barrels at Y = +62.2, Z = 69.0 + torsion-spring stop; front mortise for brass clasp hasp
// Print orientation: Flat on outer lid top (Z = 0 in this file), zero supports.

include <_common.scad>

vlid_w = 61.6;
vlid_d = 114.0;
vlid_h = 20.0;

module prop_15_vault_lid() {
  difference() {
    union() {
      // 1. Right split lid shell (printed upside-down on flat top Z = 0)
      chamfer_box(vlid_w, vlid_d, vlid_h, r = 3.2, ch_bot = 0.9, ch_top = 0.5);

      // Outer right & front iron corner bolsters + front strap bands
      translate([vlid_w / 2 - 4.6, vlid_d / 2 - 4.6, 0])
        chamfer_box(10.8, 10.8, vlid_h - 0.5, r = 1.8, ch_bot = 0.9, ch_top = 0.5);
      translate([vlid_w / 2 - 3.8, -(vlid_d / 2 - 4.6), 0])
        chamfer_box(9.4, 9.4, vlid_h - 0.5, r = 1.8, ch_bot = 0.9, ch_top = 0.5);
      for (fx = [-19.5, 19.5]) {
        translate([fx, vlid_d / 2 - 1.3, 0])
          chamfer_box(4.4, 4.0, vlid_h - 0.6, r = 0.8, ch_bot = 0.7, ch_top = 0.4);
      }

      // 2. Rear hinge barrels (at X_local = -11.5, +11.5 -> X_world = +43.9, +66.9 between chest knuckles +30 and +79.5;
      //    Y_lid = -(vlid_d/2 + 5.2) = -62.2, Z_lid = vlid_h + 1.3 = 21.3 -> lands on Y = +62.2, Z = 69.0 when flipped!)
      for (hx = [-11.5, 11.5]) {
        hull() {
          translate([hx, -(vlid_d / 2 + 5.2), vlid_h + 1.3])
            rotate([0, 90, 0])
              cylinder(h = 11.0, d = 8.0, center = true);
          translate([hx, -(vlid_d / 2 - 0.8), vlid_h - 10.5])
            cube([11.0, 2.4, 2.0], center = true);
        }
      }
    }

    // 3. Lightweight Thin-Shell Interior Dome (1.9 mm crown, 2.2 mm skirts, preserving front boss around hasp mortise!)
    difference() {
      translate([0, 0, 1.9])
        chamfer_box(vlid_w - 4.4, vlid_d - 4.4, vlid_h, r = 2.2, ch_bot = 0.7, ch_top = 0);
      hull() {
        translate([0, vlid_d / 2 - 2.8, 11.5]) cube([30.0, 5.8, 16.5], center = true);
        translate([0, vlid_d / 2 - 0.5, 2.0]) cube([34.0, 1.2, 1.0], center = true);
      }
    }

    // 4. Front Clasp Hasp Slot (15.0 mm slot depth matching prop-15-vault-clasp hasp tab!)
    translate([0, vlid_d / 2 - 1.8, vlid_h - 6.5])
      cube([24.6, 4.2, 15.0], center = true);

    // 5. Shallow Crooked Timber V-grooves on top
    for (ty = [-26, 0, 26]) {
      translate([0, ty, 0])
        rotate([0, 0, ty == 0 ? -1.8 : 2.0]) rotate([45, 0, 0]) cube([vlid_w - 14, 0.85, 0.85], center = true);
    }

    // 6. Hinge Pin Bores (Ø3.5 mm teardropped ID) + central torsion-spring leg notch
    for (hx = [-11.5, 11.5]) {
      hull() {
        translate([hx, -(vlid_d / 2 + 5.2), vlid_h + 1.3])
          rotate([0, 90, 0]) cylinder(h = 16.0, d = 3.5, center = true);
        translate([hx, -(vlid_d / 2 + 5.2), vlid_h + 2.4])
          rotate([0, 90, 0]) cylinder(h = 16.0, d = 0.8, center = true);
      }
    }
    translate([0, -(vlid_d / 2 + 0.2), vlid_h - 3.5])
      cube([5.0, 1.6, 8.0], center = true);
  }
}

color(col_leather) prop_15_vault_lid();
