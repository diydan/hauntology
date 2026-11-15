// Hauntology Tabletop Print Kit — Relic r2: Spirit Medium's Wax Hand
// Colour: Bone (#e9e4d8)
// Height: ~53 mm on 33 mm stepped token base
// Sticker details: Recessed oval palm medallion / fortune-line sticker pocket (12 x 15 mm)
// Print orientation: Flat on pedestal base (Z = 0), zero supports (all angles <= 45 deg).

include <_common.scad>

// Helper for an articulated, tapered finger from base -> mid -> tip
module wax_finger(p0, r0, p1, r1, p2, r2, p3, r3) {
  hull() { translate(p0) sphere(r = r0); translate(p1) sphere(r = r1); }
  hull() { translate(p1) sphere(r = r1); translate(p2) sphere(r = r2); }
  hull() { translate(p2) sphere(r = r2); translate(p3) sphere(r = r3); }
}

module relic_wax_hand() {
  // 1. Stepped circular token pedestal base (z = 0..6.5)
  relic_pedestal_base(h = 6.5);

  // 2. Fluted Victorian wax-catcher saucer & melted wax drips around wrist (z = 6.5..15.5)
  translate([0, 0, 6.5]) {
    // Saucer dish
    cylinder(h = 2.8, d1 = 25, d2 = 28);
    translate([0, 0, 2.8])
      cylinder(h = 1.6, d1 = 28, d2 = 23);

    // Sculpted melted wax drip lobes around the wrist column
    for (i = [0 : 7]) {
      ang = i * 45 + 15;
      drip_h = 5.5 + (i % 3) * 1.8;
      rotate([0, 0, ang])
        hull() {
          translate([8.2, 0, 2.0]) sphere(r = 2.4);
          translate([6.8, 0, 2.0 + drip_h]) sphere(r = 1.8);
          translate([0, 0, 2.0 + drip_h]) sphere(r = 3.0);
        }
    }

    // Wrist column (z = 3.0..11.5)
    hull() {
      translate([0, 0, 2.5]) scale([1.15, 0.88, 1]) cylinder(h = 1.0, d = 17.0);
      translate([0, 0, 10.0]) scale([1.2, 0.82, 1]) cylinder(h = 1.0, d = 15.6);
    }
  }

  // 3. Sculpted Anatomical Palm & Five Fingers (z = 17..53)
  translate([0, 0, 17.0])
  difference() {
    union() {
      // Lower palm heel & thenar/hypothenar mounds
      hull() {
        translate([0, 0, 0]) scale([1.2, 0.82, 1]) sphere(r = 7.6);
        translate([-3.8, -0.4, 7.5]) scale([1.0, 0.78, 1.1]) sphere(r = 6.8);
        translate([ 3.8, -0.2, 8.0]) scale([1.0, 0.78, 1.1]) sphere(r = 6.6);
        translate([-5.2,  0.2, 14.5]) sphere(r = 4.6);
        translate([ 5.4,  0.2, 14.5]) sphere(r = 4.4);
        translate([ 0.0,  0.4, 15.5]) sphere(r = 5.2);
      }

      // Thumb (left side, gracefully poised upward at ~38 deg)
      wax_finger(
        [-5.2, -1.2, 6.2],  3.8,
        [-9.2, -2.0, 11.5], 3.1,
        [-11.2, -2.2, 16.5], 2.5,
        [-10.4, -1.6, 21.0], 1.9
      );

      // Index finger (tall, slightly beckoning forward)
      wax_finger(
        [-5.2, 0.2, 14.8], 3.1,
        [-6.2, -0.4, 22.5], 2.6,
        [-6.0, -1.6, 28.8], 2.2,
        [-5.4, -2.6, 33.8], 1.7
      );

      // Middle finger (tallest, reaching Z = 53 mm total)
      wax_finger(
        [-1.6, 0.5, 15.8], 3.2,
        [-1.8, 0.1, 24.2], 2.7,
        [-1.7, -0.8, 30.8], 2.3,
        [-1.5, -1.6, 35.8], 1.75
      );

      // Ring finger (slightly curled inward for lifelike séance pose)
      wax_finger(
        [ 2.0, 0.4, 15.2], 3.0,
        [ 2.5, -0.2, 23.0], 2.5,
        [ 2.3, -1.5, 29.0], 2.1,
        [ 1.8, -2.6, 33.4], 1.65
      );

      // Little finger (pinky, poised outward)
      wax_finger(
        [ 5.4, 0.1, 14.0], 2.7,
        [ 6.6, -0.4, 20.2], 2.2,
        [ 6.8, -1.4, 25.0], 1.85,
        [ 6.4, -2.2, 28.8], 1.45
      );

      // Raised oval medallion bezel on front of palm (-Y face) for the palm sticker
      translate([0, -5.2, 8.2])
        rotate([86, 0, 0])
          cylinder(h = 1.6, d1 = 14.2, d2 = 13.2);
    }

    // Recessed 0.4 mm circular/oval sticker pocket on the palm medallion (11 mm dia)
    translate([0, -6.5, 8.3])
      rotate([86, 0, 0])
        cylinder(h = sticker_depth + 0.6, d = 11.2);
  }
}

color(col_bone) relic_wax_hand();
