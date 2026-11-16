// Hauntology Tabletop Print Kit — Prop #3: Haunt Needle (Dial Plate & Servo Housing)
// Colour: Ink (#0b0d10, matte black)
// Size: 170 W x 108 H x 28 D mm
// Sticker details: Semi-circular dial face sticker pocket (0 to 12 scale, ticks, ghost icon, "HAUNT")
// Hardware: Rear SG90 servo pocket centered on pivot, ESP32 bay in base plinth, clip detents at 8, 10 and 12
// Print orientation: Flat on back face (Z = 0), zero supports (45 deg vaulted ESP32 bay, 12.5 mm bridged servo slot).

include <_common.scad>

dial_w      = 170.0;
dial_r      = 82.0;
sticker_r   = 74.0;
plate_h     = 26.4;

// Angle helper matching 03-haunt-needle.js: lvAng(lv) = 15 + lv/12 * 150 (measured from left -X = 0 deg)
function haunt_ang(lv) = 165 - (lv / 12) * 150;

module dial_arch_2d(r_outer, y_drop = 18.0) {
  union() {
    intersection() {
      circle(r = r_outer);
      translate([0, r_outer / 2 - y_drop / 2])
        square([r_outer * 2 + 4, r_outer + y_drop], center = true);
    }
    translate([0, -y_drop / 2])
      rrect2d(r_outer * 2, y_drop, r = 3.0);
  }
}

module prop_03_dial_plate() {
  difference() {
    union() {
      // 1. Main arched instrument housing (Z = 0..plate_h)
      linear_extrude(height = plate_h)
        dial_arch_2d(dial_r, 18.0);

      // Gothic clock-tower crooked steeple crown matching bezel crest (at 90..155 deg, avoiding lv=8,10,12!)
      linear_extrude(height = plate_h) {
        hull() {
          translate([-8.5, dial_r - 3.0]) circle(d = 5.0);
          translate([ 8.5, dial_r - 3.0]) circle(d = 5.0);
          translate([ 1.8, dial_r + 7.4]) circle(d = 2.2);
        }
        for (ang = [110, 130, 152]) {
          rotate([0, 0, ang])
            hull() {
              translate([dial_r - 2.0, -3.5]) circle(d = 3.6);
              translate([dial_r - 2.0,  3.5]) circle(d = 3.6);
              translate([dial_r + 5.0,  0.6]) circle(d = 2.0);
            }
        }
      }

      // 2. Bottom tabletop base plinth + gothic splayed buttress wings (Y = -26..-16, Z = 0..plate_h)
      //    Flanks keep X <= 176 mm (<= 180 mm bed) and stay below bezel clip line!
      translate([0, -21.0, 0])
        chamfer_box(dial_w, 10.0, plate_h, r = 2.4, ch_bot = 0.6, ch_top = 0.4);
      for (sx = [-1, 1]) {
        hull() {
          translate([sx * (dial_w / 2 - 2.2), -18.0, 0]) cylinder(h = plate_h, d = 7.0);
          translate([sx * (dial_w / 2 + 1.8), -20.5, 0]) cylinder(h = 16.0, d = 4.2);
        }
      }
    }

    // 3. Front 0.4 mm recessed dial-face sticker pocket (Z = 20 - 0.4)
    translate([0, 0, plate_h - sticker_depth])
      linear_extrude(height = sticker_depth + 0.6)
        dial_arch_2d(sticker_r, 12.0);

    // 4. Four bezel alignment pin/screw holes (3.2 mm ID, matched to prop-03-bezel-ring.scad)
    for (pt = [[-76, -10], [76, -10], [-54, 54], [54, 54]]) {
      translate([pt[0], pt[1], plate_h - 8.0])
        cylinder(h = 9.0, d = 3.2);
    }

    // 5. Central SG90 top round bearing boss bore (12.4 mm through front face so shaft protrudes 5.5 mm past Z = 20!)
    translate([0, 0, -0.5])
      cylinder(h = plate_h + 1.0, d = sg90_boss_d);

    // 6. Rear SG90 Servo Cavity (ear shelf at Z = 18.9 so servo back stays at Z = 0.4 >= 0, case top clears 23.8, and shaft protrudes 5.5 mm past Z = 26.4!)
    translate([-sg90_shaft_off_x, 0, 11.85])
      cube([sg90_body_w, sg90_body_d, 23.9], center = true);
    translate([-sg90_shaft_off_x, 0, 9.4])
      cube([sg90_flange_w, sg90_body_d, 19.0], center = true);
    // M2 screw pilot holes into the Z = 18.9 ear shelf
    for (sx = [-1, 1]) {
      translate([-sg90_shaft_off_x + sx * sg90_hole_span / 2, 0, 18.8])
        cylinder(h = 6.2, d = sg90_m2_pilot_d);
    }
    // 45-deg vaulted rear wire channel connecting servo cavity to ESP32 pocket (zero overhangs)
    hull() {
      translate([23.0, -8.0, 3.0])
        cube([46.0, 8.0, 6.2], center = true);
      translate([23.0, -8.0, 9.2])
        cube([42.0, 1.4, 0.5], center = true);
    }

    // 7. Rear ESP32-WROOM-32E DevKitC V4 Cavity (X = 46, Y = 12): 45-deg vaulted roof converging to a 4.5 mm ridge at Z = 24.0
    //    (prints 100% support-free!) + 4x corner M2 screw pad shelves at Z = 10.5 with pilot bores
    difference() {
      translate([46.0, 12.0, -0.1])
        hull() {
          linear_extrude(height = 12.1)
            rrect2d(esp32_d + 0.8, esp32_w + 0.8, r = 1.2);
          translate([0, 0, 24.0])
            linear_extrude(height = 0.2)
              rrect2d(4.5, 31.6, r = 1.0);
        }
      // Retain 4x small corner M2 screw bosses (5.0 x 6.5 mm -> <= 5 mm bridge) from Z = 10.5 upward
      for (sx = [-1, 1], sy = [-1, 1]) {
        translate([46.0 + sx * (esp32_d / 2 - 2.3), 12.0 + sy * (esp32_w / 2 - 3.1), 17.5])
          cube([5.2, 6.8, 14.0], center = true);
      }
    }
    for (sx = [-1, 1], sy = [-1, 1]) {
      translate([46.0 + sx * esp32_hole_d / 2, 12.0 + sy * esp32_hole_w / 2, 10.3])
        cylinder(h = 7.5, d = sg90_m2_pilot_d);
    }

    // 8. Three Perimeter Clip Detent Slots at Haunt 8, 10, and 12 for the Red MAX Tab
    for (lv = [8, 10, 12]) {
      ang = haunt_ang(lv);
      rotate([0, 0, ang])
        translate([dial_r - 1.2, 0, plate_h - 5.5])
          cube([4.4, 4.4, 12.0], center = true);
    }
  }
}

color(col_ink) prop_03_dial_plate();
