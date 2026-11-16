// Hauntology Tabletop Print Kit — Prop #9: Curtain Reveal (Pleated Curtain Panel)
// Colour: Dark Iron (#262229); print 2x for left and right panels
// Size: 52 W x 74 H x 3.6 D mm + top rail slider tabs (total 81.3 mm H — fits stage viewport Y = -47..+35 cleanly)
// Mechanism: Top slider tabs include a 1.8 mm guide fin that rides inside the 2.2 mm twin-track rail of
//            prop-09-rail-and-pulley.stl + horizontal X cord eye holes for the counter-wound pulley loop
// Print orientation: Flat on back (Z = 0), zero supports.

include <_common.scad>

panel_w = 52.0;
panel_h = 74.0;

module prop_09_curtain_panel() {
  difference() {
    union() {
      // 1. Base curtain backing sheet (Y = 3.0..74.0 so jagged bottom hem scallops read clearly in silhouette!)
      translate([0, panel_h / 2 + 1.5, 0])
        chamfer_box(panel_w, panel_h - 3.0, 1.8, r = 2.0, ch_bot = 0.3, ch_top = 0.2);

      // 2. Five vertical pleated velvet fold ribs across the panel width
      for (rx = [-20, -10, 0, 10, 20]) {
        hull() {
          translate([rx, 4.0, 1.4]) sphere(r = 2.2);
          translate([rx, panel_h - 3.0, 1.4]) sphere(r = 2.2);
        }
      }

      // 3. Jagged Pointed Bat-Wing Velvet Fringe Scallops along bottom hem (stays >= Y=0.0 to clear stage apron!)
      translate([0, 4.6, 0])
        chamfer_box(panel_w, 4.4, 3.2, r = 1.4, ch_bot = 0.3, ch_top = 0.6);
      for (tx = [-20, -10, 0, 10, 20]) {
        hull() {
          translate([tx, 4.4, 0]) cylinder(h = 3.0, d = 6.8);
          translate([tx + (tx == 0 ? 0.5 : 0), 0.9, 0]) cylinder(h = 2.4, d = 1.8);
        }
      }
      // Diagonal gothic curtain tie-back sash cord across upper-outer waist (2-segment V-cord, not solid triangle!)
      hull() {
        translate([-panel_w / 2 + 2.5, 38.0, 1.8]) cylinder(h = 1.6, d = 3.2);
        translate([0, 26.5, 2.2]) cylinder(h = 1.6, d = 2.8);
      }
      hull() {
        translate([0, 26.5, 2.2]) cylinder(h = 1.6, d = 2.8);
        translate([panel_w / 2 - 2.5, 32.0, 1.8]) cylinder(h = 1.6, d = 3.2);
      }

      // 4. Two Top Rail Slider Carriages with Track Guide Tongue & Cord Eyelets (Y = 74..81.3)
      for (sx = [-16.0, 16.0]) {
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
    for (sx = [-16.0, 16.0]) {
      translate([sx, panel_h + 3.5, -0.5])
        cylinder(h = 8.0, d = 2.4);
      translate([sx, panel_h + 3.5, 2.6])
        rotate([0, 90, 0])
          cylinder(h = 12.0, d = 2.2, center = true);
    }
  }
}

color(col_ink) prop_09_curtain_panel();
