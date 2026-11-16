// Hauntology Tabletop Print Kit — Prop #12: Rattle Prop (Three Burton Bats + Gnarled Branch Mobile)
// Colour: Ink (#0b0d10, matte black)
// Size: ~128 W x 58 D x 3.6 H mm (three needle-eared gothic bats + crooked dead-branch spreader, < 30 g)
// Sticker details: Recessed 0.4 mm red eye pockets (2.8 mm dia) on each bat (1:1 preserved)
// Print orientation: Flat on bed (Z = 0), zero supports.

include <_common.scad>

// 2D Stylized Tim Burton Gothic Bat Silhouette (~46 mm wingspan, ~24 mm height)
module bat_2d() {
  difference() {
    union() {
      // Lean pinched body & pointed bat skull
      scale([3.6, 7.2]) circle(r = 1.0);

      // Tall needle-sharp asymmetrical bat ears
      for (sx = [-1, 1]) {
        hull() {
          translate([sx * 1.6, 5.2]) circle(r = 1.2);
          translate([sx * 3.8, 11.4]) circle(r = 0.45);
        }
      }

      // Swooping angular gothic bat wings (upper leading edge + pointed finger tips)
      for (sx = [-1, 1]) {
        burton_gnarled_path_2d(
          [[sx * 2.2, 2.5], [sx * 10.5, 6.8], [sx * 16.5, 5.2], [sx * 22.8, 1.8]],
          [2.4,             1.9,              1.6,              0.9]
        );
        // Inner webbing membrane connecting wing fingers to body
        polygon(points = [
          [sx * 2.0, 3.2],
          [sx * 10.5, 6.8],
          [sx * 22.2, 1.8],
          [sx * 16.8, -4.6],
          [sx * 10.5, -3.0],
          [sx * 3.2, -5.2],
          [sx * 2.0, -3.5]
        ]);
        // Spiky wing-finger spur tips
        for (spur = [[16.8, -5.6], [10.4, -4.2]]) {
          hull() {
            translate([sx * (spur[0] - 0.5), spur[1] + 2.2]) circle(r = 0.9);
            translate([sx * spur[0], spur[1]]) circle(r = 0.45);
          }
        }
      }

      // Curled tail eyelet collar (bats hang from tail ring)
      translate([0, -9.2]) circle(r = 3.0);
    }

    // Deep dramatic crescent scallops cut from trailing wing edge (radii sized so every wing-finger spur stays >= 1.2 mm wide!)
    for (sx = [-1, 1]) {
      translate([sx * 6.8, -8.1])  circle(r = 3.2);
      translate([sx * 13.6, -7.7]) circle(r = 3.05);
      translate([sx * 20.4, -4.9]) circle(r = 2.9);
    }

    // Thread tie hole (2.0 mm ID)
    translate([0, -9.5]) circle(d = 2.0);
  }
}

module single_bat() {
  difference() {
    union() {
      linear_extrude(height = 2.6)
        bat_2d();
      // Raised 45-deg drafted central spine & wing-arm bone ribs
      hull() {
        translate([0, 4.2, 2.4]) sphere(r = 1.3);
        translate([0, -5.0, 2.2]) sphere(r = 0.9);
      }
      for (sx = [-1, 1]) {
        hull() {
          translate([sx * 2.2, 2.5, 2.4]) sphere(r = 0.8);
          translate([sx * 11.0, 6.6, 2.2]) sphere(r = 0.65);
        }
        hull() {
          translate([sx * 11.0, 6.6, 2.2]) sphere(r = 0.65);
          translate([sx * 21.5, 2.0, 2.1]) sphere(r = 0.45);
        }
      }
    }
    // Flatten bed contact below Z = 0
    translate([0, 0, -4.0]) cube([64, 44, 8.0], center = true);

    // Two 0.4 mm recessed red eye sticker pockets (2.8 mm dia, 1:1 preserved)
    for (sx = [-1.6, 1.6]) {
      translate([sx, 4.4, 2.6 - sticker_depth])
        cylinder(h = sticker_depth + 1.2, d = 2.8);
    }
  }
}

module gnarled_spreader_bar() {
  difference() {
    union() {
      // Main crooked dead-tree branch spanning X = -58..+58 (Y ~ 18)
      linear_extrude(height = 3.4)
        burton_gnarled_path_2d(
          [[-58.0, 0.8], [-48.0, -0.5], [-34.0, 2.4], [-16.0, -1.6], [0.0, 1.2], [17.0, 2.8], [35.0, -1.2], [48.0, 0.6], [59.0, 2.6]],
          [1.8,          3.4,           3.0,          3.4,           4.0,        3.2,         3.1,          3.4,          1.6]
        );
      // Curling dead twig forks at both branch tips & center knot
      for (twig = [
        [[-52.0, 0.2], [-59.0, 6.5], [-64.5, 8.0]],
        [[-36.0, 2.2], [-41.0, 7.2], [-44.5, 6.0]],
        [[ 38.0,-1.0], [ 43.0,-6.5], [ 46.5,-5.8]],
        [[ 52.0, 1.2], [ 60.0, 7.5], [ 65.0, 6.0]]
      ]) {
        linear_extrude(height = 2.8)
          burton_gnarled_path_2d(twig, [1.6, 1.1, 0.65]);
      }

      // Top suspension eyelet knot & 3 lower bat hanging branch knots (exact -48, 0, +48 spacing!)
      translate([0, 5.2, 0]) cylinder(h = 3.4, d = 8.4);
      for (bx = [-48.0, 0, 48.0]) {
        kn_y = (bx == 0) ? -4.2 : -4.8;
        hull() {
          translate([bx, 0.2, 0]) cylinder(h = 3.4, d = 6.0);
          translate([bx, kn_y, 0]) cylinder(h = 3.4, d = 7.0);
        }
      }
    }

    // Center top suspension hole (2.4 mm) & 3 bat hanging holes (2.2 mm)
    translate([0, 5.8, -0.5]) cylinder(h = 5.0, d = 2.4);
    for (bx = [-48.0, 0, 48.0]) {
      kn_y = (bx == 0) ? -4.8 : -5.3;
      translate([bx, kn_y, -0.5]) cylinder(h = 5.0, d = 2.2);
    }

    // Bark crack V-grooves on top surface of dead branch
    for (gx = [-40.0, -22.0, -8.0, 12.0, 28.0, 42.0]) {
      translate([gx, (gx > 0 ? 0.8 : 0.2), 3.4])
        rotate([0, 0, gx > 0 ? -12 : 14])
          rotate([45, 0, 0])
            cube([10.0, 0.85, 0.85], center = true);
    }
  }
}

module prop_12_bats_mobile() {
  translate([0, 19.0, 0])
    gnarled_spreader_bar();

  for (bx = [-48.0, 0, 48.0]) {
    translate([bx, -9.0, 0])
      single_bat();
  }
}

color(col_ink) prop_12_bats_mobile();
