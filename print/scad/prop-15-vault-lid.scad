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

      // 2. Rear hinge barrels (at Y_lid = -(vlid_d/2 + 1.2) = -60.2 mm, Z_lid = vlid_h + 2.0 = 24.0 mm;
      //    when flipped right-way up via rotate([180,0,0]) onto Z_vault = 80.0, sits at Y = +60.2, Z = 78.0 mm —
      //    100% coaxial with the vault chest's hinge knuckles!)
      for (hx = [-38.5, 38.5]) {
        hull() {
          translate([hx, -(vlid_d / 2 + 1.2), vlid_h + 2.0])
            rotate([0, 90, 0])
              cylinder(h = 16.0, d = 8.8, center = true);
          translate([hx, -(vlid_d / 2 - 2.0), vlid_h - 8.0])
            cube([16.0, 2.0, 2.0], center = true);
        }
      }
    }

    // 3. Deep interior dome providing vertical clearance for the 6 standing Relics
    translate([0, 0, 3.6])
      chamfer_box(vlid_w - 7.6, vlid_d - 7.6, vlid_h, r = 2.4, ch_bot = 1.0, ch_top = 0);

    // 4. Front Clasp Hasp Slot (at Y_lid = +vlid_d/2 - 1.8 -> sits on front -Y when flipped via rotate([180,0,0]))
    translate([0, vlid_d / 2 - 1.8, vlid_h - 4.0])
      cube([24.6, 4.2, 10.0], center = true);

    // 5. Plank V-grooves around skirt
    for (sy = [-1, 1])
      translate([0, sy * (vlid_d / 2 + 0.1), vlid_h * 0.55])
        rotate([45, 0, 0])
          cube([vlid_w - 16, 1.3, 1.3], center = true);

    // 6. Hinge Pin Bores (3.4 mm ID at Z_lid = vlid_h + 2.0 = 24.0 mm, coaxial with vault chest)
    for (hx = [-38.5, 38.5]) {
      translate([hx, -(vlid_d / 2 + 1.2), vlid_h + 2.0])
        rotate([0, 90, 0])
          cylinder(h = 20.0, d = 3.4, center = true);
    }
  }
}

color(col_leather) prop_15_vault_lid();
