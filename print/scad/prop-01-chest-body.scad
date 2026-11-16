// Hauntology Tabletop Print Kit — Prop #1: Ghost in the Box (Chest Body)
// Colour: Leather (#6b4d33)
// Size: 160 W x 90 D x 70 H mm
// Sticker details: Front brass latch plate pocket (32 x 20 mm)
// Hardware: 1x horizontal-shaft SG90 servo pedestal (shaft along -Y at X = -48.5, Z = 32; XZ lever plane),
//           left/right ghost edge U-tracks, ESP32 DevKitC bay (X = 58) + USB-C port, rubber-band anchor post
// Print orientation: Flat on chest base (Z = 0), zero supports (1 connected component).

include <_common.scad>

chest_w = 160.0;
chest_d = 90.0;
chest_h = 70.0;
wall_t  = 3.2;

module prop_01_chest_body() {
  difference() {
    union() {
      // 1. Main coffer chest shell
      chamfer_box(chest_w, chest_d, chest_h, r = 3.5, ch_bot = 1.0, ch_top = 0.6);

      // 2. Stepped base plinth & upper rim moulding
      chamfer_box(chest_w + 3.2, chest_d + 3.2, 6.0, r = 4.0, ch_bot = 1.0, ch_top = 1.2);
      translate([0, 0, chest_h - 5.0])
        chamfer_box(chest_w + 2.4, chest_d + 2.4, 5.0, r = 3.8, ch_bot = 1.2, ch_top = 0.4);

      // 3. Crooked Tapered Gothic Coffin-Chest Corner Buttresses & Iron Rivets (clear below Z=68 lid rim!)
      for (sx = [-1, 1], sy = [-1, 1]) {
        hull() {
          translate([sx * (chest_w / 2 - 2.0), sy * (chest_d / 2 - 2.0), 0])
            chamfer_box(13.0, 13.0, 6.0, r = 2.4, ch_bot = 1.0, ch_top = 0.4);
          translate([sx * (chest_w / 2 - 4.0), sy * (chest_d / 2 - 4.0), chest_h - 6.0])
            chamfer_box(10.0, 10.0, 5.8, r = 2.0, ch_bot = 0.2, ch_top = 0.5);
        }
      }

      // 4. Pointed Gothic Keyhole Escutcheon Crest & Latch Frame (35.2 x 23.2 pocket preserved, stays below Z=69.5)
      translate([0, -chest_d / 2 + 1.0, chest_h - 14.0])
        rotate([90, 0, 0])
          chamfer_box(35.2, 23.2, 2.8, r = 2.2, ch_bot = 0, ch_top = 0.4);
      for (sx = [-1, 1]) {
        hull() {
          translate([sx * 16.5, -chest_d / 2 + 0.5, chest_h - 24.0]) cylinder(h = 20.0, d = 3.2);
          translate([sx * 19.5, -chest_d / 2 - 0.6, chest_h - 29.0]) cylinder(h = 6.0, d = 1.8);
        }
      }

      // 5. Rear twin hinge knuckles (at X = -52 and +52, Y = +51.2, Z = chest_h - 1.0 = 69.0 mm — behind rear rim, coaxial with lid!)
      for (hx = [-52, 52]) {
        hull() {
          translate([hx, chest_d / 2 + 6.2, chest_h - 1.0])
            rotate([0, 90, 0])
              cylinder(h = 16.0, d = 7.8, center = true);
          translate([hx, chest_d / 2 - 0.5, chest_h - 14.5])
            cube([16.0, 4.0, 2.0], center = true);
        }
      }
    }

    // 6. Hollow chest interior (leaving 3.6 mm floor and 3.2 mm walls)
    translate([0, 0, 3.6])
      chamfer_box(chest_w - 2 * wall_t, chest_d - 2 * wall_t, chest_h, r = 2.0, ch_bot = 0.8, ch_top = 0);

    // 7. Front 0.4 mm recessed sticker pocket for brass latch (32 x 20 mm)
    translate([0, -chest_d / 2 - 1.8 + sticker_depth, chest_h - 14.0])
      rotate([90, 0, 0])
        linear_extrude(height = sticker_depth + 0.6)
          rrect2d(32.0, 20.0, r = 1.6);

    // 8. Crooked Haunted Timber Plank V-grooves on front, back, and sides
    for (idx = [0 : 2]) {
      zp = 18 + idx * 16;
      tilt = (idx % 2 == 0) ? 2.6 : -2.2;
      for (sy = [-1, 1])
        translate([0, sy * (chest_d / 2 + 0.2), zp])
          rotate([0, tilt, 0])
            rotate([45, 0, 0])
              cube([chest_w - 16, 1.5, 1.5], center = true);
      for (sx = [-1, 1])
        translate([sx * (chest_w / 2 + 0.2), 0, zp])
          rotate([tilt, 0, 0])
            rotate([0, 45, 0])
              cube([1.5, chest_d - 16, 1.5], center = true);
    }

    // 9. Rear hinge pin bores (3.2 mm through-hole at Y = +51.2, Z = chest_h - 1.0 = 69.0 mm, coaxial with lid hinge barrels)
    for (hx = [-52, 52]) {
      translate([hx, chest_d / 2 + 6.2, chest_h - 1.0])
        rotate([0, 90, 0])
          cylinder(h = 20.0, d = 3.2, center = true);
    }

    // 10. Rear bottom USB-C cable exit port aligned with ESP32 cradle at X = 58
    translate([58.0, chest_d / 2, 10.5])
      rotate([90, 0, 0])
        hull() {
          cube([esp32_usb_w, esp32_usb_h, 10.0], center = true);
          translate([0, esp32_usb_h / 2 + 2.5, 0])
            cylinder(h = 10.0, d = 2.0, center = true);
        }
  }

