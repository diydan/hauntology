// Hauntology Tabletop Print Kit — Prop #3: Haunt Needle (Slim 15.4 mm Vaulted Clocktower Crest Dial for #9 Stage)
// Colour: Ink (#0b0d10, matte black)
// Size: ~169.2 W x 108.5 H x 15.4 D mm (mounts atop prop-09-stage-frame; shares Stage's ESP32 — ~50 g, 0 extra ESP32 or plinth!)
// Sticker details: Semi-circular dial face sticker pocket (0 to 12 scale, ticks, ghost icon, "HAUNT")
// Hardware:
//   - Rear SG90 servo pocket centered on pivot (flange seats at Z = 11.6; wire drops backstage to Stage ESP32)
//   - 2x M3 self-tapping rear mount bores (X = +-48, Y = -11) + 2x Ø5.6 mm conical alignment sockets (X = +-63, Y = -11)
//   - 3x perimeter clip detents at Haunt 8, 10 and 12 for prop-03-max-tab
// Print orientation: Flat on back face (Z = 0), zero supports (42-deg concentric gothic arch galleries + radial ribs).

include <_common.scad>

dial_w      = 168.0;
dial_r      = 82.0;
sticker_r   = 74.0;
plate_h     = 16.4;

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

// Concentric <= 42-deg Gothic pointed-vault gallery ring (1.8 mm narrow apex at Z = 13.0 -> 0 supports, ~50% lighter!)
module gothic_ring_vault(r_mid, half_w = 10.6, z_wall = 2.4, z_peak = 13.0) {
  intersection() {
    rotate_extrude($fn = 96)
      polygon(points = [
        [r_mid - half_w, -0.2],
        [r_mid + half_w, -0.2],
        [r_mid + half_w, z_wall],
        [r_mid + 0.9,    z_peak],
        [r_mid - 0.9,    z_peak],
        [r_mid - half_w, z_wall]
      ]);
    translate([0, 39.0, 7.5])
      cube([164.0, 84.0, 16.0], center = true); // Vertical cutoff wall at Y = -3.0!
  }
}

