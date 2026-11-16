// Hauntology Tabletop Print Kit — Prop #3: Haunt Needle (Tim Burton Gothic Instrument Bezel Ring)
// Colour: Lantern (#e0a43a, amber/matte gold)
// Size: ~176 W x 108 H x 4.8 D mm
// Features: Wrought-iron crown & gargoyle rim cusps (clear of lv=8,10,12 MAX tab clip arcs!),
//           raised index notches at Haunt 3, 6, 9; 4 alignment holes matching dial-plate
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

      // 2. Crooked Gothic Crown Crest & Outer Wrought-Iron Battlement Cusps
      //    Positioned strictly outside lv = 8 (65 deg), 10 (40 deg), 12 (15 deg) clip zones!
      // Central crooked steeple spire crest at ~90 deg
      hull() {
        translate([-7.5, bezel_r_out - 2.0, 0]) cylinder(h = bezel_h, d = 5.0);
        translate([ 7.5, bezel_r_out - 2.0, 0]) cylinder(h = bezel_h, d = 5.0);
        translate([ 1.8, bezel_r_out + 7.2, 0]) cylinder(h = bezel_h - 0.6, d = 2.0);
      }
      // Upper-left gothic gargoyle cusps (clear of MAX-tab side!)
      for (ang = [110, 130, 152]) {
        rotate([0, 0, ang])
          hull() {
            translate([bezel_r_out - 1.5, -3.5, 0]) cylinder(h = bezel_h, d = 3.6);
            translate([bezel_r_out - 1.5,  3.5, 0]) cylinder(h = bezel_h, d = 3.6);
            translate([bezel_r_out + 4.8,  0.6, 0]) cylinder(h = bezel_h - 0.5, d = 1.8);
          }
      }
      // Subtle lower-left & lower-right gothic wrought-iron ear lugs above Y = -18 base line
      for (sx = [-1, 1]) {
        translate([sx * (bezel_r_out + 0.5), -11.5, 0])
          hull() {
            cylinder(h = bezel_h, d = 7.4);
            translate([sx * 4.2, 2.0, 0]) cylinder(h = bezel_h - 0.4, d = 2.4);
          }
      }

      // 3. Three Prominent Inward Gold Gothic Pointer Notches at Haunt Events 3, 6, and 9
      for (lv = [3, 6, 9]) {
        ang = haunt_ang(lv);
        rotate([0, 0, ang])
          translate([bezel_r_in - 1.5, 0, 0])
            hull() {
              translate([3.5, 0, 0]) cylinder(h = bezel_h + 0.6, d = 6.2);
              translate([-3.6, 0, 0]) cylinder(h = bezel_h + 0.6, d = 2.0);
            }
      }

      // 4. Minor tick pips along bezel for 0..12
      for (lv = [0 : 12]) {
        if (lv != 3 && lv != 6 && lv != 9) {
          ang = haunt_ang(lv);
          rotate([0, 0, ang])
            translate([bezel_r_in + 1.2, 0, 0])
              cylinder(h = bezel_h + 0.4, d = 2.8);
        }
      }

      // 5. Raised wrought-iron rivet bosses near the 4 screw holes
      for (pt = [[-66, 28], [66, 28], [-26, 75], [26, 75]]) {
        translate([pt[0], pt[1], bezel_h - 0.3])
          cylinder(h = 0.8, d1 = 3.6, d2 = 1.6);
      }
    }

    // 6. Four 3.2 mm alignment pin/screw holes matching prop-03-dial-plate.scad
    for (pt = [[-76, -10], [76, -10], [-54, 54], [54, 54]]) {
      translate([pt[0], pt[1], -0.5])
        cylinder(h = bezel_h + 2.0, d = 3.2);
    }

    // 7. Clearance notches on outer rim at 8, 10, 12 for the hand-clipped red MAX tab
    for (lv = [8, 10, 12]) {
      ang = haunt_ang(lv);
      rotate([0, 0, ang])
        translate([bezel_r_out - 0.8, 0, bezel_h / 2])
          cube([3.6, 4.4, bezel_h + 2.0], center = true);
    }
  }
}

color(col_lantern) prop_03_bezel_ring();
