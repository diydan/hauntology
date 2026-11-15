// Hauntology Tabletop Print Kit — Prop #1: Ghost in the Box (Chest Body)
// Colour: Leather (#6b4d33)
// Size: 160 W x 90 D x 70 H mm
// Sticker details: Front brass latch plate pocket (32 x 20 mm)
// Hardware: 1x SG90 servo cradle, vertical ghost slider track, rubber-band post, rear ESP32 bay
// Print orientation: Flat on chest base (Z = 0), zero supports.

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

      // 4. Front raised latch escutcheon frame (35.2 x 23.2 mm)
      translate([0, -chest_d / 2 - 0.8, chest_h - 14.0])
        rotate([90, 0, 0])
          chamfer_box(35.2, 23.2, 2.0, r = 2.2, ch_bot = 0.6, ch_top = 0.4);

      // 5. Rear twin hinge knuckles (at X = -52 and +52, Z = chest_h - 3)
      for (hx = [-52, 52]) {
        hull() {
          translate([hx, chest_d / 2 + 2.2, chest_h - 3.5])
            rotate([0, 90, 0])
              cylinder(h = 16.0, d = 8.4, center = true);
          translate([hx, chest_d / 2 - 1.0, chest_h - 12.0])
            cube([16.0, 2.0, 2.0], center = true);
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

    // 9. Rear hinge pin bores (3.2 mm through-hole for 3 mm filament/wire hinge pin)
    for (hx = [-52, 52]) {
      translate([hx, chest_d / 2 + 2.2, chest_h - 3.5])
        rotate([0, 90, 0])
          cylinder(h = 20.0, d = 3.2, center = true);
    }

    // 10. Rear bottom USB / power cable exit port (45-deg teardrop roof for support-free printing)
    translate([38, chest_d / 2, 10.0])
      rotate([90, 0, 0])
        hull() {
          cube([esp32_usb_w, esp32_usb_h, 10.0], center = true);
          translate([0, esp32_usb_h / 2 + 2.5, 0])
            cylinder(h = 10.0, d = 2.0, center = true);
        }
  }

  // 11. Internal Mechanism Mounts (sitting on chest floor z = 3.6)
  translate([0, 0, 3.6]) {
    // a) Vertical Ghost Slider Guide Tower at X = 0, Y = -8 (accepts 6.0 x 3.2 mm stem with 0.3 mm clearance = 6.6 x 3.8 mm slot)
    translate([0, -10.0, 0])
    difference() {
      chamfer_box(16.0, 12.0, 52.0, r = 2.0, ch_bot = 0.4, ch_top = 0.6);
      // Through vertical guide channel (6.6 x 3.8 mm)
      translate([0, 0, 26.0])
        cube([6.6, 3.8, 56.0], center = true);
      // Open rear slot so the lever arm fork can drive the ghost pin from +Y
      translate([0, 4.0, 28.0])
        cube([4.4, 8.0, 52.0], center = true);
    }

    // b) Rubber-band return anchor hook post at base of guide tower
    translate([-11.0, -10.0, 0])
      cylinder(h = 10.0, d1 = 5.0, d2 = 4.0);

    // c) SG90 Servo Cradle Mount (positioned at X = -28, Y = 4 so horn swings in X-Z plane to lift lid & ghost)
    translate([-28.0, 6.0, 0])
      sg90_cradle_block(wall = 2.8);

    // d) ESP32 DevKitC Board Cradle on right side of floor (X = 38, Y = 8)
    translate([38.0, 8.0, 0])
    difference() {
      chamfer_box(esp32_w + 4.8, esp32_d + 4.8, 6.5, r = 2.0, ch_bot = 0.4, ch_top = 0.4);
      translate([0, 0, 2.0])
        cube([esp32_w, esp32_d, 6.0], center = true);
      translate([0, 0, 0])
        cube([esp32_w - 4.0, esp32_d - 4.0, 6.0], center = true);
    }
  }
}

color(col_leather) prop_01_chest_body();
