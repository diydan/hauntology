// Hauntology Tabletop Print Kit — Prop #15: Relic Vault (3x4 Keypad & ESP32 Side Pod)
// Colour: Leather (#6b4d33) or Ink (#0b0d10)
// Size: 92.4 W x 124 D x 38 H mm
// Sticker details: Recessed "ENTER PIN" label pocket (48 x 9 mm)
// Hardware: Standard 3x4 keypad recess (71.0 x 78.0 mm for standard 70 x 77 mm keypad) parallel to sloped console deck,
//           4-digit display window, ESP32-WROOM-32E DevKitC V4 bay (14.5 mm vertical walls + 45-deg vaulted roof) + rear USB-C port
// Print orientation: Flat on pod base (Z = 0), zero supports (1 connected component).

include <_common.scad>

pod_w = 88.0;
pod_d = 124.0;
pod_h = 38.0;

// Uniform console deck slope between tangent points (Y = -58.5, Z = 24) and (Y = +28.0, Z = 38):
deck_slope_deg = atan2(14.0, 86.5);

module prop_15_keypad_pod() {
  difference() {
    union() {
      // 1. Uniformly sloped gothic console housing + right-side & front wrought-iron buttress pilasters
      //    (-X mate face stays flush at -pod_w/2 for clean dovetail assembly!)
      hull() {
        chamfer_box(pod_w, pod_d, 24.0, r = 3.8, ch_bot = 0.9, ch_top = 0.2);
        translate([0, 45.0, 24.0])
          chamfer_box(pod_w - 1.6, 34.0, pod_h - 24.0, r = 3.2, ch_bot = 0.2, ch_top = 0.9);
      }
      for (ry = [-48.0, 48.0]) {
        hull() {
          translate([pod_w / 2 - 2.0, ry, 0]) chamfer_box(9.0, 10.0, 6.0, r = 1.6, ch_bot = 0.8, ch_top = 0.4);
          translate([pod_w / 2 - 3.5, ry, ry > 0 ? 32.0 : 21.0]) chamfer_box(6.0, 7.6, 4.0, r = 1.4, ch_bot = 0.2, ch_top = 0.6);
        }
      }

      // 2. Gothic Chamfered Keypad Bezel Frame + Side Scroll Spurs (framing exact 71 x 78 mm pocket!)
      translate([0, -16.0, 30.8])
        rotate([deck_slope_deg, 0, 0])
          translate([0, 0, -2.2]) {
            chamfer_box(76.4, 83.4, 4.0, r = 2.6, ch_bot = 0, ch_top = 0.9);
            for (sx = [-1, 1]) {
              hull() {
                translate([sx * 37.8, 0, 0]) cylinder(h = 3.6, d = 6.0);
                translate([sx * 41.2, 4.0, 0]) cylinder(h = 3.0, d = 2.2);
              }
            }
          }

      // 3. Left-Wall (-X) Male Dovetail Tenon (mates cleanly with right wall of Relic Vault chest at X = +83.0)
      translate([-pod_w / 2 + 0.2, -10.0, 0])
        rotate([0, 0, 90])
          dovetail_tenon(h = 24.0, n_w = 8.0, f_w = 11.4, d_len = 4.6, ch = 0.5);
    }

    // 4. Top Recessed Pocket for Standard 70 x 77 mm 3x4 Keypad Module (71.0 x 78.0 x 3.0 mm, centered inside bezel!)
    translate([0, -16.0, 30.8])
      rotate([deck_slope_deg, 0, 0])
        translate([0, 0, -1.2])
          linear_extrude(height = 8.0)
            rrect2d(71.0, 78.0, r = 2.0);

    // Keypad 7-pin ribbon cable slot into interior ESP32 bay
    translate([0, 21.0, 27.0])
      cube([24.0, 6.0, 18.0], center = true);

    // 5. Upper 4-Digit Display Window Recess on flat header deck (42 x 15 mm at Y = 37, Z = 34.8..38) + wire/pin slot into ESP32 bay!
    translate([0, 37.0, pod_h - 3.2])
      linear_extrude(height = 5.0)
        rrect2d(42.0, 15.0, r = 1.8);
    translate([0, 35.0, 26.0])
      cube([26.0, 6.0, 20.0], center = true);

    // 6. Recessed 0.4 mm Sticker Pocket for "ENTER PIN" Label (48 x 9 mm at top header Y = 52.0)
    translate([0, 52.0, pod_h - sticker_depth])
      linear_extrude(height = sticker_depth + 0.6)
        rrect2d(48.0, 9.0, r = 1.0);

    // 7. Underside / Interior ESP32-WROOM-32E DevKitC V4 Cavity: 28.6 mm wide up to Z = 9.0 (so 27.9 mm PCB + 8.5 mm header pins fit
    //    pins-down and self-seat against the 45-deg bevel at Z = 9.35 mm!), then <= 45-deg vaulted roof + 4 M2 screw bores in bevel!
    translate([0, 18.0, -0.1])
      hull() {
        linear_extrude(height = 9.1)
          rrect2d(esp32_d + 0.2, esp32_w + 2.0, r = 1.4);
        translate([0, 0, 21.6])
          linear_extrude(height = 0.4)
            rrect2d(3.8, 33.0, r = 1.0);
      }
    for (sx = [-1, 1], sy = [-1, 1]) {
      translate([sx * esp32_hole_d / 2, 18.0 + sy * esp32_hole_w / 2, 11.5])
        cylinder(h = 7.0, d = sg90_m2_pilot_d);
    }

    // 8. Rear 45-deg Gabled USB-C Power & Programming Port Cutout (Y = pod_d/2, Z = 4.6 -> true <= 45-deg roof, zero wide bridge!)
    translate([0, pod_d / 2, 4.6])
      rotate([90, 0, 0])
        hull() {
          cube([esp32_usb_w, esp32_usb_h, 36.0], center = true);
          translate([0, esp32_usb_h / 2 + 5.4, 0])
            cylinder(h = 36.0, d = 1.6, center = true);
        }

    // 9. Left-side cable pass-through hole matching the Vault Chest conduit
    translate([-pod_w / 2 + 14.0, 16.0, 12.0])
      rotate([0, 90, 0])
        hull() {
          cylinder(h = 32.0, d = 8.0, center = true);
          translate([-4.2, 0, 0]) cylinder(h = 32.0, d = 1.6, center = true);
        }
  }
}

color(col_leather) prop_15_keypad_pod();
