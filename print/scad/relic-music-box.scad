// Hauntology Tabletop Print Kit — Relic r1: Haunted Coffin-Casket Music Box (From-Scratch FDM Design)
// Colour: Crimson (#d43838) body — pairs cleanly with contrasting Antique Brass `relic-music-box-lid`
// Size: ~44.0 W (incl. +X skeleton key) x 26.8 D x 27.9 H mm (34.4 H mm when closed with lid)
// Sticker details: Front keyhole escutcheon pocket (16.0 x 7.0 x 0.4 mm) on -Y face (for 15.6 x 6.6 mm decal)
// From-Scratch FDM & Tim Burton Design Choices:
//   - Tapered hexagonal Victorian coffin planform (22.4 mm prow -> 36.8 mm shoulders -> 26.0 mm apse)
//     for a bold, unmistakable silhouette distinct from boxy containers
//   - Flat Ø14.6 mm bed foot with Ø6.1 x 3.3 mm token-peg socket (>110 mm² bed contact, zero supports)
//   - 41-deg faceted gothic buttress pedestal flaring seamlessly up into 6 corner coffin-rib pilasters
//   - Continuous gothic front apron corbel rising into pointed arch keyhole plaque (no bottom shelf!)
//   - Sculpted 38-deg Tim Burton bat-wing skeleton crank key with open 45-deg diamond aperture on +X shoulder
//   - Crisp 0.4 mm-nozzle internal mechanism (<= 24.7 mm top, >= 0.5 mm clear of closed lid collar >= 25.2 mm):
//     5-chime stepped organ comb on flush bed, octagonal pinned drum on 45-deg saddle & 8-tooth bevel gear

include <_common.scad>

module coffin_box_2d(scale_xy = 1.0, extra = 0, r = 1.4) {
  pts = [
    [-11.2 * scale_xy, -12.5 * scale_xy],  // front-left (-Y) prow
    [ 11.2 * scale_xy, -12.5 * scale_xy],  // front-right (-Y) prow
    [ 18.4 * scale_xy,   1.5 * scale_xy],  // right gothic coffin shoulder
    [ 13.0 * scale_xy,  12.5 * scale_xy],  // back-right crypt vertex
    [-13.0 * scale_xy,  12.5 * scale_xy],  // back-left crypt vertex
    [-18.4 * scale_xy,   1.5 * scale_xy]   // left gothic coffin shoulder
  ];
  offset(delta = extra, chamfer = true)
    offset(r = r) offset(r = -r)
      polygon(pts);
}

module relic_music_box() {
  // 1. Flat Ø14.6 mm pedestal foot + Ø6.1 x 3.3 mm socket at z = 0..4.5 (fits `relic-token-pocket.stl`)
  relic_pedestal_base(h = 4.5, top_d = 18.0);

  // 2. Faceted 41-deg Coffin-Ribbed Pedestal Transition (Z = 4.2 .. 15.2, zero steep belly overhangs)
  //    Lower tier (Z = 4.2 .. 10.6): Ø17.8 mm base -> 0.78x coffin waist
  hull() {
    translate([0, 0, 4.20]) cylinder(h = 0.35, d = 17.8);
    translate([0, 0, 10.45]) linear_extrude(height = 0.30) coffin_box_2d(scale_xy = 0.78);
  }
  //    Crooked gothic waist girdle ring (<= 40-deg sloped bevel, Z = 10.4 .. 11.9)
  hull() {
    translate([0, 0, 10.40]) linear_extrude(height = 0.15) coffin_box_2d(scale_xy = 0.78);
    translate([0, 0, 11.05]) linear_extrude(height = 0.35) coffin_box_2d(scale_xy = 0.83);
    translate([0, 0, 11.80]) linear_extrude(height = 0.15) coffin_box_2d(scale_xy = 0.78);
  }
  //    Upper tier (Z = 11.65 .. 15.30): 0.78x waist -> full 1.00x coffin body (max slope ~38 deg)
  hull() {
    translate([0, 0, 11.65]) linear_extrude(height = 0.25) coffin_box_2d(scale_xy = 0.78);
    translate([0, 0, 15.20]) linear_extrude(height = 0.30) coffin_box_2d(scale_xy = 1.00);
  }

