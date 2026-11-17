// Hauntology Tabletop Print Kit — Prop #15: Dual-Purpose Relic & Numbered-Clue Puzzle Lockbox (Chest Body)
// Colour: Leather / Wood Brown (#6b4d33)
// Size: ~141 W x 111 D x 55 H mm (~62-75 g PLA — 80% lighter than old vault + keypad + tray, yet holds ALL 6 Relics,
//       ALL 6 QR Tokens in a 1..6 dispenser rack, AND 6 stepped numbered paper clue-slip slots!)
// Mechanism:
//   - Hidden 44-deg vaulted underside ESP32 bay + rear USB-C port (zero exposed PCB or wires inside the box!).
//   - Enclosed front-center SG90 rotary latch shroud: pops open via Wi-Fi when a player solves a phone Lock.
//   - Push-to-relatch: front-rim 6.5 mm switch pocket re-locks the servo automatically when the player closes the lid.
// Print orientation: Flat on chest base (Z = 0), zero supports (1 connected component).

include <_common.scad>

vault_w = 138.0;
vault_d = 102.0;
vault_h = 52.0;
v_wall  = 2.2;

module keeper_peg(px, py, pz) {
  translate([px, py, pz - 0.1]) {
    cylinder(h = 2.4, d = relic_peg_d - 0.1);
    translate([0, 0, 2.4])
      cylinder(h = 0.5, d1 = relic_peg_d - 0.1, d2 = relic_peg_d - 1.1);
  }
}

