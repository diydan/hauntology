// Hauntology Tabletop Print Kit — Prop #3: Haunt Needle (Gauge Pointer Needle)
// Colour: Lantern (#e0a43a, amber/matte gold)
// Size: 82 L x 18 W x 6.0 H mm (64 mm pointer tip radius from pivot)
// Mechanism: Underside pocket fits SG90 servo horn with 0.3 mm clearance
// Print orientation: Flat on back (Z = 0), zero supports.

include <_common.scad>

module prop_03_needle() {
  difference() {
    union() {
      // 1. Central circular boss hub at pivot (0,0)
      cylinder(h = 5.6, d1 = 17.6, d2 = 15.6);
      translate([0, 0, 5.6])
        cylinder(h = 1.0, d1 = 11.0, d2 = 7.0);

      // 2. Tapered Victorian gauge pointer blade (+X direction, 64 mm reach)
      hull() {
        translate([4.0, 0, 0]) cube([1.0, 7.6, 3.6], center = true);
        translate([4.0, 0, 4.2]) cube([1.0, 2.4, 0.8], center = true);
        translate([52.0, 0, 0]) cube([1.0, 4.2, 3.0], center = true);
        translate([64.0, 0, 0]) cylinder(h = 2.4, d = 1.4);
      }

      // Decorative diamond ring at mid-shaft
      translate([24.0, 0, 0])
        cylinder(h = 4.4, d1 = 9.0, d2 = 7.2, $fn = 4);

      // 3. Counterweight tail (-X direction, 16 mm)
      hull() {
        translate([-4.0, 0, 0]) cylinder(h = 4.2, d = 6.8);
        translate([-15.0, 0, 0]) cylinder(h = 4.2, d = 10.4);
      }
    }

    // Flatten bottom at Z = 0
    translate([0, 0, -5.0])
      cube([200, 100, 10.0], center = true);

    // 4. Keyed SG90 Single-Arm Horn Recess on Underside (anti-rotation slot + M2 hub & horn screw bores)
    translate([0, 0, -0.1])
      hull() {
        cylinder(h = 3.2, d = sg90_horn_hub_d);
        translate([14.0, 0, 0])
          cylinder(h = 3.2, d = sg90_horn_tip_d);
      }
    translate([0, 0, -0.1])
      cylinder(h = 8.0, d = 2.4);
    translate([10.0, 0, -0.1])
      cylinder(h = 6.0, d = 1.8);
  }
}

color(col_lantern) prop_03_needle();
