// Hauntology Tabletop Print Kit — Prop #15: Relic Vault (3x4 Keypad & ESP32 Side Pod)
// Colour: Leather (#6b4d33) or Ink (#0b0d10)
// Size: 76 W x 114 D x 32 H mm
// Sticker details: Recessed "ENTER PIN" label pocket (48 x 9 mm)
// Hardware: Standard 3x4 keypad recess (53 x 63 mm), 4-digit display window, ESP32 DevKitC cradle, dovetail tenon
// Print orientation: Flat on pod base (Z = 0), zero supports.

include <_common.scad>

pod_w = 76.0;
pod_d = 114.0;
pod_h = 32.0;

module prop_15_keypad_pod() {
  difference() {
    union() {
      // 1. Sloped console housing (chamfered tabletop pod)
      hull() {
        chamfer_box(pod_w, pod_d, 18.0, r = 3.5, ch_bot = 0.8, ch_top = 0.2);
        translate([0, 12.0, 18.0])
          chamfer_box(pod_w - 2.0, pod_d - 24.0, pod_h - 18.0, r = 3.0, ch_bot = 0.2, ch_top = 0.8);
      }

      // 2. Left-Wall (-X) Male Dovetail Tenon (mates with the right wall of the Relic Vault chest)
      translate([-pod_w / 2 + 0.1, -10.0, 0])
        rotate([0, 0, 90])
          dovetail_tenon(h = 26.0, n_w = 8.0, f_w = 11.4, d_len = 4.5, ch = 0.5);
    }

    // 3. Top Recessed Pocket for 3 x 4 Keypad Module (53.0 x 63.0 x 3.2 mm)
    translate([0, -14.0, 17.5])
      rotate([-9.5, 0, 0])
        linear_extrude(height = 16.0)
          rrect2d(53.0, 63.0, r = 2.0);

    // Keypad 7-pin ribbon cable slot into interior ESP32 bay
    translate([0, 14.0, 10.0])
      cube([24.0, 6.0, 24.0], center = true);

    // 4. Upper 4-Digit Display Window Recess (42 x 18 mm)
    translate([0, 32.0, pod_h - 3.6])
      linear_extrude(height = 5.0)
        rrect2d(42.0, 18.0, r = 1.8);

    // 5. Recessed 0.4 mm Sticker Pocket for "ENTER PIN" Label (48 x 9 mm at top header)
    translate([0, 46.5, pod_h - sticker_depth])
      linear_extrude(height = sticker_depth + 0.6)
        rrect2d(48.0, 9.0, r = 1.0);

    // 6. Underside / Interior ESP32 DevKitC Cavity (45-deg self-supporting roof!)
    translate([0, 8.0, 6.0])
      hull() {
        cube([esp32_w, esp32_d, 12.2], center = true);
        translate([0, 0, 8.5])
          cube([esp32_w - 16.0, esp32_d - 16.0, 1.0], center = true);
      }

    // Left-side cable pass-through hole matching the Vault Chest conduit
    translate([-pod_w / 2, 16.0, 12.0])
      rotate([0, 90, 0])
        hull() {
          cylinder(h = 16.0, d = 8.0, center = true);
          translate([-4.2, 0, 0]) cylinder(h = 16.0, d = 1.6, center = true);
        }
  }
}

color(col_leather) prop_15_keypad_pod();
