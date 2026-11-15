// Hauntology Tabletop Print Kit — Prop #5: Haunting Flipper (2-Seat Modular Plinth Segment)
// Colour: Bone (#e9e4d8, warm white)
// Size: 108 W x 42 D x 45 H mm (print 3 segments and slide dovetails together for the 6-seat 306 mm row)
// Sticker details: Two 18 mm circular seat-colour disc pockets on the front face
// Hardware: Two vertical SG90 servo pockets + 3 Resolve LED windows per seat (Section 6) + wire bus channel
// Print orientation: Flat on plinth base (Z = 0), zero supports.

include <_common.scad>

seg_w     = 100.0; // Two 50 mm seats per segment
seg_d     = 42.0;
seg_h     = 45.0;
seat_span = 50.0;

module prop_05_plinth_2seat() {
  difference() {
    union() {
      // 1. Main 2-seat stepped Victorian plinth block
      chamfer_box(seg_w, seg_d, seg_h, r = 3.0, ch_bot = 0.8, ch_top = 0.8);
      chamfer_box(seg_w + 1.6, seg_d + 2.4, 5.5, r = 3.2, ch_bot = 0.8, ch_top = 1.0);

      // 2. Right-end (+X) Male Dovetail Tenon (locks into next segment's left mortise)
      translate([seg_w / 2 - 0.1, 0, 0])
        rotate([0, 0, -90])
          dovetail_tenon(h = seg_h - 4.0, n_w = 8.0, f_w = 11.4, d_len = 5.0, ch = 0.6);

      // 3. Raised circular bezels on front (-Y) for the two Seat Colour Disc stickers
      for (sx = [-seat_span / 2, seat_span / 2]) {
        translate([sx, -seg_d / 2 - 0.4, 28.5])
          rotate([90, 0, 0])
            cylinder(h = 1.6, d1 = 21.6, d2 = 20.0);
      }
    }

    // 4. Left-end (-X) Female Dovetail Mortise (with 0.3 mm clearance)
    translate([-seg_w / 2, 0, 0])
      rotate([0, 0, -90])
        dovetail_mortise(h = seg_h + 1.0, n_w = 8.0, f_w = 11.4, d_len = 5.0, clr = clear_move);

    // 5. Two Vertical SG90 Servo Pockets (each turns its seat flap 180 deg)
    for (sx = [-seat_span / 2, seat_span / 2]) {
      // Lower cable & body chamber (open from top Z = seg_h down to Z = 10)
      translate([sx, 2.0, seg_h - 14.0])
        cube([sg90_body_w, sg90_body_d, 30.0], center = true);
      // Mounting flange ear recess near top of plinth
      translate([sx, 2.0, seg_h - 1.5])
        cube([sg90_flange_w, sg90_body_d, 3.6], center = true);
      // M2 pilot holes for SG90 mounting screws
      for (ex = [-1, 1]) {
        translate([sx + ex * sg90_hole_span / 2, 2.0, seg_h - 12.0])
          cylinder(h = 11.0, d = sg90_m2_pilot_d);
      }
      // Vertical cable drop chute into the bottom bus channel
      translate([sx + 8.0, 2.0, 12.0])
        cube([6.5, sg90_cable_w, 20.0], center = true);
    }

    // 6. Front 0.4 mm Recessed Sticker Pockets for Seat Colour Discs (18.2 mm dia)
    for (sx = [-seat_span / 2, seat_span / 2]) {
      translate([sx, -seg_d / 2 - 2.0 + sticker_depth, 28.5])
        rotate([90, 0, 0])
          cylinder(h = sticker_depth + 0.6, d = 18.2);
    }

    // 7. Three Resolve Lamp LED Windows per Seat (Section 6: 3 small LED windows on each plinth front)
    for (sx = [-seat_span / 2, seat_span / 2]) {
      for (lx = [-10.0, 0.0, 10.0]) {
        // Print-safe teardrop-topped 5 mm LED window from front into diffuser slot
        translate([sx + lx, -seg_d / 2 + 4.0, 12.5])
          rotate([90, 0, 0])
            hull() {
              cylinder(h = 12.0, d = 5.0, center = true);
              translate([0, 2.6, 0]) cylinder(h = 12.0, d = 1.0, center = true);
            }
      }
      // Internal vertical slot behind the 3 windows for the translucent Resolve diffuser insert
      translate([sx, -seg_d / 2 + 6.2, 24.0])
        cube([37.2, 3.0, 38.0], center = true);
    }

    // 8. Continuous Underside Wire & WS2812B LED Bus Trench (45-deg roof, runs full X width)
    translate([0, 2.0, 4.0])
      hull() {
        cube([seg_w + 20.0, 16.0, 8.2], center = true);
        translate([0, 0, 6.0]) cube([seg_w + 20.0, 4.0, 1.0], center = true);
      }
  }
}

color(col_bone) prop_05_plinth_2seat();
