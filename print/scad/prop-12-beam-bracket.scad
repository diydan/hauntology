// Hauntology Tabletop Print Kit — Prop #12: Rattle Prop (Lightweight Hollowed Timber Ceiling Beam Bracket)
// Colour: Leather (#6b4d33)
// Size: 128.6 W x 76.2 D x 32.0 H mm (~46% less filament: vaulted hollow beam wings & windowed ESP32 cradle)
// Hardware: Central SG90 tug-servo cradle, rear ESP32 DevKitC cradle, Y-axis bellmouth fairlead fin, M3 holes preserved
// Print orientation: Flat on Z = 0, zero supports (1 connected component).

include <_common.scad>

beam_w = 120.0;
beam_d = 36.0;
beam_h = 32.0;

module prop_12_beam_bracket() {
  difference() {
    union() {
      // 1. Hewn warped timber ceiling beam
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
      chamfer_box(42.0, beam_d - 4.0, beam_h, r = 2.8, ch_bot = 0.8, ch_top = 0.8);
      for (sx = [-1, 1]) {
        hull() {
          translate([sx * 22.5, 0, 13.0]) cube([3.0, beam_d - 8.0, 2.0], center = true);
          translate([sx * 20.0, 0, beam_h - 4.0]) cube([2.0, beam_d - 8.0, 2.0], center = true);
        }
      }

      // 3. Wrought-Iron Clamp Straps & Rivet Studs
      for (bx = [-33.0, 33.0]) {
        translate([bx, 0, 0])
          chamfer_box(5.4, beam_d + 1.8, 14.8, r = 0.8, ch_bot = 0.5, ch_top = 0.6);
        for (ry = [-11.0, 11.0]) {
          translate([bx, ry, 14.2])
            cylinder(h = 1.8, d1 = 3.0, d2 = 1.2, $fn = 4);
        }
      }

      // 4. Gothic Arched Corbel Thread Fairlead Fin aligned on SG90 shaft X = -5.5
      translate([-5.5, -19.0, 0])
        chamfer_box(10.0, 10.4, beam_h, r = 2.0, ch_bot = 0.8, ch_top = 0.8);
      hull() {
        translate([-5.5, -24.0, 0])    cylinder(h = 12.0, d = 3.4);
        translate([-5.5, -25.0, 18.0]) cylinder(h = 1.0, d = 2.8);
        translate([-5.5, -23.6, 22.0]) cylinder(h = 0.8, d = 1.8);
      }

      // 4b. Integrated Rear (+Y) ESP32-WROOM-32E DevKitC V4 Cradle flat on Z = 0 (with lightened open center floor!)
      translate([0, beam_d / 2 + 15.2, 0])
        rotate([0, 0, -90])
        difference() {
          esp32_devkitc_cradle(wall = 2.0, h = 12.6, z_pcb = 9.0);
          translate([0, 0, -0.5])
            linear_extrude(height = 4.0)
              rrect2d(18.0, 38.0, r = 3.0);
        }
    }

    // 4c. Vaulted Weight-Relief Pockets under Left & Right Timber Beam Wings (preserves solid Ø12 mm columns around X = +-44 M3 holes!)
    for (sx = [-1, 1]) {
      difference() {
        hull() {
          translate([sx * 39.5, 0, -0.1])
            linear_extrude(height = 4.5)
              rrect2d(35.0, 29.6, r = 2.2);
          translate([sx * 39.5, 0, 11.4])
            linear_extrude(height = 0.3)
              rrect2d(21.0, 15.6, r = 1.4);
        }
        translate([sx * 44.0, 0, -1.0])
          cylinder(h = 16.0, d = 12.2);
      }
      // Front & rear underside pockets inside central boss beneath SG90 pocket
      hull() {
        translate([0, sx * 10.5, -0.1])
          linear_extrude(height = 4.0)
            rrect2d(34.0, 8.0, r = 1.5);
        translate([0, sx * 10.5, 7.2])
          linear_extrude(height = 0.3)
            rrect2d(27.0, 1.8, r = 0.8);
      }
    }

    // 5. Shallow Jagged Hewn Wood Grain V-Grooves
    for (zg = [4.0, 9.8]) {
      translate([0, -beam_d / 2 - 0.1, zg])
        rotate([45, 0, 0])
          cube([beam_w - 8, 0.95, 0.95], center = true);
    }

    // 6. Central SG90 Servo Pocket + Open Rear (+Y) Cable Exit
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
    translate([-5.5, 16.0, beam_h - 11.5])
      cube([8.2, 22.0, 24.0], center = true);

    // 7. Flared Y-Axis Bellmouth Thread Guide Fairlead Bore (X = -5.5, Y = -19.0, Z = 25.5)
    translate([-5.5, -19.0, 25.5])
      rotate([90, 0, 0]) {
        hull() {
          cylinder(h = 14.0, d = 3.2, center = true);
          translate([0, 1.2, 0]) cylinder(h = 14.0, d = 0.8, center = true);
        }
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
