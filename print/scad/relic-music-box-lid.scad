// Hauntology Tabletop Print Kit — Relic r1: Haunted Coffin-Casket Lid (From-Scratch FDM Design)
// Colour: Antique Brass (#d4a84b) — contrasts the Dark Iron `relic-music-box` casket body
// Size: ~41.2 W x 28.4 D x 10.6 H mm (outer eaves overlap rim to Z_world = 26.8 mm; peak at Z_world = 34.6 mm)
// Mates closed onto `relic-music-box.stl` at `translate([0, 0, 34.6]) rotate([180, 0, 0])` (0.2 mm higher than the first design, for clearance):
//   - Y-mirrored hexagonal gothic coffin mansard roof so all asymmetric prow/shoulder/apse angles match 1:1
//   - Overhanging eaves drip skirt (Z_lid = 6.4 .. 7.4 -> Z_world = 27.2 .. 28.2) with +0.45 mm/side
//     radial clearance outside body cornice (+0.30 vs +0.75) + 6 pointed gargoyle corner eaves to Z_world = 26.7
//   - Inner shelf (Z_lid = 6.4 -> Z_world = 28.2) leaves a 0.30 mm gap over Z_body = 27.9 (it was 0.10, which fuses on a real printer)
//   - Self-centering 45-deg chamfered inner coffin plug collar (0.45 mm/side free clearance +
//     4 normal-aligned guide ribs at 0.25 mm clearance: a printer is good for about +-0.1 mm, so a 0.10 mm fit welds shut)
//   - Recessed 0.45 mm 45-deg V-carved coffin frame & diamond motif in top crown (prints face-down support-free)
//   - Upward-facing 0.4 mm recessed inner lid song-score pocket (18.2 x 9.2 mm for 17.6 x 8.6 mm decal)
// Print orientation: Flat upside-down on its gothic coffin roof crown at Z = 0 (>260 mm² contact, zero supports).

include <_common.scad>

// Y-mirrored (`y -> -y`) relative to `coffin_box_2d` so `rotate([180, 0, 0])` mates every corner 1:1!
module coffin_lid_2d(scale_xy = 1.0, extra = 0, r = 1.4) {
  pts = [
    [-13.0 * scale_xy, -12.5 * scale_xy],  // lands at +12.5 (back-left crypt vertex)
    [ 13.0 * scale_xy, -12.5 * scale_xy],  // lands at +12.5 (back-right crypt vertex)
    [ 18.4 * scale_xy,  -1.5 * scale_xy],  // lands at +1.5 (right gothic coffin shoulder)
    [ 11.2 * scale_xy,  12.5 * scale_xy],  // lands at -12.5 (front-right prow)
    [-11.2 * scale_xy,  12.5 * scale_xy],  // lands at -12.5 (front-left prow)
    [-18.4 * scale_xy,  -1.5 * scale_xy]   // lands at +1.5 (left gothic coffin shoulder)
  ];
  offset(delta = extra, chamfer = true)
    offset(r = r) offset(r = -r)
      polygon(pts);
}

