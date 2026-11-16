// Hauntology Tabletop Print Kit — Prop #9: Curtain Reveal (Proscenium Stage Frame & Valance)
// Colour: Leather (#6b4d33)
// Size: 174 W x 130 H x 59.4 D mm
// Sticker details: Scalloped valance gold-trim groove & "THE SOLUTION" nameplate pocket (66 x 12 mm)
// Hardware: Top-right SG90 back plate (servo hangs behind the frame), top-left idler pulley post, curtain rail sockets, backstage bezel cleats
// Print orientation: Flat on back edge (Z = 0, 174 x 130 mm footprint, 59.4 mm height), zero supports (1 connected component).

include <_common.scad>

stage_w = 170.0;
stage_h = 130.0; // Along Y in print orientation so back lies flat on Z = 0
stage_d = 56.0;  // Along Z in print orientation

// Curtain drive layout. ONE thread plane at thread_z (the idler groove, the middle of the capstan drum's two grooves and the panels'
// cord eyes all sit on it), measured on the compiled STLs; see print/README.md (Prop #9). The SG90 hangs BEHIND the frame: its case
// goes down through a hole in a plate on the back (Z = 0), its ears rest on top of the plate, and the capstan drum sits on the
// servo's round boss inside the chamber. The SG90 heights above the ears (4.0 mm boss, 3.5 mm spline) are from memory: a 1 mm error
// moves the capstan's grooves 1 mm against the idler and the eyes.
thread_z    = 20.2;  // the thread plane
plate_t     = 2.2;   // servo back plate; the ears' underside is at Z = plate_t, so the drum's middle is at plate_t + 18.0 = thread_z
servo_x     = 66.0;  // X of the servo spline and the capstan drum axis
servo_y     = 47.0;  // Y of the spline (the case runs along Y, the spline end toward +Y, 5.5 mm from the case's middle)
idler_x     = -68.0; // X of the idler pulley post
idler_y     = 49.5;  // Y of the idler post (0.5 mm lower than before: the wheel's top flange reached the Y = 58 wall)
rail_z0     = 22.5;  // bottom of the 6 mm curtain rail bar, resting on the socket pockets' floor

module prop_09_stage_frame() {
  difference() {
    union() {
      // 1. Outer proscenium box shell (X = -85..85, Y = -65..65, Z = 0..56)
      chamfer_box(stage_w, stage_h, stage_d, r = 4.0, ch_bot = 0.8, ch_top = 0.8);

      // 2. Crooked Gothic Stage Pediment Gable & Flanking Spire Turrets along Top Edge (+Y = 63..84)
      //    Prints flat on Z = 0 with ZERO overhangs and stays <= 178 mm X!
      linear_extrude(height = stage_d + 1.4, scale = 0.99)
        polygon(points = [
          [-stage_w / 2 + 10.0, stage_h / 2 - 3.0],
          [ stage_w / 2 - 10.0, stage_h / 2 - 3.0],
          [ stage_w / 2 - 18.0, stage_h / 2 + 7.5],
          [ 5.0,                stage_h / 2 + 19.0],
          [-stage_w / 2 + 22.0, stage_h / 2 + 6.5]
        ]);
      // Asymmetric theatre cornice spire finials at gable center & upper outer corners
      for (sp = [[5.0, stage_h / 2 + 17.5, 5.6, 10.0], [-stage_w / 2 + 5.0, stage_h / 2 + 1.0, 6.4, 9.0], [stage_w / 2 - 5.0, stage_h / 2 + 1.0, 7.0, 9.5]]) {
        hull() {
          translate([sp[0], sp[1] - 3.0, 0]) cylinder(h = stage_d + 1.8, d = sp[2]);
          translate([sp[0] + 1.0, sp[1] + sp[3], 0]) cylinder(h = stage_d + 0.8, d = 1.8);
        }
      }

      // 3. Stepped theatre stage apron at bottom (Y = -65..-51) with miniature crooked gothic footlights
      translate([0, -stage_h / 2 + 7.0, 0])
        chamfer_box(stage_w + 5.0, 14.0, stage_d + 2.4, r = 2.6, ch_bot = 0.8, ch_top = 0.8);
      for (fx = [-44, -22, 0, 22, 44]) {
        translate([fx, -stage_h / 2 + 4.5, stage_d - 1.0])
          hull() {
            cylinder(h = 4.6, d = 7.4);
            translate([0, 3.0, 0]) cylinder(h = 4.6, d = 5.2);
          }
      }
      translate([0, stage_h / 2 - 5.0, 0])
        chamfer_box(stage_w + 5.0, 10.0, stage_d + 2.4, r = 2.6, ch_bot = 0.8, ch_top = 0.8);

      // 4. Skewed Tapered Gothic Theatre Column Pilasters on Front Proscenium (Z = stage_d)
      for (sx = [-1, 1]) {
        hull() {
          translate([sx * (stage_w / 2 - 11.0), -48.0, stage_d - 2.0])
            chamfer_box(20.0, 12.0, 4.6, r = 1.6, ch_bot = 0.4, ch_top = 0.8);
          translate([sx * (stage_w / 2 - 12.2), 2.0, stage_d - 2.0])
            chamfer_box(15.0, 18.0, 4.4, r = 2.0, ch_bot = 0.4, ch_top = 0.8);
          translate([sx * (stage_w / 2 - 10.5), 48.0, stage_d - 2.0])
            chamfer_box(19.0, 12.0, 4.6, r = 1.6, ch_bot = 0.4, ch_top = 0.8);
        }
      }

      // 5. Pointed Bat-Wing Scalloped Gothic Valance Header across Top Arch (Y = 28..56, Z = stage_d - 2..stage_d + 2.4)
      translate([0, 44.0, stage_d - 2.0])
        chamfer_box(stage_w - 12.0, 24.0, 4.4, r = 2.4, ch_bot = 0.4, ch_top = 0.8);
      for (vx = [-60 : 15 : 60]) {
        translate([vx, 32.0, stage_d - 2.0])
          hull() {
            cylinder(h = 4.4, d1 = 15.6, d2 = 14.0);
            translate([0, -4.4, 0]) cylinder(h = 4.0, d = 2.6);
          }
      }

      // 6. Raised Gothic Cartouche Plaque for "THE SOLUTION" Nameplate Sticker on Valance
      translate([0, 45.0, stage_d + 1.0])
        chamfer_box(70.0, 15.6, 2.4, r = 2.0, ch_bot = 0, ch_top = 0.4);
    }

    // 6. Central Stage Viewport & Backstage Cavity (leaves 18 mm side wings, 18 mm apron, 32 mm header)
    translate([0, -6.0, -0.5])
      linear_extrude(height = stage_d + 5.0)
        rrect2d(stage_w - 38.0, stage_h - 48.0, r = 4.0);

    // 7. Wider Interior Curtain Wing & Mechanism Chamber behind Front Proscenium Arch,
    //    tapering at <= 45 deg from Z = 27.5 to Z = 50.5 into the stage viewport so NO supports are needed!
    hull() {
      translate([0, 0, -0.5])
        linear_extrude(height = 28.0)
          rrect2d(stage_w - 10.0, stage_h - 14.0, r = 3.0);
      translate([0, -6.0, stage_d - 5.5])
        linear_extrude(height = 0.5)
          rrect2d(stage_w - 38.0, stage_h - 48.0, r = 4.0);
    }

    // 8. Front 0.4 mm Recessed Sticker Pocket for "THE SOLUTION" Nameplate (66 x 12 mm)
    translate([0, 45.0, stage_d + 3.4 - sticker_depth])
      linear_extrude(height = sticker_depth + 0.6)
        rrect2d(66.0, 12.0, r = 1.2);

    // 9. Twisted Diagonal Spiral Flutes in Left & Right Proscenium Columns
    for (sx = [-1, 1], fy = [-32, -16, 0, 16, 32]) {
      translate([sx * (stage_w / 2 - 11.5), fy, stage_d + 2.4])
        rotate([0, 0, sx * 32])
          rotate([45, 0, 0])
            cube([14.0, 1.4, 1.4], center = true);
    }
  }

