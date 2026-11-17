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
ky_y    =  37.5; // Left-wall (-X) KY-040 Rotary Encoder Safe-Dial Y center (inside open-bottom rear electronics bay!)
ky_z    =  36.5; // Left-wall (-X) KY-040 Rotary Encoder Safe-Dial Z center (32.7 mm above USB-C, 28.5 mm below closed lid!)

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

      // 3b. Right-Wall (+X) 45-deg Corbelled Gothic Escutcheon for 4x MTS-103 Toggle Switches + SUBMIT Button (X <= +87.0 <= 175.6 W!)
      hull() {
        translate([chest_w / 2 + 0.2, 7.5, 40.5])
          cube([1.6, 82.0, 42.0], center = true);
        translate([chest_w / 2 - 0.6, 7.5, 18.0])
          cube([0.8, 84.0, 1.0], center = true);
      }
      // 3c. Left-Wall (-X) 45-deg Corbelled Circular Gothic Safe-Dial Escutcheon Medallion around KY-040 (Y = ky_y, Z = ky_z)
      hull() {
        translate([-chest_w / 2 + 0.2, ky_y, ky_z])
          rotate([0, -90, 0]) cylinder(h = 1.0, d1 = 35.0, d2 = 33.4, $fn = 48);
        translate([-chest_w / 2 + 0.2, ky_y, ky_z - 18.5])
          rotate([0, -90, 0]) cylinder(h = 0.3, d = 4.0, $fn = 16);
      }

      // 4. Four Coaxial Rear Hinge Knuckles at Y = chest_d/2 + 6.2 = +62.2, Z = chest_h - 1.0 = 69.0 mm
      //    45-deg gussets root into +Y = +56.0 at Z = 60.2 so Z <= 59.5 sticker pockets stay 100% clear!
      for (hk = [[-75.0, 14.0], [13.0, 14.0], [30.0, 10.0], [80.8, 10.0]]) {
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
      // Internal backing pad behind Right-Bay (#15) front escutcheon recess + 45-deg corbelled housing boss for X = 30.5 rim switch!
      hull() {
        translate([xv_15, -chest_d / 2 + 2.2, chest_h - 14.0]) cube([39.6, 3.2, 26.8], center = true);
        translate([xv_15, -chest_d / 2 + 1.2, chest_h - 30.5]) cube([39.6, 0.8, 2.0], center = true);
      }
      hull() {
        translate([30.2, -chest_d / 2 + 3.6, chest_h - 3.5]) cube([9.2, 7.2, 7.0], center = true);
        translate([28.0, -chest_d / 2 + 1.4, chest_h - 11.5]) cube([4.8, 1.6, 1.4], center = true);
      }
    }

    // 6b. WIDE OPEN-BOTTOM REAR #20 SOLDERING & WIRING BAY + SELF-CENTERING 45-DEG ESP32 SEAT:
    //     - X = -25..+81 (and Z = 16..62 across full X = -81..+81!): 23.4 mm wide open-bottom soldering bay leaving a thin 4.8 mm rear wall!
    //     - X = -82.6..-26.6, Z = 0..16: symmetric 28.6 mm 45-deg V-seat holding the ESP32 level at Z = 5.95 mm (4 mm from -X USB-C wall!)
    //       with all 38 header pins projecting into the wide-open Z = 16..62 chamber above!
    hull() {
      translate([28.0, 39.5, -0.2])
        linear_extrude(height = 50.7)
          rrect2d(106.0, 23.4, r = 2.0);
      translate([28.0, 39.5, 62.0])
        linear_extrude(height = 0.3)
          rrect2d(94.0, 2.0, r = 0.8);
    }
    hull() {
      translate([-28.0, 39.5, 16.0])
        linear_extrude(height = 34.5)
          rrect2d(106.0, 23.4, r = 2.0);
      translate([-28.0, 39.5, 62.0])
        linear_extrude(height = 0.3)
          rrect2d(94.0, 2.0, r = 0.8);
    }
    translate([-54.6, 36.9, -0.2])
      hull() {
        linear_extrude(height = 5.8) rrect2d(56.4, 28.6, r = 1.6);
        translate([0, 0, 16.5]) linear_extrude(height = 0.3) rrect2d(48.0, 7.6, r = 1.2);
      }
    for (sx = [-1, 1], sy = [-1, 1]) {
      translate([-54.6 + sx * esp32_hole_w / 2, 36.9 + sy * esp32_hole_d / 2, 7.2])
        cylinder(h = 8.5, d = sg90_m2_pilot_d);
    }

    // Concealed internal servo, switch & WS2812B LED strip pass-throughs through the Y = +25.4..+27.8 bulkhead & X = +24.9 divider:
    translate([-52.0, 26.6, 23.0])
      rotate([90, 0, 0])
        hull() { cylinder(h = 6.0, d = 6.0, center = true); translate([0, 3.2, 0]) cylinder(h = 6.0, d = 1.2, center = true); }
    translate([77.0, 26.6, 23.0])
      rotate([90, 0, 0])
        hull() { cylinder(h = 6.0, d = 6.0, center = true); translate([0, 3.2, 0]) cylinder(h = 6.0, d = 1.2, center = true); }
    //   - Upper-Right 4x MTS-103 switch ribbon pass-through from Right Bay (Z = 53.5) straight into open-bottom rear ESP32 bay!
    translate([78.0, 26.6, 53.5])
      rotate([90, 0, 0])
        hull() { cylinder(h = 6.0, d = 6.4, center = true); translate([0, 3.4, 0]) cylinder(h = 6.0, d = 1.2, center = true); }
    //   - Inner Left-Wall (-X) 3.0 mm Thin-Wall Seat inside open-bottom rear bay for KY-040 M7 Bushing (X = -83.0..-80.0, Y = 28..48.5, Z = 16..50)
    hull() {
      translate([-81.5, ky_y, 33.0]) cube([3.2, 20.6, 34.0], center = true);
      translate([-80.2, ky_y, 56.5]) cube([0.6, 12.0, 0.4], center = true);
    }
    //   - Inner Right-Wall (+X) 3.8 mm Thin-Wall Seat inside open-bottom rear bay for 16 mm SUBMIT Pushbutton Nut (X = 80.0..83.2, Y = 29..49, Z = 19..43)
    hull() {
      translate([81.6, 39.0, 30.5]) cube([3.4, 20.4, 23.0], center = true);
      translate([80.2, 39.0, 48.0]) cube([0.6, 12.0, 0.4], center = true);
    }
    //   - WS2812B LED strip entry slot from open-bottom rear ESP32 bay into Right (#15) Lockbox LED channel (X = +31.0, Z = 54.1)
    translate([31.0, 26.6, 54.1])
      hull() {
        cube([5.2, 6.0, 10.6], center = true);
        translate([0, 0, 7.6]) cube([0.8, 6.0, 0.4], center = true);
      }
    //   - Aligned internal light window through Y = +26.6 bulkhead at X = +64.5, Z = 53.5 so internal WS2812B glow ALSO reaches +Y status slits!
    for (lx = [-5.5, 0.0, 5.5]) {
      translate([64.5 + lx, 26.6, 53.5])
        hull() {
          cube([3.2, 6.0, 6.5], center = true);
          translate([0, 0, 4.8]) cube([0.8, 6.0, 0.4], center = true);
        }
    }
    //   - WS2812B LED strip daisy-chain slot through X = +24.9 divider into Left (#1) Ghost LED channel (Y = +23.8, Z = 54.1)
    translate([24.9, 23.8, 54.1])
      hull() {
        cube([5.0, 3.4, 10.6], center = true);
        translate([0, 0, 6.8]) cube([5.0, 0.6, 0.4], center = true);
      }

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

    // Three-Lancet Gothic Status Light Grille (Green / Orange / Red WS2812B glow for #20 Cut Wires!) + sticker pocket
    for (lx = [-6.0, 0.0, 6.0]) {
      translate([64.5 + lx, chest_d / 2 - 6.0, 45.2])
        rotate([-90, 0, 0])
          hull() {
            translate([0, 2.2, 0]) cylinder(h = 8.0, d = 3.2);
            translate([0, -2.0, 0]) cylinder(h = 8.0, d = 3.2);
            translate([0, -4.4, 0]) cylinder(h = 8.0, d = 0.9); // local -Y -> world +Z pointed gothic lancet arch!
          }
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

    // Right-Bay (#15) 6x6x5 mm tactile rim-switch pocket (Z = 66.0 solid seat floor -> actuator at Z = 71.0!) + solder-pin wire slot
    translate([30.5, -chest_d / 2 + 3.8, chest_h - 1.9])
      cube([6.5, 6.5, 4.2], center = true);
    translate([30.5, -chest_d / 2 + 3.8, chest_h - 6.0])
      cube([5.0, 2.4, 8.0], center = true);

    // Front (-Y) Top/Phone-Lock Active Status Keyhole Lancet directly underneath #15 Gold Brass Clasp (X = xv_15 = +55.4, Z = 26.5)
    translate([xv_15, -chest_d / 2 - 2.0, 26.5])
      rotate([-90, 0, 0])
        hull() {
          translate([0, 2.4, 0]) cylinder(h = 6.0, d = 3.6);
          translate([0, -2.0, 0]) cylinder(h = 6.0, d = 3.4);
          translate([0, -4.6, 0]) cylinder(h = 6.0, d = 0.9); // local -Y -> world +Z pointed gothic lancet!
        }

    // =========================================================================
    // 8b. RIGHT WALL (+X): 4x SPDT MTS-103 (ON-OFF-ON) Toggle Bank + SUBMIT Button + Status Lancet
    // =========================================================================
    for (si = [0 : 3]) {
      sy_sw = -24.5 + si * 14.0; // Comfortable 14.0 mm nut & finger pitch: Y = -24.5, -10.5, +3.5, +17.5 (Z = 54.5 clears QR cards <= 45.7!)
      // Ø6.4 mm teardropped M6 bushing through-bore
      translate([chest_w / 2 - 4.0, sy_sw, 54.5])
        rotate([0, 90, 0])
          hull() {
            cylinder(h = 7.0, d = 6.4);
            translate([-3.5, 0, 0]) cylinder(h = 7.0, d = 0.9); // local -X -> world +Z teardrop!
          }
      // Ø2.3 mm anti-rotation keyway dimple 5.8 mm below bore for MTS-103 locking tab washer
      translate([chest_w / 2 - 0.2, sy_sw, 54.5 - 5.8])
        rotate([0, 90, 0])
          cylinder(h = 1.6, d = 2.3);
    }
    // Recessed 0.4 mm Roman-numeral / Rune Sticker Strip Pocket below the 4 switches (54.0 x 5.2 mm at Z = 42.5)
    translate([chest_w / 2 + 1.0 - sticker_depth, -3.5, 42.5])
      rotate([0, 90, 0])
        linear_extrude(height = sticker_depth + 0.6)
          rrect2d(5.2, 54.0, r = 0.9);

    // Right-Wall 16.2 mm SUBMIT Pushbutton Bore (Y = +39.0, Z = 31.0 -> opens directly into 23.4 mm wide open-bottom rear soldering bay!)
    translate([chest_w / 2 - 4.0, 39.0, 31.0])
      rotate([0, 90, 0])
        hull() {
          cylinder(h = 7.0, d = 16.2);
          translate([-8.8, 0, 0]) cylinder(h = 7.0, d = 1.5); // local -X -> world +Z teardrop!
        }
    translate([chest_w / 2 + 1.0 - sticker_depth, 39.0, 17.5])
      rotate([0, 90, 0])
        linear_extrude(height = sticker_depth + 0.6)
          rrect2d(5.2, 16.0, r = 0.9);

    // Right-Wall Pointed Gothic Active-Lock Status Lancet above SUBMIT button (Y = +39.0, Z = 52.5)
    translate([chest_w / 2 - 4.0, 39.0, 52.5])
      rotate([0, 90, 0])
        hull() {
          translate([ 2.2, 0, 0]) cylinder(h = 7.0, d = 3.4);
          translate([-2.0, 0, 0]) cylinder(h = 7.0, d = 3.4);
          translate([-4.5, 0, 0]) cylinder(h = 7.0, d = 0.9); // local -X -> world +Z pointed gothic lancet!
        }

    // =========================================================================
    // 8c. LEFT WALL (-X): KY-040 Safe-Cracker Combination Dial + Status Lancet
    // =========================================================================
    // Ø7.3 mm teardropped M7 bushing through-bore at (Y = ky_y = 37.5, Z = ky_z = 36.5) inside open-bottom rear electronics bay!
    translate([-chest_w / 2 - 3.0, ky_y, ky_z])
      rotate([0, 90, 0])
        hull() {
          cylinder(h = 7.0, d = 7.3);
          translate([-3.9, 0, 0]) cylinder(h = 7.0, d = 1.0); // local -X -> world +Z teardrop!
        }
    // 12 Engraved Radial Safe-Combination Tick Marks around R = 13.8..16.2 mm on -X Medallion (12 o'clock major tick slightly longer!)
    for (ti = [0 : 11]) {
      ang_t = ti * 30;
      t_len = (ti % 3 == 0) ? 3.2 : 2.1;
      translate([-chest_w / 2 - 0.8, ky_y + 14.8 * sin(ang_t), ky_z + 14.8 * cos(ang_t)])
        rotate([-ang_t, 0, 0])
          cube([1.2, 0.85, t_len], center = true);
    }
    // Left-Wall Pointed Gothic Active-Lock Status Lancet forward of Safe Dial (Y = +14.5, Z = 53.5)
    translate([-chest_w / 2 - 3.0, 14.5, 53.5])
      rotate([0, 90, 0])
        hull() {
          translate([ 2.2, 0, 0]) cylinder(h = 7.0, d = 3.4);
          translate([-2.0, 0, 0]) cylinder(h = 7.0, d = 3.4);
          translate([-4.5, 0, 0]) cylinder(h = 7.0, d = 0.9);
        }

    // Shallow Crooked Timber Plank V-grooves on Front & Lower Front Flanks (clear of Left/Right puzzle escutcheons!)
    for (idx = [0 : 2]) {
      zp = 18 + idx * 16;
      tilt = (idx % 2 == 0) ? 2.2 : -1.8;
      translate([xl_01, -chest_d / 2 - 0.1, zp])
        rotate([0, tilt, 0]) rotate([45, 0, 0]) cube([88.0, 1.0, 1.0], center = true);
      translate([-chest_w / 2 - 0.1, -22.0, zp])
        rotate([tilt, 0, 0]) rotate([0, 45, 0]) cube([1.0, 44.0, 1.0], center = true);
    }

    // 9. Coaxial Rear Hinge Pin Bores (Ø3.5 mm teardropped across all 4 knuckles at Y = +62.2, Z = 69.0) + Right Lid Spring Notch
    for (hx = [-75.0, 13.0, 30.0, 80.8]) {
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

  // ===========================================================================
  // 12. INTEGRATED 10 mm WS2812B LED STRIP CHANNELS (45-deg self-supporting upper/lower guide rails ->
  //     11.0 mm clear channel for 10 mm NeoPixel tape lighting ALL 4 Active-Lock Status Windows + Left & Right Bays!)
  // ===========================================================================
  for (zr = [48.0, 60.2]) {
    // a) Right Bay (#15 Lockbox) rear bulkhead rail (X = +34..+74, clear of +78 switch pass-through!)
    hull() {
      translate([54.0, 25.5, zr]) cube([40.0, 0.4, 2.8], center = true);
      translate([54.0, 24.3, zr]) cube([40.0, 0.4, 0.5], center = true);
    }
    // b) Left Bay (#1 Ghost) rear bulkhead uplight rail (X = -83.5..+22.5) + Left-wall (-X) status-lancet turn rail (Y = +6..+24)
    hull() {
      translate([-30.5, 25.5, zr]) cube([106.0, 0.4, 2.8], center = true);
      translate([-30.5, 24.3, zr]) cube([106.0, 0.4, 0.5], center = true);
    }
    hull() {
      translate([-83.9, 15.0, zr]) cube([0.4, 18.0, 2.8], center = true);
      translate([-82.7, 15.0, zr]) cube([0.4, 18.0, 0.5], center = true);
    }
  }
  // c) Inner +Y = +51.2 Rear Wall WS2812B Strip Guide Rails right behind the 3-Lancet #20 Status Grille (X = +53..+76, Z = 39.2 & 51.4)
  for (zr2 = [39.2, 51.4]) {
    hull() {
      translate([64.5, chest_d / 2 - 4.9, zr2]) cube([22.0, 0.4, 2.8], center = true);
      translate([64.5, chest_d / 2 - 6.1, zr2]) cube([22.0, 0.4, 0.5], center = true);
    }
  }
  // d) Inner +X = +81.0 Rear-Bay WS2812B Strip Guide Rails behind Right Toggle Status Lancet (Y = +31..+47, Z = 46.5 & 58.7)
  for (zr3 = [46.5, 58.7]) {
    hull() {
      translate([80.9, 39.0, zr3]) cube([0.4, 16.0, 2.6], center = true);
      translate([79.8, 39.0, zr3]) cube([0.4, 16.0, 0.5], center = true);
    }
  }
  // e) Inner -Y = -53.8 Front-Wall WS2812B Strip Guide Rails behind Front Phone-Lock Keyhole Lancet (X = +45..+66, Z = 20.5 & 32.7)
  for (zr4 = [20.5, 32.7]) {
    hull() {
      translate([xv_15, -chest_d / 2 + 2.3, zr4]) cube([21.0, 0.4, 2.6], center = true);
      translate([xv_15, -chest_d / 2 + 3.4, zr4]) cube([21.0, 0.4, 0.5], center = true);
    }
  }
}

color(col_leather) prop_01_chest_body();
