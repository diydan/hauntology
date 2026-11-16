// Hauntology Tabletop Print Kit — Prop #5: Haunting Flipper (2-Seat Modular Plinth Segment)
// Colour: Bone (#e9e4d8, warm white)
// Size: 105.7 W x 45.2 D x 45.0 H mm (print 3 segments and slide dovetails together for the 6-seat row)
// Sticker details: Two 18 mm circular seat-colour disc pockets on the front face
// Hardware: Two vertical SG90 servo pockets + 3 Resolve LED windows per seat (with bottom-loading slot for
//           prop-05-resolve-insert.stl) + continuous underside wire & WS2812B LED bus trench
// Print orientation: Flat on plinth base (Z = 0), no supports: every downward-facing slope is <= 50 deg from vertical (1 connected component).

include <_common.scad>

seg_w     = 100.0; // Two 50 mm seats per segment
seg_d     = 42.0;
seg_h     = 45.0;
seat_span = 50.0;

module prop_05_plinth_2seat() {
  difference() {
    union() {
      // 1. Main 2-seat stepped gothic crypt plinth (flush on X = +-50.0 so segments tile cleanly!)
      chamfer_box(seg_w, seg_d, seg_h, r = 3.0, ch_bot = 0.8, ch_top = 0.8);
      chamfer_box(seg_w, seg_d + 2.4, 5.5, r = 3.0, ch_bot = 0.8, ch_top = 1.0);

      // 2. Crypt Pilaster Columns on front (-Y) rising smoothly from base skirt Z=0 to top Z=44.5 (X within +-49)
      for (px = [-46.2, 0.0, 46.2]) {
        hull() {
          translate([px, -seg_d / 2 - 0.5, 0]) chamfer_box(5.6, 2.2, 5.5, r = 0.8, ch_bot = 0.6, ch_top = 0.2);
          translate([px, -seg_d / 2 - 0.1, 22.0]) chamfer_box(3.8, 1.8, 18.0, r = 0.6, ch_bot = 0.2, ch_top = 0.2);
          translate([px + (px == 0 ? 0.5 : 0), -seg_d / 2 + 0.2, seg_h - 4.0]) chamfer_box(5.2, 1.8, 3.6, r = 0.6, ch_bot = 0.2, ch_top = 0.6);
        }
      }

      // 3. Pointed Gothic Lancet Pier Colonnettes framing the 3 Resolve LEDs per seat (Z = 0..22, 45-deg safe!)
      for (sx = [-seat_span / 2, seat_span / 2]) {
        for (cx = [-15.0, -5.0, 5.0, 15.0]) {
          hull() {
            translate([sx + cx, -seg_d / 2 - 0.4, 0]) chamfer_box(2.8, 1.8, 15.5, r = 0.5, ch_bot = 0.5, ch_top = 0.2);
            translate([sx + cx, -seg_d / 2 + 0.5, 19.5]) cube([2.0, 1.2, 0.8], center = true);
          }
        }
        // Gothic lancet pointed arch ribs uniting pier tops cleanly ABOVE each LED window (Z = 15..22)
        for (lx = [-10.0, 0.0, 10.0]) {
          for (side = [-1, 1]) {
            hull() {
              translate([sx + lx + side * 4.8, -seg_d / 2 + 0.1, 15.0]) cylinder(h = 1.2, d = 1.8);
              translate([sx + lx, -seg_d / 2 + 0.3, 20.6]) cylinder(h = 0.8, d = 1.6);
            }
          }
        }
      }

      // 4. Right-end (+X) Male Dovetail Tenon (starts cleanly at Z = 0 with no overhang slivers!)
      translate([seg_w / 2 - 0.4, 0, 0])
        rotate([0, 0, -90])
          dovetail_tenon(h = seg_h - 4.0, n_w = 8.0, f_w = 11.4, d_len = 5.4, ch = 0.6);

      // 5. Gothic Gargoyle-Winged Circular Medallion Bezels for the two Seat Colour Disc stickers
      for (sx = [-seat_span / 2, seat_span / 2]) {
        translate([sx, -seg_d / 2 + 1.0, 29.5])
          rotate([90, 0, 0])
            cylinder(h = 2.4, d1 = 21.8, d2 = 20.0);
        // Side gothic cusp ears on left/right flanks of disc bezel (slope 45 deg down to plinth front!)
        for (ex = [-1, 1]) {
          hull() {
            translate([sx + ex * 10.0, -seg_d / 2 + 0.6, 29.5]) rotate([90, 0, 0]) cylinder(h = 1.8, d = 4.6);
            translate([sx + ex * 14.5, -seg_d / 2 + 0.8, 30.8]) rotate([90, 0, 0]) cylinder(h = 1.2, d = 1.6);
          }
        }
      }
    }

    // 4. Left-end (-X) Female Dovetail Mortise (with 0.3 mm clearance)
    translate([-seg_w / 2, 0, 0])
      rotate([0, 0, -90])
        dovetail_mortise_fit(h = seg_h + 1.0, n_w = 8.0, f_w = 11.4, d_len = 5.4, ch = 0.6, inset = 0.4, clr = clear_move);

    // 5. Two Vertical SG90 Servo Pockets (shifted by -sg90_shaft_off_x = +5.5 mm so output shafts sit dead-center on X = +-25.0 mm,
    //    and ear shelf sunk to Z = 38.2 mm so the SG90 body sits flush below Z = 45.0 with wire-grommet relief!)
    for (sx = [-seat_span / 2, seat_span / 2]) {
      px = sx - sg90_shaft_off_x; // -19.5 and +30.5 (fits cleanly inside X = +-50!)
      // Lower body chamber (Z = 21.8..46, above the Z = 20.0 ESP32 vault peak)
      translate([px, 3.0, seg_h - 11.6])
        cube([sg90_body_w, sg90_body_d, 23.6], center = true);
      // Mounting flange ear recess sunk so case top sits flush at Z = 44.7 <= 45.0
      translate([px, 3.0, seg_h - 3.4])
        cube([sg90_flange_w, sg90_body_d, 6.85], center = true);
      // M2 pilot holes for SG90 mounting screws
      for (ex = [-1, 1]) {
        translate([px + ex * sg90_hole_span / 2, 3.0, seg_h - 15.8])
          cylinder(h = 10.0, d = sg90_m2_pilot_d);
      }
      // Side wire-grommet & drop chute straight down into the underside ESP32 & bus bay (stays clear of px - 13.75 M2 screw boss!)
      translate([px - 9.2, 3.0, 21.0])
        cube([5.2, sg90_cable_w + 1.0, 24.0], center = true);
    }

    // 6. Front 0.4 mm Recessed Sticker Pockets for Seat Colour Discs (18.2 mm dia)
    for (sx = [-seat_span / 2, seat_span / 2]) {
      translate([sx, -seg_d / 2 - 1.4 + sticker_depth, 29.5])
        rotate([90, 0, 0])
          cylinder(h = sticker_depth + 0.6, d = 18.2);
    }

    // 7. Three Resolve Lamp LED Windows per Seat + Bottom-Entry Diffuser Insert Slot (Z = -0.1..19.5)
    for (sx = [-seat_span / 2, seat_span / 2]) {
      for (lx = [-10.0, 0.0, 10.0]) {
        // Print-safe teardrop-topped 5 mm LED window from front into diffuser slot
        translate([sx + lx, -seg_d / 2 + 4.0, 12.0])
          rotate([90, 0, 0])
            hull() {
              cylinder(h = 14.0, d = 5.0, center = true);
              translate([0, 2.6, 0]) cylinder(h = 14.0, d = 1.0, center = true);
            }
      }
      // Bottom-entry vertical pocket (37.0 x 2.8 x 19.6 mm, open at Z = 0) so prop-05-resolve-insert.stl
      // (36.4 x 14.0 x 2.4 mm) slides straight in from the underside!
      translate([sx, -seg_d / 2 + 6.0, 9.7])
        cube([37.0, 2.8, 19.6], center = true);
    }

    // 8. Continuous Underside ESP32 DevKitC & WS2812B LED Bus Vault: 29.6 mm wide (Y = -12.4..+17.2, keeping a sturdy 1.20 mm
    //    wall behind the Y = -16.4..-13.6 Resolve diffuser slots AND wide enough for an ESP32-DevKitC V4!), 7.2 mm vertical walls,
    //    then a true 45-deg vaulted roof up to a 4.0 mm ridge at Z = 20.0 (1.8 mm solid below the Z = 21.8 SG90 floors!) + rear USB-C port.
    translate([0, 2.4, 0])
      hull() {
        translate([0, 0, 3.55]) cube([seg_w - 16.0, 29.6, 7.3], center = true);
        translate([0, 0, 19.8]) cube([seg_w - 20.0, 4.0, 0.4], center = true);
      }
    // Continuous inter-segment wire & LED bus pass-through trench through left & right dovetail ends (<= 45 deg roof)
    translate([0, 2.4, 0])
      hull() {
        translate([0, 0, 2.5]) cube([seg_w + 20.0, 14.0, 5.2], center = true);
        translate([0, 0, 10.1]) cube([seg_w + 20.0, 2.0, 0.4], center = true);
      }
    // Rear (+Y) 45-deg gabled USB-C power & programming port into the underside ESP32 bay
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
