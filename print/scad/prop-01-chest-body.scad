// Hauntology Tabletop Print Kit — Master 3-in-1 Haunted Chest Body (#1 Ghost + #15 Puzzle Lockbox + #20 Thin-Wall Rear Cut-Wires Bay)
// Colour: Leather / Wood Brown (#6b4d33)
// Size: 175.6 W x 125.0 D x 73.0 H mm (fits 180x180 mm bed; ~50 g lighter with wide-open bottom soldering bay!)
// Compartments:
//   - Left Bay (#1 Ghost in the Box, X = -83.8..+23.8): self-closing lid, horizontal SG90 lever pedestal, ghost U-tracks & return post.
//   - Right Bay (#15 Puzzle Lockbox, X = +26.0..+83.8): spring-latched lid, shrouded SG90 rotary latch, push-to-relatch rim switch,
//     and 6 stepped numbered slots (1..6 with tactile pips) holding folded paper clue slips AND/OR all 6 upright QR Relic Stands.
//   - Back Face (#20 Cut Wires Fuse-Box, +Y = +56.0 thin 4.8 mm wall):
//       * 5 upper Ø14.3 mm terminal socket bores at 25.5 mm pitch (Z = 45.0) + 1..5 sticker pockets (Z = 56.2)
//       * 5 built-in Z = 8.8 mm bottom cable-knot grommets (23.4 mm clear vertical wire space, 0 extra anchor blocks to print!)
//       * 16.2 mm SET button (Z = 26.5) + 5.2 mm PAIRED LED (Z = 45.0) at X = +64.5
//       * Wide 23.4..28.6 mm OPEN-BOTTOM VAULTED SOLDERING & ESP32 BAY (Y = +22.6..+51.2) — full finger, wrench & soldering-iron access
//         straight from underneath while 100% hidden behind a solid 2.4 mm internal bulkhead!
// Print orientation: Flat on chest base (Z = 0), 100% support-free (1 connected manifold).

include <_common.scad>

chest_w = 172.0;
chest_d = 112.0;
chest_h = 70.0;
wall_t  = 2.2;

// Sub-assembly origins (read by tools/lib/print-assembly.mjs & viewer.html)
xg_01   = -16.0; // #1 Ghost X center
yg_01   =  -3.8; // #1 Ghost Y center (pedestal backs into Y = +25.4 bulkhead; lever at Y = -14.8..-10.3)
xl_01   = -31.4; // Left Split Ghost Lid X center (lid_w = 110.2 -> X = -86.5..+23.7)
xv_15   =  55.4; // Right Split Lockbox & Clasp X center (vlid_w = 61.6 -> X = +24.6..+86.2)

