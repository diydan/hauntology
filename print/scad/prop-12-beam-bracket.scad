// Hauntology Tabletop Print Kit — Prop #12: Rattle Prop (Ceiling Beam Servo Bracket)
// Colour: Leather (#6b4d33)
// Size: 120 W x 44 D x 32 H mm
// Hardware: Central SG90 tug-servo cradle, projecting front thread guide eyelet fin, M3 mounting holes
// Print orientation: Flat on back/top face (Z = 0), zero supports (1 connected component).

include <_common.scad>

beam_w = 120.0;
beam_d = 36.0;
beam_h = 32.0;

module prop_12_beam_bracket() {
  difference() {
    union() {
      // 1. Hewn timber ceiling beam bar (120 x 36 x 14 mm base beam)
      chamfer_box(beam_w, beam_d, 14.0, r = 2.8, ch_bot = 0.8, ch_top = 0.8);

      // 2. Central SG90 Tug-Servo Housing Boss (Z = 0..32, Y = -17..+17)
      chamfer_box(46.0, beam_d - 2.0, beam_h, r = 3.0, ch_bot = 0.8, ch_top = 0.8);

      // 3. Projecting Front Thread Suspension Guide Fin (X = -11..-5, Y = -24..-14, Z = 0..32)
      translate([-8.0, -19.0, 0])
        chamfer_box(6.0, 10.0, beam_h, r = 1.6, ch_bot = 0.8, ch_top = 0.6);
    }

    // 4. Timber grain V-grooves along back and sides of beam
    for (zg = [4.5, 9.5]) {
      translate([0, beam_d / 2 + 0.1, zg])
        rotate([45, 0, 0])
          cube([beam_w - 10, 1.2, 1.2], center = true);
    }

    // 5. Central SG90 Servo Pocket (body + mounting ears + M2 pilot holes + wire slot)
    translate([0, 2.0, beam_h - 11.0])
      cube([sg90_body_w, sg90_body_d, 24.0], center = true);
    translate([0, 2.0, beam_h - 1.5])
      cube([sg90_flange_w, sg90_body_d, 3.6], center = true);
    for (sx = [-1, 1]) {
      translate([sx * sg90_hole_span / 2, 2.0, beam_h - 12.0])
        cylinder(h = 11.0, d = sg90_m2_pilot_d);
    }
    translate([16.0, 2.0, beam_h - 6.0])
      cube([16.0, sg90_cable_w, 12.0], center = true);

    // 6. Through Thread Guide Eyelet Bore in the projecting front fin (X = -14..-2, Y = -20.5, Z = 25.0)
    translate([-8.0, -20.5, 25.0])
      rotate([0, 90, 0])
        cylinder(h = 12.0, d = 2.8, center = true);

    // 7. Two M3 Mounting Countersunk Screw Holes at Left & Right Ends of Beam
    for (sx = [-44.0, 44.0]) {
      translate([sx, 0, -0.5])
        cylinder(h = 16.0, d = 3.4);
      translate([sx, 0, 10.5])
        cylinder(h = 4.0, d1 = 3.4, d2 = 6.8);
    }
  }
}

color(col_leather) prop_12_beam_bracket();
