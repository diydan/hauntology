// Hauntology Tabletop Print Kit — Master Chest Left-Side Safe Dial Knob (for KY-040 Rotary Encoder)
// Colour: Tarnished Silver (#c9c9d4)
// Size: ~27.6 x 30.2 x 14.6 mm (Ø27.6 knurled Gothic vault dial knob + pointed index dagger + hidden M7 nut recess)
// Mechanism: Press-fits onto standard KY-040 6.0 mm D-shaft on Left (-X) wall of prop-01-chest-body;
//            1.6 mm axial gap under skirt preserves KY-040 push-shaft click (SW pin) while hiding the M7 mounting nut!
// Print orientation: Flat on back rim (Z = 0), 100% support-free (all inner bores <= 43 deg).

include <_common.scad>

module prop_01_safe_knob() {
  difference() {
    union() {
      // 1. Bevelled Gothic safe-dial skirt & knurled grip drum (Z = 0..11.6, Ø26.4 -> Ø22.4)
      cylinder(h = 2.6, d1 = 26.8, d2 = 26.2, $fn = 64);
      translate([0, 0, 2.6])
        cylinder(h = 6.2, d1 = 26.2, d2 = 23.6, $fn = 64);
      translate([0, 0, 8.8])
        cylinder(h = 3.2, d1 = 23.6, d2 = 18.8, $fn = 64);

      // 16 Gothic gear-tooth grip flutes around the knurled drum
      for (i = [0 : 15]) {
        rotate([0, 0, i * 22.5])
          hull() {
            translate([12.6, 0, 0]) cylinder(h = 8.4, d = 2.4, $fn = 16);
            translate([11.2, 0, 10.6]) cylinder(h = 0.8, d = 1.4, $fn = 16);
          }
      }

      // 2. Pointed +Y Gothic Dagger Index Pointer (reaches R = 16.2 mm to point directly at chest dial ticks!)
      //    Aligned opposite the KY-040 D-flat (+Y when D-flat is on -Y; can rotate freely with encoder)
      hull() {
        translate([-3.4, 9.5, 0]) cylinder(h = 5.4, d = 2.4, $fn = 16);
        translate([ 3.4, 9.5, 0]) cylinder(h = 5.4, d = 2.4, $fn = 16);
        translate([ 0.0, 15.8, 0]) cylinder(h = 3.2, d = 1.5, $fn = 16);
      }

      // 3. Raised Victorian Vault-Spindle Crown Boss on Front Face (Z = 12.0..14.6)
      translate([0, 0, 11.8])
        cylinder(h = 2.8, d1 = 12.4, d2 = 8.8, $fn = 48);
      for (ang = [0, 120, 240]) {
        rotate([0, 0, ang])
          hull() {
            translate([3.2, 0, 11.8]) cylinder(h = 2.4, d = 2.8, $fn = 16);
            translate([8.2, 0, 11.8]) cylinder(h = 1.2, d = 1.6, $fn = 16);
          }
      }
    }

    // 4. Underside M7 Hex-Nut & Washer Concealment Recess (Ø13.4 mm, Z = 0..4.4, tapering at 42 deg to Ø6.25 at Z = 8.4 -> 0 supports!)
    //    Ensure >= 250 mm² flat bed contact on Z = 0 outer annulus (Ø26.8 minus Ø13.4 = 423 mm² bed contact!)
    translate([0, 0, -0.2])
      cylinder(h = 4.6, d = 13.4, $fn = 48);
    translate([0, 0, 4.39])
      cylinder(h = 4.1, d1 = 13.4, d2 = 6.25, $fn = 48);

    // 5. Keyed 6.0 mm KY-040 D-Shaft Socket (Z = 4.4..12.8, Ø6.20 mm w/ D-flat at Y = -1.65 mm -> 4.65 mm chord + 42-deg conical tip)
    difference() {
      union() {
        translate([0, 0, 4.3])
          cylinder(h = 8.5, d = 6.22, $fn = 40);
        translate([0, 0, 12.79])
          cylinder(h = 1.4, d1 = 6.22, d2 = 1.4, $fn = 32);
      }
      // Solid D-flat key tab on -Y side (Z = 5.4..13.5, sloped 45 deg from Z = 4.4..5.9 so zero downward overhang!)
      hull() {
        translate([0, -2.55, 9.6]) cube([7.0, 2.0, 6.8], center = true);
        translate([0, -3.55, 4.4]) cube([7.0, 0.2, 0.4], center = true);
      }
    }
  }
}

color(col_silver) prop_01_safe_knob();
