// Hauntology Tabletop Print Kit — Relic r3: Heirloom Oval Locket
// Colour: Lantern (#e0a43a, amber/matte gold)
// Height: ~50 mm on 33 mm stepped token base
// Sticker details: Front oval cameo/engraving sticker pocket (16 x 22 mm)
// Print orientation: Flat on pedestal base (Z = 0), zero supports.

include <_common.scad>

module relic_locket() {
  // 1. Stepped circular token pedestal base (z = 0..6.5)
  relic_pedestal_base(h = 6.5);

  // 2. Scrolled Victorian ribbon display cradle (z = 6.5..14.0)
  translate([0, 0, 6.5]) {
    cylinder(h = 2.5, d1 = 26, d2 = 20);
    // Side scroll arms cradling the locket body
    for (sx = [-1, 1]) {
      hull() {
        translate([sx * 5.0, 0, 1.8]) sphere(r = 3.0);
        translate([sx * 11.2, 0, 8.5]) sphere(r = 2.6);
      }
    }
  }

  // 3. Upright Heirloom Oval Locket Body (z = 11.0..43.0, center at z = 27.0)
  translate([0, 0, 27.0])
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

  // 4. Ornate Crown Bail & Top Suspension Ring (z = 42.0..50.5)
  translate([0, 0, 42.5]) {
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
