// Hauntology Tabletop Print Kit — Tim Burton Wrought-Iron Pepper's-Ghost Pyramid Cage
// Colour: Ink (#0b0d10, matte black to eliminate screen glare)
// Default parameters: base_mm = 60, top_mm = 10, face angle = 45 degrees (optical slots preserved 1:1)
// Print orientation: Flat on base ring (Z = 0), zero supports (45 deg ribs, 1 connected component).

include <_common.scad>

base_mm    = 60.0; // Bottom edge of each clear trapezoid pane
top_mm     = 10.0; // Top edge of each clear trapezoid pane
pane_t     = 0.85; // Clear acetate / PETG sheet slot thickness (0.5 mm sheet + clearance)
frame_wall = 3.2;
base_h     = 3.6;

pyr_run    = (base_mm - top_mm) / 2;
pyr_h      = pyr_run; // tan(45 deg) == 1

module pyramid_holder() {
  outer_b = base_mm + 2 * frame_wall;
  outer_t = top_mm + 2 * frame_wall;

  difference() {
    union() {
      // 1. Matte-black base calibration frame + 4 flat wrought-iron scroll corner feet
      difference() {
        union() {
          chamfer_box(outer_b + 4, outer_b + 4, base_h, r = 3.2, ch_bot = 0.6, ch_top = 0.6);
          for (sx = [-1, 1], sy = [-1, 1]) {
            // Splayed wrought-iron spiral scroll feet sitting flat at Z = 0..base_h
            translate([sx * (outer_b / 2 + 1.5), sy * (outer_b / 2 + 1.5), 0])
              rotate([0, 0, atan2(sy, sx) - 45])
                linear_extrude(height = base_h - 0.2)
                  burton_spiral_2d(turns = 1.0, r0 = 0.9, r1 = 5.6, w = 2.0, dir = sx * sy, steps = 16);
          }
        }
        // Optical aperture window (clean for screen)
        translate([0, 0, -0.1])
          linear_extrude(height = base_h + 0.4)
            rrect2d(base_mm - 2.4, base_mm - 2.4, r = 1.2);
      }

      // 2. Four 45-degree Knuckled Wrought-Iron Corner Ribs (segmented gnarled spine)
      for (sx = [-1, 1], sy = [-1, 1]) {
        p_bot = [sx * (base_mm / 2 + 0.8), sy * (base_mm / 2 + 0.8), base_h - 0.8];
        p_mid1 = [
          p_bot[0] + (sx * (top_mm / 2 + 1.0) - p_bot[0]) * 0.34,
          p_bot[1] + (sy * (top_mm / 2 + 1.0) - p_bot[1]) * 0.34,
          base_h - 0.8 + (pyr_h - 0.6) * 0.34
        ];
        p_mid2 = [
          p_bot[0] + (sx * (top_mm / 2 + 1.0) - p_bot[0]) * 0.68,
          p_bot[1] + (sy * (top_mm / 2 + 1.0) - p_bot[1]) * 0.68,
          base_h - 0.8 + (pyr_h - 0.6) * 0.68
        ];
        p_top = [sx * (top_mm / 2 + 1.0), sy * (top_mm / 2 + 1.0), base_h + pyr_h - 1.4];

        // Continuous core strut enclosing the sheet groove cleanly
        hull() {
          translate(p_bot) cylinder(h = 1.4, d = 7.2);
          translate(p_top) cylinder(h = 1.8, d = 5.6);
        }
        // Subtle gnarled gargoyle iron knuckle collars along the outer spine (all <= 45 deg!)
        hull() {
          translate(p_bot) cylinder(h = 1.4, d = 8.8);
          translate(p_mid1 + [sx * 1.4, sy * 1.4, 0]) cylinder(h = 2.0, d = 7.4);
        }
        hull() {
          translate(p_mid1 + [sx * 1.4, sy * 1.4, 0]) cylinder(h = 2.0, d = 7.4);
          translate(p_mid2 + [-sx * 0.6, -sy * 0.6, 0]) cylinder(h = 1.8, d = 7.6);
        }
        hull() {
          translate(p_mid2 + [-sx * 0.6, -sy * 0.6, 0]) cylinder(h = 1.8, d = 7.6);
          translate(p_top) cylinder(h = 1.8, d = 6.2);
        }
      }

      // 3. Top Gothic Crown Locking Collar with 45-deg corbelled underside (zero mid-air hole!) & 4 Corner Spires
      translate([0, 0, base_h + pyr_h - 2.4]) {
        difference() {
          hull() {
            translate([0, 0, -2.0])
              chamfer_box(outer_t + 0.6, outer_t + 0.6, 0.4, r = 1.6, ch_bot = 0, ch_top = 0);
            chamfer_box(outer_t + 3.4, outer_t + 3.4, 2.8, r = 1.8, ch_bot = 0.4, ch_top = 0.5);
          }
          hull() {
            translate([0, 0, -2.2])
              linear_extrude(height = 0.2)
                rrect2d(top_mm + 3.0, top_mm + 3.0, r = 1.0);
            translate([0, 0, -0.1])
              linear_extrude(height = 3.2)
                rrect2d(top_mm - 1.2, top_mm - 1.2, r = 0.8);
          }
        }
        for (sx = [-1, 1], sy = [-1, 1]) {
          translate([sx * (outer_t / 2 + 0.5), sy * (outer_t / 2 + 0.5), 2.3])
            burton_gothic_spire_3d(h = 4.6, d = 2.6, skew_x = sx * 0.4, skew_y = sy * 0.4);
        }
      }
    }

    // 4. Four 45-degree trapezoid pane retention grooves (sized +0.2 mm over 60 -> 10 mm README panes, open at top collar, inside strut cores!)
    for (rot_z = [0, 90, 180, 270]) {
      rotate([0, 0, rot_z])
        hull() {
          translate([0, -(base_mm / 2), base_h - 1.0])
            rotate([45, 0, 0])
              cube([base_mm + 0.2, pane_t, 1.3], center = true);
          translate([0, -(top_mm / 2) + 1.8, base_h + pyr_h + 0.8])
            rotate([45, 0, 0])
              cube([top_mm + 0.2, pane_t, 1.6], center = true);
        }
    }
  }
}

color(col_ink) pyramid_holder();
