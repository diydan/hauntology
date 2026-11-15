// Hauntology Tabletop Print Kit — Relic r5: Warded Silver Skeleton Key
// Colour: Silver (#c9c9d4) or Bone (#e9e4d8)
// Height: ~54 mm on 33 mm stepped token base
// Sticker details: Keyhole escutcheon crest sticker pocket on plinth front (14 x 8 mm)
// Print orientation: Flat on pedestal base (Z = 0), zero supports (45-deg corbels under bit & bow).

include <_common.scad>

module relic_silver_key() {
  // 1. Stepped circular token pedestal base (z = 0..6.5)
  relic_pedestal_base(h = 6.5);

  // 2. Gothic Escutcheon Plinth with Front Sticker Pocket (z = 6.5..16.5)
  translate([0, 0, 6.5])
  difference() {
    union() {
      cylinder(h = 2.5, d1 = 26, d2 = 22);
      translate([0, 0, 2.0])
        chamfer_box(20.0, 13.0, 8.0, r = 2.2, ch_bot = 0.6, ch_top = 1.0);
      // Raised front crest frame
      translate([0, -6.5, 5.8])
        rotate([90, 0, 0])
          chamfer_box(16.0, 9.6, 1.0, r = 1.2, ch_bot = 0.3, ch_top = 0.3);
    }
    // Front 0.4 mm recessed sticker pocket (14 x 8 mm)
    translate([0, -7.1, 5.8])
      rotate([90, 0, 0])
        linear_extrude(height = sticker_depth + 0.5)
          rrect2d(14.0, 8.0, r = 0.8);
  }

  // 3. Turned Skeleton Key Stem & Collars (z = 15.5..40.0)
  translate([0, 0, 15.5]) {
    // Main cylindrical shaft
    cylinder(h = 24.5, d = 5.4);
    // Decorative turned barrel collars (45-deg self-supporting profiles)
    for (zc = [1.5, 11.5, 21.5]) {
      translate([0, 0, zc]) {
        cylinder(h = 1.2, d1 = 5.4, d2 = 7.8);
        translate([0, 0, 1.2]) cylinder(h = 1.0, d = 7.8);
        translate([0, 0, 2.2]) cylinder(h = 1.2, d1 = 7.8, d2 = 5.4);
      }
    }

    // 4. Stepped Ward Bit (projecting to +X, with 45-deg bottom corbel from collar)
    translate([0, 0, 2.5])
    difference() {
      hull() {
        translate([2.0, 0, 0]) cube([1.0, 3.2, 1.0], center = true);
        translate([6.2, 0, 5.2]) cube([9.5, 3.2, 8.4], center = true);
      }
      // Intricate ward notches (vertical and angled key cuts)
      translate([6.2, 0, 5.2]) {
        translate([-1.2, 0, 1.5]) cube([1.4, 5.0, 4.2], center = true);
        translate([ 1.8, 0, -0.5]) cube([1.4, 5.0, 4.2], center = true);
        translate([ 0.4, 0, 0.2]) cube([4.2, 5.0, 1.3], center = true);
      }
    }
  }

  // 5. Gothic Quatrefoil Key Bow (Handle) at Top (z = 39.0..54.0)
  translate([0, 0, 46.5])
  difference() {
    union() {
      // Diamond-corbelled outer bow frame (45-deg self-supporting lower cheeks)
      hull() {
        translate([0, 0, -7.5]) cylinder(h = 1.0, d = 6.6, center = true);
        for (sx = [-1, 1])
          translate([sx * 5.2, 0, 0]) rotate([90, 0, 0]) cylinder(h = 4.2, d = 7.6, center = true);
        translate([0, 0,  5.2]) rotate([90, 0, 0]) cylinder(h = 4.2, d = 7.2, center = true);
      }
      // Top finial pip
      translate([0, 0, 6.2])
        cylinder(h = 2.0, d1 = 5.2, d2 = 2.2);
    }
    // Print-safe teardrop cutouts forming the gothic trefoil/quatrefoil tracery
    for (pt = [[0, 2.6, 2.4], [-3.4, -0.6, 2.0], [3.4, -0.6, 2.0], [0, -3.4, 1.8]]) {
      translate([pt[0], 0, pt[1]])
        rotate([90, 0, 0])
          hull() {
            cylinder(h = 8.0, d = pt[2], center = true);
            translate([0, pt[2] * 0.55, 0]) cylinder(h = 8.0, d = 0.6, center = true);
          }
    }
  }
}

color(col_silver) relic_silver_key();
