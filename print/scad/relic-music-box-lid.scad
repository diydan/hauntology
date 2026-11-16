// Hauntology Tabletop Print Kit — Relic r1: Victorian Music Box Lid (Ground-Up FDM Print Design)
// Colour: Antique Brass (#e0a43a / #d4a84b) — contrasts cleanly with Warm Wood `relic-music-box`
// Size: 32.4 W x 24.4 D x 8.2 H mm (25.4 W x 17.4 D x 3.2 H closed reveal above casket rim)
// Mates closed onto `relic-music-box.stl` at `translate([0, 0, 34.8]) rotate([180, 0, 0])`:
//   - Outer cornice skirt (32.4 x 24.4 mm) seats flush on the Z = 29.0 mm casket crown (top at Z = 34.8 mm)
//   - Self-centering 4-rib compliant snap collar (23.6 x 15.6 mm main + 4x 0.28 mm crush-detent ribs ->
//     0.12 mm/side kiss-fit at 4 low-friction points inside the 24.4 x 16.4 mm well) never binds across tolerances!
//   - Hollow vaulted brass dome clears all <= 26.1 mm drum/comb hardware by >= 5.5 mm when shut
//   - Symmetric in X and Y so it fits seamlessly either way; left/right thumb-lift finger coves at seam
// Sticker details: Recessed 0.4 mm inner lid song/score pocket (18.2 x 9.2 mm for 17.6 x 8.6 mm decal) facing UP
// Print orientation: Flat upside-down on its coffered crown at Z = 0 (>380 mm² contact, zero supports, <= 42 deg).

include <_common.scad>

module relic_music_box_lid() {
  difference() {
    union() {
      // 1. Flat Coffered Brass Crown on build plate (26.6 x 18.6 mm -> >380 mm² bed contact at Z = 0)
      chamfer_box(26.6, 18.6, 1.3, r = 2.8, ch_bot = 0.4, ch_top = 0);

      // 2. Stepped 42-deg Victorian Dome Flare outward to Cornice Rim (Z = 0.8 .. 5.8, <= 42 deg at corners!)
      hull() {
        translate([0, 0, 0.8]) linear_extrude(height = 0.2) rrect2d(26.6, 18.6, r = 2.8);
        translate([0, 0, 5.0]) linear_extrude(height = 0.8) rrect2d(32.4, 24.4, r = 3.4);
      }
      // Subtle Tim Burton gothic corner lugs along outer cornice corners (Z = 1.4 .. 5.8, clear of well!)
      for (sx = [-1, 1], sy = [-1, 1]) {
        hull() {
          translate([sx * 12.2, sy * 8.2, 1.4]) cylinder(h = 0.6, d = 2.4);
          translate([sx * 15.2, sy * 11.2, 5.0]) cylinder(h = 0.8, d = 3.0);
        }
      }

      // 3. Underside Locating Collar with 45-deg Lead-In & 4 Compliant Friction-Click Ribs (Z = 5.8 .. 8.2)
      //    Main collar is 23.6 x 15.6 mm (0.40 mm/side free clearance inside 24.4 x 16.4 well -> corners never jam!)
      translate([0, 0, 5.7])
        chamfer_box(23.6, 15.6, 2.5, r = 1.8, ch_bot = 0, ch_top = 0.7);

      //    Four 3.2 mm wide smooth vertical crush-detent ribs reaching 24.12 x 16.12 mm (0.14 mm/side kiss-fit)
      for (sx = [-1, 1]) {
        hull() {
          for (yy = [-1.2, 1.2]) {
            translate([sx * 11.78, yy, 5.8]) cylinder(h = 1.9, r = 0.28);
            translate([sx * 11.45, yy, 5.8]) cylinder(h = 1.9, r = 0.28);
            translate([sx * 11.62, yy, 8.0]) cylinder(h = 0.1, r = 0.08);
          }
        }
      }
      for (sy = [-1, 1]) {
        hull() {
          for (xx = [-1.2, 1.2]) {
            translate([xx, sy * 7.78, 5.8]) cylinder(h = 1.9, r = 0.28);
            translate([xx, sy * 7.45, 5.8]) cylinder(h = 1.9, r = 0.28);
            translate([xx, sy * 7.62, 8.0]) cylinder(h = 0.1, r = 0.08);
          }
        }
      }
    }

    // 4. Vaulted Interior Hollow (19.6 x 11.2 mm -> >= 2.0 mm perimeter collar wall, Z = 3.2 .. 8.4)
    translate([0, 0, 3.2])
      linear_extrude(height = 5.5)
        rrect2d(19.6, 11.2, r = 1.2);

    // 5. Upward-Facing 0.4 mm Recessed Lid Song-Score Sticker Pocket (18.2 x 9.2 mm at Z = 2.8 .. 3.2)
    //    Leaves a rock-solid 2.8 mm solid crown below and fits the printed 17.6 x 8.6 mm decal
    translate([0, 0, 3.2 - sticker_depth])
      linear_extrude(height = 0.9)
        rrect2d(18.2, 9.2, r = 1.0);

    // 6. Left & Right 45-deg Fingernail-Lift Grip Coves along the mating rim seam (Z = 5.1 .. 5.9)
    for (sx = [-1, 1]) {
      hull() {
        translate([sx * 16.3, 0, 5.85])
          cube([1.6, 12.0, 0.3], center = true);
        translate([sx * 15.6, 0, 5.25])
          cube([0.4, 9.6, 0.2], center = true);
      }
    }
  }
}

color(col_lantern) relic_music_box_lid();
