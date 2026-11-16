// Hauntology Tabletop Print Kit — Prop #15: Relic Vault (Wrought-Iron Gothic Clasp, Hasp & Hook)
// Colour: Lantern (#e0a43a, amber/matte gold)
// Size: ~98 W x 34 D x 5.2 H mm (3 pieces arranged cleanly on bed)
// Sticker details: Recessed clasp detail sticker pocket (30 x 18 mm preserved 1:1)
// Print orientation: Flat on bed (Z = 0), zero supports.

include <_common.scad>

module prop_15_vault_clasp() {
  // 1. Chest Front Gothic Wrought-Iron Escutcheon Plate (at X = -28, rear boss 35.6 x 23.6 preserved)
  translate([-28.0, 0, 0])
  difference() {
    union() {
      // Core escutcheon frame
      chamfer_box(36.0, 24.0, 4.2, r = 2.4, ch_bot = 0.5, ch_top = 0.6);
      // Gothic scrollwork wings & pointed keyhole crown flare (flat on Z = 0..3.8, clears Y = +12..+18 safely!)
      for (sx = [-1, 1]) {
        hull() {
          translate([sx * 16.5, 2.0, 0]) cylinder(h = 4.0, d = 6.0);
          translate([sx * 22.8, 0.5, 0]) cylinder(h = 3.6, d = 2.6);
          translate([sx * 17.5, -5.0, 0]) cylinder(h = 4.0, d = 5.4);
        }
        // Bottom-corner filigree scroll curl
        translate([sx * 16.5, -9.5, 0])
          rotate([0, 0, sx > 0 ? -40 : 140])
            linear_extrude(height = 3.8)
              burton_spiral_2d(turns = 0.85, r0 = 0.9, r1 = 3.8, w = 1.9, dir = sx, steps = 14);
      }
      // Pointed gothic lower drop shield finial
      hull() {
        translate([-7.0, -10.5, 0]) cylinder(h = 4.0, d = 3.0);
        translate([ 7.0, -10.5, 0]) cylinder(h = 4.0, d = 3.0);
        translate([ 0.0, -15.8, 0]) cylinder(h = 3.4, d = 2.0);
      }
      // Exact rear locating boss that drops into the vault chest front recess
      translate([0, 0, 4.0])
        chamfer_box(35.6, 23.6, 1.2, r = 2.0, ch_bot = 0, ch_top = 0.3);
    }
    // Front 0.4 mm sticker pocket for brass clasp rivets & engraving (30 x 18 mm preserved 1:1)
    translate([0, 0, -0.1])
      linear_extrude(height = sticker_depth + 0.5)
        rrect2d(30.0, 18.0, r = 1.4);
    // Center keeper slot where the lid hasp loop enters
    translate([0, 5.0, 2.0])
      cube([18.0, 14.0, 12.0], center = true);
    translate([13.5, 10.0, 2.0])
      cube([11.0, 6.0, 12.0], center = true);
  }

  // 2. Gothic Spear-Tongue Lid Keeper Hasp Loop (at X = 14; engages SG90 latch hook)
  translate([14.0, 0, 0])
  difference() {
    union() {
      // Exact upper mounting tab pressing into vault lid mortise (24.0 x 12.0 x 3.8 mm)
      translate([0, 6.5, 0])
        chamfer_box(24.0, 12.0, 3.8, r = 1.6, ch_bot = 0.4, ch_top = 0.4);
      // Lower keeper loop tongue shaped into pointed gothic shield tip
      hull() {
        translate([0, -4.0, 0])
          chamfer_box(16.8, 12.0, 4.6, r = 2.0, ch_bot = 0.4, ch_top = 0.5);
        translate([0, -12.6, 0])
          cylinder(h = 4.2, d = 2.4);
      }
    }
    // Exact latch bolt catch window (9.6 x 6.4 mm) + swing clearance hull
    translate([0, -5.0, -0.5])
      linear_extrude(height = 6.0)
        hull() { rrect2d(9.6, 6.4, r = 1.0); translate([10.0, 0]) rrect2d(9.6, 6.4, r = 1.0); }
  }

  // 3. Spiked SG90 Servo Rotary Latch Hook Arm (at X = 40; spline & catch reach preserved 1:1)
  translate([40.0, -4.0, 0])
  difference() {
    union() {
      cylinder(h = 4.8, d = 13.6);
      hull() {
        cylinder(h = 4.2, d = 10.0);
        translate([0, 14.0, 0]) cylinder(h = 4.2, d = 7.6);
      }
      // Subtle gothic dragon-spine thorn along back (+X) edge of hook arm (away from -X catch!)
      hull() {
        translate([3.2, 6.0, 0]) cylinder(h = 3.8, d = 3.0);
        translate([7.0, 9.5, 0]) cylinder(h = 3.4, d = 1.4);
        translate([2.8, 12.0, 0]) cylinder(h = 3.8, d = 3.0);
      }
      // Bevelled locking hook nose
      hull() {
        translate([0, 14.0, 0]) cylinder(h = 4.2, d = 7.6);
        translate([-5.5, 16.5, 0]) cylinder(h = 4.2, d = 4.8);
      }
    }
    translate([0, 0, -0.5])
      cylinder(h = 6.0, d = 5.0);
    translate([0, 0, 2.6])
      hull() {
        cylinder(h = 3.0, d = 7.4);
        translate([0, 11.0, 0]) cylinder(h = 3.0, d = 4.4);
      }
    translate([0, 7.5, -0.5])
      cylinder(h = 6.0, d = 1.8);
  }
}

color(col_lantern) prop_15_vault_clasp();