  // 3. Haunted Coffin Casket Body (Z = 15.2 .. 27.9) with 6 Gothic Buttresses & Pointed Arch Keyhole Shield
  //    Top rim at Z = 27.90 leaves a 0.10 mm clean vertical shadow seat inside lid outer eaves (Z = 27.0..28.0)
  difference() {
    union() {
      // Main thick hexagonal coffin body (Z = 15.2 .. 27.9)
      translate([0, 0, 15.2])
        linear_extrude(height = 12.7)
          coffin_box_2d(scale_xy = 1.00);

      // Stepped upper coffin cornice rim (Z = 25.4 .. 27.9, <= 38-deg flare outward +0.30 mm)
      // Stays cleanly inside overhanging lid skirt inner cavity (extra = +0.75 -> 0.45 mm/side clearance)
      hull() {
        translate([0, 0, 25.4]) linear_extrude(height = 0.2) coffin_box_2d(scale_xy = 1.00);
        translate([0, 0, 26.8]) linear_extrude(height = 0.7) coffin_box_2d(scale_xy = 1.00, extra = 0.30);
        translate([0, 0, 27.8]) linear_extrude(height = 0.1) coffin_box_2d(scale_xy = 1.00, extra = 0.28);
      }

      // 6 tapered Tim Burton gothic corner buttress ribs rising from pedestal waist up to Z = 26.5
      // Capitals taper cleanly back into Z = 26.6 so lid overhanging brass eaves (Z >= 27.0) clear cleanly
      corners = [
        [-10.6, -11.9], [ 10.6, -11.9],
        [ 17.8,   1.5], [ 12.4,  11.9],
        [-12.4,  11.9], [-17.8,   1.5]
      ];
      for (i = [0 : len(corners) - 1]) {
        pt = corners[i];
        skew = (i % 2 == 0) ? 0.35 : -0.35;
        hull() {
          translate([pt[0] * 0.78, pt[1] * 0.78, 10.4]) cylinder(h = 0.5, d = 2.0);
          translate([pt[0], pt[1], 15.2]) cylinder(h = 1.2, d = 2.6);
          translate([pt[0] + skew * 0.20, pt[1], 25.2]) cylinder(h = 0.9, d = 3.0);
          translate([pt[0] * 0.96, pt[1] * 0.96, 26.6]) cylinder(h = 0.2, d = 1.6);
        }
      }

      // Front (-Y) Continuous Gothic Shield Corbel + Pointed Arch Keyhole Escutcheon
      // Flows smoothly up from the waist girdle (Z = 10.6) -> zero harsh horizontal shelf underneath!
      // Terminates cleanly at Z = 26.6 (underneath lid brass eaves Z >= 27.0)
      hull() {
        translate([0, -9.9, 10.6])
          rotate([90, 0, 0])
            linear_extrude(height = 0.5)
              rrect2d(10.8, 0.8, r = 0.3);
        translate([0, -12.6, 16.6])
          rotate([90, 0, 0])
            linear_extrude(height = 1.0)
              polygon([
                [-9.4, 0.0], [9.4, 0.0], [9.1, 7.6], [0.0, 9.9], [-9.1, 7.6]
              ]);
      }

      // Twin gothic rivet corner studs flanking the front keyhole decal bezel (45-deg self-supporting domes)
      for (sx = [-1, 1], sz = [17.4, 24.0]) {
        translate([sx * 8.6, -13.5, sz])
          rotate([90, 0, 0])
            cylinder(h = 0.5, d1 = 1.2, d2 = 0.4, $fn = 8);
      }
    }

    // Main Coffin Mechanism Pit (offset -2.5 mm inward -> 2.5+ mm thick outer walls, floor at Z = 19.6)
    translate([0, 0, 19.6])
      linear_extrude(height = 8.6)
        coffin_box_2d(scale_xy = 1.00, extra = -2.5, r = 1.0);

    // 45-deg self-centering upper well entry chamfer (Z = 27.0 .. 28.0)
    translate([0, 0, 27.0])
      hull() {
        linear_extrude(height = 0.1) coffin_box_2d(scale_xy = 1.00, extra = -2.5, r = 1.0);
        translate([0, 0, 1.0]) linear_extrude(height = 0.1) coffin_box_2d(scale_xy = 1.00, extra = -1.6, r = 1.1);
      }

    // Front 0.4 mm clean flat recessed keyhole sticker pocket (16.0 x 7.0 mm for 15.6 x 6.6 mm decal on -Y)
    translate([0, -13.6 + sticker_depth, 20.8])
      rotate([90, 0, 0])
        linear_extrude(height = sticker_depth + 1.2)
          rrect2d(16.0, 7.0, r = 0.9);

    // Subtle gothic apex trifoil notch centered above the sticker pocket (Z = 25.1, stays print-safe)
    translate([0, -13.3, 25.1])
      rotate([0, 45, 0])
        cube([1.0, 0.9, 1.0], center = true);

    // Crooked gothic V-flute plank grooves carved lightly across the rear apse wall (+Y = +12.5)
    for (gx = [-6.5, -1.5, 4.0]) {
      translate([gx, 12.6, 20.6])
        rotate([0, gx > 0 ? 5 : -6, 45])
          cube([0.9, 0.9, 9.6], center = true);
    }

    // Diagonal gothic groove on left coffin cheek wall (-X)
    translate([-15.3, -5.2, 20.8])
      rotate([0, 0, atan2(14.0, 7.2)])
        rotate([45, 0, 0])
          cube([0.9, 0.9, 7.6], center = true);
  }

