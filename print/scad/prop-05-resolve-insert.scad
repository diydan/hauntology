// Hauntology Tabletop Print Kit — Prop #5 / Section 6: Resolve Lamp Diffuser Insert
// Colour: Bone (#e9e4d8, printed at 0.8 mm translucent face thickness; print 6x, one per seat)
// Size: 36.4 W x 14.0 H x 2.4 D mm
// Mechanism: Slides into the slot behind each seat plinth's 3 Resolve LED windows to diffuse WS2812B pixels
// Print orientation: Flat on front diffuser face (Z = 0), zero supports.

include <_common.scad>

module prop_05_resolve_insert() {
  difference() {
    union() {
      // 1. Thin 0.8 mm translucent diffuser face plate (36.4 x 14.0 x 0.8 mm)
      chamfer_box(36.4, 14.0, 0.8, r = 1.6, ch_bot = 0.2, ch_top = 0.1);

      // 2. Three optical isolation light-baffle rings around each 5 mm LED window
      for (lx = [-10.0, 0.0, 10.0]) {
        translate([lx, 0, 0.8])
          cylinder(h = 1.6, d1 = 8.4, d2 = 7.6);
      }
    }

    // 3. Hollow light-pipe cups inside each baffle ring (leaving 0.8 mm translucent floor at Z = 0..0.8)
    for (lx = [-10.0, 0.0, 10.0]) {
      translate([lx, 0, 0.8])
        cylinder(h = 2.0, d = 5.4);
    }
  }
}

color(col_bone) prop_05_resolve_insert();
