// Hauntology Tabletop Print Kit — Relic r3: Heirloom Oval Locket
// Colour: Lantern (#e0a43a, amber/matte gold)
// Height: ~50 mm on 33 mm stepped token base
// Sticker details: Front oval cameo/engraving sticker pocket (16 x 22 mm)
// Print orientation: Flat on pedestal base (Z = 0), zero supports.

include <_common.scad>

module relic_locket() {
  // 1. Flat 14.6 mm foot with a 6 mm centre socket (z = 0..4.5); the Relic Token has the matching peg
  relic_pedestal_base(h = 4.5, top_d = 18.0);

  // 2. A short 45-degree stem from the foot up into the locket (no arms, cradle or base plate)
  translate([0, 0, 4.5])
    cylinder(h = 5.0, d1 = 18.0, d2 = 8.0);

  // 3. Upright Heirloom Oval Locket Body (z = 9.0..41.0, center at z = 25.0)
  translate([0, 0, 25.0])
  difference() {
    union() {
      // Main cushion-domed oval locket case (26 W x 32 H x 9.6 D)
      hull() {
        rotate([90, 0, 0])
          scale([13.2, 16.2, 1])
            cylinder(h = 5.6, r = 1.0, center = true);
        rotate([90, 0, 0])
          scale([10.8, 13.8, 1])
            cylinder(h = 9.4, r = 1.0, center = true);
      }

      // 16-bead pearl bezel ring around the front face
      for (i = [0 : 15]) {
        ang = i * 22.5;
        bx = 10.6 * cos(ang);
        bz = 13.4 * sin(ang);
        translate([bx, -4.2, bz])
          sphere(r = 1.15);
      }

      // Left barrel hinge knuckles & right clasp tab (45-deg corbelled)
      for (sz = [-3.5, 0, 3.5]) {
        hull() {
          translate([-12.8, 0, sz]) cylinder(h = 2.0, d = 2.8, center = true);
          translate([-10.5, 0, sz - 1.2]) cylinder(h = 2.0, d = 2.0, center = true);
        }
      }
      hull() {
        translate([12.8, 0, 0]) cylinder(h = 4.2, d = 3.0, center = true);
        translate([10.5, 0, -2.0]) cylinder(h = 4.0, d = 2.0, center = true);
      }

      // Front raised oval bezel lip framing the sticker pocket
      translate([0, -4.4, 0])
        rotate([90, 0, 0])
          scale([8.8, 11.8, 1])
            cylinder(h = 1.2, r = 1.0, center = true);
    }

    // Center parting seam groove around the locket edge
    difference() {
      cube([32, 0.9, 38], center = true);
      rotate([90, 0, 0])
        scale([12.4, 15.4, 1])
          cylinder(h = 4.0, r = 1.0, center = true);
    }

    // Front 0.4 mm recessed oval sticker pocket (16 x 22 mm)
    translate([0, -4.65, 0])
      rotate([90, 0, 0])
        linear_extrude(height = sticker_depth + 0.6)
          scale([8.0, 11.0])
            circle(r = 1.0);
  }

  // 4. Ornate Crown Bail & Top Suspension Ring (z = 40.0..48.5)
  translate([0, 0, 40.5]) {
    cylinder(h = 3.2, d1 = 8.4, d2 = 5.4);
    translate([0, 0, 4.2])
      rotate([90, 0, 0])
        difference() {
          cylinder(h = 3.2, d = 8.2, center = true);
          cylinder(h = 4.0, d = 3.8, center = true);
        }
  }
}

color(col_lantern) relic_locket();
