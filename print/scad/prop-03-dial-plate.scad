// Hauntology Tabletop Print Kit — Prop #3: Haunt Needle (Dial Plate & Servo Housing)
// Colour: Ink (#0b0d10, matte black)
// Size: 170 W x 108 H x 28 D mm
// Sticker details: Semi-circular dial face sticker pocket (0 to 12 scale, ticks, ghost icon, "HAUNT")
// Hardware: Rear SG90 servo pocket centered on pivot, ESP32 bay in base plinth, clip detents at 8, 10 and 12
// Print orientation: Flat on back face (Z = 0), zero supports (45 deg vaulted ESP32 bay, 12.5 mm bridged servo slot).

include <_common.scad>

dial_w      = 168.0;
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
      //    Flanks keep X <= 172.6 mm (generous slicer skirt/brim margin inside 180 mm bed) and stay below bezel clip line!
      translate([0, -21.0, 0])
        chamfer_box(dial_w, 10.0, plate_h, r = 2.4, ch_bot = 0.6, ch_top = 0.4);
      for (sx = [-1, 1]) {
        hull() {
          translate([sx * (dial_w / 2 - 2.2), -18.0, 0]) cylinder(h = plate_h, d = 7.0);
          translate([sx * (dial_w / 2 + 0.2), -20.5, 0]) cylinder(h = 16.0, d = 4.2);
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

    // 6. Rear SG90 Servo Cavity: ear shelf at Z = 18.9, true 45-deg gabled body roof (23.0 -> 25.4, top width 7.7 mm < 10 mm!),
    //    and 0.25 mm sacrificial bridge skin under M2 pilot holes so no hole prints in mid-air!
    hull() {
      translate([-sg90_shaft_off_x, 0, 11.45])
        cube([sg90_body_w, sg90_body_d, 23.1], center = true);
      translate([-sg90_shaft_off_x, 0, 25.3])
        cube([sg90_body_w, 7.7, 0.2], center = true);
    }
    translate([-sg90_shaft_off_x, 0, 9.4])
      cube([sg90_flange_w, sg90_body_d, 19.0], center = true);
    // M2 screw pilot holes into the Z = 18.9 ear shelf (with 0.25 mm Voron-style straight bridge slot so 1 manifold & zero mid-air circle!)
    for (sx = [-1, 1]) {
      mx = -sg90_shaft_off_x + sx * sg90_hole_span / 2;
      translate([mx, 0, 19.0])
        cube([sg90_m2_pilot_d, sg90_body_d + 0.4, 0.3], center = true);
      translate([mx, 0, 19.1])
        cylinder(h = 6.0, d = sg90_m2_pilot_d);
    }
    // 45-deg vaulted rear wire channel connecting servo cavity up into horizontal ESP32 pocket
    hull() {
      translate([16.0, 11.0, 3.0])
        cube([16.0, 14.0, 6.2], center = true);
      translate([16.0, 11.0, 9.2])
        cube([14.0, 1.6, 0.5], center = true);
    }

    // 7. Horizontal Rear ESP32-WROOM-32E DevKitC V4 Cavity (X = 43, Y = 22): <= 44-deg vaulted roof converging to a
    //    4.5 mm ridge at Z = 24.3 + right-rim USB-C exit!
    translate([43.0, 22.0, -0.1])
      hull() {
        linear_extrude(height = 11.5)
          rrect2d(esp32_w + 1.2, esp32_d + 0.8, r = 1.2);
        translate([0, 0, 24.3])
          linear_extrude(height = 0.2)
            rrect2d(32.0, 4.5, r = 1.0);
      }
    // Right-rim (+X) 45-deg gabled USB-C cable exit channel reaching cleanly out of the horizontal ESP32 bay
    translate([76.0, 22.0, 4.0])
      rotate([0, 90, 0])
        hull() {
          cube([8.2, esp32_usb_w + 1.0, 18.0], center = true);
          translate([-6.0, 0, 0])
            cylinder(h = 18.0, d = 1.6, center = true);
        }

    // 8. Three Perimeter Clip Detent Slots at Haunt 8, 10, and 12 for the Red MAX Tab
    for (lv = [8, 10, 12]) {
      ang = haunt_ang(lv);
      rotate([0, 0, ang])
        translate([dial_r - 1.2, 0, plate_h - 5.5])
          cube([4.4, 4.4, 12.0], center = true);
    }
  }

  // 9. Four 45-deg corbelled ESP32 corner M2 mounting bosses fused directly into the vaulted ESP32 bay walls (1 connected solid!)
  for (sx = [-1, 1], sy = [-1, 1]) {
    bx = 43.0 + sx * esp32_hole_w / 2;
    by = 22.0 + sy * esp32_hole_d / 2;
    difference() {
      hull() {
        translate([bx, by, 13.5]) cylinder(h = 6.5, d = 5.4);
        translate([43.0 + sx * (esp32_w / 2 + 1.2), 22.0 + sy * (esp32_d / 2 + 1.0), 19.5]) cube([2.0, 2.0, 2.0], center = true);
      }
      // Open M2 pilot bore + Voron bridge slot across the 5.4 mm boss bottom (1 manifold, zero mid-air circle!)
      translate([bx, by, 13.6]) cube([6.0, sg90_m2_pilot_d, 0.35], center = true);
      translate([bx, by, 13.7]) cylinder(h = 5.5, d = sg90_m2_pilot_d);
    }
  }
}

color(col_ink) prop_03_dial_plate();
