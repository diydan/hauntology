// Hauntology Tabletop Print Kit — Prop #3: Haunt Needle (Ornate Instrument Bezel Ring)
// Colour: Lantern (#e0a43a, amber/matte gold)
// Size: 166 W x 101 H x 4.8 D mm
// Features: Raised index notches at Haunt 3, 6 and 9; perimeter rivets; 4 alignment holes matching dial-plate
// Print orientation: Flat on back (Z = 0), zero supports.

include <_common.scad>

bezel_r_out = 83.0;
bezel_r_in  = 72.5;
bezel_h     = 4.2;

function haunt_ang(lv) = 165 - (lv / 12) * 150;

module prop_03_bezel_ring() {
  difference() {
    union() {
      // 1. Arched outer bezel frame (Z = 0..bezel_h)
      difference() {
        linear_extrude(height = bezel_h, scale = 0.99)
          union() {
            intersection() {
              circle(r = bezel_r_out);
              translate([0, bezel_r_out / 2 - 9.0])
                square([bezel_r_out * 2 + 4, bezel_r_out + 18.0], center = true);
            }
            translate([0, -9.0])
              rrect2d(bezel_r_out * 2, 18.0, r = 3.0);
          }

        // Inner viewport cutout revealing the dial sticker
        translate([0, 0, -0.5])
          linear_extrude(height = bezel_h + 1.0)
            union() {
              intersection() {
                circle(r = bezel_r_in);
                translate([0, bezel_r_in / 2 - 5.0])
                  square([bezel_r_in * 2 + 4, bezel_r_in + 10.0], center = true);
              }
              translate([0, -5.0])
                rrect2d(bezel_r_in * 2, 10.0, r = 1.5);
            }
      }

      // 2. Three Prominent Inward Gold Notches at Haunt Events 3, 6, and 9
      for (lv = [3, 6, 9]) {
        ang = haunt_ang(lv);
        rotate([0, 0, ang])
          translate([bezel_r_in - 1.5, 0, 0])
            hull() {
              translate([3.5, 0, 0]) cylinder(h = bezel_h + 0.6, d = 6.0);
              translate([-3.0, 0, 0]) cylinder(h = bezel_h + 0.6, d = 2.4);
            }
      }

      // 3. Minor tick pips along bezel for 0..12
      for (lv = [0 : 12]) {
        if (lv != 3 && lv != 6 && lv != 9) {
          ang = haunt_ang(lv);
          rotate([0, 0, ang])
            translate([bezel_r_in + 1.2, 0, 0])
              cylinder(h = bezel_h + 0.4, d = 2.8);
        }
      }
    }

    // 4. Four 3.2 mm alignment pin/screw holes matching prop-03-dial-plate.scad (accepts 1.75 mm filament or M3 screws)
    for (pt = [[-76, -10], [76, -10], [-54, 54], [54, 54]]) {
      translate([pt[0], pt[1], -0.5])
        cylinder(h = bezel_h + 2.0, d = 3.2);
    }

    // 5. Clearance notches on outer rim at 8, 10, 12 for the hand-clipped red MAX tab
    for (lv = [8, 10, 12]) {
      ang = haunt_ang(lv);
      rotate([0, 0, ang])
        translate([bezel_r_out - 0.8, 0, bezel_h / 2])
          cube([3.6, 4.4, bezel_h + 2.0], center = true);
    }
  }
}

color(col_lantern) prop_03_bezel_ring();
