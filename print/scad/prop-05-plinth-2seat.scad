// Hauntology Tabletop Print Kit — Prop #5: Haunting Flipper (Lightweight 2-Seat Modular Plinth Segment)
// Colour: Ink / Dark Iron (#262229)
// Size: 105.0 W x 44.8 D x 45.0 H mm (deep-vaulted lightweight shell: ~43% less filament per segment)
// Sticker details: Two 18 mm circular seat-colour disc pockets on the front face
// Hardware: Two centered & sunk SG90 servo pockets + 6 Resolve LED windows + vaulted ESP32 & WS2812B bus bay
// Print orientation: Flat on plinth base (Z = 0), zero supports (1 connected component).

include <_common.scad>

seg_w     = 100.0;
seg_d     = 42.0;
seg_h     = 45.0;
seat_span = 50.0;

module prop_05_plinth_2seat() {
  difference() {
    union() {
      // 1. Main 2-seat stepped gothic crypt plinth (flush on X = +-50.0 so segments tile cleanly)
      chamfer_box(seg_w, seg_d, seg_h, r = 3.0, ch_bot = 0.8, ch_top = 0.8);
      chamfer_box(seg_w, seg_d + 2.4, 5.5, r = 3.0, ch_bot = 0.8, ch_top = 1.0);

      // 2. Crypt Pilaster Columns on front (-Y)
      for (px = [-46.2, 0.0, 46.2]) {
        hull() {
          translate([px, -seg_d / 2 - 0.5, 0]) chamfer_box(5.6, 2.2, 5.5, r = 0.8, ch_bot = 0.6, ch_top = 0.2);
          translate([px, -seg_d / 2 - 0.1, 22.0]) chamfer_box(3.8, 1.8, 18.0, r = 0.6, ch_bot = 0.2, ch_top = 0.2);
          translate([px + (px == 0 ? 0.5 : 0), -seg_d / 2 + 0.2, seg_h - 4.0]) chamfer_box(5.2, 1.8, 3.6, r = 0.6, ch_bot = 0.2, ch_top = 0.6);
        }
      }

      // 3. Pointed Gothic Lancet Pier Colonnettes framing the 3 Resolve LEDs per seat
      for (sx = [-seat_span / 2, seat_span / 2]) {
        for (cx = [-15.0, -5.0, 5.0, 15.0]) {
          hull() {
            translate([sx + cx, -seg_d / 2 - 0.4, 0]) chamfer_box(2.8, 1.8, 15.5, r = 0.5, ch_bot = 0.5, ch_top = 0.2);
            translate([sx + cx, -seg_d / 2 + 0.5, 19.5]) cube([2.0, 1.2, 0.8], center = true);
          }
        }
        for (lx = [-10.0, 0.0, 10.0]) {
          for (side = [-1, 1]) {
            hull() {
              translate([sx + lx + side * 4.8, -seg_d / 2 + 0.1, 15.0]) cylinder(h = 1.2, d = 1.8);
              translate([sx + lx, -seg_d / 2 + 0.3, 20.6]) cylinder(h = 0.8, d = 1.6);
            }
          }
        }
      }

      // 4. Right-end (+X) Male Dovetail Tenon
      translate([seg_w / 2 - 0.4, 0, 0])
        rotate([0, 0, -90])
          dovetail_tenon(h = seg_h - 4.0, n_w = 8.0, f_w = 11.4, d_len = 5.4, ch = 0.6);

      // 5. Gothic Gargoyle-Winged Circular Medallion Bezels for the two Seat Colour Disc stickers
      for (sx = [-seat_span / 2, seat_span / 2]) {
        translate([sx, -seg_d / 2 + 1.0, 29.5])
          rotate([90, 0, 0])
            cylinder(h = 2.4, d1 = 21.8, d2 = 20.0);
        for (ex = [-1, 1]) {
          hull() {
            translate([sx + ex * 10.0, -seg_d / 2 + 0.6, 29.5]) rotate([90, 0, 0]) cylinder(h = 1.8, d = 4.6);
            translate([sx + ex * 14.5, -seg_d / 2 + 0.8, 30.8]) rotate([90, 0, 0]) cylinder(h = 1.2, d = 1.6);
          }
        }
      }
    }

    // 4. Left-end (-X) Female Dovetail Mortise
    translate([-seg_w / 2, 0, 0])
      rotate([0, 0, -90])
        dovetail_mortise_fit(h = seg_h + 1.0, n_w = 8.0, f_w = 11.4, d_len = 5.4, ch = 0.6, inset = 0.4, clr = clear_move);

    // 5. Two Vertical SG90 Servo Pockets (shafts centered on X = +-25.0, sunk flush below Z = 45.0)
    for (sx = [-seat_span / 2, seat_span / 2]) {
      px = sx - sg90_shaft_off_x; // -19.5 and +30.5
      translate([px, 3.0, seg_h - 11.6])
        cube([sg90_body_w, sg90_body_d, 23.6], center = true);
      translate([px, 3.0, seg_h - 3.4])
        cube([sg90_flange_w, sg90_body_d, 6.85], center = true);
      for (ex = [-1, 1]) {
        translate([px + ex * sg90_hole_span / 2, 3.0, seg_h - 15.8])
          cylinder(h = 10.0, d = sg90_m2_pilot_d);
      }
      translate([px - 9.2, 3.0, 21.0])
        cube([5.2, sg90_cable_w + 1.0, 24.0], center = true);
    }

    // 6. Front 0.4 mm Recessed Sticker Pockets for Seat Colour Discs
    for (sx = [-seat_span / 2, seat_span / 2]) {
      translate([sx, -seg_d / 2 - 1.4 + sticker_depth, 29.5])
        rotate([90, 0, 0])
          cylinder(h = sticker_depth + 0.6, d = 18.2);
    }

    // 7. Three Resolve Lamp LED Windows per Seat + Bottom-Entry Diffuser Insert Slot
    for (sx = [-seat_span / 2, seat_span / 2]) {
      for (lx = [-10.0, 0.0, 10.0]) {
        translate([sx + lx, -seg_d / 2 + 4.0, 12.0])
          rotate([90, 0, 0])
            hull() {
              cylinder(h = 14.0, d = 5.0, center = true);
              translate([0, 2.6, 0]) cylinder(h = 14.0, d = 1.0, center = true);
            }
      }
      translate([sx, -seg_d / 2 + 6.0, 9.7])
        cube([37.0, 2.8, 19.6], center = true);
    }

    // 8. Underside ESP32 DevKitC & WS2812B Bus Vault (29.6 x 84 mm) + High Weight-Relief Vaults in Unused Solid Piers:
    translate([0, 2.4, 0])
      hull() {
        translate([0, 0, 3.55]) cube([seg_w - 16.0, 29.6, 7.3], center = true);
        translate([0, 0, 19.8]) cube([seg_w - 20.0, 4.0, 0.4], center = true);
      }
    // High center vault between left & right SG90s (X = -3.4..+14.4, clear of M2 bores at -5.75 & +16.75 and ears!)
    translate([5.5, 3.2, -0.1])
      hull() {
        linear_extrude(height = 33.6) rrect2d(17.8, 30.8, r = 1.8);
        translate([0, 0, 42.2]) linear_extrude(height = 0.3) rrect2d(1.8, 14.0, r = 0.8);
      }
    // Left pier vault between -X dovetail (X <= -44.7) & left SG90 ear/M2 (X >= -35.9 / -33.25)
    translate([-39.2, 3.2, -0.1])
      hull() {
        linear_extrude(height = 32.5) rrect2d(6.8, 30.8, r = 1.4);
        translate([0, 0, 35.6]) linear_extrude(height = 0.3) rrect2d(1.6, 24.8, r = 0.6);
      }
    // Full-width rear upper gallery behind SG90 bodies (Y = +11.6..+18.6, X = -42.4..+46.0, rising to Z = 42.2!)
    translate([1.8, 15.1, -0.1])
      hull() {
        linear_extrude(height = 39.2) rrect2d(88.4, 7.0, r = 1.4);
        translate([0, 0, 42.2]) linear_extrude(height = 0.3) rrect2d(82.4, 1.8, r = 0.6);
      }
    // Full-width front upper gallery between Resolve slots (Y <= -13.6) & SG90 bodies (Y >= -3.25): Y = -12.2..-5.6
    translate([0.0, -8.9, -0.1])
      hull() {
        linear_extrude(height = 39.2) rrect2d(84.8, 6.6, r = 1.4);
        translate([0, 0, 42.2]) linear_extrude(height = 0.3) rrect2d(78.8, 1.8, r = 0.6);
      }

    // Continuous inter-segment wire & LED bus pass-through trench through left & right dovetail ends
    translate([0, 2.4, 0])
      hull() {
        translate([0, 0, 2.5]) cube([seg_w + 20.0, 14.0, 5.2], center = true);
        translate([0, 0, 10.1]) cube([seg_w + 20.0, 2.0, 0.4], center = true);
      }
    // Rear (+Y) 45-deg gabled USB-C power & programming port
    translate([0, seg_d / 2, 3.8])
      rotate([90, 0, 0])
        hull() {
          cube([esp32_usb_w + 0.8, esp32_usb_h + 0.4, 12.0], center = true);
          translate([0, (esp32_usb_h + 0.4) / 2 + 5.6, 0])
            cylinder(h = 12.0, d = 1.6, center = true);
        }
  }
}

color(col_bone) prop_05_plinth_2seat();