module prop_01_chest_body() {
  difference() {
    union() {
      // 1. Master 3-in-1 coffer chest shell + slim base plinth & upper rim moulding (<= 175.6 mm W)
      chamfer_box(chest_w, chest_d, chest_h, r = 3.5, ch_bot = 0.9, ch_top = 0.6);
      chamfer_box(chest_w + 2.8, chest_d + 2.8, 4.6, r = 3.8, ch_bot = 0.9, ch_top = 1.0);
      translate([0, 0, chest_h - 4.8])
        chamfer_box(chest_w + 2.0, chest_d + 2.0, 4.8, r = 3.6, ch_bot = 1.1, ch_top = 0.4);

      // 2. Crooked Tapered Gothic Coffin Corner Buttresses
      for (sx = [-1, 1], sy = [-1, 1]) {
        hull() {
          translate([sx * (chest_w / 2 - 4.0), sy * (chest_d / 2 - 3.0), 0])
            chamfer_box(11.6, 11.6, 5.0, r = 2.2, ch_bot = 0.9, ch_top = 0.4);
          translate([sx * (chest_w / 2 - 4.4), sy * (chest_d / 2 - 3.8), chest_h - 5.8])
            chamfer_box(9.2, 9.2, 5.4, r = 1.8, ch_bot = 0.2, ch_top = 0.5);
        }
      }

      // 3. Left-Bay Decorative Brass Latch Sticker Frame (at X = xl_01 = -31.4 on front -Y wall, 45-deg corbelled at bottom)
      hull() {
        translate([xl_01, -chest_d / 2 - 0.2, chest_h - 14.0])
          cube([35.2, 2.4, 23.2], center = true);
        translate([xl_01, -chest_d / 2 + 0.8, chest_h - 27.0])
          cube([33.0, 0.8, 1.0], center = true);
      }
      // Front vertical wrought-iron strap dividing Left (#1) and Right (#15) bays at X = +24.9
      translate([24.9, -chest_d / 2 + 0.4, 0])
        chamfer_box(4.6, 2.6, chest_h - 0.6, r = 0.8, ch_bot = 0.6, ch_top = 0.4);

      // 4. Four Coaxial Rear Hinge Knuckles at Y = chest_d/2 + 6.2 = +62.2, Z = chest_h - 1.0 = 69.0 mm
      //    45-deg gussets root into +Y = +56.0 at Z = 60.2 so Z <= 59.5 sticker pockets stay 100% clear!
      for (hk = [[-75.0, 14.0], [13.0, 14.0], [30.0, 10.0], [79.5, 10.0]]) {
        hull() {
          translate([hk[0], chest_d / 2 + 6.2, chest_h - 1.0])
            rotate([0, 90, 0])
              cylinder(h = hk[1], d = 8.0, center = true);
          translate([hk[0], chest_d / 2 - 0.6, chest_h - 9.8])
            cube([hk[1], 2.2, 1.4], center = true);
        }
      }

      // 5. Rear #20 Cut-Wires 45-deg Bevelled Perimeter Frame + 5 Built-in Bottom Wire-Knot Grommet Bosses (Z = 8.8 mm!)
      difference() {
        hull() {
          translate([0, chest_d / 2 + 0.1, 32.5])
            cube([158.0, 1.8, 57.0], center = true);
          translate([0, chest_d / 2 - 0.6, 32.5])
            cube([160.4, 0.6, 59.4], center = true);
        }
        translate([0, chest_d / 2 + 0.6, 33.5])
          cube([152.0, 3.0, 51.4], center = true);
      }
      // Five built-in 45-deg bevelled gothic cable grommet bosses along bottom row (Z = 8.8, wx = -65..+37 @ 25.5 mm pitch)
      for (i = [0 : 4]) {
        wx = -65.0 + i * 25.5;
        hull() {
          translate([wx, chest_d / 2 - 0.2, 8.8])
            rotate([-90, 0, 0]) cylinder(h = 2.0, d1 = 9.2, d2 = 7.2);
          translate([wx, chest_d / 2 - 0.2, 3.2])
            rotate([-90, 0, 0]) cylinder(h = 1.4, d = 4.0);
        }
      }
    }

    // =========================================================================
    // 6. MAIN INTERIOR HOLLOW & WIDE OPEN-BOTTOM REAR SOLDERING / ESP32 BAY
    // =========================================================================
    // 6a. Main Interior Hollow: Y = -53.8 .. +25.4 (79.2 mm deep; solid 2.4 mm bulkhead at Y = +25.4..+27.8 hides all #20 wires!)
    difference() {
      hull() {
        translate([0, -14.2, 2.0])
          linear_extrude(height = 64.0)
            rrect2d(chest_w - 2 * wall_t, 79.2, r = 2.0);
        translate([0, -14.2, 66.5])
          linear_extrude(height = 5.0)
            rrect2d(chest_w - 6.0, 77.6, r = 2.0);
      }
      // Full-height 2.2 mm partition dividing Left (#1 Ghost) and Right (#15 Lockbox) bays at X = +24.9
      translate([24.9, -14.0, 36.0])
        cube([2.2, 84.0, chest_h + 4.0], center = true);
      // Small 17.5 mm rear step in Left Bay ONLY (X = -85..+24.0, Y = +20.2..+26.0, with 45-deg front chamfer)
      // roofing the front 2.8 mm of the 28.6 mm-wide ESP32 seat while keeping Right Bay floor flat at Z = 2.0!
      hull() {
        translate([-30.5, 23.2, 8.75]) cube([110.0, 6.2, 17.5], center = true);
        translate([-30.5, 15.5, 1.0])  cube([110.0, 21.6, 2.0], center = true);
      }
      // Internal backing pad behind Right-Bay (#15) front escutcheon recess
      hull() {
        translate([xv_15, -chest_d / 2 + 2.2, chest_h - 14.0]) cube([39.6, 3.2, 26.8], center = true);
        translate([xv_15, -chest_d / 2 + 1.2, chest_h - 30.5]) cube([39.6, 0.8, 2.0], center = true);
      }
    }

    // 6b. WIDE OPEN-BOTTOM REAR #20 SOLDERING & WIRING BAY (Y = +27.8 .. +51.2 = 23.4 mm wide x 162 mm long, OPEN AT Z = 0!!):
    //     Leaves a thin 4.8 mm rear panel wall (Y = +51.2..+56.0) so all 5 socket backs, LED leads, M16 SET nut, and bottom wire knots
    //     are wide-open to your fingers, wrench, and soldering iron straight from underneath!
    //     Roof tapers at <= 43 deg from Z = 50.5 to a 2.0 mm ridge at Z = 62.0 -> 100% support-free!
    difference() {
      union() {
        hull() {
          translate([0, 39.5, -0.2])
            linear_extrude(height = 50.7)
              rrect2d(chest_w - 10.0, 23.4, r = 2.0);
          translate([0, 39.5, 62.0])
            linear_extrude(height = 0.3)
              rrect2d(chest_w - 22.0, 2.0, r = 0.8);
        }
        // Left-side 28.6 mm-wide ESP32-DevKitC V4 pocket extension at bottom (X = -79..-13, Y = +22.6..+51.2, Z = 0..5.4,
        // tapering at 45 deg up into the 23.4 mm soldering bay so ALL 38 header pins have 45+ mm of open DuPont connector room above!)
        translate([-46.0, 36.9, -0.2])
          hull() {
            linear_extrude(height = 5.6) rrect2d(66.0, 28.6, r = 1.8);
            translate([0, 0, 15.2]) linear_extrude(height = 0.3) rrect2d(54.0, 10.0, r = 1.2);
          }
      }
      // Four 45-deg self-supporting M2 screw corbel shoulders at X = -46 +- 24.13, Y = 36.9 +- 11.43 (starting at Z = 5.5 -> 0 overhang!)
      for (sx = [-1, 1]) {
        hull() {
          translate([-46.0 + sx * esp32_hole_w / 2, 51.2, 10.5]) cube([8.0, 1.0, 9.6], center = true);
          translate([-46.0 + sx * esp32_hole_w / 2, 47.0, 12.6]) cube([7.2, 4.2, 5.4], center = true);
        }
      }
    }
    // Four vertical M2 pilot bores (48.26 x 22.86 mm) seating the ESP32 upside-down at Z = 5.5 inside the open rear bay!
    for (sx = [-1, 1], sy = [-1, 1]) {
      translate([-46.0 + sx * esp32_hole_w / 2, 36.9 + sy * esp32_hole_d / 2, 6.2])
        cylinder(h = 8.5, d = sg90_m2_pilot_d);
    }

    // Concealed internal servo wire pass-throughs through the Y = +25.4..+27.8 bulkhead into the open rear bay:
    translate([-52.0, 26.6, 23.0])
      rotate([90, 0, 0])
        hull() { cylinder(h = 6.0, d = 6.0, center = true); translate([0, 3.2, 0]) cylinder(h = 6.0, d = 1.2, center = true); }
    translate([77.0, 26.6, 23.0])
      rotate([90, 0, 0])
        hull() { cylinder(h = 6.0, d = 6.0, center = true); translate([0, 3.2, 0]) cylinder(h = 6.0, d = 1.2, center = true); }

    // Left-Rear (-X) 45-deg Gabled USB-C Port into the shared ESP32 bay (X = -86, Y = +36.9, Z = 3.8)
    translate([-chest_w / 2, 36.9, 3.8])
      rotate([0, -90, 0])
        hull() {
          cube([esp32_usb_h + 0.4, esp32_usb_w + 0.8, 20.0], center = true);
          translate([(esp32_usb_h + 0.4) / 2 + 5.6, 0, 0])
            cylinder(h = 20.0, d = 1.6, center = true);
        }

    // 6c. Framed Floor Lightener Windows in Unused Front Quadrants
    for (win = [[-66.0, -36.0, 24.0, 22.0], [-2.0, -36.0, 26.0, 22.0]]) {
      translate([win[0], win[1], -0.5])
        linear_extrude(height = 3.2)
          rrect2d(win[2], win[3], r = 3.2);
    }

    // =========================================================================
    // 7. BACK WALL: Thin-Panel #20 Cut-Wires Fuse-Box (+Y = +56.0, 4.8 mm wall!)
    // =========================================================================
    for (i = [0 : 4]) {
      wx = -65.0 + i * 25.5; // Wide 25.5 mm finger pitch: X = -65.0, -39.5, -14.0, +11.5, +37.0

      // a) Upper Row (Z = 45.0): Five Ø14.3 mm Teardropped Through-Bores (through 4.8 mm wall straight into 23.4 mm open soldering bay!)
      translate([wx, chest_d / 2 - 6.0, 45.0])
        rotate([-90, 0, 0])
          hull() {
            cylinder(h = 8.0, d = 14.3);
            translate([0, -7.8, 0]) cylinder(h = 8.0, d = 1.4); // local -Y -> world +Z!
          }
      // Number Sticker Pocket (1..5) at Z = 56.2
      translate([wx, chest_d / 2 - sticker_depth, 56.2])
        rotate([-90, 0, 0])
          linear_extrude(height = sticker_depth + 0.6)
            rrect2d(10.6, 6.2, r = 1.0);

      // b) Bottom Row (Z = 8.8): Five Built-in Ø3.5 mm Flared Jumper-Wire Grommet Holes (23.4 mm clear vertical gap below sockets!
      //    Tie a simple stopper knot or mini zip-tie inside the 23.4 mm open rear bay — zero extra anchor blocks to print!)
      translate([wx, chest_d / 2 - 6.0, 8.8])
        rotate([-90, 0, 0]) {
          hull() {
            cylinder(h = 9.0, d = 3.5);
            translate([0, -2.1, 0]) cylinder(h = 9.0, d = 0.9);
          }
          // Smooth inner & outer wire-bend chamfers
          hull() {
            translate([0, 0, 0.5]) cylinder(h = 1.6, d1 = 6.2, d2 = 3.5);
            translate([0, -3.4, 0.5]) cylinder(h = 1.6, d = 1.0);
          }
        }
    }

    // c) Right Control Column on +Y Back Wall (X = +64.5): 16.2 mm SET Pushbutton (Z = 26.5) + 5.2 mm PAIRED LED (Z = 45.0)
    //    4.8 mm panel thickness threads standard M16 panel-mount pushbuttons directly with full wrench room in the open rear bay!
    translate([64.5, chest_d / 2 - 6.0, 26.5])
      rotate([-90, 0, 0])
        hull() {
          cylinder(h = 8.0, d = 16.2);
          translate([0, -8.8, 0]) cylinder(h = 8.0, d = 1.6);
        }
    translate([64.5, chest_d / 2 - sticker_depth, 11.2])
      rotate([-90, 0, 0])
        linear_extrude(height = sticker_depth + 0.6)
          rrect2d(20.0, 5.8, r = 1.0);

    translate([64.5, chest_d / 2 - 6.0, 45.0])
      rotate([-90, 0, 0])
        hull() {
          cylinder(h = 8.0, d = 5.2);
          translate([0, -2.8, 0]) cylinder(h = 8.0, d = 1.0);
        }
    translate([64.5, chest_d / 2 - sticker_depth, 56.2])
      rotate([-90, 0, 0])
        linear_extrude(height = sticker_depth + 0.6)
          rrect2d(20.0, 6.2, r = 1.0);

    // =========================================================================
    // 8. FRONT WALL: Left (#1) Latch Sticker + Right (#15) Clasp Window & Rim Switch
    // =========================================================================
    translate([xl_01, -chest_d / 2 - 1.4 + sticker_depth, chest_h - 14.0])
      rotate([90, 0, 0])
        linear_extrude(height = sticker_depth + 0.6)
          rrect2d(32.0, 20.0, r = 1.6);

    translate([xv_15, -chest_d / 2 + 0.6, chest_h - 14.0])
      cube([36.6, 2.4, 24.6], center = true);
    translate([xv_15 + 2.25, -chest_d / 2, chest_h - 7.5])
      cube([32.5, 10.0, 18.0], center = true);

    translate([30.5, -chest_d / 2 + 1.7, chest_h - 1.8])
      cube([6.5, 6.5, 4.0], center = true);

    // Shallow Crooked Timber Plank V-grooves on Front & Sides
    for (idx = [0 : 2]) {
      zp = 18 + idx * 16;
      tilt = (idx % 2 == 0) ? 2.2 : -1.8;
      translate([xl_01, -chest_d / 2 - 0.1, zp])
        rotate([0, tilt, 0]) rotate([45, 0, 0]) cube([88.0, 1.0, 1.0], center = true);
      for (sx = [-1, 1])
        translate([sx * (chest_w / 2 + 0.1), -8.0, zp])
          rotate([tilt, 0, 0]) rotate([0, 45, 0]) cube([1.0, 74.0, 1.0], center = true);
    }

    // 9. Coaxial Rear Hinge Pin Bores (Ø3.5 mm teardropped across all 4 knuckles at Y = +62.2, Z = 69.0) + Right Lid Spring Notch
    for (hx = [-75.0, 13.0, 30.0, 79.5]) {
      hull() {
        translate([hx, chest_d / 2 + 6.2, chest_h - 1.0])
          rotate([0, 90, 0]) cylinder(h = 18.0, d = 3.5, center = true);
        translate([hx, chest_d / 2 + 6.2, chest_h + 0.1])
          rotate([0, 90, 0]) cylinder(h = 18.0, d = 0.8, center = true);
      }
    }
    translate([xv_15, chest_d / 2 + 0.2, chest_h - 4.5])
      cube([5.0, 1.6, 9.5], center = true);
  }