module prop_15_vault_chest() {
  difference() {
    union() {
      // 1. Dual-purpose gothic casket shell + slim stepped base plinth
      chamfer_box(vault_w, vault_d, vault_h, r = 3.4, ch_bot = 0.8, ch_top = 0.5);
      chamfer_box(vault_w + 2.8, vault_d + 2.8, 4.4, r = 3.8, ch_bot = 0.8, ch_top = 0.9);

      // 2. Tapered Gothic Coffin Corner Buttresses
      for (sx = [-1, 1], sy = [-1, 1]) {
        hull() {
          translate([sx * (vault_w / 2 - 1.8), sy * (vault_d / 2 - 1.8), 0])
            chamfer_box(11.4, 11.4, 4.6, r = 2.0, ch_bot = 0.8, ch_top = 0.4);
          translate([sx * (vault_w / 2 - 3.2), sy * (vault_d / 2 - 3.2), vault_h - 5.2])
            chamfer_box(8.8, 8.8, 5.0, r = 1.6, ch_bot = 0.2, ch_top = 0.5);
        }
      }

      // Wrought-iron vertical front & side strap pilasters
      for (fx = [-42.0, 42.0]) {
        translate([fx, -vault_d / 2 + 0.4, 0])
          chamfer_box(4.6, 2.4, vault_h - 2.4, r = 0.8, ch_bot = 0.5, ch_top = 0.5);
      }
      for (sx = [-1, 1], sy_off = [-20.0, 20.0]) {
        translate([sx * (vault_w / 2 - 0.4), sy_off, 0])
          chamfer_box(2.4, 4.6, vault_h - 2.4, r = 0.8, ch_bot = 0.5, ch_top = 0.5);
      }

      // 3. Rear twin spring-hinge knuckles (X = -46, +46; Y = vault_d/2 + 5.6 = +56.6, Z = vault_h - 1.0 = 51.0 mm)
      for (hx = [-46.0, 46.0]) {
        hull() {
          translate([hx, vault_d / 2 + 5.6, vault_h - 1.0])
            rotate([0, 90, 0])
              cylinder(h = 15.0, d = 8.2, center = true);
          translate([hx, vault_d / 2 - 1.2, vault_h - 15.0])
            cube([15.0, 2.4, 2.0], center = true);
        }
      }

      // Internal front backing pad behind escutcheon recess
      hull() {
        translate([0, -vault_d / 2 + 2.0, vault_h - 14.0]) cube([39.0, 2.4, 26.0], center = true);
        translate([0, -vault_d / 2 + 1.2, vault_h - 30.0]) cube([39.0, 0.8, 2.0], center = true);
      }
    }

    // 4. Thin-Shell Interior Chamber (2.2 mm walls & 1.8 mm left/right well floors, widening top rim to 3.4 mm at Z = 47..52)
    difference() {
      hull() {
        translate([0, 0, 1.8])
          linear_extrude(height = 45.2)
            rrect2d(vault_w - 2 * v_wall, vault_d - 2 * v_wall, r = 2.2);
        translate([0, 0, 48.6])
          linear_extrude(height = 5.0)
            rrect2d(vault_w - 6.8, vault_d - 6.8, r = 2.0);
      }
      // Raised central gothic spine housing the hidden underside ESP32 vault (X = -16.4..+16.4, Z = 0..19.5 -> flat top deck at Z = 19.5!)
      chamfer_box(32.8, vault_d - 3.6, 19.5, r = 1.6, ch_bot = 0, ch_top = 0.6);
    }

    // 4b. Underside Hidden 44.5-deg Vaulted ESP32-DevKitC V4 Bay (28.8 mm self-seating V-cradle at Z = 0..5.0, 3.6 mm ridge at Z = 17.8!)
    translate([0, 4.0, -0.1])
      hull() {
        linear_extrude(height = 5.1) rrect2d(28.8, 86.0, r = 2.0);
        translate([0, 0, 17.9]) linear_extrude(height = 0.3) rrect2d(3.6, 62.0, r = 1.0);
      }
    for (sx = [-1, 1], sy = [-1, 1]) {
      translate([sx * esp32_hole_d / 2, 6.0 + sy * esp32_hole_w / 2, 6.0])
        cylinder(h = 9.5, d = sg90_m2_pilot_d);
    }
    // Rear (+Y) 45-deg Gabled USB-C Port into the hidden underside ESP32 bay
    translate([0, vault_d / 2, 3.8])
      rotate([90, 0, 0])
        hull() {
          cube([esp32_usb_w + 0.8, esp32_usb_h + 0.4, 24.0], center = true);
          translate([0, (esp32_usb_h + 0.4) / 2 + 5.6, 0])
            cylinder(h = 24.0, d = 1.6, center = true);
        }

    // 4c. Framed Floor Lightener Windows in Left & Right Wells (clear of all Relic keeper pegs!)
    for (win = [[-42.0, 5.5, 22.0, 9.0], [-42.0, -21.8, 22.0, 8.0], [42.0, 26.0, 26.0, 28.0], [43.0, -22.0, 26.0, 28.0]]) {
      translate([win[0], win[1], -0.5])
        linear_extrude(height = 3.0)
          rrect2d(win[2], win[3], r = 3.0);
    }

    // 5. Front Clasp Escutcheon Recess & Latch Bolt Window (exact match to prop-15-vault-clasp.stl!)
    translate([0, -vault_d / 2 + 0.5, vault_h - 14.0])
      cube([36.6, 2.0, 24.6], center = true);
    translate([2.25, -vault_d / 2, vault_h - 7.5])
      cube([32.5, 10.0, 18.0], center = true);

    // 5b. Front-Rim Push-to-Relatch 6x6 mm Tactile Switch Pocket (X = -28, Y = -vault_d/2 + 1.7) + concealed wire bore to underside bay!
    translate([-28.0, -vault_d / 2 + 1.7, vault_h - 1.8])
      cube([6.5, 6.5, 4.0], center = true);
    hull() {
      translate([-28.0, -vault_d / 2 + 2.2, vault_h - 5.0]) cylinder(h = 4.0, d = 3.0);
      translate([-13.0, -34.0, 8.0]) cylinder(h = 4.0, d = 3.0);
    }

    // 6. Shallow Crooked Haunted Timber Plank V-grooves
    for (idx = [0 : 1]) {
      zp = 16 + idx * 18;
      tilt = (idx == 0) ? 2.0 : -1.8;
      translate([0, vault_d / 2 + 0.1, zp])
        rotate([0, tilt, 0])
          rotate([45, 0, 0])
            cube([vault_w - 20, 1.0, 1.0], center = true);
      translate([0, -vault_d / 2 - 0.1, zp])
        rotate([0, tilt, 0])
          rotate([45, 0, 0])
            cube([68.0, 1.0, 1.0], center = true);
    }

    // 7. Rear Hinge Pin Bore (3.5 mm teardropped ID at Y = +56.6, Z = 51.0) + central torsion-spring leg notch
    for (hx = [-46.0, 46.0]) {
      hull() {
        translate([hx, vault_d / 2 + 5.6, vault_h - 1.0])
          rotate([0, 90, 0])
            cylinder(h = 18.0, d = 3.5, center = true);
        translate([hx, vault_d / 2 + 5.6, vault_h + 0.1])
          rotate([0, 90, 0])
            cylinder(h = 18.0, d = 0.8, center = true);
      }
    }
    translate([0, vault_d / 2 + 0.2, vault_h - 4.5])
      cube([5.0, 1.6, 9.5], center = true);
  }

