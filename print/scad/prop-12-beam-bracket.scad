// Hauntology Tabletop Print Kit — Prop #12: Rattle Prop (Haunted Timber Ceiling Beam Bracket)
// Colour: Leather (#6b4d33)
// Size: 126 W x 46 D x 32 H mm
// Hardware: Central SG90 tug-servo cradle, projecting gothic corbel thread eyelet fin, M3 holes preserved
// Print orientation: Flat on Z = 0, zero supports (1 connected component).

include <_common.scad>

beam_w = 120.0;
beam_d = 36.0;
beam_h = 32.0;

module prop_12_beam_bracket() {
  difference() {
    union() {
      // 1. Hewn warped timber ceiling beam (with tapered adze-split ends X = +-55..63)
      chamfer_box(beam_w, beam_d, 14.0, r = 2.6, ch_bot = 0.8, ch_top = 0.8);
      for (sx = [-1, 1]) {
        hull() {
          translate([sx * (beam_w / 2 - 4.0), 0, 0])
            chamfer_box(8.0, beam_d - 2.0, 14.0, r = 2.0, ch_bot = 0.8, ch_top = 0.8);
          translate([sx * (beam_w / 2 + 2.8), sx * 1.4, 0])
            chamfer_box(3.0, beam_d - 10.0, 10.5, r = 1.2, ch_bot = 0.6, ch_top = 0.8);
        }
      }

      // 2. Central SG90 Tug-Servo Housing Boss with Tapered Gothic Side Buttresses
      chamfer_box(46.0, beam_d - 2.0, beam_h, r = 2.8, ch_bot = 0.8, ch_top = 0.8);
      for (sx = [-1, 1]) {
        hull() {
          translate([sx * 24.5, 0, 13.0]) cube([3.0, beam_d - 6.0, 2.0], center = true);
          translate([sx * 22.0, 0, beam_h - 4.0]) cube([2.0, beam_d - 6.0, 2.0], center = true);
        }
      }

      // 3. Wrought-Iron Clamp Straps & Rivet Studs (climbing cleanly from Z = 0, zero overhangs!)
      for (bx = [-33.0, 33.0]) {
        translate([bx, 0, 0])
          chamfer_box(5.8, beam_d + 2.0, 14.8, r = 0.8, ch_bot = 0.5, ch_top = 0.6);
        // Pyramid iron rivet studs embedded deeply into top of straps
        for (ry = [-11.0, 11.0]) {
          translate([bx, ry, 14.2])
            cylinder(h = 1.8, d1 = 3.0, d2 = 1.2, $fn = 4);
        }
      }

      // 4. Gothic Arched Corbel Thread Fairlead Fin aligned on SG90 shaft X = -5.5 (Y-axis bellmouth eyelet = zero sideways kink!)
      translate([-5.5, -19.0, 0])
        chamfer_box(10.0, 10.4, beam_h, r = 2.0, ch_bot = 0.8, ch_top = 0.8);
      // Pointed gothic corbel rib accent supporting the fairlead boss from below (Z = 0..22.5, clear of Z = 25.5 bellmouth!)
      hull() {
        translate([-5.5, -24.0, 0])    cylinder(h = 12.0, d = 3.4);
        translate([-5.5, -25.0, 18.0]) cylinder(h = 1.0, d = 2.8);
        translate([-5.5, -23.6, 22.0]) cylinder(h = 0.8, d = 1.8);
      }

      // 4b. Integrated Rear (+Y) ESP32-WROOM-32E DevKitC V4 Cradle flat on Z = 0 (USB-C exits +X; zero supports!)
      translate([0, beam_d / 2 + 15.2, 0])
        rotate([0, 0, -90])
          esp32_devkitc_cradle(wall = 2.4, h = 12.6, z_pcb = 9.0);
    }

    // 5. Jagged Hewn Wood Grain & Plank Split V-Grooves along front & top of beam
    for (zg = [4.0, 9.8]) {
      translate([0, -beam_d / 2 - 0.1, zg])
        rotate([45, 0, 0])
          cube([beam_w - 8, 1.1, 1.1], center = true);
    }
    for (sx = [-1, 1]) {
      translate([sx * 48.0, 6.0, 14.0])
        rotate([0, 0, sx * 7])
          rotate([45, 0, 0])
            cube([22.0, 1.0, 1.0], center = true);
    }

    // 6. Central SG90 Servo Pocket (sunk to Z = 25.5 ear floor with wire-grommet relief + open rear +Y cable exit to ESP32 cradle!)
    translate([0, 2.0, beam_h - 12.0])
      cube([sg90_body_w, sg90_body_d, 25.0], center = true);
    translate([-8.5, 2.0, beam_h - 12.0])
      cube([8.0, sg90_cable_w + 1.4, 25.0], center = true);
    translate([0, 2.0, beam_h - 3.25])
      cube([sg90_flange_w, sg90_body_d, 6.6], center = true);
    for (sx = [-1, 1]) {
      translate([sx * sg90_hole_span / 2, 2.0, beam_h - 15.5])
        cylinder(h = 10.0, d = sg90_m2_pilot_d);
    }
    // Full-depth open rear (+Y) SG90 wire exit channel straight to the rear ESP32 cradle (no blind +X thin-fin cut!)
    translate([-5.5, 16.0, beam_h - 11.5])
      cube([8.2, 22.0, 24.0], center = true);

    // 7. Flared Y-Axis Bellmouth Thread Guide Fairlead Bore in the projecting front fin (X = -5.5, Y = -19.0, Z = 25.5)
    translate([-5.5, -19.0, 25.5])
      rotate([90, 0, 0]) {
        hull() {
          cylinder(h = 14.0, d = 3.2, center = true);
          translate([0, 1.2, 0]) cylinder(h = 14.0, d = 0.8, center = true);
        }
        // Smooth 45-deg entry & exit bellmouth cones so nylon line glides without sharp-edge chafing
        translate([0, 0, -5.6]) cylinder(h = 2.2, d1 = 6.6, d2 = 3.2);
        translate([0, 0,  3.4]) cylinder(h = 2.2, d1 = 3.2, d2 = 6.6);
      }

    // 8. Two M3 Mounting Countersunk Screw Holes at Left & Right Ends of Beam
    for (sx = [-44.0, 44.0]) {
      translate([sx, 0, -0.5])
        cylinder(h = 16.0, d = 3.4);
      translate([sx, 0, 10.5])
        cylinder(h = 4.0, d1 = 3.4, d2 = 6.8);
    }
  }
}

color(col_leather) prop_12_beam_bracket();