module prop_03_dial_plate() {
  difference() {
    union() {
      difference() {
        union() {
          // 1. Main arched clocktower instrument shell (Y = -18.0..+82.0, Z = 0..plate_h)
          linear_extrude(height = plate_h)
            dial_arch_2d(dial_r, 18.0);

          // 2. Gothic clock-tower crooked steeple crown & side cusps matching prop-03-bezel-ring
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

          // Side Gothic wrought-iron ear lugs above Y = -18.0 base sill (matches bezel_ring & stage column width)
          for (sx = [-1, 1]) {
            hull() {
              translate([sx * (dial_r - 1.0), -12.0, 0]) cylinder(h = plate_h, d = 7.2);
              translate([sx * (dial_w / 2 - 1.5), -10.5, 0]) cylinder(h = plate_h - 0.8, d = 3.0);
            }
          }
        }

        // 2b. Two Wide Concentric 42-deg Gothic Pointed-Arch Galleries (R = 24..72 mm, Z = 0..13.8 -> ~50% lighter with 0 supports!)
        gothic_ring_vault(35.0, half_w = 10.6, z_wall = 3.2, z_peak = 13.8);
        gothic_ring_vault(60.4, half_w = 11.2, z_wall = 2.6, z_peak = 13.8);

        // Lower-beam weight-relief pockets between center SG90 hub (X = +-23) and Stage M3 bosses (X = +-48)
        for (sx = [-1, 1]) {
          hull() {
            translate([sx * 34.0, -10.8, -0.2])
              linear_extrude(height = 9.0)
                rrect2d(16.0, 9.8, r = 1.8);
            translate([sx * 34.0, -10.8, 13.8])
              linear_extrude(height = 0.2)
                rrect2d(6.8, 1.6, r = 0.6);
          }
        }
      }

      // 2c. Solid Central SG90 Servo Hub Pillar + Radial Stiffener Spokes across the Rear Galleries (Z = 0..plate_h)
      translate([-sg90_shaft_off_x, 0, 0])
        chamfer_box(sg90_flange_w + 7.6, sg90_body_d + 8.4, plate_h, r = 2.8, ch_bot = 0, ch_top = 0);
      translate([-14.0, -6.0, 0])
        cube([28.0, 12.0, plate_h], center = false);
      for (ang = [45, 90, 135]) {
        rotate([0, 0, ang])
          translate([46.0, 0, plate_h / 2])
            cube([56.0, 2.8, plate_h], center = true);
      }
    }

    // 3. Front 0.4 mm recessed dial-face sticker pocket
    translate([0, 0, plate_h - sticker_depth])
      linear_extrude(height = sticker_depth + 0.6)
        dial_arch_2d(sticker_r, 12.0);

    // 4. Four self-tapping M3 bezel screw pilot bores on front face (Ø2.75 mm ID matching Ø3.2 clearance holes in prop-03-bezel-ring)
    for (pt = [[-76, -10], [76, -10], [-54, 54], [54, 54]]) {
      translate([pt[0], pt[1], plate_h - 8.5])
        cylinder(h = 9.5, d = 2.75);
      translate([pt[0], pt[1], plate_h - 0.6])
        cylinder(h = 1.0, d1 = 2.75, d2 = 3.6);
    }

    // 5. Central SG90 top round bearing boss bore
    translate([0, 0, -0.5])
      cylinder(h = plate_h + 1.0, d = sg90_boss_d);

    // 6. Rear SG90 Servo Cavity (flange top seats at Z = 9.2, upper 4 mm case reaches Z = 13.3 + 45-deg gable; boss protrudes 0.6 mm at Z = 17.0!)
    hull() {
      translate([-sg90_shaft_off_x, 0, 6.6])
        cube([sg90_body_w + 0.6, sg90_body_d + 0.6, 13.6], center = true);
      translate([-sg90_shaft_off_x, 0, 15.6])
        cube([sg90_body_w + 0.4, 7.8, 0.2], center = true);
    }
    translate([-sg90_shaft_off_x, 0, 4.55])
      cube([sg90_flange_w + 0.6, sg90_body_d + 0.6, 9.5], center = true);
    for (sx = [-1, 1]) {
      mx = -sg90_shaft_off_x + sx * sg90_hole_span / 2;
      translate([mx, 0, 9.35])
        cube([sg90_m2_pilot_d, sg90_body_d + 0.6, 0.3], center = true);
      translate([mx, 0, 9.45])
        cylinder(h = 5.6, d = sg90_m2_pilot_d);
    }

    // 7. Stage Clocktower Mounting Interface on Back Face (Z = 0, Y = -11.0):
    //   - 2x Ø2.75 mm self-tapping M3 screw bores at X = +-48.0, Y = -11.0 (secured from backstage through prop-09-stage-frame!)
    //   - 2x Ø5.6 mm conical locating pin sockets at X = +-63.0, Y = -11.0 (0-deg overhang 45-deg cones)
    for (sx = [-1, 1]) {
      translate([sx * 48.0, -11.0, -0.2])
        cylinder(h = 11.4, d = 2.75);
      translate([sx * 48.0, -11.0, -0.1])
        cylinder(h = 0.9, d1 = 3.8, d2 = 2.75);

      translate([sx * 63.0, -11.0, -0.1]) {
        cylinder(h = 4.3, d = 5.6);
        translate([0, 0, 4.2])
          cylinder(h = 2.0, d1 = 5.6, d2 = 1.6);
      }
    }

    // 8. Three Perimeter Clip Detent Slots at Haunt 8, 10, and 12 for the MAX Tab
    for (lv = [8, 10, 12]) {
      ang = haunt_ang(lv);
      rotate([0, 0, ang])
        translate([dial_r - 1.2, 0, plate_h - 5.5])
          cube([4.4, 4.4, 12.0], center = true);
    }
  }
}

color(col_ink) prop_03_dial_plate();
