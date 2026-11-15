// Hauntology Tabletop Print Kit — Prop #12: Rattle Prop (Three Bats Mobile + Spreader Bar)
// Colour: Ink (#0b0d10, matte black; chosen option in IDEAS.md)
// Size: 116 W x 56 D x 3.2 H mm (three 44 mm wingspan bats + 116 mm spreader bar, total weight ~8.5 g < 30 g)
// Sticker details: Recessed 0.4 mm red eye pockets on each bat
// Print orientation: Flat on bed (Z = 0), zero supports.

include <_common.scad>

// 2D Gothic Bat Silhouette (~44 mm wingspan, ~22 mm body height)
module bat_2d() {
  difference() {
    union() {
      // Central body & head
      scale([4.2, 7.5]) circle(r = 1.0);
      // Pointed ears
      for (sx = [-1, 1]) {
        hull() {
          translate([sx * 2.0, 5.5]) circle(r = 1.2);
          translate([sx * 3.0, 9.5]) circle(r = 0.5);
        }
      }
      // Left and right swept wings
      for (sx = [-1, 1]) {
        hull() {
          translate([sx * 3.0, 2.0]) circle(r = 4.5);
          translate([sx * 12.0, 5.5]) circle(r = 4.0);
          translate([sx * 21.0, 1.5]) circle(r = 1.6);
        }
        hull() {
          translate([sx * 3.0, -1.5]) circle(r = 3.5);
          translate([sx * 11.0, -1.0]) circle(r = 3.5);
        }
      }
      // Hanging eyelet tab at tail (bats hang upside-down or swoop)
      translate([0, -8.5]) circle(r = 3.0);
    }
    // Scalloped wing cutouts along bottom edge of wings
    for (sx = [-1, 1]) {
      translate([sx * 7.2, -6.2]) circle(r = 3.8);
      translate([sx * 15.2, -4.5]) circle(r = 4.2);
    }
    // Thread tie hole (2.0 mm ID)
    translate([0, -8.8]) circle(d = 2.0);
  }
}

module single_bat() {
  difference() {
    union() {
      linear_extrude(height = 2.6)
        bat_2d();
      // Raised central body ridge & wing bone ribs
      hull() {
        translate([0, 4.0, 2.4]) sphere(r = 1.2);
        translate([0, -4.0, 2.4]) sphere(r = 1.0);
      }
    }
    // Flatten bottom Z < 0
    translate([0, 0, -4.0]) cube([60, 40, 8.0], center = true);
    // Two 0.4 mm recessed eye sticker pockets (2.8 mm dia)
    for (sx = [-1.8, 1.8]) {
      translate([sx, 4.2, 2.6 - sticker_depth])
        cylinder(h = sticker_depth + 1.0, d = 2.8);
    }
  }
}

module prop_12_bats_mobile() {
  // 1. Spreader Bar (116 x 9 x 3.2 mm at Y = 18) with center top suspension eyelet & 3 lower bat eyelets
  translate([0, 18.0, 0])
  difference() {
    union() {
      chamfer_box(116.0, 8.0, 3.2, r = 2.0, ch_bot = 0.3, ch_top = 0.4);
      translate([0, 4.5, 0]) cylinder(h = 3.2, d = 8.4);
      for (bx = [-48.0, 0, 48.0])
        translate([bx, -4.2, 0]) cylinder(h = 3.2, d = 7.2);
    }
    translate([0, 5.2, -0.5]) cylinder(h = 5.0, d = 2.4);
    for (bx = [-48.0, 0, 48.0])
      translate([bx, -4.8, -0.5]) cylinder(h = 5.0, d = 2.2);
  }

  // 2. Three Gothic Bats (arranged side-by-side at Y = -8 for single-plate printing)
  for (bx = [-46.0, 0, 46.0]) {
    translate([bx, -8.0, 0])
      single_bat();
  }
}

color(col_ink) prop_12_bats_mobile();
