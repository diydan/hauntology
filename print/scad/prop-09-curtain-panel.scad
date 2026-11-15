// Hauntology Tabletop Print Kit — Prop #9: Curtain Reveal (Pleated Curtain Panel)
// Colour: Alarm (#d4604a, brick red; print 2x for left and right panels)
// Size: 60 W x 90 H x 3.6 D mm + top rail slider tabs (total 98 mm H)
// Mechanism: Top slider tabs include a 1.8 mm guide fin that rides inside the 2.2 mm twin-track rail of
//            prop-09-rail-and-pulley.stl + horizontal X cord eye holes for the counter-wound pulley loop
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

      // 4. Two Top Rail Slider Carriages with Track Guide Tongue & Cord Eyelets (Y = 90..98)
      for (sx = [-20.0, 20.0]) {
        translate([sx, panel_h + 3.0, 0])
          chamfer_box(10.0, 9.0, 5.2, r = 1.5, ch_bot = 0.3, ch_top = 0.5);
        // Guide fin tongue at top edge (1.8 mm thick, fits 2.2 mm rail slot with 0.4 mm clearance)
        translate([sx, panel_h + 6.4, 0])
          chamfer_box(9.6, 1.8, 7.2, r = 0.6, ch_bot = 0.2, ch_top = 0.3);
      }
    }

    // Flatten back at Z = 0
    translate([0, 50, -5.0])
      cube([120, 140, 10.0], center = true);

    // 5. Thread Tie Holes (both Z-through and X-horizontal) in Top Slider Carriages
    for (sx = [-20.0, 20.0]) {
      translate([sx, panel_h + 3.5, -0.5])
        cylinder(h = 8.0, d = 2.4);
      translate([sx, panel_h + 3.5, 2.6])
        rotate([0, 90, 0])
          cylinder(h = 12.0, d = 2.2, center = true);
    }
  }
}

color(col_alarm) prop_09_curtain_panel();