  // 4. Bold 3D-Print-First Interior Organ & Clockwork Mechanism (Z = 19.4 .. 24.7 mm < 25.2 lid collar bottom!)
  //    A. 5-Chime Stepped Organ Comb on Solid Flush Bed (centered X = -2.8, Y = -4.2)
  translate([-2.8, -4.2, 19.4]) {
    // Gothic comb spine plate anchored into floor with twin oversized rivet domes
    hull() {
      translate([0, -1.5, 0]) linear_extrude(height = 2.6) rrect2d(17.4, 3.0, r = 0.7);
      translate([0, -1.5, 2.5]) linear_extrude(height = 0.5) rrect2d(16.6, 2.3, r = 0.5);
    }
    for (sx = [-1, 1]) {
      translate([sx * 7.2, -1.5, 2.95])
        cylinder(h = 0.65, d1 = 2.0, d2 = 1.3);
    }
    // Continuous solid flush under-bed beneath comb chimes (zero cantilever overhang!)
    translate([0, 1.4, 0.9])
      cube([15.6, 4.0, 1.8], center = true);

    // 5 bold 2.0 mm tapered organ chimes separated by clean 1.1 mm slots (top at Z_world = 22.8)
    chime_lens = [4.0, 3.5, 3.0, 2.5, 2.0];
    for (i = [0 : 4]) {
      tx = (i - 2) * 3.1;
      tl = chime_lens[i];
      hull() {
        translate([tx, tl / 2 - 0.1, 2.2]) cube([2.0, tl, 1.2], center = true);
        translate([tx, tl / 2 - 0.1, 3.2]) cube([1.4, tl - 0.4, 0.4], center = true);
      }
    }
  }

  //    B. Octagonal Faceted Melody Drum & Crown Gear (Y = +2.8, top Z_world <= 24.7 mm)
  translate([-2.8, 2.8, 19.4]) {
    // Full 45-deg V-cradle support bed under the barrel (zero horizontal overhang)
    hull() {
      translate([0, 0, 0.3]) cube([14.4, 5.4, 0.6], center = true);
      translate([0, 0, 2.4]) cube([14.4, 5.8, 0.4], center = true);
    }
    // Twin coffin pillow bearing blocks
    for (bx = [-7.6, 7.6]) {
      hull() {
        translate([bx, 0, 1.6]) cube([2.2, 5.6, 3.2], center = true);
        translate([bx, 0, 3.6]) cube([1.6, 4.0, 0.6], center = true);
      }
    }
    // 8-sided faceted barrel cylinder (center Z_world = 22.0, radius 2.5 -> top = 24.5 mm)
    translate([0, 0, 2.6])
      rotate([0, 90, 0]) {
        rotate([0, 0, 22.5]) cylinder(h = 13.8, d = 5.0, center = true, $fn = 8);
        for (sz = [-1, 1])
          translate([0, 0, sz * 6.5]) cylinder(h = 1.0, d = 5.8, center = true, $fn = 8);
      }
    // Crisp 45-deg pyramidal melody teeth along top hemisphere (top Z_world <= 24.7 mm)
    pin_angles = [
      [-45, 5, 48],
      [-26, 26],
      [-50, 0, 44],
      [-32, 22],
      [-42, 12, 50]
    ];
    for (i = [0 : 4]) {
      tx = (i - 2) * 3.1;
      for (ang = pin_angles[i]) {
        translate([tx, 0, 2.6])
          rotate([ang, 0, 0])
            translate([0, 0, 2.2])
              cylinder(h = 0.55, d1 = 1.35, d2 = 0.45, $fn = 4);
      }
    }
    // Drive axle connecting into the right crown gear
    translate([5.6, 0, 1.4]) cube([11.8, 2.6, 2.8], center = true);
  }

