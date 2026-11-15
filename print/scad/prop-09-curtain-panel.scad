// Hauntology Tabletop Print Kit — Prop #9: Curtain Reveal (Pleated Curtain Panel)
// Colour: Alarm (#d4604a, brick red; print 2x for left and right panels)
// Size: 60 W x 90 H x 3.6 D mm + top rail slider tabs (total 98 mm H)
// Mechanism: Rides along curtain rail with 0.3 mm clearance; thread eyelets tie to upper/lower pulley loop
// Print orientation: Flat on back (Z = 0), zero supports.

include <_common.scad>

panel_w = 60.0;
panel_h = 90.0;

module prop_09_curtain_panel() {
  difference() {
    union() {
      // 1. Base curtain backing sheet (60 x 90 x 1.8 mm)
      translate([0, panel_h / 2, 0])
        chamfer_box(panel_w, panel_h, 1.8, r = 2.0, ch_bot = 0.3, ch_top = 0.2);

      // 2. Five vertical pleated velvet fold ribs across the panel width
      for (rx = [-24, -12, 0, 12, 24]) {
        hull() {
          translate([rx, 4.0, 1.4]) sphere(r = 2.2);
          translate([rx, panel_h - 3.0, 1.4]) sphere(r = 2.2);
        }
      }

      // 3. Bottom fringe hem band & scalloped tassel trim
      translate([0, 3.0, 0])
        chamfer_box(panel_w, 6.0, 3.2, r = 1.5, ch_bot = 0.3, ch_top = 0.6);

      // 4. Two Top Rail Slider Carriages with Thread-Tie Eyelets (Y = 90..98)
      for (sx = [-20.0, 20.0]) {
        translate([sx, panel_h + 3.0, 0])
          chamfer_box(10.0, 9.0, 5.2, r = 1.5, ch_bot = 0.3, ch_top = 0.5);
      }
    }

    // Flatten back at Z = 0
    translate([0, 50, -5.0])
      cube([120, 140, 10.0], center = true);

    // 5. Rail Guide Slot & Thread Tie Holes in Top Slider Carriages
    for (sx = [-20.0, 20.0]) {
      // Thread tie hole (2.4 mm ID)
      translate([sx, panel_h + 4.5, -0.5])
        cylinder(h = 7.0, d = 2.4);
    }
  }
}

color(col_alarm) prop_09_curtain_panel();