  // 11. Internal Mechanism Mounts (sunk into floor at z = 3.0 so CSG welds them into a single manifold solid)
  translate([0, 0, 3.0]) {
    // a) Twin Left/Right Ghost Side-Edge U-Tracks at X = +/-36.15, Y = -1.1 (Z = 3..66 mm)
    //    Captures the 68.0 mm wide x 4.2 mm thick ghost sides cleanly with 0.3..0.5 mm clearance (Y_ghost = -3.2..+1.0)
    //    while keeping the entire front face (Y <= -5.5) completely unobstructed for the XZ lever arm!
    for (sx = [-1, 1]) {
      translate([sx * 36.15, -1.1, 0])
      difference() {
        chamfer_box(6.7, 7.6, 63.0, r = 1.2, ch_bot = 0, ch_top = 0.5);
        translate([-sx * 2.25, 0, 32.5])
          cube([4.4, 4.8, 67.0], center = true);
      }
    }

    // b) Rubber-band return anchor hook post on front floor clear of lever sweep
    translate([-12.0, -24.0, 0])
      cylinder(h = 11.0, d1 = 5.4, d2 = 4.0);

    // c) Horizontal-Shaft SG90 Servo Pedestal at X = -43.0, Y = 16.75 (front wall at Y = +3.5, cleanly 0.8 mm behind ghost tracks;
    //    shaft points along -Y at X = -48.5, Z_world = 32.0, swinging the lever arm vertically in Y = -11.0..-6.5 XZ plane!)
    translate([-43.0, 16.75, 0])
    difference() {
      chamfer_box(sg90_flange_w + 5.6, sg90_body_h + 4.0, 36.0, r = 2.4, ch_bot = 0, ch_top = 0.6);
      // Horizontal SG90 body slot (23.1 W along X, 22.5 D along Y, 14.5 H open at top Z = 36 for drop-in clamping)
      translate([0, 0, 29.5])
        cube([sg90_body_w, sg90_body_h, sg90_body_d + 2.0], center = true);
      // Flange ear slot (4.0..6.5 mm behind case top Y_front = -11.25 -> center y_local = -6.0)
      translate([0, -sg90_body_h / 2 + 5.25, 29.5])
        cube([sg90_flange_w, sg90_flange_h + 0.4, sg90_body_d + 2.0], center = true);
      // Two horizontal M2 mounting screw pilot bores (27.5 mm c-c)
      for (sx = [-1, 1]) {
        translate([sx * sg90_hole_span / 2, -sg90_body_h / 2 + 5.25, 29.0])
          rotate([90, 0, 0])
            cylinder(h = 12.0, d = sg90_m2_pilot_d, center = true);
      }
      // Shaft & bearing boss clearance notch facing -Y
      translate([sg90_shaft_off_x, -sg90_body_h / 2 - 2.0, 29.0])
        cube([14.0, 8.0, 16.0], center = true);
    }

    // d) ESP32-WROOM-32E DevKitC V4 Board Cradle on right side of floor (X = 58, Y = 12, clear of X <= 39.5 ghost track;
    //    includes 4x M2 screw bosses, antenna keep-out window, and rear USB-C channel)
    translate([58.0, 12.0, 0])
      esp32_devkitc_cradle(wall = 2.4, h = 7.5);
  }
}

color(col_leather) prop_01_chest_body();