  // ===========================================================================
  // 10. LEFT BAY (#1 Ghost in the Box) Internal Mounts (centered on xg_01 = -16.0, yg_01 = -3.8)
  // ===========================================================================
  for (sx = [-1, 1]) {
    translate([xg_01 + sx * 36.15, yg_01 - 1.1, 1.8])
    difference() {
      chamfer_box(6.2, 7.2, 64.2, r = 1.2, ch_bot = 0, ch_top = 0.5);
      translate([-sx * 2.0, 0, 33.0])
        cube([4.4, 4.8, 68.0], center = true);
    }
  }
  translate([xg_01 - 12.0, yg_01 - 24.0, 1.8]) {
    cylinder(h = 7.5, d1 = 5.8, d2 = 4.2);
    translate([0, 0, 7.5]) cylinder(h = 1.2, d1 = 4.2, d2 = 6.4);
    translate([0, 0, 8.7]) cylinder(h = 1.4, d1 = 6.4, d2 = 5.0);
  }
  // Horizontal-Shaft SG90 Lever Servo Pedestal (front Y = -0.1..+20.2 on Z = 1.8 floor; rear Y = +20.2..+26.0 welded into Z = 17.5 curb & bulkhead!)
  translate([xg_01 - 43.0, yg_01 + 16.75, 1.8])
  difference() {
    union() {
      translate([0, 0, 15.5])
        chamfer_box(sg90_flange_w + 4.8, sg90_body_h + 3.6, 21.7, r = 2.2, ch_bot = 0, ch_top = 0.6);
      hull() {
        translate([0, -3.0, 0])
          chamfer_box(sg90_flange_w + 4.8, 20.1, 16.0, r = 2.2, ch_bot = 0, ch_top = 0);
        translate([0, 0, 15.5])
          chamfer_box(sg90_flange_w + 4.8, sg90_body_h + 3.6, 1.0, r = 2.2, ch_bot = 0, ch_top = 0);
      }
    }
    translate([0, 0, 30.7])
      cube([sg90_body_w, sg90_body_h, sg90_body_d + 2.0], center = true);
    translate([0, -sg90_body_h / 2 + 5.25, 30.7])
      cube([sg90_flange_w, sg90_flange_h + 0.4, sg90_body_d + 2.0], center = true);
    for (sx = [-1, 1]) {
      translate([sx * sg90_hole_span / 2, -sg90_body_h / 2 + 5.25, 30.2])
        rotate([90, 0, 0])
          cylinder(h = 12.0, d = sg90_m2_pilot_d, center = true);
    }
    translate([sg90_shaft_off_x, -sg90_body_h / 2 - 2.0, 30.2])
      cube([14.0, 8.0, 16.0], center = true);
  }

