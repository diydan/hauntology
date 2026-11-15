// Hauntology Tabletop Print Kit — Prop #9: Curtain Reveal (Proscenium Stage Frame & Valance)
// Colour: Leather (#6b4d33)
// Size: 170 W x 130 H x 56 D mm
// Sticker details: Scalloped valance gold-trim groove & "THE SOLUTION" nameplate pocket (66 x 12 mm)
// Hardware: Top-right SG90 servo pocket, top-left idler pulley post, curtain rail slots, backstage bezel cleats
// Print orientation: Flat on back edge (Z = 0, 170 x 130 mm footprint, 56 mm height), zero supports!

include <_common.scad>

stage_w = 170.0;
stage_h = 130.0; // Along Y in print orientation so back lies flat on Z = 0
stage_d = 56.0;  // Along Z in print orientation

module prop_09_stage_frame() {
  difference() {
    union() {
      // 1. Outer proscenium box shell (X = -85..85, Y = -65..65, Z = 0..56)
      chamfer_box(stage_w, stage_h, stage_d, r = 4.0, ch_bot = 0.8, ch_top = 0.8);

      // 2. Stepped theatre stage apron at bottom (Y = -65..-51) & cornice crown at top (Y = 55..65)
      translate([0, -stage_h / 2 + 7.0, 0])
        chamfer_box(stage_w + 4.0, 14.0, stage_d + 2.4, r = 3.0, ch_bot = 0.8, ch_top = 0.8);
      translate([0, stage_h / 2 - 5.0, 0])
        chamfer_box(stage_w + 4.0, 10.0, stage_d + 2.4, r = 3.0, ch_bot = 0.8, ch_top = 0.8);

      // 3. Fluted side pilasters on front proscenium face (Z = stage_d)
      for (sx = [-1, 1]) {
        translate([sx * (stage_w / 2 - 11.0), -2.0, stage_d - 2.0])
          chamfer_box(18.0, stage_h - 22.0, 4.4, r = 2.0, ch_bot = 0.4, ch_top = 0.8);
      }

      // 4. Scalloped Victorian Valance Header across Top Arch (Y = 30..56, Z = stage_d - 2..stage_d + 2.4)
      translate([0, 44.0, stage_d - 2.0])
        chamfer_box(stage_w - 12.0, 24.0, 4.4, r = 2.4, ch_bot = 0.4, ch_top = 0.8);
      for (vx = [-60 : 15 : 60]) {
        translate([vx, 32.0, stage_d - 2.0])
          cylinder(h = 4.4, d1 = 16.0, d2 = 14.4);
      }

      // 5. Raised Cartouche Plaque for "THE SOLUTION" Nameplate Sticker on Valance
      translate([0, 45.0, stage_d + 1.6])
        chamfer_box(70.0, 15.6, 1.8, r = 2.0, ch_bot = 0.4, ch_top = 0.4);
    }

    // 6. Central Stage Viewport & Backstage Cavity (leaves 18 mm side wings, 18 mm apron, 32 mm header)
    translate([0, -6.0, -0.5])
      linear_extrude(height = stage_d + 5.0)
        rrect2d(stage_w - 38.0, stage_h - 48.0, r = 4.0);

    // 7. Wider Interior Curtain Wing & Mechanism Chamber behind Front Proscenium Arch (Z = 0..stage_d - 6.0)
    translate([0, 0, -0.5])
      linear_extrude(height = stage_d - 5.5)
        rrect2d(stage_w - 10.0, stage_h - 14.0, r = 3.0);

    // 8. Front 0.4 mm Recessed Sticker Pocket for "THE SOLUTION" Nameplate (66 x 12 mm)
    translate([0, 45.0, stage_d + 3.4 - sticker_depth])
      linear_extrude(height = sticker_depth + 0.6)
        rrect2d(66.0, 12.0, r = 1.2);

    // 9. Vertical Flutes in Left & Right Pilasters
    for (sx = [-1, 1], fx = [-4.5, 0, 4.5]) {
      translate([sx * (stage_w / 2 - 11.0) + fx, -4.0, stage_d + 2.4])
        rotate([90, 0, 0])
          cylinder(h = stage_h - 36.0, d = 2.6, center = true);
    }
  }

  // 10. Internal Backstage Mounts (attached to inner side/top walls, printing cleanly from Z = 0)
  // a) Top-Right SG90 Curtain Servo Cradle (X = 62, Y = 42, Z = 0..20)
  translate([62.0, 42.0, 0])
  difference() {
    chamfer_box(22.0, 26.0, 22.0, r = 2.0, ch_bot = 0.4, ch_top = 0.6);
    translate([0, 0, 11.0])
      cube([sg90_body_d, sg90_body_w, 24.0], center = true);
    for (sy = [-1, 1])
      translate([0, sy * sg90_hole_span / 2, 12.0])
        cylinder(h = 12.0, d = sg90_m2_pilot_d);
  }

  // b) Top-Left Idler Pulley Axle Post (X = -66, Y = 42, Z = 0..24; 4.0 mm axle for 4.6 mm pulley bore)
  translate([-66.0, 42.0, 0]) {
    cylinder(h = 14.0, d1 = 12.0, d2 = 9.0);
    cylinder(h = 24.0, d = 4.0);
  }

  // c) Left & Right Curtain Rail Cleat Sockets (at Y = 34, Z = 28..42)
  for (sx = [-1, 1]) {
    translate([sx * (stage_w / 2 - 5.0), 34.0, 28.0])
    difference() {
      chamfer_box(8.0, 14.0, 14.0, r = 1.2, ch_bot = 0.4, ch_top = 0.4);
      translate([-sx * 2.0, 0, 7.5])
        cube([6.6, 8.6, 15.0], center = true);
    }
  }
}

color(col_leather) prop_09_stage_frame();
