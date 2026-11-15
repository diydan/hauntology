// Hauntology Tabletop Print Kit — Prop #12: Rattle Prop (Option A: Five-Candle Chandelier)
// Colour: Lantern (#e0a43a, amber/matte gold)
// Size: 74 W x 74 D x 38 H mm (70 mm ring diameter, 5 candle posts, lightweight ~12 g < 30 g)
// Sticker details: Five flame-shaped sticker tabs at the top of each candle
// Print orientation: Flat on ring base (Z = 0), zero supports.

include <_common.scad>

chand_r = 32.0;

module prop_12_chandelier() {
  difference() {
    union() {
      // 1. Ornate Outer Wheel Ring (70 mm OD, 58 mm ID, Z = 0..4.0)
      difference() {
        cylinder(h = 4.0, d = chand_r * 2 + 6.0);
        translate([0, 0, -0.5])
          cylinder(h = 5.0, d = chand_r * 2 - 5.0);
      }

      // 2. Central Hub & Five Radial Spokes (Z = 0..4.0)
      cylinder(h = 6.0, d1 = 16.0, d2 = 12.0);
      for (i = [0 : 4]) {
        rotate([0, 0, i * 72])
          translate([chand_r / 2, 0, 1.8])
            cube([chand_r, 3.6, 3.6], center = true);
      }

      // 3. Central Suspension Spire & Top Tie Loop (Z = 6.0..38.0)
      cylinder(h = 30.0, d1 = 9.0, d2 = 4.4);
      translate([0, 0, 33.5])
        rotate([90, 0, 0])
          difference() {
            cylinder(h = 3.2, d = 9.0, center = true);
            cylinder(h = 4.0, d = 3.2, center = true);
          }

      // 4. Five Candle Cups, Wax Pillars & Flame Sticker Tabs around the Ring
      for (i = [0 : 4]) {
        ang = i * 72;
        rotate([0, 0, ang])
          translate([chand_r, 0, 0]) {
            // Drip saucer (45-deg flare from z = 3.5 to z = 6.5)
            translate([0, 0, 3.5])
              cylinder(h = 2.8, d1 = 7.6, d2 = 12.4);
            // Candle pillar (Z = 6.0..21.0)
            translate([0, 0, 6.0])
              cylinder(h = 15.0, d = 6.8);
            // Flame sticker tab at top of candle (Z = 20.5..30.0, facing radially outward)
            translate([0, 0, 20.5])
              hull() {
                cylinder(h = 1.0, d = 5.2);
                translate([0, 0, 4.5]) scale([0.5, 1.2, 1]) cylinder(h = 1.0, d = 5.6);
                translate([0, 0, 9.0]) sphere(d = 2.0);
              }
          }
      }
    }
  }
}

color(col_lantern) prop_12_chandelier();