  // 8. Shrouded Front-Center SG90 Latch Servo Pedestal sitting cleanly on the Z = 19.5 center spine (cradle top at Z = 39.0, spline X = 0!)
  translate([5.5, -vault_d / 2 + v_wall, 19.2])
  difference() {
    translate([0, 8.1, 0])
      chamfer_box(sg90_flange_w + 4.4, sg90_body_d + 3.5, 19.8, r = 2.0, ch_bot = 0, ch_top = 0.6);
    translate([0, 8.1, 10.8])
      cube([sg90_body_w, sg90_body_d, 20.0], center = true);
    translate([0, 8.1, 18.3])
      cube([sg90_flange_w, sg90_body_d, 3.6], center = true);
    for (sx = [-1, 1]) {
      translate([sx * sg90_hole_span / 2, 8.1, 7.3])
        cylinder(h = 13.0, d = sg90_m2_pilot_d);
    }
    translate([-8.0, 8.1, 1.0])
      cube([7.0, sg90_cable_w + 1.6, 12.0], center = true);
  }

  // 9. Built-In Dual-Purpose Organizer Geometry:
  // a) Six Integrated Ø5.5 mm Relic Keeper Pegs:
  //    Left deep well (Z = 1.8, 66.7 mm headroom!): r1 Music box [-42.0, +21.5] (rot +90), r2 Wax hand [-43.0, -9.5], r3 Locket [-42.0, -34.0]
  keeper_peg(-42.0,  21.5, 1.8);
  keeper_peg(-43.0,  -9.5, 1.8);
  keeper_peg(-42.0, -34.0, 1.8);
  //    Center spine deck (Z = 19.5, 49.0 mm headroom!): r6 Bell [0.0, +33.0], r4 Planchette [0.0, +7.0], r5 Silver key [-2.0, -14.0]
  keeper_peg(  0.0,  33.0, 19.5);
  keeper_peg(  0.0,   7.0, 19.5);
  keeper_peg( -2.0, -14.0, 19.5);

  // b) Back-Right 6-Slot Upright QR Token Dispenser Rack (X = +18..+66, Y = +5..+45):
  //    Holds all 6 sculpted 43.2 x 43.2 x 6.2 mm Relic Stands upright in sequential order (#1 front -> #6 back)!
  for (side_x = [18.0, 65.8]) {
    for (i = [0 : 6]) {
      ry = 5.4 + i * 6.6;
      translate([side_x, ry, 1.6])
        chamfer_box(3.8, 1.3, 18.2, r = 0.4, ch_bot = 0, ch_top = 0.4);
    }
  }

  // c) Front-Right 6-Slot Stepped Numbered Paper Clue-Slip / Envelope Rack (X = +25..+66, Y = -46..+1):
  //    6 angled gothic index slots (#1 nearest front -> #6 nearest back, with 1..6 tally pips along the right rail!)
  //    so each player who unlocks the box pulls ONLY their numbered slip (or frontmost slip) and closes the lid to re-lock!
  for (i = [0 : 6]) {
    sy = -44.2 + i * 6.8;
    // Left & right card-file guide fins (open middle for easy pinch-grip on paper slips!)
    for (fx = [26.5, 63.5]) {
      translate([fx, sy, 1.8])
        hull() {
          cube([6.0, 1.3, 1.0], center = true);
          translate([0, 1.4, 15.0 + i * 1.2]) cube([5.2, 1.1, 1.0], center = true);
        }
    }
    // Raised Roman/tally index pips (1..6) on the inner right shelf so slot numbers 1..6 are tactile & unmistakable!
    if (i < 6) {
      for (pip = [0 : i]) {
        translate([67.0, sy + 3.7, 20.0 + pip * 2.6])
          rotate([0, -90, 0])
            cylinder(h = 1.1, d1 = 2.4, d2 = 0.4, $fn = 4);
      }
    }
  }
}

color(col_leather) prop_15_vault_chest();
