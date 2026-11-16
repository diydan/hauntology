// Hauntology Tabletop Print Kit — Prop #15: Relic Vault (Spring-Hinged Coffered Lid)
// Colour: Leather (#6b4d33)
// Size: 168 W x 118 D x 22 H mm
// Mechanism: Rear hinge barrels with torsion-spring stop; front mortise for Lantern clasp hasp
// Print orientation: Flat on outer lid top (Z = 0 in this file), zero supports.

include <_common.scad>

vlid_w = 168.0;
vlid_d = 118.0;
vlid_h = 22.0;

module prop_15_vault_lid() {
  difference() {
    union() {
      // 1. Main coffered lid shell (printed upside-down on flat top Z = 0)
      chamfer_box(vlid_w, vlid_d, vlid_h, r = 3.6, ch_bot = 1.0, ch_top = 0.6);

      // Gothic Iron Corner Strap Bolsters (rear -Y hinge area around +-38.5 kept 100% clear!)
      for (sx = [-1, 1]) {
        translate([sx * (vlid_w / 2 - 5.0), vlid_d / 2 - 5.0, 0])
          chamfer_box(12.2, 12.2, vlid_h - 0.6, r = 2.0, ch_bot = 1.0, ch_top = 0.6);
        translate([sx * (vlid_w / 2 - 4.0), -(vlid_d / 2 - 5.0), 0])
          chamfer_box(10.6, 10.6, vlid_h - 0.6, r = 2.0, ch_bot = 1.0, ch_top = 0.6);
      }
      // Twin front iron strap bands (Y_lid = +vlid_d/2, avoiding central clasp hasp slot X = +-13)
      for (fx = [-42.0, 42.0]) {
        translate([fx, vlid_d / 2 - 1.5, 0])
          chamfer_box(6.0, 5.2, vlid_h - 0.8, r = 1.0, ch_bot = 0.8, ch_top = 0.5);
      }

      // 2. Rear hinge barrels (at Y_lid = -(vlid_d/2 + 4.6) = -63.6 mm, Z_lid = vlid_h + 1.3 = 23.3 mm;
      //    when flipped right-way up via rotate([180,0,0]) onto Z_rim = 80.3 (0.3 mm clear of Z_vault = 80.0),
      //    sits at Y = +63.6, Z = 79.0 mm — behind rear wall, 100% coaxial with the vault chest knuckles!)
      for (hx = [-38.5, 38.5]) {
        hull() {
          translate([hx, -(vlid_d / 2 + 4.6), vlid_h + 1.3])
            rotate([0, 90, 0])
              cylinder(h = 16.0, d = 8.2, center = true);
          translate([hx, -(vlid_d / 2 - 2.0), vlid_h - 11.5])
            cube([16.0, 3.0, 2.0], center = true);
        }
      }
    }

    // 3. Deep interior dome providing vertical clearance for the 6 standing Relics
    translate([0, 0, 3.6])
      chamfer_box(vlid_w - 7.6, vlid_d - 7.6, vlid_h, r = 2.4, ch_bot = 1.0, ch_top = 0);

    // 4. Front Clasp Hasp Slot (at Y_lid = +vlid_d/2 - 1.8 -> sits on front -Y when flipped via rotate([180,0,0]))
    translate([0, vlid_d / 2 - 1.8, vlid_h - 6.5])
      cube([24.6, 4.2, 15.0], center = true);

    // 5. Crooked Coffin Timber V-grooves on skirts (kept strictly clear of rear X = +-38.5 hinge gussets & front X = +-42 straps!) + top seams
    translate([0, vlid_d / 2 + 0.1, vlid_h * 0.55])
      rotate([0, 2.0, 0])
        rotate([45, 0, 0])
          cube([72.0, 1.4, 1.4], center = true);
    translate([0, -(vlid_d / 2 + 0.1), vlid_h * 0.55])
      rotate([0, -2.0, 0])
        rotate([45, 0, 0])
          cube([54.0, 1.4, 1.4], center = true);
    for (ty = [-28, 0, 28]) {
      translate([0, ty, 0])
        rotate([0, 0, ty == 0 ? 1.8 : -2.2])
          rotate([45, 0, 0])
            cube([vlid_w - 22, 1.1, 1.1], center = true);
    }

    // 6. Hinge Pin Bores (3.5 mm teardropped ID at Y = -63.6, Z_lid = vlid_h + 1.3 = 23.3 mm, coaxial with vault chest) + spring leg notch
    for (hx = [-38.5, 38.5]) {
      hull() {
        translate([hx, -(vlid_d / 2 + 4.6), vlid_h + 1.3])
          rotate([0, 90, 0])
            cylinder(h = 20.0, d = 3.5, center = true);
        translate([hx, -(vlid_d / 2 + 4.6), vlid_h + 2.4])
          rotate([0, 90, 0])
            cylinder(h = 20.0, d = 0.8, center = true);
      }
    }
    translate([0, -(vlid_d / 2 + 0.2), vlid_h - 3.5])
      cube([5.0, 1.6, 8.0], center = true);
  }
}

color(col_leather) prop_15_vault_lid();