  // ===========================================================================
  // 11. RIGHT BAY (#15 Puzzle Lockbox) Latch Cradle & 6-Slot Organizer (centered on xv_15 = +55.4)
  // ===========================================================================
  translate([xv_15 + 5.5, -chest_d / 2 + wall_t, 0])
  difference() {
    hull() {
      translate([0, 8.1, 38.0])
        chamfer_box(sg90_flange_w + 4.0, sg90_body_d + 3.5, 19.0, r = 2.0, ch_bot = 0.4, ch_top = 0.6);
      translate([0, 0.2, 23.5])
        cube([sg90_flange_w + 4.0, 2.0, 2.0], center = true);
    }
    translate([0, 8.1, 48.0])
      cube([sg90_body_w, sg90_body_d, 20.0], center = true);
    translate([0, 8.1, 55.5])
      cube([sg90_flange_w, sg90_body_d, 3.6], center = true);
    for (sx = [-1, 1]) {
      translate([sx * sg90_hole_span / 2, 8.1, 44.5])
        cylinder(h = 13.0, d = sg90_m2_pilot_d);
    }
    translate([-15.0, 3.0, 36.0])
      cube([6.0, 6.0, 24.0], center = true);
  }

  // Stepped 6-Slot Numbered Organizer (Y = -36.4 .. +22.4 at 9.8 mm pitch -> clears 5.8 mm upright QR stands & folded clue slips!)
  for (i = [0 : 6]) {
    sy = -36.4 + i * 9.8;
    for (fx = [29.8, 80.2]) {
      translate([fx, sy, 1.8])
        hull() {
          cube([7.6, 1.2, 1.0], center = true);
          translate([0, 0.4, 13.5 + i * 1.4]) cube([6.8, 1.0, 1.0], center = true);
        }
    }
    if (i < 6) {
      for (sx = [-1, 1]) {
        translate([xv_15 + sx * 23.0, sy + 4.9, 1.8])
          chamfer_box(1.6, 8.2, 5.5, r = 0.5, ch_bot = 0, ch_top = 0.4);
      }
      for (pip = [0 : i]) {
        translate([84.0, sy + 4.9, 18.0 + pip * 2.5])
          rotate([0, -90, 0])
            cylinder(h = 1.1, d1 = 2.3, d2 = 0.4, $fn = 4);
      }
    }
  }
}

color(col_leather) prop_01_chest_body();
