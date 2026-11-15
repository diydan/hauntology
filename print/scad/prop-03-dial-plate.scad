// Hauntology Tabletop Print Kit — Prop #3: Haunt Needle (Dial Plate & Servo Housing)
// Colour: Ink (#0b0d10, matte black)
// Size: 170 W x 102 H x 20 D mm
// Sticker details: Semi-circular dial face sticker pocket (0 to 12 scale, ticks, ghost icon, "HAUNT")
// Hardware: Rear SG90 servo pocket centered on pivot, clip detents at 8, 10 and 12
// Print orientation: Flat on back face (Z = 0), zero supports.

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
      // 1. Main arched instrument housing (Z = 0..20)
      linear_extrude(height = plate_h)
        dial_arch_2d(dial_r, 18.0);

      // 2. Bottom tabletop base plinth lip so the gauge stands upright on the table
      translate([0, -14.0, 10.0])
        chamfer_box(dial_w, 10.0, 20.0, r = 2.4, ch_bot = 0.6, ch_top = 0.6);
    }

    // 3. Front 0.4 mm recessed dial-face sticker pocket (Z = 20 - 0.4)
    translate([0, 0, plate_h - sticker_depth])
      linear_extrude(height = sticker_depth + 0.6)
        dial_arch_2d(sticker_r, 12.0);

    // 4. Four bezel snap-fit alignment holes (3.4 mm ID)
    for (pt = [[-76, -10], [76, -10], [-54, 54], [54, 54]]) {
      translate([pt[0], pt[1], plate_h - 6.0])
        cylinder(h = 7.0, d = 3.4);
    }

    // 5. Central servo output shaft bore (9.0 mm through-hole at origin)
    translate([0, 0, -0.5])
      cylinder(h = plate_h + 1.0, d = 9.0);

    // 6. Rear SG90 Servo Cavity (from Z = 0..15.5, offset so output shaft is at [0,0])
    translate([-sg90_shaft_off_x, 0, 7.5])
      cube([sg90_body_w, sg90_body_d, 15.6], center = true);
    translate([-sg90_shaft_off_x, 0, 2.0])
      cube([sg90_flange_w, sg90_body_d, 4.4], center = true);
    // M2 screw pilot holes for SG90 ears
    for (sx = [-1, 1]) {
      translate([-sg90_shaft_off_x + sx * sg90_hole_span / 2, 0, -0.1])
        cylinder(h = 12.0, d = sg90_m2_pilot_d);
    }
    // Rear wire channel exiting down to the base
    translate([0, -10.0, 2.5])
      cube([8.0, 24.0, 5.2], center = true);

    // 7. Three Perimeter Clip Detent Slots at Haunt 8, 10, and 12 for the Red MAX Tab
    for (lv = [8, 10, 12]) {
      ang = haunt_ang(lv);
      rotate([0, 0, ang])
        translate([dial_r - 1.2, 0, plate_h - 5.0])
          cube([4.0, 4.4, 11.0], center = true);
    }
  }
}

color(col_ink) prop_03_dial_plate();
