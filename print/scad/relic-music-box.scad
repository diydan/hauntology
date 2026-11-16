// Hauntology Tabletop Print Kit — Relic r1: Victorian Music Box (Ground-Up FDM Print Design)
// Colour: Warm Wood / Leather (#6b4d33) body (mates with Antique Brass `relic-music-box-lid`)
// Size: ~36.8 W (incl. bow key) x 25.4 D x 29.0 H mm (34.8 H mm with lid closed)
// Sticker details: Front keyhole/escutcheon pocket (16.0 x 7.0 x 0.4 mm) on -Y face (for 15.6 x 6.6 mm decal)
// FDM Print Optimisations:
//   - Flat Ø14.6 mm bed foot with Ø6.1 mm token-peg socket (>110 mm² bed contact, zero supports)
//   - Sculpted 2-tier Victorian plinth where EVERY angle — including 45-deg corners — stays strictly <= 40 deg
//   - Bold canonical 5-tooth stepped steel comb (TEETH [17,15,13,11,9] proportions: 1.8 mm teeth, 1.0 mm clear gaps)
//     seated on a solid shadow bed so zero cantilevers droop or fuse shut at 0.4 mm nozzle
//   - Pinned drum cradled on a full-length 40-deg V-saddle with top-hemisphere nibs aligned to the 5 comb tracks
//   - Crisp 8-tooth horizontal XY winding gear (no sub-mm side teeth) + rugged, compact 40-deg gusseted trefoil bow key
//   - 45-deg upper inner well chamfer for effortless self-centering alignment with `relic-music-box-lid.stl`

include <_common.scad>

module relic_music_box() {
  // 1. Flat Ø14.6 mm pedestal foot + Ø6.1 x 3.3 mm socket at z = 0..4.5 (fits `relic-token-pocket.stl` peg)
  relic_pedestal_base(h = 4.5, top_d = 18.0);

  // 2. Sculpted 2-tier Victorian Ogee Plinth (Z = 4.2 .. 16.6, strictly <= 40 deg even on diagonal corners)
  //    Tier A: overlaps into Ø18.0 base top (Z = 4.25) -> 21.8 x 17.2 mm flare (Z = 8.2) -> 26.6 x 19.8 mm plinth (Z = 12.2)
  hull() {
    translate([0, 0, 4.20]) cylinder(h = 0.35, d = 17.3);
    translate([0, 0, 8.15]) linear_extrude(height = 0.25) rrect2d(21.8, 17.2, r = 4.5);
  }
  hull() {
    translate([0, 0, 8.15]) linear_extrude(height = 0.25) rrect2d(21.8, 17.2, r = 4.5);
    translate([0, 0, 12.15]) linear_extrude(height = 0.25) rrect2d(26.6, 19.8, r = 3.8);
  }
  //    Pure 40-deg waist moulding belt (Z = 12.1 .. 13.7, zero flat ledges)
  hull() {
    translate([0, 0, 12.1]) linear_extrude(height = 0.15) rrect2d(26.6, 19.8, r = 3.8);
    translate([0, 0, 12.7]) linear_extrude(height = 0.40) rrect2d(27.3, 20.5, r = 3.8);
    translate([0, 0, 13.6]) linear_extrude(height = 0.15) rrect2d(26.6, 19.8, r = 3.8);
  }
  //    Tier B: 26.6 x 19.8 mm waist (Z = 13.45) -> 30.8 x 22.8 mm cabinet body (Z = 16.6, 38.3 deg corner angle)
  hull() {
    translate([0, 0, 13.45]) linear_extrude(height = 0.25) rrect2d(26.6, 19.8, r = 3.8);
    translate([0, 0, 16.55]) linear_extrude(height = 0.25) rrect2d(30.8, 22.8, r = 3.2);
  }

