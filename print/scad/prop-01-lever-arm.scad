// Hauntology Tabletop Print Kit — Prop #1: Ghost in the Box (Dual-Stage Servo Lever Arm)
// Colour: Ink (#0b0d10) or Leather (#6b4d33)
// Size: 74 L x 26 W x 6.0 H mm
// Mechanism: 0-30 deg cam nose cracks/lifts lid; 20-90 deg slotted fork lifts ghost slider pin
// Print orientation: Flat on base (Z = 0), zero supports.

include <_common.scad>

module prop_01_lever_arm() {
  difference() {
    union() {
      // 1. Servo hub boss at origin
      cylinder(h = 6.0, d = 16.0);

      // 2. Stage 1 Lid-Lift Cam Nose (angled at +25 deg, radius 32 mm)
      hull() {
        cylinder(h = 5.0, d = 14.0);
        translate([18.0, 14.0, 0])
          cylinder(h = 5.0, d = 10.0);
      }

      // 3. Stage 2 Ghost-Lift Fork Arm (extending to X = 60 mm with slotted fork for ghost pin)
      hull() {
        cylinder(h = 4.5, d = 13.0);
        translate([42.0, 0, 0])
          cylinder(h = 4.5, d = 11.0);
      }
      // Fork prongs from X = 40 to X = 64
      for (sy = [-1, 1]) {
        hull() {
          translate([40.0, sy * 3.4, 0]) cylinder(h = 4.5, d = 3.6);
          translate([62.0, sy * 3.6, 0]) cylinder(h = 4.5, d = 3.4);
        }
      }
    }

    // 4. SG90 Horn Pocket on Top Face (0.3 mm clearance for standard single servo arm + M2 screw holes)
    translate([0, 0, -0.1])
      cylinder(h = 6.5, d = 5.2);
    translate([0, 0, 3.6])
      hull() {
        cylinder(h = 3.0, d = 7.6);
        translate([16.0, 0, 0]) cylinder(h = 3.0, d = 4.6);
      }
    // M2 horn attachment holes
    for (hx = [7.0, 13.0]) {
      translate([hx, 0, -0.1])
        cylinder(h = 7.0, d = 1.8);
    }
  }
}

color(col_ink) prop_01_lever_arm();