module relic_music_box_lid() {
  difference() {
    union() {
      // 1. Flat Coffin Crown Slab on build plate at Z = 0..1.1 (>320 mm² flat bed contact, zero supports)
      translate([0, 0, 0])
        hull() {
          linear_extrude(height = 0.2) coffin_lid_2d(scale_xy = 1.00, extra = -3.6);
          translate([0, 0, 0.35]) linear_extrude(height = 0.85) coffin_lid_2d(scale_xy = 1.00, extra = -3.3);
        }

      // 2. Uniform 42.5-deg Mansard Gothic Coffin Roof Flare to Cornice & Overhanging Drip Skirt (Z = 0.9 .. 7.4)
      hull() {
        translate([0, 0, 0.9]) linear_extrude(height = 0.2) coffin_lid_2d(scale_xy = 1.00, extra = -3.3);
        translate([0, 0, 6.2]) linear_extrude(height = 0.4) coffin_lid_2d(scale_xy = 1.00, extra = 1.75);
      }
      // Vertical overhanging eaves wall wrapping around upper body rim (Z_lid = 6.2 .. 7.4 -> Z_world = 27.0..28.2)
      translate([0, 0, 6.2])
        linear_extrude(height = 1.2)
          coffin_lid_2d(scale_xy = 1.00, extra = 1.75);

      // 3. Six Tim Burton Gothic Corner Gargoyle Eave Spurs (<= 42-deg flare + downward tips to Z = 7.7)
      //    Mirrored Y to match Y-mirrored `coffin_lid_2d` vertices
      corners = [
        [-12.4, -11.9], [ 12.4, -11.9],
        [ 17.8,  -1.5], [ 10.6,  11.9],
        [-10.6,  11.9], [-17.8,  -1.5]
      ];
      for (i = [0 : len(corners) - 1]) {
        pt = corners[i];
        skew = (i % 2 == 0) ? 0.35 : -0.35;
        hull() {
          translate([pt[0] * 0.80, pt[1] * 0.80, 1.3]) cylinder(h = 0.6, d = 2.2);
          translate([pt[0] * 1.09 + skew, pt[1] * 1.09, 6.0]) cylinder(h = 1.2, d = 2.6);
          translate([pt[0] * 1.11 + skew, pt[1] * 1.11, 7.6]) cylinder(h = 0.2, d = 1.0);
        }
      }

      // 4. Underside Self-Centering Coffin Plug Collar (Z = 6.2 .. 9.0 -> Z_world = 25.4 .. 28.2)
      //    Body pit wall at extra = -2.5; collar outer wall at extra = -3.20 -> 0.70 mm/side nominal clearance (the pit flares near its top, so the
      //    nearest it came was 0.17 mm at the collar top edge when the wall was at -2.95)
      translate([0, 0, 6.2])
        hull() {
          linear_extrude(height = 1.9) coffin_lid_2d(scale_xy = 1.00, extra = -3.20, r = 1.0);
          translate([0, 0, 2.6]) linear_extrude(height = 0.2) coffin_lid_2d(scale_xy = 1.00, extra = -3.75, r = 0.8);
        }

      // 5. Four Normal-Aligned Slip-Detent Guide Ribs (protrude to extra = -2.75 -> 0.25 mm clear inside -2.5 pit)
      //    Front prow (+Y_lid = +10.0 pit wall) & Back apse (-Y_lid = -10.0 pit wall)
      for (ry = [-9.47, 9.47]) {
        hull() {
          translate([-1.3, ry, 6.4]) cylinder(h = 1.7, r = 0.28);
          translate([ 1.3, ry, 6.4]) cylinder(h = 1.7, r = 0.28);
          translate([ 0.0, ry, 8.6]) cylinder(h = 0.1, r = 0.08);
        }
      }
      //    Left & right angled back-cheek flats (edge [+-13.0, -12.5] -> [+-18.4, -1.5], exact inward normal)
      //    Pit wall delta=-2.5; rib center delta=-3.01, r=0.26 -> reaches -2.75 (0.25 mm clearance): centres moved 0.15 mm along the inward normal
      for (sx = [-1, 1]) {
        hull() {
          translate([sx * (13.133 - 0.53 - 0.1355), -5.740 - 1.08 + 0.0665, 6.4]) cylinder(h = 1.7, r = 0.26);
          translate([sx * (13.133 + 0.53 - 0.1355), -5.740 + 1.08 + 0.0665, 6.4]) cylinder(h = 1.7, r = 0.26);
          translate([sx * (13.133 - 0.1355), -5.740 + 0.0665, 8.6]) cylinder(h = 0.1, r = 0.08);
        }
      }
    }

    // 6. Eaves Under-Recess Annulus around Body Cornice (Z_lid = 6.4 .. 8.2, radial channel -2.55 .. +0.75)
    //    Cuts ONLY the rim seat channel back to Z_lid = 6.4 while preserving inner plug collar (<= -2.60)
    //    and outer 1.0 mm drip skirt (+0.75 .. +1.75) wrapping outside body cornice (+0.30 -> +0.45 mm gap)
    translate([0, 0, 6.4])
      linear_extrude(height = 1.8)
        difference() {
          coffin_lid_2d(scale_xy = 1.00, extra = 0.75, r = 1.4);
          coffin_lid_2d(scale_xy = 1.00, extra = -2.55, r = 1.0);
        }

    // 7. Vaulted Interior Coffin Dome Hollow (offset -5.0 mm -> >= 2.05 mm sturdy plug collar wall, Z = 3.2 .. 9.4)
    translate([0, 0, 3.2])
      linear_extrude(height = 6.3)
        coffin_lid_2d(scale_xy = 1.00, extra = -5.0, r = 0.8);

    // 8. Upward-Facing 0.4 mm Recessed Inner Lid Song-Score Sticker Pocket (18.2 x 9.2 mm at Z = 2.8 .. 3.2)
    //    Offset -0.8 Y_lid toward wider apse so corners clear inner hollow wall with generous margin
    translate([0, -0.8, 3.2 - sticker_depth])
      linear_extrude(height = 1.0)
        rrect2d(18.2, 9.2, r = 1.0);

    // 9. Support-Free 45-deg V-Carved Gothic Coffin Trim & Center Diamond Emblem on Roof Crown (Z_lid = 0..0.42)
    //    Diff of two convex frustums creates a clean 45-deg V-trench perimeter around `extra = -5.4` (>260 mm² center!)
    difference() {
      hull() {
        translate([0, 0, -0.04]) linear_extrude(height = 0.05) coffin_lid_2d(scale_xy = 1.00, extra = -4.95);
        translate([0, 0,  0.40]) linear_extrude(height = 0.03) coffin_lid_2d(scale_xy = 1.00, extra = -5.39);
      }
      hull() {
        translate([0, 0, -0.06]) linear_extrude(height = 0.05) coffin_lid_2d(scale_xy = 1.00, extra = -5.85);
        translate([0, 0,  0.42]) linear_extrude(height = 0.05) coffin_lid_2d(scale_xy = 1.00, extra = -5.41);
      }
    }
    //    Center Tim Burton crooked gothic diamond-cross inlay groove at Z = 0..0.42
    for (ang = [45, -45]) {
      hull() {
        translate([0, 0, -0.02]) rotate([0, 0, ang]) cube([5.4, 0.85, 0.04], center = true);
        translate([0, 0,  0.40]) rotate([0, 0, ang]) cube([4.6, 0.08, 0.04], center = true);
      }
    }

    // 10. (The three fingernail-lift grip coves are gone: they were cut to leave a 0.1 to 0.45 mm wall in a 1.0 mm drip skirt,
    //     thinner than one 0.4 mm extrusion line. The 1.75 mm overhanging skirt is the lift lip: pinch it at the sides.)
  }
}

color(col_lantern) relic_music_box_lid();
