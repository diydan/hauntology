// Hauntology Tabletop Print Kit — Prop #1: Ghost in the Box (Chest Body)
// Colour: Leather (#6b4d33)
// Size: 160 W x 90 D x 70 H mm
// Sticker details: Front brass latch plate pocket (32 x 20 mm)
// Hardware: 1x horizontal-shaft SG90 servo cradle (swings lever arm in X-Z plane), vertical ghost slider track,
//           rubber-band post, rear-facing ESP32 DevKitC bay + USB-C port, WS2812B LED channel
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

      // 3. Four corner iron-strap bolsters
      for (sx = [-1, 1], sy = [-1, 1]) {
        translate([sx * (chest_w / 2 - 4.0), sy * (chest_d / 2 - 4.0), 0])
          chamfer_box(10.0, 10.0, chest_h, r = 2.0, ch_bot = 1.0, ch_top = 0.4);
      }

      // 4. Front raised latch escutcheon frame (35.2 x 23.2 mm, sunk 1 mm into front wall so it is 1 solid piece)
      translate([0, -chest_d / 2 + 1.0, chest_h - 14.0])
        rotate([90, 0, 0])
          chamfer_box(35.2, 23.2, 2.8, r = 2.2, ch_bot = 0, ch_top = 0.4);

      // 5. Rear twin hinge knuckles (at X = -52 and +52, Y = +47.2, Z = chest_h - 2.0 = 68.0 mm — coaxial with lid!)
      for (hx = [-52, 52]) {
        hull() {
          translate([hx, chest_d / 2 + 2.2, chest_h - 2.0])
            rotate([0, 90, 0])
              cylinder(h = 16.0, d = 8.4, center = true);
          translate([hx, chest_d / 2 - 1.5, chest_h - 11.0])
            cube([16.0, 3.0, 2.0], center = true);
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

    // 8. Horizontal wood plank V-grooves on front, back, and sides
    for (zp = [18, 34, 50]) {
      for (sy = [-1, 1])
        translate([0, sy * (chest_d / 2 + 0.2), zp])
          rotate([45, 0, 0])
            cube([chest_w - 16, 1.4, 1.4], center = true);
      for (sx = [-1, 1])
        translate([sx * (chest_w / 2 + 0.2), 0, zp])
          rotate([0, 45, 0])
            cube([1.4, chest_d - 16, 1.4], center = true);
    }

    // 9. Rear hinge pin bores (3.2 mm through-hole at Z = chest_h - 2.0 = 68.0 mm, coaxial with lid hinge barrels)
    for (hx = [-52, 52]) {
      translate([hx, chest_d / 2 + 2.2, chest_h - 2.0])
        rotate([0, 90, 0])
          cylinder(h = 20.0, d = 3.2, center = true);
    }

    // 10. Rear bottom USB-C cable exit port aligned with ESP32 cradle at X = 48
    translate([48.0, chest_d / 2, 10.5])
      rotate([90, 0, 0])
        hull() {
          cube([esp32_usb_w, esp32_usb_h, 10.0], center = true);
          translate([0, esp32_usb_h / 2 + 2.5, 0])
            cylinder(h = 10.0, d = 2.0, center = true);
        }
  }

  // 11. Internal Mechanism Mounts (sunk into floor at z = 3.0 so CSG welds them into a single manifold solid)
  translate([0, 0, 3.0]) {
    // a) Vertical Ghost Slider Guide Tower at X = 0, Y = -10 (accepts 6.0 x 3.2 mm stem with 0.3 mm clearance = 6.6 x 3.8 mm slot)
    translate([0, -10.0, 0])
    difference() {
      chamfer_box(16.0, 12.0, 52.0, r = 2.0, ch_bot = 0, ch_top = 0.6);
      // Through vertical guide channel (6.6 x 3.8 mm)
      translate([0, 0, 26.5])
        cube([6.6, 3.8, 56.0], center = true);
      // Open rear slot (+Y) so the ghost's cam-follower pin projects out to engage the servo lever fork
      translate([0, 4.0, 28.5])
        cube([4.8, 8.0, 52.0], center = true);
    }

    // b) Rubber-band return anchor hook post at base of guide tower
    translate([-11.0, -10.0, 0])
      cylinder(h = 11.0, d1 = 5.4, d2 = 4.0);

    // c) Horizontal-Shaft SG90 Servo Pedestal at X = -42, Y = 8 (shaft points along -Y at X = -47.5, Z = 20,
    //    so the 50 mm lever arm swings vertically in the X-Z plane to lift both the lid ramp & ghost pin at X = 0!)
    translate([-42.0, 8.0, 0])
    difference() {
      chamfer_box(sg90_flange_w + 5.6, sg90_body_h + 4.0, 26.0, r = 2.4, ch_bot = 0, ch_top = 0.6);
      // Horizontal SG90 body slot (23.1 W along X, 22.5 D along Y, 12.5 H open at top for drop-in clamping)
      translate([0, 0, 19.5])
        cube([sg90_body_w, sg90_body_h, sg90_body_d + 2.0], center = true);
      // Flange ear slot
      translate([0, -sg90_body_h / 2 + 4.0, 19.5])
        cube([sg90_flange_w, sg90_flange_h + 0.4, sg90_body_d + 2.0], center = true);
      // Two horizontal M2 mounting screw pilot bores (27.5 mm c-c)
      for (sx = [-1, 1]) {
        translate([sx * sg90_hole_span / 2, -sg90_body_h / 2 + 4.0, 19.5])
          rotate([90, 0, 0])
            cylinder(h = 12.0, d = sg90_m2_pilot_d, center = true);
      }
      // Shaft & horn clearance notch facing -Y
      translate([sg90_shaft_off_x, -sg90_body_h / 2 - 2.0, 19.5])
        cube([14.0, 8.0, 16.0], center = true);
    }

    // d) ESP32-WROOM-32E DevKitC V4 Board Cradle on right side of floor (X = 48, Y = 10;
    //    includes 4x M2 screw bosses, antenna keep-out window, and rear USB-C channel)
    translate([48.0, 10.0, 0])
      esp32_devkitc_cradle(wall = 2.4, h = 7.5);
  }
}

color(col_leather) prop_01_chest_body();
