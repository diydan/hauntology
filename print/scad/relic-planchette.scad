// Hauntology Tabletop Print Kit — Relic r4: Séance Planchette
// Colour: Leather (#6b4d33)
// Height: ~49 mm on 33 mm stepped token base
// Sticker details: Front arcane border / sun-moon sticker pocket around the central viewing oculus
// Print orientation: Flat on pedestal base (Z = 0), zero supports.

include <_common.scad>

// 2D Gothic Heart / Ogive Planchette Silhouette (width ~30 mm, height ~36 mm)
module planchette_shape_2d(shrink = 0) {
  offset(r = -shrink)
  mirror([0, 1, 0])
  hull() {
    // Two lower lobes
    for (sx = [-1, 1])
      translate([sx * 6.8, -8.5]) circle(r = 7.6);
    // Pointed gothic apex
    translate([0, 16.5]) circle(r = 2.2);
  }
}

module relic_planchette() {
  // 1. Flat 14.6 mm foot with a 6 mm centre socket (z = 0..4.5); the Relic Token has the matching peg
  relic_pedestal_base(h = 4.5, top_d = 18.4);

  // 2. A short post from the foot to the point of the planchette (no legs, discs or base plate)
  hull() {
    translate([0, 0, 5.0]) sphere(r = 3.6);
    translate([0, -3.0, 9.6]) sphere(r = 2.4);
  }

  // 3. Sculpted Planchette Body (tilted 16 deg back from vertical = 74 deg from horizontal, 100% print-safe!)
  translate([0, 0, 25.5])
    rotate([74, 0, 0])
    difference() {
      union() {
        // Bevelled wooden heart-ogive body
        hull() {
          translate([0, 0, -2.2]) linear_extrude(height = 0.4) planchette_shape_2d(1.0);
          translate([0, 0, -1.2]) linear_extrude(height = 2.4) planchette_shape_2d(0.0);
          translate([0, 0,  1.8]) linear_extrude(height = 0.4) planchette_shape_2d(0.8);
        }
        // Raised central brass-style viewing oculus bezel on front face (+Z in rotated frame)
        translate([0, 2.5, 1.6])
          cylinder(h = 1.4, d1 = 14.4, d2 = 13.2);
        // Three underside caster wheel bosses on back face (-Z in rotated frame)
        for (pt = [[-6.8, 8.5], [6.8, 8.5]]) {
          translate([pt[0], pt[1], -3.2])
            cylinder(h = 1.6, d1 = 3.6, d2 = 5.2);
        }
      }

      // Recessed 0.4 mm sticker pocket across the planchette face (excluding outer rim and central oculus bezel)
      translate([0, 0, 2.2 - sticker_depth])
        linear_extrude(height = sticker_depth + 0.5)
          difference() {
            planchette_shape_2d(2.4);
            translate([0, 2.5]) circle(d = 14.8);
          }

      // Bevelled sight oculus aperture (with print-safe teardrop top arch so zero supports are needed!)
      translate([0, 2.5, 0])
        rotate([0, 0, 0]) {
          hull() {
            cylinder(h = 10, d = 8.4, center = true);
            translate([0, 5.2, 0]) cylinder(h = 10, d = 1.6, center = true);
          }
          // Front countersink bevel
          translate([0, 0, 1.2])
            cylinder(h = 2.2, d1 = 8.4, d2 = 11.4);
        }
    }
}

color(col_leather) relic_planchette();
