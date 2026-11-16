// Hauntology Tabletop Print Kit — Prop #9: Curtain Reveal (Slider Rail, Idler Pulley & Servo Drum)
// Colour: Ink (#0b0d10, matte black)
// Size: 158 W x 38 D x 10 H mm (arranged on one print bed)
// Mechanism: 158 mm twin-track curtain rail + 16 mm grooved idler pulley (4.6 mm bore) + 17.6 mm SG90 capstan drum
// Print orientation: Flat on bed (Z = 0). No supports: every downward-facing slope is <= 45 deg from vertical.

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

  // 3. SG90 Capstan Drum (at X = 24, Y = 10; 17.6 mm max OD, 13.0 mm tall) sitting on the servo's round boss with its horn inside.
  //    The thread plane is the middle of the two grooves, 8.75 mm above the drum's base; the frame puts the base 11.45 mm up
  //    (ears at 2.2, case top 8.7, boss top 12.7, minus the 1.25 mm boss recess below), so the middle lands on thread_z = 20.2.
  //    Groove floors are r 7.8 (180 deg of servo turn pulls 24.5 mm of thread); the flanges are r 8.8. One turned profile, every
  //    downward-facing slope is <= 45 deg from vertical, so it prints base-down with no supports.
  translate([24.0, 10.0, 0])
  difference() {
    rotate_extrude()
      polygon([
        [0, 0], [8.0, 0], [8.8, 2.0], [8.8, 5.65],       // base, lower flange
        [7.8, 6.65], [7.8, 7.65], [8.8, 8.65],           // groove 1 (floor at 7.15 mm)
        [8.8, 8.85],                                     // ridge between the grooves
        [7.8, 9.85], [7.8, 10.85], [8.8, 11.85],         // groove 2 (floor at 10.35 mm)
        [8.8, 12.4], [8.0, 13.0], [0, 13.0]              // upper flange, top
      ]);
    // Boss recess, open at the bed face: the servo's 11.8 mm round output boss stands 1.25 mm into the drum
    translate([0, 0, -0.1])
      cylinder(h = 1.35, d = sg90_boss_d);
    // Horn pocket above it, open into the recess: a stock horn trimmed to a bar 13 mm long (hub in the middle, 4 mm wide) seats here
    translate([0, 0, 1.25])
      hull() {
        cylinder(h = 4.4, d = sg90_horn_hub_d);
        for (sx = [-1, 1])
          translate([sx * 4.5, 0, 0]) cylinder(h = 4.4, d = sg90_horn_tip_d);
      }
    // Horn screw and screwdriver hole straight up the axis
    translate([0, 0, 5.0])
      cylinder(h = 9.0, d = 3.2);
    // Thread anchor: a 1.6 mm hole across the ridge, to knot the thread's end through
    translate([0, 0, 8.75])
      rotate([0, 90, 0])
        cylinder(h = 20.0, d = 1.6, center = true);
  }
}

color(col_ink) prop_09_rail_and_pulley();
