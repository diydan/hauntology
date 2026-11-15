// Hauntology Tabletop Print Kit — Prop #3: Haunt Needle (Dial Plate & Servo Housing)
// Colour: Ink (#0b0d10, matte black)
// Size: 170 W x 108 H x 28 D mm
// Sticker details: Semi-circular dial face sticker pocket (0 to 12 scale, ticks, ghost icon, "HAUNT")
// Hardware: Rear SG90 servo pocket centered on pivot, ESP32 bay in base plinth, clip detents at 8, 10 and 12
// Print orientation: Flat on back face (Z = 0). SUPPORTS NEEDED under the ESP32 bay roof (28.5 x 55.6 mm, flat): a 45 deg roof over a
// 28 mm board would need 14 mm more height than this 20 mm plate has. The servo pocket roof is only 12.5 mm wide and bridges.

include <_common.scad>

dial_w      = 170.0;
dial_r      = 82.0;
sticker_r   = 74.0;
plate_h     = 20.0;

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
      // 1. Main arched instrument housing (Z = 0..20, Y = -18..+82)
      linear_extrude(height = plate_h)
        dial_arch_2d(dial_r, 18.0);

      // 2. Bottom tabletop base plinth shelf BELOW the bezel ring (Y = -26..-16, Z = 0..26)
      //    so the gauge stands upright AND the bezel ring (Y = -18..+83) sits flush on Z = 20!
      translate([0, -21.0, 0])
        chamfer_box(dial_w, 10.0, 26.0, r = 2.4, ch_bot = 0.6, ch_top = 0.6);
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

    // 6. Rear SG90 Servo Cavity (body Z = 0..16.5, mounting ear shelf at Z = 12.5 -> shaft reaches Z = 25.5 mm!)
    translate([-sg90_shaft_off_x, 0, 8.2])
      cube([sg90_body_w, sg90_body_d, 16.6], center = true);
    translate([-sg90_shaft_off_x, 0, 6.2])
      cube([sg90_flange_w, sg90_body_d, 12.6], center = true);
    // M2 screw pilot holes into the Z = 12.5 ear shelf
    for (sx = [-1, 1]) {
      translate([-sg90_shaft_off_x + sx * sg90_hole_span / 2, 0, 12.4])
        cylinder(h = 6.2, d = sg90_m2_pilot_d);
    }
    // Rear wire channel connecting servo cavity to ESP32 pocket
    translate([22.0, -8.0, 3.0])
      cube([48.0, 8.0, 6.2], center = true);

    // 7. Rear ESP32-WROOM-32E DevKitC V4 Cavity on right side of back face (Z = 0..10) + M2 pilot holes & antenna recess
    translate([46.0, 12.0, 5.0])
      cube([esp32_d, esp32_w, 10.2], center = true);
    translate([46.0, 12.0 - (esp32_w / 2 - esp32_ant_len / 2), 6.5])
      cube([esp32_d - 4.0, esp32_ant_len, 13.2], center = true);
    for (sx = [-1, 1], sy = [-1, 1]) {
      translate([46.0 + sx * esp32_hole_d / 2, 12.0 + sy * esp32_hole_w / 2, 9.8])
        cylinder(h = 6.5, d = sg90_m2_pilot_d);
    }

    // 8. Three Perimeter Clip Detent Slots at Haunt 8, 10, and 12 for the Red MAX Tab
    for (lv = [8, 10, 12]) {
      ang = haunt_ang(lv);
      rotate([0, 0, ang])
        translate([dial_r - 1.2, 0, plate_h - 5.0])
          cube([4.0, 4.4, 11.0], center = true);
    }
  }
}

color(col_ink) prop_03_dial_plate();
