// Hauntology Tabletop Print Kit — Prop #1: Ghost in the Box (Dual-Stage Servo Lever Arm)
// Colour: Ink (#0b0d10) or Leather (#6b4d33)
// Size: 82 L x 55 W x 11.5 H mm
// Mechanism: Driven by -Y SG90 shaft in XZ plane (arm at Y = -11.0..-6.5; stepped boss reaches Y = +0.5
//            to engage the SG90 horn outside the ghost track). Stage 1 cam nose (+54 deg in XZ -> -54 deg in STL)
//            cracks lid ramp; Stage 2 slotted fork (4.4 mm slot for 3.8 mm ghost pin) lifts ghost +35 mm!
// Print orientation: Flat on base (Z = 0), zero supports.

include <_common.scad>

module prop_01_lever_arm() {
  difference() {
    union() {
      // 1. Stepped servo hub & horn boss (Z = 0..11.5 extends +Y toward SG90 spline outside ghost track X <= -40.7)
      hull() {
        cylinder(h = 11.5, d = 15.6);
        translate([-14.5, 0, 0]) cylinder(h = 11.5, d = 7.6);
      }

      // 2. Stage 1 Lid-Lift Cam Nose (at -54 deg, R = 52 mm -> becomes +54 deg upward in XZ when mounted via Rx(-90))
      hull() {
        cylinder(h = 4.5, d = 14.0);
        translate([52.0 * cos(-54), 52.0 * sin(-54), 0])
          cylinder(h = 4.5, d = 9.0);
      }

      // 3. Stage 2 Ghost-Lift Fork Arm (R = 0..64 mm; prongs from R = 40 to 64 mm with 4.4 mm internal slot for 3.8 mm pin)
      hull() {
        cylinder(h = 4.5, d = 13.0);
        translate([38.0, 0, 0])
          cylinder(h = 4.5, d = 11.6);
      }
      for (sy = [-1, 1]) {
        hull() {
          translate([40.0, sy * 4.0, 0]) cylinder(h = 4.5, d = 3.6);
          translate([63.0, sy * 4.0, 0]) cylinder(h = 4.5, d = 3.4);
        }
      }
    }

    // 4. SG90 Horn Pocket on Boss Top Face (Z = 9.0..11.5; pointed toward -X away from left U-track)
    translate([0, 0, -0.1])
      cylinder(h = 12.0, d = sg90_spline_d);
    translate([0, 0, 9.0])
      hull() {
        cylinder(h = 3.0, d = sg90_horn_hub_d);
        translate([-14.5, 0, 0]) cylinder(h = 3.0, d = sg90_horn_tip_d);
      }
    // M2 horn attachment holes
    for (hx = [-6.5, -12.5]) {
      translate([hx, 0, -0.1])
        cylinder(h = 12.0, d = 1.8);
    }
  }
}

color(col_ink) prop_01_lever_arm();
