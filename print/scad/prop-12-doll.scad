// Hauntology Tabletop Print Kit — Prop #12: Rattle Prop (Option C: Victorian Rag Doll)
// Colour: Bone (#e9e4d8, warm white)
// Size: 42 W x 62 H x 6.4 D mm (weight ~9.5 g < 30 g)
// Sticker details: Recessed 16 mm circular face sticker pocket on head
// Print orientation: Flat on back (Z = 0), zero supports.

include <_common.scad>

module prop_12_doll() {
  difference() {
    union() {
      // 1. Flared Bell Skirt & Bodice (Y = 8..34, Z = 0..5.2)
      hull() {
        translate([-13.0, 9.0, 0]) cylinder(h = 5.2, d = 5.0);
        translate([ 13.0, 9.0, 0]) cylinder(h = 5.2, d = 5.0);
        translate([-6.5, 32.0, 0]) cylinder(h = 5.2, d = 4.6);
        translate([ 6.5, 32.0, 0]) cylinder(h = 5.2, d = 4.6);
      }

      // 2. Two Lower Legs & Boots (Y = 0..10)
      for (sx = [-5.5, 5.5]) {
        hull() {
          translate([sx, 2.0, 0]) cylinder(h = 4.2, d = 4.4);
          translate([sx, 10.0, 0]) cylinder(h = 4.2, d = 4.8);
        }
      }

      // 3. Outstretched Rag Arms (Y = 18..32)
      for (sx = [-1, 1]) {
        hull() {
          translate([sx * 7.0, 31.0, 0]) cylinder(h = 4.4, d = 4.6);
          translate([sx * 17.5, 19.0, 0]) cylinder(h = 4.4, d = 4.2);
        }
      }

      // 4. Porcelain-Style Head with Bonnet Rim (Y = 44, diameter 22 mm)
      translate([0, 44.0, 0])
        cylinder(h = 5.8, d1 = 22.4, d2 = 21.0);

      // 5. Top Suspension Loop at Crown (Y = 56..60)
      translate([0, 56.5, 0])
        cylinder(h = 4.2, d = 8.4);
    }

    // 6. Recessed 0.4 mm Circular Face Sticker Pocket (16.2 mm dia)
    translate([0, 44.0, 5.8 - sticker_depth])
      cylinder(h = sticker_depth + 0.6, d = 16.2);

    // 7. Crown Thread Tie Hole (2.4 mm ID)
    translate([0, 57.2, -0.5])
      cylinder(h = 6.0, d = 2.4);
  }
}

color(col_bone) prop_12_doll();
