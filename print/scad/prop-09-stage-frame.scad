// Hauntology Tabletop Print Kit — Master 3-in-1 Haunted Clocktower Stage (#3 Haunt Meter + #9 Curtain Reveal + #12 Rafter Rattle Bats)
// Colour: Leather / Wood Brown (#6b4d33)
// Size: 173.0 W x 169.8 H x 63.0 D mm (fits 180x180 mm bed; merges #3 + #9 + #12 on 1 shared backstage ESP32!)
// Sticker details: Scalloped valance trim & "THE SOLUTION" nameplate pocket (66 x 12 mm)
// Hardware:
//   - #3 Haunt Needle Clocktower Saddle (top Y = +92.3 ledge + Z = 0..16.4 twin M3 yoke & Ø4.6 conical locating pins at Y = +99.8):
//     prop-03-dial-plate bolts on with 2x M3 screws from backstage; SG90 wire drops straight down backstage to shared ESP32!
//   - #9 Curtain Reveal: Top-right SG90 back plate (X = 67, Y = 46), top-left idler post (M2 screw bore), rail sockets, screen/ESP32 cleats,
//     plus concealed 10 mm WS2812B LED strip channels in upper valance & lower footlight apron.
//   - #12 Rafter Bats Belfry: Upper-gable horizontal SG90 back plate (spline X = -14.0, Y = 71.0 -> 14 mm horn tip on X = 0.0!)
//     tugging a straight Z-axis fairlead tunnel out a projecting Z = 63 mm gothic gargoyle rafter beam (Y = +83.2) right below the #3 dial!
// Print orientation: Flat on back edge (Z = 0), 100% support-free (1 connected manifold).

include <_common.scad>

stage_w = 170.0;
stage_h = 130.0; // Core proscenium box Y = -65..+65; clocktower yoke rises to Y = +104.8 (total Y = 169.8 mm <= 180 mm bed!)
stage_d = 43.0;  // Core proscenium depth; footlight base Z = 55.5 mm for stability; top belfry rafter projects to Z = 63 mm!

// #9 Curtain drive layout — 100% identical stage coordinates so all p09 curtain & thread-route checks match 1:1.
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

// #3 Integrated Clocktower Haunt-Meter Saddle Coordinates (read by tools/lib/print-assembly.mjs & viewer.html)
dial_cy     = 110.8; // #3 dial hub (0, 0) stage Y -> #3 bottom sill (Y_local = -18.0) rests above Y = +92.3 clocktower cornice!
dial_z0     = 26.8;  // #3 dial back face (Z_dial = 0) stage Z -> #3 front face (16.4) aligns flush with Z = +43.2 proscenium!