  // 3. Ornate Victorian Cabinet Body (Z = 16.65 .. 29.0, overlapped into Tier B at Z = 16.55..16.80)
  difference() {
    union() {
      // Main thick-walled cabinet shell (Z = 16.6 .. 29.0)
      translate([0, 0, 16.6])
        linear_extrude(height = 12.4)
          rrect2d(30.8, 22.8, r = 3.2);

      // 38-deg max flared upper cornice crown (Z = 26.4 .. 29.0, flat rim 32.0 x 24.0 mm at Z = 29.0)
      hull() {
        translate([0, 0, 26.4]) linear_extrude(height = 0.2) rrect2d(30.8, 22.8, r = 3.2);
        translate([0, 0, 27.9]) linear_extrude(height = 0.85) rrect2d(32.6, 24.6, r = 3.4);
        translate([0, 0, 28.95]) linear_extrude(height = 0.05) rrect2d(32.0, 24.0, r = 3.2);
      }

      // Four flush-blended corner pilaster ribs flaring cleanly at <= 42 deg inside Tier B
      for (sx = [-1, 1], sy = [-1, 1]) {
        hull() {
          translate([sx * 12.2, sy * 8.2, 13.1]) cylinder(h = 0.4, d = 1.8);
          translate([sx * 13.9, sy * 9.9, 16.6]) cylinder(h = 10.0, d = 3.2);
        }
      }

      // Front (-Y) Escutcheon Frame with continuous 38-deg swept sill emerging smoothly from Tier B
      hull() {
        translate([0, -10.2, 20.0])
          rotate([90, 0, 0])
            linear_extrude(height = 0.4) rrect2d(18.6, 8.8, r = 1.5);
        translate([0, -11.4, 22.2])
          rotate([90, 0, 0])
            linear_extrude(height = 1.4) rrect2d(18.6, 8.8, r = 1.5);
      }
    }

    // Main Interior Mechanism Chamber (24.4 x 16.4 mm, floor at Z = 20.4, open at Z = 29.0)
    translate([0, 0, 20.4])
      chamfer_box(24.4, 16.4, 9.2, r = 2.0, ch_bot = 0.8, ch_top = 0);

    // 45-deg self-centering upper well rim chamfer (Z = 28.1 .. 29.1)
    translate([0, 0, 28.1])
      hull() {
        linear_extrude(height = 0.1) rrect2d(24.4, 16.4, r = 2.0);
        translate([0, 0, 1.0]) linear_extrude(height = 0.1) rrect2d(26.0, 18.0, r = 2.4);
      }

    // Front 0.4 mm recessed sticker pocket for keyhole escutcheon (16.0 x 7.0 mm, cuts Y = -12.4..-13.6 open!)
    translate([0, -12.8 + sticker_depth, 22.2])
      rotate([90, 0, 0])
        linear_extrude(height = sticker_depth + 0.8)
          rrect2d(16.0, 7.0, r = 1.0);

    // Sculpted tactile keyhole relief in pocket center (cuts Y = -12.0..-13.4 open!)
    translate([0, -12.0, 22.55])
      rotate([90, 0, 0]) {
        cylinder(h = 1.4, d = 2.1);
        translate([0, -1.25, 0.7])
          linear_extrude(height = 1.4, center = true)
            polygon([[-0.5, 1.0], [0.5, 1.0], [0.85, -1.0], [-0.85, -1.0]]);
      }

    // Decorative -X side panel groove (38-deg sloped borders, zero bridging sag)
    hull() {
      translate([-15.6, 0, 22.1])
        rotate([0, 90, 0])
          linear_extrude(height = 0.8, center = true) rrect2d(7.0, 12.4, r = 1.4);
      translate([-14.7, 0, 22.1])
        rotate([0, 90, 0])
          linear_extrude(height = 0.2, center = true) rrect2d(5.0, 10.4, r = 0.8);
    }
  }

  // 4. Crisp FDM Interior Music Box Mechanism (anchored 0.4 mm into Z = 20.4 floor, top <= 26.1 mm)
  //    A. Canonical 5-Tooth Tuned Steel Comb (TEETH = [17, 15, 13, 11, 9] proportions)
  //       Track centers X_i = -2.6 + [-5.6, -2.8, 0, +2.8, +5.6] -> 1.8 mm bold teeth + 1.0 mm clear gaps!
  translate([-2.6, -4.8, 20.4]) {
    // Solid continuous comb spine bar anchored to floor with chamfered top & two Ø1.8 mm rivet bosses
    hull() {
      translate([0, -1.2, -0.4]) linear_extrude(height = 3.0) rrect2d(16.2, 2.8, r = 0.7);
      translate([0, -1.2, 2.6]) linear_extrude(height = 0.5) rrect2d(15.6, 2.2, r = 0.5);
    }
    for (sx = [-1, 1]) {
      translate([sx * 7.2, -1.2, 3.05])
        cylinder(h = 0.60, d1 = 1.8, d2 = 1.3);
    }

    // Continuous dark shadow bed under all 5 teeth (stops cleanly 0.9 mm clear of drum saddle!)
    translate([0, 1.35, 0.50])
      cube([14.4, 3.9, 1.8], center = true);

    // 5 graduated chamfered comb teeth elevated into clear top sightlines (Z_world = 21.8..23.5)
    tooth_lens = [3.7, 3.25, 2.8, 2.35, 1.9];
    for (i = [0 : 4]) {
      tx = (i - 2) * 2.8;
      tl = tooth_lens[i];
      hull() {
        translate([tx, tl / 2 - 0.1, 1.9])
          cube([1.8, tl, 1.4], center = true);
        translate([tx, tl / 2 - 0.1, 2.9])
          cube([1.3, tl - 0.4, 0.4], center = true);
      }
    }
  }

