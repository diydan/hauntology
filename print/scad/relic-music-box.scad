// Hauntology Tabletop Print Kit — Relic r1: Victorian Music Box
// Colour: Leather (#6b4d33)
// Height: ~48 mm on 33 mm stepped token base
// Sticker details: Front keyhole/escutcheon pocket (16 x 7 mm) + inner lid label pocket (18 x 9 mm)
// Print orientation: Flat on pedestal base (Z = 0), zero supports required (all overhangs <= 45 deg).

include <_common.scad>

module relic_music_box() {
  // 1. Compact centre connector plug (z = 0..4.5, no wide circular base plate)
  relic_pedestal_base(h = 4.5, top_d = 18.0);

  // 2. Rounded central riser supporting the casket (z = 4.5..11.5)
  translate([0, 0, 4.5]) {
    cylinder(h = 3.0, d1 = 18.0, d2 = 20.5);
    translate([0, 0, 2.5])
      chamfer_box(24, 18, 4.5, r = 2.4, ch_bot = 0.6, ch_top = 0.6);
  }

  // 3. Ornate Victorian Music Box Casket (z = 11.5..29.5)
  translate([0, 0, 11.5]) {
    // 45-deg corbelled support flare from riser to casket bottom
    hull() {
      linear_extrude(height = 0.2) rrect2d(22, 16, 1.8);
      translate([0, 0, 2.2]) linear_extrude(height = 0.2) rrect2d(28, 20, 2.2);
    }

    // Main casket body with corner pilasters and recessed front keyhole sticker area
    translate([0, 0, 2.2])
    difference() {
      union() {
        chamfer_box(28, 20, 15.5, r = 2.0, ch_bot = 0.4, ch_top = 0.6);
        // Moulded base skirt & upper cornice band
        translate([0, 0, 1.2]) chamfer_box(29.4, 21.4, 2.0, r = 2.2, ch_bot = 0.6, ch_top = 0.6);
        translate([0, 0, 13.5]) chamfer_box(29.6, 21.6, 2.0, r = 2.2, ch_bot = 0.6, ch_top = 0.4);
        // Four decorative corner pilasters
        for (sx = [-1, 1], sy = [-1, 1]) {
          translate([sx * 13.2, sy * 9.2, 1.5])
            cylinder(h = 13.5, d = 3.2);
        }
        // Raised keyhole escutcheon frame on front (-Y)
        translate([0, -10.0, 7.8])
          rotate([90, 0, 0])
            chamfer_box(18.0, 9.0, 1.2, r = 1.4, ch_bot = 0.4, ch_top = 0.3);
      }

      // Recessed interior mechanical well
      translate([0, 0, 11.5])
        chamfer_box(23.6, 15.6, 6.0, r = 1.2, ch_bot = 0.6, ch_top = 0);

      // Front 0.4 mm sticker pocket for keyhole & brass filigree (16 x 7 mm)
      translate([0, -10.85, 7.8])
        rotate([90, 0, 0])
          linear_extrude(height = sticker_depth + 0.5)
            rrect2d(16.0, 7.0, r = 1.0);

      // Sculpted keyhole relief inside pocket center for tactile registration
      translate([0, -10.5, 8.2])
        rotate([90, 0, 0]) {
          cylinder(h = 0.8, d = 2.2);
          translate([0, -1.4, 0]) cube([1.2, 2.2, 0.8], center = true);
        }

      // Decorative side panel recesses
      for (sx = [-1, 1]) {
        translate([sx * 14.1, 0, 7.8])
          rotate([0, 90, 0])
            linear_extrude(height = 1.2, center = true)
              rrect2d(7.0, 11.0, r = 1.0);
      }
    }

    // 4. Interior Music Box Mechanism (Pinned Cylinder Drum + Tuned Steel Comb)
    translate([0, 0, 13.2]) {
      // Pinned brass cylinder drum (left-to-right)
      translate([-2.5, 0.5, 1.8])
        rotate([0, 90, 0]) {
          cylinder(h = 13.0, d = 5.4, center = true);
          // End caps
          for (sz = [-1, 1])
            translate([0, 0, sz * 6.8]) cylinder(h = 1.0, d = 6.4, center = true);
          // Tiny musical pins around drum
          for (a = [0:45:315], px = [-4.5, -1.5, 1.5, 4.5])
            rotate([0, 0, a + px * 12])
              translate([2.6, 0, px]) sphere(r = 0.55);
        }
      // Tuned comb plate in front of cylinder
      translate([-2.5, -5.2, 0.2]) {
        cube([13.0, 3.6, 2.2], center = true);
        for (tx = [-5.5 : 1.5 : 5.5])
          translate([tx, 2.2, 0.6])
            cube([0.9, 2.4, 1.0], center = true);
      }
      // Winding gear wheel on right side of well
      translate([7.8, 0.5, 1.4])
        cylinder(h = 2.2, d = 6.2);
    }

    // 5. Side Winding Key (print-safe 45-deg corbelled stem + pierced butterfly bow)
    translate([14.0, 0, 9.5]) {
      hull() {
        translate([0, 0, -2.5]) cube([0.4, 3.2, 2.0], center = true);
        translate([3.2, 0, 0]) rotate([0, 90, 0]) cylinder(h = 0.8, d = 3.6, center = true);
      }
      translate([3.6, 0, 0]) {
        rotate([0, 90, 0]) cylinder(h = 2.0, d = 3.2, center = true);
        // Key bow wings
        for (sz = [-1, 1]) {
          translate([1.2, 0, sz * 3.0])
            rotate([90, 0, 0])
              difference() {
                cylinder(h = 2.2, d = 5.6, center = true);
                cylinder(h = 3.0, d = 2.2, center = true);
              }
        }
      }
    }

    // 6. Open Hinged Lid atRear (tilted up at 68 deg from horizontal = 22 deg from vertical, 100% print-safe!)
    translate([0, 8.8, 17.2])
      rotate([68, 0, 0]) {
        translate([0, 9.5, 0])
        difference() {
          union() {
            chamfer_box(28.8, 19.6, 4.2, r = 2.0, ch_bot = 0.5, ch_top = 0.8);
            // Coffered outer lid dome
            translate([0, 0, 1.2])
              chamfer_box(24.0, 14.8, 4.2, r = 1.8, ch_bot = 0.4, ch_top = 1.2);
          }
          // Inner lid 0.4 mm sticker pocket (18 x 9 mm) facing viewer
          translate([0, 0, -0.1])
            linear_extrude(height = sticker_depth + 0.5)
              rrect2d(18.0, 9.0, r = 1.0);
        }
      }
  }
}

color(col_leather) relic_music_box();