module prop_09_stage_frame() {
  difference() {
    union() {
      // 1. Outer proscenium box shell (X = -85..85, Y = -65..65, Z = 0..stage_d)
      chamfer_box(stage_w, stage_h, stage_d, r = 4.0, ch_bot = 0.8, ch_top = 0.8);

      // 2. Gothic Clocktower Belfry Shoulders & Horizontal Saddle Cornice (Y = 62.0..92.3, Z = 0..42.6)
      linear_extrude(height = stage_d - 0.4)
        polygon(points = [
          [-stage_w / 2 + 3.0,  stage_h / 2 - 3.0],
          [ stage_w / 2 - 3.0,  stage_h / 2 - 3.0],
          [ stage_w / 2 - 7.0,  77.0],
          [ 76.0,               88.5],
          [ 78.0,               92.2],
          [-78.0,               92.2],
          [-76.0,               88.5],
          [-stage_w / 2 + 7.0,  77.0]
        ]);
      // Sculpted front clocktower saddle cornice moulding along Y = 88.5..92.2 (recessed to Z <= 42.6 so #3 bezel at Y >= 92.8 clears!)
      translate([0, 90.2, 0])
        chamfer_box(156.0, 4.0, stage_d - 0.4, r = 1.4, ch_bot = 0.6, ch_top = 0.5);

      // 2b. Twin Backstage Clocktower Mounting Yoke Pillars (Z = 0..26.4, Y = 84.0..104.8 -> total Y = 169.8 mm <= 180 mm bed!)
      //     Forms a rock-solid L-cradle with 2x M3 backstage counterbored holes (X = +-48, Y = 99.8) + 2x Ø4.6 conical pins (X = +-63, Y = 99.8)
      for (sx = [-1, 1]) {
        translate([sx * 55.5, 94.4, 0])
          chamfer_box(30.0, 20.8, 26.4, r = 2.4, ch_bot = 0.6, ch_top = 0.4);
        // Conical +Z locating pin entering prop-03-dial-plate's Ø5.6 mm alignment socket (0-deg overhang!)
        translate([sx * 63.0, dial_cy - 11.0, 26.3])
          cylinder(h = 3.9, d1 = 4.6, d2 = 3.9);
      }

      // 2c. Projecting #12 Gothic Belfry Rafter Hood (Y = 81.2..92.0 at base, Y = 83.0..91.4 at tip -> clears hanging bats at <= 82.8 & #3 dial at >= 92.8!)
      hull() {
        translate([0, 86.6, stage_d - 2.0])
          chamfer_box(26.0, 10.8, 3.4, r = 2.4, ch_bot = 0, ch_top = 0.4);
        translate([0, 87.2, rafter_z + 3.5])
          chamfer_box(13.0, 8.4, 1.6, r = 1.8, ch_bot = 0, ch_top = 0.5);
      }

      // 3. Stabilized Deep Stage Apron at Bottom (Y = -65..-51, Z = 0..55.5 so CoM with top clocktower & bats stays dead-center!)
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

      // 4. Skewed Tapered Gothic Theatre Column Pilasters on Front Proscenium (extending up into clocktower corbels)
      for (sx = [-1, 1]) {
        hull() {
          translate([sx * (stage_w / 2 - 11.0), -48.0, stage_d - 2.0])
            chamfer_box(20.0, 12.0, 4.6, r = 1.6, ch_bot = 0.4, ch_top = 0.8);
          translate([sx * (stage_w / 2 - 12.2), 2.0, stage_d - 2.0])
            chamfer_box(15.0, 18.0, 4.4, r = 2.0, ch_bot = 0.4, ch_top = 0.8);
          translate([sx * (stage_w / 2 - 10.5), 48.0, stage_d - 2.0])
            chamfer_box(19.0, 12.0, 4.6, r = 1.6, ch_bot = 0.4, ch_top = 0.8);
        }
        // Upper clocktower buttress corbels flanking the #12 rafter
        hull() {
          translate([sx * 64.0, 68.0, stage_d - 2.0])
            chamfer_box(16.0, 8.0, 3.4, r = 1.6, ch_bot = 0.2, ch_top = 0.6);
          translate([sx * 66.0, 86.0, stage_d - 2.0])
            chamfer_box(18.0, 8.0, 3.6, r = 1.6, ch_bot = 0.2, ch_top = 0.6);
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

    // 6b. Concealed 11.0 mm-wide WS2812B LED Strip Channels (Z = 29.0..40.2, hidden behind front valance & footlight lip):
    hull() {
      translate([0, 35.6, 34.6]) cube([124.0, 2.4, 11.2], center = true);
      translate([0, 34.0, 34.6]) cube([126.0, 0.8, 14.8], center = true);
    }
    translate([59.0, 35.8, 15.5])
      cylinder(h = 15.0, d = 4.6);
    hull() {
      translate([0, -47.6, 34.6]) cube([124.0, 2.4, 11.2], center = true);
      translate([0, -46.0, 34.6]) cube([126.0, 0.8, 14.8], center = true);
    }
    translate([59.0, -47.8, -0.5])
      cylinder(h = 31.0, d = 4.6);

    // 7. Interior Curtain Wing & Mechanism Chamber
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

    // 7b. Upper Belfry #12 Rattle-Servo Vault & Widened Clocktower Shoulder Coffers (all <= 43 deg vaulted = zero supports!):
    hull() {
      translate([-4.0, 71.5, plate_t])
        linear_extrude(height = 21.0)
          rrect2d(56.0, 19.6, r = 2.2);
      translate([-4.0, 71.5, stage_d - 2.2])
        linear_extrude(height = 0.4)
          rrect2d(22.0, 3.0, r = 1.0);
    }
    for (sx = [-1, 1]) {
      px_c = sx < 0 ? -54.0 : 51.0;
      pw_c = sx < 0 ? 40.0 : 44.0;
      hull() {
        translate([px_c, 74.5, -0.1])
          linear_extrude(height = 25.0)
            rrect2d(pw_c, 16.5, r = 2.2);
        translate([px_c, 74.5, stage_d - 2.8])
          linear_extrude(height = 0.4)
            rrect2d(pw_c - 22.0, 2.2, r = 0.8);
      }
      // Inner clocktower saddle coffers between center rafter spine (X = +-15) and yoke pillars (X = +-40.5)
      hull() {
        translate([sx * 27.5, 86.2, -0.1])
          linear_extrude(height = 28.0)
            rrect2d(21.0, 8.8, r = 1.8);
        translate([sx * 27.5, 86.2, stage_d - 3.2])
          linear_extrude(height = 0.4)
            rrect2d(9.0, 1.8, r = 0.8);
      }
    }
    hull() {
      translate([0, -58.0, -0.1])
        linear_extrude(height = 41.0)
          rrect2d(60.0, 8.4, r = 1.6);
      translate([0, -58.0, stage_d + 5.0])
        linear_extrude(height = 0.3)
          rrect2d(50.0, 2.0, r = 0.8);
    }
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

    // 7c. #3 Clocktower Yoke Backstage M3 Clearance Bores, Deep Counterbores & Vaulted Yoke Weight-Relief (X = +-48.0, Y = 99.8)
    for (sx = [-1, 1]) {
      translate([sx * 48.0, dial_cy - 11.0, -0.5])
        cylinder(h = 28.0, d = 3.4);
      translate([sx * 48.0, dial_cy - 11.0, -0.2])
        cylinder(h = 16.6, d = 6.6);
      // Hollow the outer half of each yoke pillar from Z = 0..16.2 (43-deg dome to Z = 22.8) so yoke adds minimal weight!
      hull() {
        translate([sx * 61.5, 94.0, -0.2])
          linear_extrude(height = 16.4)
            rrect2d(13.0, 14.0, r = 1.8);
        translate([sx * 61.5, 94.0, 22.8])
          linear_extrude(height = 0.2)
            rrect2d(1.8, 2.8, r = 0.6);
      }
    }

    // 7d. #12 Rattle SG90 #2 Cutout in Z = 0..2.2 Upper Belfry Backplate + Plumb Z-Axis Fairlead Tunnel out Front Rafter!
    translate([rattle_bx, rattle_by, 1.0])
      cube([sg90_body_w, sg90_body_d, plate_t + 2.5], center = true);
    for (sx = [-1, 1]) {
      translate([rattle_bx + sx * sg90_hole_span / 2, rattle_by, -0.2])
        cylinder(h = plate_t + 1.0, d = sg90_m2_pilot_d);
    }
    // Straight vertical-print (+Z) Ø3.8 mm nylon-thread tunnel inside the solid Y = 87.0 rafter spine (Z = 14.0 .. rafter_z)
    translate([0, 87.0, 14.0])
      cylinder(h = rafter_z - 14.0 + 0.5, d = 3.8);
    hull() {
      translate([0, 81.0, 15.5]) rotate([-90, 0, 0]) cylinder(h = 7.0, d = 6.4);
      translate([0, 81.0, 22.0]) rotate([-90, 0, 0]) cylinder(h = 7.0, d = 1.4);
    }
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

    // 9. Twisted Diagonal Spiral Flutes in Left & Right Proscenium Columns + Gothic Pointed Blind Arches in Clocktower Corbels
    for (sx = [-1, 1], fy = [-32, -16, 0, 16, 32]) {
      translate([sx * (stage_w / 2 - 11.5), fy, stage_d + 2.4])
        rotate([0, 0, sx * 32])
          rotate([45, 0, 0])
            cube([14.0, 1.4, 1.4], center = true);
    }
    for (sx = [-1, 1], cx = [34.0, 48.0]) {
      translate([sx * cx, 77.0, stage_d - 0.8])
        hull() {
          translate([0, -5.0, 0]) cylinder(h = 2.0, d = 6.4);
          translate([0,  4.0, 0]) cylinder(h = 2.0, d = 6.4);
          translate([0,  7.5, 0]) cylinder(h = 2.0, d = 1.6);
        }
    }
  }

  // 10. Internal Backstage Mounts (100% unchanged #9 Curtain Reveal coordinates + backstage servo-wire guide clips)
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

  // b) Top-Left Idler Pulley Post (with axial Ø1.75 mm M2 washer-screw pilot bore)
  idler_boss_h = thread_z - 4.4;
  translate([idler_x, idler_y, 0])
  difference() {
    union() {
      hull() {
        cylinder(h = idler_boss_h, d1 = 14.0, d2 = 10.0);
        translate([-14.0, 0, 0]) cube([6.0, 14.0, idler_boss_h]);
      }
      cylinder(h = idler_boss_h + 10.0, d = 4.0);
    }
    translate([0, 0, idler_boss_h + 3.0])
      cylinder(h = 8.0, d = 1.75);
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

  // d) Four Backstage Corner Rest & Open Z = 0 M3 Through-Bore Cleats for prop-09-screen-bezel.stl
  for (sx = [-1, 1]) {
    difference() {
      union() {
        translate([sx * 60.0, -52.0, 0])
          chamfer_box(44.0, 14.0, 6.0, r = 1.5, ch_bot = 0.4, ch_top = 0.4);
        translate([sx * 46.0, 48.0, 0])
          chamfer_box(22.0, 24.0, 6.0, r = 1.5, ch_bot = 0.4, ch_top = 0.4);
      }
      for (cy = [-50.0, 39.0]) {
        translate([sx * 46.0, cy, -0.5])
          cylinder(h = 7.5, d = 3.4);
        translate([sx * 46.0, cy, -0.1])
          cylinder(h = 1.4, d1 = 6.0, d2 = 3.4);
      }
    }
  }

  // e) Backstage Servo-Ribbon Retention Clips (Z = 0..4.5 along right inner frame wall X = +80, routing #3 & #12 wires safely behind bezel!)
  for (wy = [60.0, -12.0]) {
    translate([80.5, wy, 0]) {
      cube([4.0, 6.0, 4.4]);
      translate([-2.8, 0, 0]) cube([3.2, 2.2, 4.4]);
    }
  }
}

color(col_leather) prop_09_stage_frame();
