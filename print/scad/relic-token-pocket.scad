// Hauntology Tabletop Print Kit — Sculpted Gothic Rose-Tracery Relic Stand (~3.2 g each / ~19 g for all 6 — 20g budget!)
// Colour: Dark Iron / Matte Black
// Size: 43.2 x 43.2 x 6.2 mm rigid coffin-iron plinth stand, 45-deg finger-pickup bevel, 36.4 x 36.4 x 0.45 mm QR pocket,
//       octagonal rose-window underside tracery, splayed coffin corner lugs & cored Ø5.6 mm Relic peg.
// Print orientation: Flat on base (Z = 0), zero supports (1 connected component, > 850 mm^2 flat bed contact).

include <_common.scad>

tok_base_h = 3.2; // Rigid 3.2 mm gothic plinth frame with 45-deg finger-lift bottom bevel + 6.2 mm total height with peg

module relic_token_pocket() {
  difference() {
    union() {
      difference() {
        union() {
          // 1. Rigid 40 x 40 x 3.2 mm gothic bevelled plinth frame (0.9 mm bottom 45-deg bevel = easy finger pickup off table!)
          chamfer_box(token_side_mm, token_side_mm, tok_base_h, r = 3.0, ch_bot = 0.9, ch_top = 0.45);

          // 2. Four sculpted Tim Burton splayed coffin-corner iron lug ears + rivet studs (fits existing tray lug reliefs!)
          for (sx = [-1, 1], sy = [-1, 1]) {
            hull() {
              translate([sx * 17.5, sy * 17.5, 0.35]) cylinder(h = tok_base_h - 0.55, d = 5.0);
              translate([sx * 17.5, sy * 17.5, 0])    cylinder(h = 0.35, d = 4.3);
              translate([sx * 20.5, sy * 20.5, 0.45]) cylinder(h = tok_base_h - 0.95, d = 2.4);
              translate([sx * 20.1, sy * 20.1, 0])    cylinder(h = 0.45, d = 1.6);
            }
            // Sculpted Gothic iron corner cusp & pyramid rivet outside QR sticker pocket (never shades QR code!)
            hull() {
              translate([sx * 18.6, sy * 18.6, tok_base_h - 0.6]) cylinder(h = 0.6, d = 3.6);
              translate([sx * 19.6, sy * 19.6, tok_base_h + 0.9]) cylinder(h = 0.2, d = 1.1, $fn = 4);
            }
          }
        }

        // 2b. Four 45-deg Bottom Finger-Pickup Scoops centered on all 4 sides (makes lifting off a smooth table effortless!)
        for (ang = [0, 90, 180, 270]) {
          rotate([0, 0, ang])
            hull() {
              translate([0, token_side_mm / 2 + 0.5, -0.1]) cube([15.0, 3.2, 0.2], center = true);
              translate([0, token_side_mm / 2 + 0.5, 1.35]) cube([11.0, 0.4, 0.2], center = true);
            }
        }

        // 3. 0.45 mm recessed pocket for the 36 x 36 mm QR sticker on the top face (Z = 2.75..3.20)
        translate([0, 0, tok_base_h - 0.45])
          linear_extrude(height = 0.7)
            rrect2d(token_qr_mm, token_qr_mm, r = 1.4);

        // 4. Gothic side edge V-notch cuts along midpoint of all 4 rim edges (tactile grip + Victorian ironwork look)
        for (ang = [0, 90, 180, 270]) {
          rotate([0, 0, ang])
            translate([0, token_side_mm / 2 + 0.08, tok_base_h * 0.58])
              rotate([45, 0, 0])
                cube([11.0, 0.9, 0.9], center = true);
        }

        // 5. Vaulted Underside Rose-Window Tracery & Open Quadrant Windows:
        //    - Leaves a solid 1.0 mm sticker deck where bridged (< 6.5 mm spans), 45-deg vaulted ribs, an inner octagonal ring,
        //      and a wide Ø15.2 mm central pillar directly supporting the Relic's Ø14.6 mm foot!
        difference() {
          // Underside coffer recess (Z = 0..1.75, tapering at 45 deg so perimeter skirt is 3.2 mm tall & super stiff!)
          hull() {
            translate([0, 0, -0.1])
              linear_extrude(height = 0.2)
                rrect2d(token_qr_mm - 2.4, token_qr_mm - 2.4, r = 2.0);
            translate([0, 0, 1.75])
              linear_extrude(height = 0.1)
                rrect2d(token_qr_mm - 5.8, token_qr_mm - 5.8, r = 1.6);
          }
          // Solid Ø15.2 mm central pedestal column directly under the Relic's Ø14.6 mm foot + 8 radial ribs + octagonal ring!
          translate([0, 0, -0.5]) {
            cylinder(h = 4.0, d = 15.2);
            difference() {
              cylinder(h = 4.0, d = 25.4, $fn = 8);
              translate([0, 0, -0.2]) cylinder(h = 4.5, d = 21.6, $fn = 8);
            }
            for (ang = [0, 45, 90, 135])
              rotate([0, 0, ang])
                cube([56.0, 2.2, 4.0], center = true);
          }
        }
        // Clean through-windows in the 8 outer rose-tracery petals (cuts excess dead gram weight while keeping < 6 mm sticker spans!)
        difference() {
          translate([0, 0, -0.5])
            linear_extrude(height = 4.0)
              rrect2d(token_qr_mm - 6.2, token_qr_mm - 6.2, r = 1.6);
          translate([0, 0, -1.0]) {
            cylinder(h = 6.0, d = 24.8, $fn = 8);
            for (ang = [0, 45, 90, 135])
              rotate([0, 0, ang])
                cube([56.0, 2.6, 6.0], center = true);
          }
        }
      }

      // 6. Sturdy Central Ø5.6 x 3.0 mm Relic Connector Peg rising from Z = 2.75 sticker floor to Z = 5.75 (with 0.35 mm root fillet)
      translate([0, 0, tok_base_h - 0.45 - 0.05])
        cylinder(h = 0.40, d1 = relic_peg_d + 0.38, d2 = relic_peg_d);
      translate([0, 0, tok_base_h - 0.45 + 0.34])
        cylinder(h = 0.45 + relic_peg_h - 0.84 + 0.01, d = relic_peg_d);
      translate([0, 0, tok_base_h - 0.45 + relic_peg_h - 0.5])
        cylinder(h = 0.5, d1 = relic_peg_d, d2 = relic_peg_d - 1.0);
    }

    // 7. Cored Ø2.6 mm through-bore inside the Ø5.6 mm peg (leaves thick 1.5 mm solid peg wall & zero flat roof!)
    translate([0, 0, -0.5])
      cylinder(h = tok_base_h + relic_peg_h + 1.0, d = 2.6);
  }
}

color(col_ink) relic_token_pocket();