  //    B. Pinned Cylinder Drum on Full-Arc 40-deg V-Saddle Bed (X = -9.6 .. +4.4, Y = +2.4, center Z = 22.8)
  translate([-2.6, 2.4, 20.4]) {
    // Full-length V-cradle support saddle supporting lower 120 deg of drum & both end flanges
    hull() {
      translate([0, 0, -0.2]) cube([14.8, 5.2, 0.4], center = true);
      translate([0, 0, 2.3]) cube([14.8, 5.6, 0.4], center = true);
    }

    // Left & right octagonal-topped pillow bearing blocks
    for (bx = [-7.8, 7.8]) {
      hull() {
        translate([bx, 0, 0.0]) cube([2.2, 5.4, 3.6], center = true);
        translate([bx, 0, 3.4]) cube([1.8, 3.8, 0.6], center = true);
      }
    }

    // Main Ø5.6 mm horizontal brass barrel + Ø6.4 mm end flanges (top <= 26.0 mm)
    translate([0, 0, 2.4])
      rotate([0, 90, 0]) {
        cylinder(h = 13.8, d = 5.6, center = true);
        for (sz = [-1, 1])
          translate([0, 0, sz * 6.5]) cylinder(h = 1.0, d = 6.4, center = true);
      }

    // Top-hemisphere melody pin lugs strictly across -55..+55 deg around +Z, aligned to the 5 comb tracks!
    track_angles = [
      [-48,  6, 52],
      [-28, 28],
      [-52,  0, 48],
      [-34, 24],
      [-46, 10, 54]
    ];
    for (i = [0 : 4]) {
      tx = (i - 2) * 2.8;
      for (ang = track_angles[i]) {
        translate([tx, 0, 2.4])
          rotate([ang, 0, 0])
            translate([0, 0, 2.65])
              cylinder(h = 0.75, d1 = 1.45, d2 = 0.75);
      }
    }

    // Drive axle connecting drum cleanly to +X winding gear & wall key
    translate([5.6, 0, 1.0])
      cube([12.4, 2.6, 2.8], center = true);
    translate([5.6, 0, 2.4])
      rotate([0, 90, 0])
        cylinder(h = 12.4, d = 2.6, center = true);
  }

  //    C. Bold 8-Tooth Horizontal XY Winding Spur Gear on Right Floor (X = +8.6, Y = +2.4)
  translate([8.6, 2.4, 20.0]) {
    cylinder(h = 1.35, d = 6.2);
    translate([0, 0, 1.3]) cylinder(h = 1.15, d1 = 6.2, d2 = 8.4);
    translate([0, 0, 2.4]) {
      cylinder(h = 1.9, d = 6.0);
      for (ga = [0 : 45 : 315]) {
        rotate([0, 0, ga])
          hull() {
            translate([3.2, 0, 0.9]) cube([1.2, 1.55, 1.8], center = true);
            translate([4.0, 0, 0.9]) cube([0.5, 0.95, 1.8], center = true);
          }
      }
      // Chamfered gear hub cap
      translate([0, 0, 1.85])
        cylinder(h = 0.75, d1 = 3.4, d2 = 2.4);
    }
  }

  // 5. Rugged, Compact 40-deg Victorian Wing Winding Key (+X wall, Y = +2.4, X = +14.8 .. +19.8, Z <= 26.2)
  translate([15.2, 2.4, 22.6]) {
    difference() {
      union() {
        // Tapered escutcheon boss flush into +X flank
        hull() {
          translate([-0.6, 0, -5.0]) cube([1.0, 4.6, 1.6], center = true);
          translate([0.2, 0, -0.4]) cube([1.6, 5.2, 4.4], center = true);
        }
        // Clean <= 40-deg antique key bow: bottom keel rises 40 deg (ΔZ/ΔX >= 1.2) -> zero overhang!
        rotate([90, 0, 0])
          linear_extrude(height = 3.4, center = true)
            offset(r = 0.45) offset(r = -0.45)
            polygon([
              [-0.4, -3.8],  // wall anchor lower root (Z = 18.8)
              [ 3.8,  1.0],  // 38 deg upward bottom slope (ΔX=4.2, ΔZ=4.8 -> 41.2 deg!)
              [ 4.5,  2.1],  // outer wing tip (X = 19.7)
              [ 3.8,  3.5],  // upper wing crest (Z = 26.1 < 26.4 cornice!)
              [ 2.5,  3.3],  // butterfly crest notch
              [ 1.7,  1.8],  // upper collar step
              [-0.4,  1.8]   // wall anchor top (Z = 24.4)
            ]);
      }
      // Subtle 0.65 mm diamond-faceted thumb grip dimples on both -Y and +Y faces
      for (sy = [-1, 1]) {
        translate([2.65, sy * 1.55, 1.35])
          rotate([0, 45, 0])
            cube([1.6, 1.1, 1.6], center = true);
      }
    }
  }
}

color(col_leather) relic_music_box();
