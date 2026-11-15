// Hauntology Tabletop Print Kit — Parametric Pepper's-Ghost Pyramid Holder
// Colour: Ink (#0b0d10, matte black to eliminate screen glare)
// Default parameters: base_mm = 60, top_mm = 10, face angle = 45 degrees (height = 25 mm)
// Print orientation: Flat on base ring (Z = 0), zero supports (all struts are exactly 45 deg!).

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
      // 1. Matte-black base calibration frame sitting on screen (with corner feet pads)
      difference() {
        chamfer_box(outer_b + 4, outer_b + 4, base_h, r = 3.5, ch_bot = 0.6, ch_top = 0.6);
        translate([0, 0, -0.1])
          linear_extrude(height = base_h + 0.2)
            rrect2d(base_mm - 2.4, base_mm - 2.4, r = 1.2);
      }

      // 2. Four 45-degree corner struts rising from base ring to top collar
      for (sx = [-1, 1], sy = [-1, 1]) {
        hull() {
          translate([sx * (base_mm / 2 + 0.8), sy * (base_mm / 2 + 0.8), base_h - 0.6])
            cylinder(h = 1.2, d = 6.2);
          translate([sx * (top_mm / 2 + 1.0), sy * (top_mm / 2 + 1.0), base_h + pyr_h - 1.2])
            cylinder(h = 1.6, d = 5.0);
        }
      }

      // 3. Top locking collar ring (supported at 45 deg by the four corner struts; bridge span = 10 mm)
      translate([0, 0, base_h + pyr_h - 2.4])
      difference() {
        chamfer_box(outer_t + 3.2, outer_t + 3.2, 2.8, r = 2.0, ch_bot = 0.6, ch_top = 0.5);
        translate([0, 0, -0.1])
          linear_extrude(height = 3.2)
            rrect2d(top_mm - 1.2, top_mm - 1.2, r = 0.8);
      }
    }

    // 4. Four 45-degree trapezoid pane retention grooves (each holds one clear plastic trapezoid face)
    for (rot_z = [0, 90, 180, 270]) {
      rotate([0, 0, rot_z])
        hull() {
          translate([0, -(base_mm / 2), base_h - 1.4])
            rotate([45, 0, 0])
              cube([base_mm + 1.2, pane_t, 1.6], center = true);
          translate([0, -(top_mm / 2), base_h + pyr_h - 0.8])
            rotate([45, 0, 0])
              cube([top_mm + 1.2, pane_t, 1.6], center = true);
        }
    }
  }
}

color(col_ink) pyramid_holder();