  // 10. Internal Backstage Mounts (solidly bridged to the top/side frame walls and sitting on Z = 0!)
  // a) Top-Right SG90 Curtain Servo Back Plate (Z = 0..plate_t, X = 58..82, Y = 24.5..59, fused into the right and top walls).
  //    The case (12.5 x 23.1 mm hole) goes down through it to the back; the ears (32.5 mm along Y) sit on top and take two M2 screws.
  //    X >= 58 keeps 1 mm clear of the screen bezel (X <= 57); the drum (r 8.8 at Y = 47) clears the Y = 58 wall and the open panels.
  difference() {
    translate([58.0, 24.5, 0]) cube([24.0, 34.5, plate_t]);
    translate([servo_x - sg90_body_d / 2, servo_y - 5.5 - sg90_body_w / 2, -0.1])
      cube([sg90_body_d, sg90_body_w, plate_t + 0.2]);
    for (sy = [-1, 1])
      translate([servo_x, servo_y - 5.5 + sy * sg90_hole_span / 2, -0.1])
        cylinder(h = plate_t + 0.2, d = sg90_m2_pilot_d);
  }

  // b) Top-Left Idler Pulley Post: the wheel's groove (4.4 mm above its base) must sit on thread_z, so the boss is thread_z - 4.4 tall.
  idler_boss_h = thread_z - 4.4;
  translate([idler_x, idler_y, 0]) {
    hull() {
      cylinder(h = idler_boss_h, d1 = 14.0, d2 = 10.0);
      translate([-12.0, 0, 0]) cube([6.0, 14.0, idler_boss_h]);
      translate([-4.0, 8.0, 0]) cube([14.0, 6.0, idler_boss_h]);
    }
    // 4.0 mm axle pin for the 4.6 mm idler pulley bore: 10 mm above the boss, 1.6 mm above the wheel top
    cylinder(h = idler_boss_h + 10.0, d = 4.0);
  }

  // c) Left & Right Curtain Rail Cleat Sockets (at X = +/-80, Y = 31.5, Z = 0..34, clears open curtains X <= 74.5!)
  for (sx = [-1, 1]) {
    translate([sx * (stage_w / 2 - 4.5), 31.5, 0])
    difference() {
      chamfer_box(8.0, 12.0, 34.0, r = 1.4, ch_bot = 0.4, ch_top = 0.4);
      // Pocket Z = rail_z0..35 that receives the ends of the 158 x 8 x 6 mm curtain rail bar (the floor sets the bar at rail_z0)
      translate([-sx * 2.0, 0, (rail_z0 + 35.0) / 2])
        cube([7.0, 8.6, 35.0 - rail_z0], center = true);
    }
  }

  // d) Four Backstage Corner Rest Cleats for prop-09-screen-bezel.stl (114 x 102 mm) at Z = 0..8
  for (sx = [-1, 1]) {
    translate([sx * 58.5, -52.0, 0])
      chamfer_box(50.0, 14.0, 6.0, r = 1.5, ch_bot = 0.4, ch_top = 0.4);
  }
}

color(col_leather) prop_09_stage_frame();