  //    C. Chunky 8-Tooth Bevel-Crowned Horizontal XY Drive Gear (X = +8.8, Y = +2.8, Z_world = 22.0..24.6)
  //       Stepped higher & bevel-chamfered on top teeth so every tooth catches top-down light cleanly
  translate([8.8, 2.8, 19.4]) {
    cylinder(h = 1.4, d = 5.8);
    translate([0, 0, 1.35]) cylinder(h = 1.1, d1 = 5.8, d2 = 8.0);
    translate([0, 0, 2.4]) {
      cylinder(h = 1.7, d = 5.6);
      for (ga = [0 : 45 : 315]) {
        rotate([0, 0, ga])
          hull() {
            translate([2.9, 0, 0.75]) cube([1.4, 1.6, 1.5], center = true);
            translate([3.85, 0, 0.75]) cube([0.6, 1.0, 1.5], center = true);
            translate([3.2, 0, 1.85]) cube([1.1, 0.7, 0.25], center = true);
          }
      }
      translate([0, 0, 1.65]) cylinder(h = 0.9, d1 = 3.4, d2 = 1.9);
    }
  }

  // 5. Sculpted Tim Burton Skeleton / Bat-Wing Winding Key (+X Shoulder, Y = +1.5, Z <= 26.5)
  //    Stays strictly below Z = 26.7 (or well past X = +20.4) so closed lid brass eaves (Z >= 27.0) never hit!
  translate([17.6, 1.5, 15.2]) {
    // Stepped rosette escutcheon collar anchored down at 40 deg into right coffin shoulder
    hull() {
      translate([-0.6, 0, 0.4]) cube([1.4, 4.4, 1.6], center = true);
      translate([ 0.8, 0, 4.4]) cylinder(h = 1.8, d = 4.6, $fn = 8);
    }
    translate([1.4, 0, 5.2]) rotate([0, 90, 0]) cylinder(h = 1.6, d = 3.2, $fn = 8);

    // Tapered Winding Stem + Twin-Cusp Gothic Skeleton Key Bow (45-deg open diamond center aperture!)
    difference() {
      union() {
        // Stem rising outward at 38 deg to bow center (X_local = 4.4, Z_local = 7.4 -> Z_world = 22.6)
        hull() {
          translate([0.2, 0, 3.6]) rotate([0, 52, 0]) cylinder(h = 1.6, d = 2.6, $fn = 8);
          translate([3.8, 0, 6.8]) rotate([0, 52, 0]) cylinder(h = 1.2, d = 2.8, $fn = 8);
        }
        // Symmetric beveled gothic diamond/bat-wing key bow (Z_local 4.0 .. 11.2 -> Z_world <= 26.4!)
        rotate([90, 0, 0])
          linear_extrude(height = 2.6, center = true)
            offset(r = 0.35) offset(r = -0.35)
              polygon([
                [ 2.0,  7.4],  // inner neck
                [ 4.2, 11.2],  // upper key horn (Z_world = 26.4 < 26.7!)
                [ 5.6,  9.5],  // upper wing cusp
                [ 8.2,  8.6],  // outer point (X_world = +25.8 -> clear!)
                [ 6.0,  6.2],  // lower wing cusp
                [ 5.0,  3.8],  // lower spur (40-deg upward slope from X=1.0,Z=0.4!)
                [ 2.6,  5.0]   // lower neck
              ]);
      }
      // Clean self-supporting 45-deg diamond aperture cut right through the bow center!
      translate([5.1, 0, 7.6])
        rotate([0, 45, 0])
          cube([2.3, 4.0, 2.3], center = true);
    }
  }
}

color(col_alarm) relic_music_box();
