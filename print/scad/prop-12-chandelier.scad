// Hauntology Tabletop Print Kit — Prop #12: Rattle Prop (Option A: Tim Burton Wrought-Iron Chandelier)
// Colour: Lantern (#e0a43a, amber/matte gold)
// Size: ~76 W x 76 D x 39 H mm (five crooked dripping taper candles, weight < 30 g)
// Sticker details: Five flame-shaped sticker tabs at the top of each candle (1:1 preserved)
// Print orientation: Flat on ring base (Z = 0), zero supports (all tilts <= 7 deg, 1 component).

include <_common.scad>

chand_r = 31.0;

module prop_12_chandelier() {
  union() {
    // 1. Wrought-Iron Outer Rim with Five Gothic Scalloped Cusp Arches (Z = 0..4.0)
    difference() {
      union() {
        cylinder(h = 4.0, d = chand_r * 2 + 6.4);
        // Subtle pointed gothic iron lugs at each candle station
        for (i = [0 : 4]) {
          rotate([0, 0, i * 72])
            translate([chand_r + 2.8, 0, 0])
              hull() {
                cylinder(h = 4.0, d = 6.4);
                translate([3.0, 0, 0]) cylinder(h = 3.2, d = 2.0);
              }
        }
      }
      translate([0, 0, -0.5])
        cylinder(h = 5.2, d = chand_r * 2 - 4.8);
    }

    // Inward wrought-iron gothic trefoil cusps between candle spokes (flat on Z = 0..3.6)
    for (i = [0 : 4]) {
      rotate([0, 0, i * 72 + 36])
        translate([chand_r - 2.0, 0, 0])
          hull() {
            cylinder(h = 3.6, d = 5.0);
            translate([-5.4, 0, 0]) cylinder(h = 3.2, d = 1.6);
          }
    }

    // 2. Central Hub & Five S-Scroll Wrought-Iron Arms (flat on bed Z = 0..3.8)
    cylinder(h = 6.0, d1 = 16.5, d2 = 12.0);
    for (i = [0 : 4]) {
      ang = i * 72;
      rotate([0, 0, ang]) {
        // Organic S-curved wrought-iron arm built via burton_gnarled_path_2d
        linear_extrude(height = 3.8)
          burton_gnarled_path_2d(
            [[4.5, 0.0], [11.0, 4.6], [18.5, 4.2], [24.5, -3.6], [chand_r, 0.0]],
            [2.0,        1.8,         1.6,         1.7,          2.4]
          );
        // Inner decorative iron spiral curl anchored directly into the S-curve arm
        hull() {
          translate([18.5, 4.2, 0]) cylinder(h = 3.4, d = 3.0);
          translate([17.5, 0.2, 0]) cylinder(h = 3.4, d = 2.4);
        }
        translate([16.8, -3.0, 0])
          rotate([0, 0, 95])
            linear_extrude(height = 3.4)
              burton_spiral_2d(turns = 0.95, r0 = 0.8, r1 = 4.8, w = 1.7, dir = 1, steps = 16);
      }
    }

    // 3. Crooked Twisted Gothic Central Spire & Top Suspension Eyelet (Z = 5.5..39.0)
    hull() {
      cylinder(h = 0.8, d = 11.5);
      translate([1.4, -0.8, 17.5]) cylinder(h = 0.8, d = 6.6);
    }
    hull() {
      translate([1.4, -0.8, 17.5]) cylinder(h = 0.8, d = 6.6);
      translate([0.0,  0.4, 30.8]) cylinder(h = 0.8, d = 4.4);
    }
    // Wrought-iron top suspension loop centered near mast apex
    translate([0.0, 0.4, 34.4])
      rotate([90, 0, 22])
        difference() {
          cylinder(h = 3.2, d = 9.2, center = true);
          cylinder(h = 4.2, d = 3.2, center = true);
        }

    // 4. Five Slightly Canted / Melted Taper Candles + Scalloped Drip Bobeches + Upright Flame Tabs
    for (i = [0 : 4]) {
      ang = i * 72;
      lean_tang = (i % 2 == 0) ? 1.5 : -1.7;
      lean_rad  = (i % 3 == 0) ? 0.9 : -0.8;
      cand_h    = 13.8 + (i % 3) * 1.1; // uneven melted heights (13.8..16.0 mm)

      rotate([0, 0, ang])
        translate([chand_r, 0, 0]) {
          // Scalloped drip bobeche saucer (45-deg safe flare from Z = 3.2 to Z = 6.6)
          translate([0, 0, 3.2])
            cylinder(h = 3.2, d1 = 7.6, d2 = 12.6);
          for (d_ang = [0 : 72 : 288]) {
            rotate([0, 0, d_ang + i * 19])
              hull() {
                translate([3.8, 0, 3.6]) sphere(d = 2.6);
                translate([5.4, 0, 6.0]) sphere(d = 3.0);
              }
          }

          // Gently tilted melted candle shaft (<= 7 deg slope << 45 deg, 100% support-free!)
          hull() {
            translate([0, 0, 6.0]) cylinder(h = 1.0, d = 7.0);
            translate([lean_rad, lean_tang, 6.0 + cand_h]) cylinder(h = 0.8, d = 6.2);
          }

          // Melted wax drip runnel hugging the side of the candle
          hull() {
            translate([lean_rad + 2.5, lean_tang, 6.0 + cand_h - 1.5]) cylinder(h = 0.6, d = 2.2);
            translate([2.8, 0.6, 8.2]) cylinder(h = 0.6, d = 2.0);
          }

          // Upright flame sticker paddle at candle tip (preserving exact 5.2 x 9.0 mm silhouette)
          translate([lean_rad, lean_tang, 6.0 + cand_h - 0.5])
            hull() {
              cylinder(h = 1.0, d = 5.2);
              translate([0, 0, 4.5]) scale([0.5, 1.2, 1]) cylinder(h = 1.0, d = 5.6);
              translate([0, 0, 9.0]) sphere(d = 2.0);
            }
        }
    }
  }
}

color(col_lantern) prop_12_chandelier();
