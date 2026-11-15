// Hauntology Tabletop Print Kit — Prop #15: Relic Vault (3x4 Keypad & ESP32 Side Pod)
// Colour: Leather (#6b4d33) or Ink (#0b0d10)
// Size: 92.4 W x 124 D x 32 H mm
// Sticker details: Recessed "ENTER PIN" label pocket (48 x 9 mm)
// Hardware: Standard 3x4 keypad recess (71.0 x 78.0 mm for standard 70 x 77 mm keypad) parallel to sloped console deck,
//           4-digit display window, ESP32-WROOM-32E DevKitC V4 bay (45-deg vaulted roof, zero supports) + rear USB-C port
// Print orientation: Flat on pod base (Z = 0), zero supports (1 connected component).

include <_common.scad>

pod_w = 88.0;
pod_d = 124.0;
pod_h = 32.0;

// Uniform console deck slope between tangent points (Y = -58.5, Z = 18) and (Y = +28.0, Z = 32):
deck_slope_deg = atan2(14.0, 86.5);

module prop_15_keypad_pod() {
  difference() {
    union() {
      // 1. Uniformly sloped console housing (Z = 18 at Y = -62 rising smoothly to Z = 32 at Y = +28..+62)
      hull() {
        chamfer_box(pod_w, pod_d, 18.0, r = 3.8, ch_bot = 0.9, ch_top = 0.2);
        translate([0, 45.0, 18.0])
          chamfer_box(pod_w - 1.6, 34.0, pod_h - 18.0, r = 3.2, ch_bot = 0.2, ch_top = 0.9);
      }

      // 2. Raised Chamfered Keypad Bezel Frame on the Sloped Deck (75.6 x 82.6 mm framing the 71 x 78 mm standard keypad)
      translate([0, -16.0, 24.8])
        rotate([deck_slope_deg, 0, 0])
          translate([0, 0, -2.2])
            chamfer_box(75.6, 82.6, 4.0, r = 3.0, ch_bot = 0, ch_top = 0.8);

      // 3. Left-Wall (-X) Male Dovetail Tenon (mates with the right wall of the Relic Vault chest)
      translate([-pod_w / 2 + 0.4, -10.0, 0])
        rotate([0, 0, 90])
          dovetail_tenon(h = 24.0, n_w = 8.0, f_w = 11.4, d_len = 4.8, ch = 0.5);
    }

    // 4. Top Recessed Pocket for Standard 70 x 77 mm 3x4 Keypad Module (71.0 x 78.0 x 3.0 mm, centered inside bezel!)
    translate([0, -16.0, 24.8])
      rotate([deck_slope_deg, 0, 0])
        translate([0, 0, -1.2])
          linear_extrude(height = 8.0)
            rrect2d(71.0, 78.0, r = 2.0);

    // Keypad 7-pin ribbon cable slot into interior ESP32 bay
    translate([0, 18.0, 15.0])
      cube([24.0, 6.0, 22.0], center = true);

    // 5. Upper 4-Digit Display Window Recess on flat header deck (42 x 15 mm at Y = 37, Z = 28.8..32)
    translate([0, 37.0, pod_h - 3.2])
      linear_extrude(height = 5.0)
        rrect2d(42.0, 15.0, r = 1.8);

    // 6. Recessed 0.4 mm Sticker Pocket for "ENTER PIN" Label (48 x 9 mm at top header Y = 52.0)
    translate([0, 52.0, pod_h - sticker_depth])
      linear_extrude(height = sticker_depth + 0.6)
        rrect2d(48.0, 9.0, r = 1.0);

    // 7. Underside / Interior ESP32-WROOM-32E DevKitC V4 Cavity (45-deg vaulted roof converging into the ribbon slot -> zero supports!)
    translate([0, 18.0, -0.1])
      hull() {
        linear_extrude(height = 6.0)
          rrect2d(esp32_d + 2.0, esp32_w + 4.0, r = 2.0);
        translate([0, 0, 18.5])
          linear_extrude(height = 0.5)
            rrect2d(4.0, 24.0, r = 1.0);
      }

    // 8. Rear USB-C Power & Programming Port Cutout (Y = pod_d/2, Z = 5.0; reaches into ESP32 cavity!)
    translate([0, pod_d / 2, 5.0])
      rotate([90, 0, 0])
        hull() {
          cube([esp32_usb_w, esp32_usb_h, 36.0], center = true);
          translate([0, esp32_usb_h / 2 + 2.5, 0])
            cylinder(h = 36.0, d = 2.0, center = true);
        }

    // 9. Left-side cable pass-through hole matching the Vault Chest conduit
    translate([-pod_w / 2, 16.0, 12.0])
      rotate([0, 90, 0])
        hull() {
          cylinder(h = 16.0, d = 8.0, center = true);
          translate([-4.2, 0, 0]) cylinder(h = 16.0, d = 1.6, center = true);
        }
  }
}

color(col_leather) prop_15_keypad_pod();
