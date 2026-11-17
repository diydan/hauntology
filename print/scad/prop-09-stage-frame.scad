// Hauntology Tabletop Print Kit — Master 2-in-1 Haunted Stage (#9 Curtain Reveal + #12 Rafter Rattle Bats)
// Colour: Leather / Wood Brown (#6b4d33)
// Size: 173.0 W x 169.2 H x 63.0 D mm (fits 180x180 mm bed; merges #9 Proscenium Stage + #12 Rattle Bats on 1 shared ESP32!)
// Sticker details: Scalloped valance trim & "THE SOLUTION" nameplate pocket (66 x 12 mm)
// Hardware:
//   - #9 Curtain Reveal: Top-right SG90 back plate (X = 67, Y = 46), top-left idler post, curtain rail sockets, backstage screen/ESP32 cleats.
//   - #12 Rafter Bats Belfry: Upper-gable horizontal SG90 back plate (spline X = -14.0, Y = 71.0 -> 14 mm horn tip on X = 0.0!)
//     tugging a straight Z-axis fairlead tunnel out a projecting Z = 63 mm gothic gargoyle rafter beam above the arch (Y = +83),
//     suspending prop-12-bats-mobile.stl 17 mm in front of the header and 100% clear above the Y = +35 stage opening!
// Print orientation: Flat on back edge (Z = 0), 100% support-free (1 connected manifold).

include <_common.scad>

stage_w = 170.0;
stage_h = 130.0; // Core proscenium box Y = -65..+65; belfry peak rises to Y = +104 (total Y = 169 mm <= 180 mm bed!)
stage_d = 43.0;  // Core proscenium depth; footlight base Z = 52 mm for stability; top belfry rafter projects to Z = 63 mm!

// #9 Curtain drive layout — 100% identical stage coordinates so all 80 p09 assembly & thread-route checks match 1:1.
thread_z    = 20.2;
plate_t     = 2.2;
servo_x     = 67.0;
servo_y     = 46.0;
idler_x     = -66.0;
idler_y     = 44.5;
rail_z0     = 22.5;

// #12 Integrated Rafter-Bats SG90 & Belfry Hang Coordinates (read by tools/lib/print-assembly.mjs)
rattle_bx   = -8.5;  // Horizontal SG90 #2 case X center (puts output spline at X = -14.0, so a 14 mm +X horn lands on X = 0.0!)
rattle_by   = 71.0;  // SG90 #2 Y center inside upper belfry gable (18+ mm above curtain top thread & screen bezel!)
rafter_y    = 83.2;  // Front bottom eyelet Y where prop-12-bats-mobile hangs
rafter_z    = 59.5;  // Front bottom eyelet Z (16.5 mm proud of proscenium arch, 13.1 mm proud of nameplate!)

