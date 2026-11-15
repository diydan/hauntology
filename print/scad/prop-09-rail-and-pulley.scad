// Hauntology Tabletop Print Kit — Prop #9: Curtain Reveal (Slider Rail, Idler Pulley & Servo Drum)
// Colour: Ink (#0b0d10, matte black)
// Size: 158 W x 38 D x 10 H mm (arranged on one print bed)
// Mechanism: 158 mm twin-track curtain rail + 16 mm grooved idler pulley (4.6 mm bore) + 22 mm SG90 capstan drum
// Print orientation: Flat on bed (Z = 0), zero supports.

include <_common.scad>

module prop_09_rail_and_pulley() {
  // 1. Twin-Track Curtain Slider Rail Bar (158 x 8.0 x 6.0 mm, sits at Y = -10)
  translate([0, -10.0, 0])
  difference() {
    chamfer_box(158.0, 8.0, 6.0, r = 1.2, ch_bot = 0.4, ch_top = 0.4);
    // Twin longitudinal slider tracks (2.6 mm wide x 3.2 mm deep)
    for (sy = [-1.8, 1.8]) {
      translate([0, sy, 4.6])
        cube([142.0, 2.2, 3.4], center = true);
    }
  }

  // 2. Grooved Thread Idler Pulley Wheel (at X = -24, Y = 10; 16 mm OD, 4.6 mm axle bore for 4.0 mm post)
  translate([-24.0, 10.0, 0])
  difference() {
    union() {
      cylinder(h = 2.0, d1 = 15.2, d2 = 16.4);
      translate([0, 0, 2.0]) cylinder(h = 2.4, d1 = 16.4, d2 = 12.4);
      translate([0, 0, 4.4]) cylinder(h = 2.4, d1 = 12.4, d2 = 16.4);
      translate([0, 0, 6.8]) cylinder(h = 1.6, d1 = 16.4, d2 = 15.2);
    }
    translate([0, 0, -0.5])
      cylinder(h = 10.0, d = 4.6);
  }

  // 3. SG90 Dual-Groove Thread Capstan Drum with Extended Shaft Boss (at X = 24, Y = 10; 24 mm OD, 13.0 mm total height)
  translate([24.0, 10.0, 0])
  difference() {
    union() {
      // Lower extended servo shaft hub boss (Z = 0..4.0) so drum grooves align with idler & curtain rail
      cylinder(h = 4.0, d1 = 16.0, d2 = 23.0);
      translate([0, 0, 4.0]) {
        cylinder(h = 1.8, d1 = 23.0, d2 = 24.4);
        translate([0, 0, 1.8]) cylinder(h = 2.0, d1 = 24.4, d2 = 20.4);
        translate([0, 0, 3.8]) cylinder(h = 1.4, d = 23.6);
        translate([0, 0, 5.2]) cylinder(h = 2.0, d1 = 20.4, d2 = 24.4);
        translate([0, 0, 7.2]) cylinder(h = 1.8, d1 = 24.4, d2 = 23.0);
      }
    }
    // Center SG90 shaft hole + keyed top horn slot (uses clear_fit)
    translate([0, 0, -0.5])
      cylinder(h = 15.0, d = sg90_spline_d);
    translate([0, 0, 9.8])
      hull() {
        cylinder(h = 3.6, d = sg90_horn_hub_d);
        for (sx = [-1, 1])
          translate([sx * 9.5, 0, 0]) cylinder(h = 3.6, d = sg90_horn_tip_d);
      }
    // Thread anchor tie hole
    translate([0, 9.5, 3.5])
      cylinder(h = 11.0, d = 2.2);
  }
}

color(col_ink) prop_09_rail_and_pulley();