module prop_09_stage_frame() {
  difference() {
    union() {
      // 1. Outer proscenium box shell (X = -85..85, Y = -65..65, Z = 0..stage_d)
      chamfer_box(stage_w, stage_h, stage_d, r = 4.0, ch_bot = 0.8, ch_top = 0.8);

      // 2. Tall Gothic Belfry Pediment Gable (+Y = 62..95.5) + Projecting #12 Gargoyle Rafter Beam (rises along +Z to 63.0 mm = 0 overhang!)
      linear_extrude(height = stage_d + 1.4, scale = 0.99)
        polygon(points = [
          [-stage_w / 2 + 10.0, stage_h / 2 - 3.0],
          [ stage_w / 2 - 10.0, stage_h / 2 - 3.0],
          [ stage_w / 2 - 19.0, stage_h / 2 + 9.0],
          [ 22.0,               89.0],
          [  0.0,               95.5],
          [-22.0,               88.5],
          [-stage_w / 2 + 21.0, stage_h / 2 + 8.0]
        ]);
      // Flanking & Peak Gothic Spire Finials (max Y = 95.5 + 8.5 = +104.0 -> total Y = 169.0 mm <= 180 mm bed!)
      for (sp = [[0.0, 94.5, 6.0, 8.8], [-stage_w / 2 + 5.0, stage_h / 2 + 1.0, 6.4, 9.0], [stage_w / 2 - 5.0, stage_h / 2 + 1.0, 7.0, 9.5]]) {
        hull() {
          translate([sp[0], sp[1] - 3.0, 0]) cylinder(h = stage_d + 1.8, d = sp[2]);
          translate([sp[0] + 0.6, sp[1] + sp[3], 0]) cylinder(h = stage_d + 0.8, d = 1.8);
        }
      }
      // Projecting #12 Gothic Belfry Rafter Hood (tapers inward as +Z rises from Z = 41..63 -> 0-deg overhang on print bed!)
      hull() {
        translate([0, 87.5, stage_d - 2.0])
          chamfer_box(26.0, 13.0, 3.4, r = 2.4, ch_bot = 0, ch_top = 0.4);
        translate([0, 87.0, rafter_z + 3.5])
          chamfer_box(13.0, 9.6, 1.6, r = 1.8, ch_bot = 0, ch_top = 0.5);
      }

      // 3. Stabilized Deep Stage Apron at Bottom (Y = -65..-51, Z = 0..51.0 so CoM stays rock-solid with front-hanging bats!)
      translate([0, -stage_h / 2 + 7.0, 0])
        chamfer_box(stage_w + 3.0, 14.0, stage_d + 8.0, r = 3.2, ch_bot = 0.8, ch_top = 0.8);
      for (fx = [-44, -22, 0, 22, 44]) {
        translate([fx, -stage_h / 2 + 4.5, stage_d + 6.5])
          hull() {
            cylinder(h = 4.5, d = 7.4);
            translate([0, 3.0, 0]) cylinder(h = 4.5, d = 5.2);
          }
      }
      translate([0, stage_h / 2 - 5.0, 0])
        chamfer_box(stage_w + 3.0, 10.0, stage_d + 2.4, r = 3.2, ch_bot = 0.8, ch_top = 0.8);

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

      // 5. Pointed Bat-Wing Scalloped Gothic Valance Header across Top Arch + Raised Cartouche Plaque
      translate([0, 44.0, stage_d - 2.0])
        chamfer_box(stage_w - 12.0, 24.0, 4.4, r = 2.4, ch_bot = 0.4, ch_top = 0.8);
      for (vx = [-60 : 15 : 60]) {
        translate([vx, 32.0, stage_d - 2.0])
          hull() {
            cylinder(h = 4.4, d1 = 15.6, d2 = 14.0);
            translate([0, -4.4, 0]) cylinder(h = 4.0, d = 2.6);
          }
      }
      translate([0, 45.0, stage_d + 1.0])
        chamfer_box(70.0, 15.6, 2.4, r = 2.0, ch_bot = 0, ch_top = 0.4);
    }

    // 6. Central Stage Viewport (132 x 82 mm)
    translate([0, -6.0, -0.5])
      linear_extrude(height = stage_d + 5.0)
        rrect2d(stage_w - 38.0, stage_h - 48.0, r = 4.0);

    // 7. Interior Curtain Wing & Mechanism Chamber: full 160 x 116 mm backstage bay up to Z = 17.5,
    //    tapering at <= 45 deg (23 mm over 23.1 mm Z) to the 132 x 82 mm viewport at Z = 40.6!
    hull() {
      translate([0, 0, -0.5])
        linear_extrude(height = 18.0)
          rrect2d(stage_w - 10.0, stage_h - 14.0, r = 3.0);
      translate([0, -6.0, stage_d - 2.4])
        linear_extrude(height = 0.5)
          rrect2d(stage_w - 38.0, stage_h - 48.0, r = 4.0);
    }
    for (sx = [-1, 1]) {
      hull() {
        translate([sx * 71.0, 5.5, -0.5])
          linear_extrude(height = 29.5)
            rrect2d(18.0, 105.0, r = 2.4);
        translate([sx * 71.0, 5.5, 37.7])
          linear_extrude(height = 0.4)
            rrect2d(2.4, 89.0, r = 1.0);
      }
    }
    hull() {
      translate([0, 48.0, -0.5])
        linear_extrude(height = 23.0)
          rrect2d(136.0, 18.0, r = 2.4);
      translate([0, 48.0, 31.5])
        linear_extrude(height = 0.4)
          rrect2d(120.0, 2.4, r = 1.0);
    }

    // 7b. Upper Belfry #12 Rattle-Servo Vault & Side Pediment Weight-Relief Coffers (all <= 43 deg vaulted = zero supports!):
    //   - Central Rattle SG90 #2 backstage chamber (Z = 2.2..40.5, leaving Z = 0..2.2 backplate & Z >= 41 front gable + Z = 0..63 Y >= 83.5 rafter solid!)
    hull() {
      translate([-4.0, 71.5, plate_t])
        linear_extrude(height = 21.0)
          rrect2d(56.0, 19.6, r = 2.2);
      translate([-4.0, 71.5, stage_d - 2.2])
        linear_extrude(height = 0.4)
          rrect2d(22.0, 3.0, r = 1.0);
    }
    //   - Left & right upper pediment wing coffers (open on Z = 0 outside the X = -32..+24 SG90 #2 backplate!)
    for (sx = [-1, 1]) {
      px_c = sx < 0 ? -48.0 : 44.0;
      hull() {
        translate([px_c, 68.5, -0.1])
          linear_extrude(height = 28.0)
            rrect2d(24.0, 12.0, r = 2.0);
        translate([px_c, 68.5, stage_d - 3.0])
          linear_extrude(height = 0.4)
            rrect2d(4.0, 2.0, r = 0.8);
      }
    }
    //   - Center bottom apron coffer between the two lower M3 bezel cleats (leaves solid 2.8 mm bottom foot at Y = -65..-62.2!)
    hull() {
      translate([0, -58.0, -0.1])
        linear_extrude(height = 41.0)
          rrect2d(60.0, 8.4, r = 1.6);
      translate([0, -58.0, stage_d + 5.0])
        linear_extrude(height = 0.3)
          rrect2d(50.0, 2.0, r = 0.8);
    }
    //   - Left & right lower column flank coffers
    for (sx = [-1, 1]) {
      hull() {
        translate([sx * 74.0, -14.0, -0.1])
          linear_extrude(height = 29.0)
            rrect2d(16.0, 62.0, r = 2.0);
        translate([sx * 73.5, -14.0, stage_d - 2.6])
          linear_extrude(height = 0.3)
            rrect2d(3.2, 48.0, r = 1.0);
      }
    }

    // 7c. #12 RattleSG90 #2 Cutout in Z = 0..2.2 Upper Belfry Backplate + Plumb Z-Axis Fairlead Tunnel out Front Rafter!
    translate([rattle_bx, rattle_by, 1.0])
      cube([sg90_body_w, sg90_body_d, plate_t + 2.5], center = true);
    for (sx = [-1, 1]) {
      translate([rattle_bx + sx * sg90_hole_span / 2, rattle_by, -0.2])
        cylinder(h = plate_t + 1.0, d = sg90_m2_pilot_d);
    }
    // Straight vertical-print (+Z) Ø3.8 mm nylon-thread tunnel inside the solid Y = 87.0 rafter spine (Z = 14.0 .. rafter_z)
    translate([0, 87.0, 14.0])
      cylinder(h = rafter_z - 14.0 + 0.5, d = 3.8);
    // Backstage 45-deg bellmouth entry port connecting SG90 #2 horn (X = 0, Y = 71, Z = 15) smoothly up into the Z = 14..22 tunnel
    hull() {
      translate([0, 81.0, 15.5]) rotate([-90, 0, 0]) cylinder(h = 7.0, d = 6.4);
      translate([0, 81.0, 22.0]) rotate([-90, 0, 0]) cylinder(h = 7.0, d = 1.4);
    }
    // Front-bottom 45-deg bellmouth hang port at (X = 0, Y = rafter_y = 83.2, Z = rafter_z = 59.5) suspending prop-12-bats-mobile!
    translate([0, 87.0, rafter_z])
      rotate([90, 0, 0]) {
        hull() {
          cylinder(h = 7.0, d = 3.6);
          translate([0, 2.2, 0]) cylinder(h = 7.0, d = 1.0);
        }
        hull() {
          translate([0, 0, 2.4]) cylinder(h = 2.8, d1 = 3.6, d2 = 6.4);
          translate([0, 3.4, 2.4]) cylinder(h = 2.8, d = 1.2);
        }
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

  // 10. Internal Backstage Mounts (100% unchanged #9 Curtain Reveal coordinates)
  // a) Top-Right SG90 Curtain Servo Back Plate
  difference() {
    translate([58.0, 23.5, 0]) cube([24.0, 35.5, plate_t]);
    translate([servo_x - sg90_body_d / 2, servo_y - 5.5 - sg90_body_w / 2, -0.1])
      cube([sg90_body_d, sg90_body_w, plate_t + 0.2]);
    for (sy = [-1, 1])
      translate([servo_x, servo_y - 5.5 + sy * sg90_hole_span / 2, -0.1])
        cylinder(h = plate_t + 0.2, d = sg90_m2_pilot_d);
  }

  // a2) Tapered Left Thread Post
  left_post = [-73.45, 28.8];
  translate([-82.0, 23.5, 0]) cube([12.0, 10.0, plate_t]);
  translate([left_post[0], left_post[1], plate_t - 0.01]) {
    cylinder(h = 15.6, d1 = 7.8, d2 = 3.2);
    cylinder(h = thread_z + 1.8 - plate_t + 0.01, d = 3.2);
  }

  // b) Top-Left Idler Pulley Post
  idler_boss_h = thread_z - 4.4;
  translate([idler_x, idler_y, 0]) {
    hull() {
      cylinder(h = idler_boss_h, d1 = 14.0, d2 = 10.0);
      translate([-14.0, 0, 0]) cube([6.0, 14.0, idler_boss_h]);
    }
    cylinder(h = idler_boss_h + 10.0, d = 4.0);
  }

  // c) Left & Right Curtain Rail Cleat Sockets (pocket Z = rail_z0..31.5)
  for (sx = [-1, 1]) {
    translate([sx * (stage_w / 2 - 4.5), 31.5, 0])
    difference() {
      chamfer_box(8.0, 12.0, 31.0, r = 1.4, ch_bot = 0.4, ch_top = 0.4);
      translate([-sx * 2.0, 0, (rail_z0 + 32.0) / 2])
        cube([7.0, 8.6, 32.0 - rail_z0], center = true);
    }
  }

  // d) Four Backstage Corner Rest & M3 Screw Cleats for prop-09-screen-bezel.stl
  for (sx = [-1, 1]) {
    difference() {
      union() {
        translate([sx * 58.5, -52.0, 0])
          chamfer_box(50.0, 14.0, 6.0, r = 1.5, ch_bot = 0.4, ch_top = 0.4);
        translate([sx * 46.0, 48.0, 0])
          chamfer_box(22.0, 24.0, 6.0, r = 1.5, ch_bot = 0.4, ch_top = 0.4);
      }
      translate([sx * 46.0, -50.0, 0.6])
        cylinder(h = 6.0, d = 2.7);
      translate([sx * 46.0, 39.0, 0.6])
        cylinder(h = 6.0, d = 2.7);
    }
  }
}

color(col_leather) prop_09_stage_frame();
