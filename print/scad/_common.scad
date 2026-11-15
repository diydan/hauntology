// Hauntology Tabletop Print Kit — Shared Parametric Header (_common.scad)
// Ground rules (3D_BRIEF.md):
//   - Bed limit: 180 x 180 mm
//   - Layer height: 0.2 mm, nozzle: 0.4 mm, walls >= 1.6 mm
//   - Moving clearance: 0.3 mm (clear_move); press/snap clearance: 0.15 mm (clear_fit)
//   - Sticker pockets: 0.4 mm recessed with raised rounded-chamfer frame
//   - Reference Servo: TowerPro SG90 9g Micro Servo (22.8 x 12.2 x 22.5 mm case, 32.5 mm ear span,
//     27.5 mm M2 screw hole centres, 11.8 mm top boss, shaft 5.5 mm from end).
//     NOTE: Clone SG90/MG90S dimensions vary by +/-0.3 mm — measure your servos and adjust the sg90_*
//     parameters below if needed before printing a full batch.
//   - Reference Controller: Espressif ESP32-WROOM-32E DevKitC V4 (54.4 x 27.9 mm PCB, 48.26 x 22.86 mm
//     M2 corner mounting holes, 7.0 mm PCB antenna overhang at end opposite USB-C port).

$fa = 4;
$fs = 0.35;

// --- Standard tolerances and print parameters ---
layer_h            = 0.2;
nozzle_d           = 0.4;
min_wall           = 1.6;
clear_move         = 0.30;
clear_fit          = 0.15;
sticker_depth      = 0.40;

// --- Relic Token & Centre Connector interface dimensions (no Relic base plates) ---
token_side_mm      = 40.0;
token_height_mm    = 6.0;
token_qr_mm        = 36.4; // 36 x 36 mm sticker + 0.2 mm margin per side
relic_conn_plug_d  = 13.6; // Compact centre connector plug on bottom of each Relic (130+ mm^2 bed contact at z=0)
relic_conn_plug_h  = 2.0;  // Plug engagement depth into the centre of the Relic Token
relic_conn_sock_d  = relic_conn_plug_d + 2 * clear_fit; // 13.9 mm press/drop-in centre socket on Relic Token

// --- TowerPro SG90 9g Micro Servo dimensions (incorporating clear_move / clear_fit) ---
sg90_body_w        = 22.8 + 2 * clear_fit; // 23.1 mm
sg90_body_d        = 12.2 + 2 * clear_fit; // 12.5 mm
sg90_body_h        = 22.5;
sg90_flange_w      = 32.5 + 2 * clear_fit; // 32.8 mm
sg90_flange_h      = 2.5 + clear_fit;      // 2.65 mm
sg90_flange_z      = 16.0; // Bottom of servo case to underside of mounting ears (4.0 mm below case top)
sg90_hole_span     = 27.5;
sg90_m2_pilot_d    = 1.8 - clear_fit;      // 1.65 mm self-tapping M2 pilot bore
sg90_shaft_off_x   = -5.5; // Output spline offset from body centre along length
sg90_boss_d        = 11.8 + 2 * clear_move; // 12.4 mm clearance bore for top round bearing boss
sg90_spline_d      = 4.8 + 2 * clear_fit;  // 5.1 mm spline shaft clearance
sg90_horn_hub_d    = 7.3 + 2 * clear_fit;  // 7.6 mm SG90 horn hub press-fit
sg90_horn_tip_d    = 4.0 + 2 * clear_fit;  // 4.3 mm SG90 single-arm horn tip press-fit
sg90_cable_w       = 4.6;
sg90_cable_h       = 6.0;

// --- Espressif ESP32-WROOM-32E DevKitC V4 dimensions ---
esp32_pcb_w        = 54.4;
esp32_pcb_d        = 27.9;
esp32_w            = esp32_pcb_w + 4 * clear_move; // 55.6 mm pocket length
esp32_d            = esp32_pcb_d + 2 * clear_move; // 28.5 mm pocket width
esp32_h            = 14.0;
esp32_hole_w       = 48.26; // M2 mounting screw spacing along board length
esp32_hole_d       = 22.86; // M2 mounting screw spacing across board width
esp32_ant_len      = 7.5;   // PCB antenna keep-out zone at end opposite USB
esp32_usb_w        = 12.0;
esp32_usb_h        = 7.0;

// --- Expanded Spool & Preview Colour Palette ---
col_ink            = [11/255,  13/255,  16/255];
col_leather        = [107/255, 77/255,  51/255];
col_bone           = [233/255, 228/255, 216/255];
col_lantern        = [224/255, 164/255, 58/255];
col_ghost          = [159/255, 232/255, 208/255];
col_alarm          = [212/255, 96/255,  74/255];
col_silver         = [201/255, 201/255, 212/255];
col_seat_red       = [255/255, 107/255, 107/255];
col_seat_blue      = [107/255, 182/255, 255/255];
col_seat_green     = [107/255, 227/255, 154/255];
col_seat_yellow    = [255/255, 216/255, 107/255];
col_seat_violet    = [196/255, 155/255, 255/255];
col_seat_orange    = [255/255, 178/255, 122/255];

// ============================================================================
// Geometric & Ornamental Primitives (Rounded corners, print-safe <= 45 deg)
// ============================================================================

// Rounded rectangle in 2D centered at origin
module rrect2d(w, d, r = 2.4) {
  rc = max(0.2, min(r, min(w, d) / 2 - 0.05));
  offset(r = rc) square([w - 2*rc, d - 2*rc], center = true);
}

// Smoothly rounded tabletop box sitting on z = 0 (2-step pseudo-fillet on top & bottom edges,
// keeping the bottommost step at 45 deg so it prints crisp with zero supports and no sharp corners)
module chamfer_box(w, d, h, r = 2.8, ch_bot = 0.9, ch_top = 0.9) {
  cb = min(ch_bot, h * 0.35);
  ct = min(ch_top, h * 0.35);
  rc = max(0.5, r);
  hull() {
    // Main vertical body with rounded XY corners
    translate([0, 0, cb])
      linear_extrude(height = max(0.15, h - cb - ct))
        rrect2d(w, d, rc);
    // Two-stage bottom rounded bevel
    if (cb > 0) {
      translate([0, 0, cb * 0.42])
        linear_extrude(height = 0.05)
          rrect2d(w - 0.9 * cb, d - 0.9 * cb, max(0.4, rc - 0.45 * cb));
      linear_extrude(height = 0.05)
        rrect2d(w - 1.8 * cb, d - 1.8 * cb, max(0.3, rc - 0.9 * cb));
    }
    // Two-stage top rounded fillet
    if (ct > 0) {
      translate([0, 0, h - ct * 0.42 - 0.05])
        linear_extrude(height = 0.05)
          rrect2d(w - 0.9 * ct, d - 0.9 * ct, max(0.4, rc - 0.45 * ct));
      translate([0, 0, h - 0.05])
        linear_extrude(height = 0.05)
          rrect2d(w - 1.8 * ct, d - 1.8 * ct, max(0.3, rc - 0.9 * ct));
    }
  }
}

// Recessed 0.4 mm rectangular sticker pocket (subtract from top/front face)
module sticker_pocket_rect(w, d, r = 1.2, depth = sticker_depth) {
  translate([0, 0, -depth])
    linear_extrude(height = depth + 0.5)
      rrect2d(w, d, r);
}

// Recessed 0.4 mm circular/oval sticker pocket
module sticker_pocket_oval(rx, ry, depth = sticker_depth) {
  translate([0, 0, -depth])
    linear_extrude(height = depth + 0.5)
      scale([rx, ry]) circle(r = 1);
}

// Compact Relic Centre Connector Plug (no wide circular base plate!):
// Sits flat on z = 0 (diameter 13.6 mm -> 130+ mm^2 flat bed contact), plugs 2.0 mm into the
// centre socket of `relic-token-pocket.stl`, and corbels smoothly at <= 45 deg into the Relic body.
module relic_pedestal_base(h = 4.2, top_d = 18.0) {
  plug_h = relic_conn_plug_h;
  collar_h = max(0.8, h - plug_h);
  union() {
    // 1. Lower cylindrical centre-connector plug (z = 0..2.0) that drops into the Relic Token centre socket
    cylinder(h = 0.4, d1 = relic_conn_plug_d - 0.8, d2 = relic_conn_plug_d);
    translate([0, 0, 0.4])
      cylinder(h = plug_h - 0.4, d = relic_conn_plug_d);
    // Subtle anti-rotation alignment nub on +Y side of plug
    translate([0, relic_conn_plug_d / 2 - 0.2, plug_h / 2])
      chamfer_box(2.4, 1.2, plug_h - 0.4, r = 0.4, ch_bot = 0.2, ch_top = 0.2);

    // 2. Smooth 45-deg corbelled transition collar into the Relic body (no wide base plate!)
    translate([0, 0, plug_h])
      cylinder(h = collar_h, d1 = relic_conn_plug_d + 1.2, d2 = min(top_d, relic_conn_plug_d + 2 * collar_h));
  }
}

// Positive ESP32-WROOM-32E DevKitC V4 Mounting Cradle (narrow 28.5 mm USB-C end at +Y,
// 4x M2 corner screw bosses at 48.26 x 22.86 mm, and RF antenna keep-out window at -Y)
module esp32_devkitc_cradle(wall = 2.4, h = 7.5) {
  cw = esp32_d + 2 * wall;
  cd = esp32_w + 2 * wall;
  difference() {
    chamfer_box(cw, cd, h, r = 2.4, ch_bot = 0, ch_top = 0.6);
    // Main PCB pocket (z = 3.2..h)
    translate([0, 0, 3.2])
      linear_extrude(height = h)
        rrect2d(esp32_d, esp32_w, r = 1.0);
    // Under-board component & solder-pin clearance well (leaves 4 corner standoffs)
    translate([0, 2.0, -0.1])
      linear_extrude(height = 4.0)
        rrect2d(esp32_d - 6.4, esp32_w - 11.0, r = 1.5);
    // RF PCB antenna keep-out clearance window at -Y end
    translate([0, -(esp32_w / 2 - esp32_ant_len / 2 + 0.5), -0.1])
      linear_extrude(height = h + 1.0)
        rrect2d(esp32_d - 4.0, esp32_ant_len + 1.0, r = 1.2);
    // USB-C connector exit channel at +Y end
    translate([0, cd / 2 - wall / 2, 4.6])
      cube([esp32_usb_w + 1.0, wall + 3.0, h], center = true);
    // Four M2 corner screw pilot holes (22.86 x 48.26 mm spacing)
    for (sx = [-1, 1], sy = [-1, 1]) {
      translate([sx * esp32_hole_d / 2, sy * esp32_hole_w / 2, 0.4])
        cylinder(h = h + 1.0, d = sg90_m2_pilot_d);
    }
  }
}

// SG90 servo cavity (subtract from a cradle block)
module sg90_cutout(cable_dir = 1) {
  // Main body cavity
  translate([0, 0, -0.1])
    cube([sg90_body_w, sg90_body_d, sg90_body_h + 0.2], center = true);
  // Mounting ears slot
  translate([0, 0, sg90_flange_z * 0.5])
    cube([sg90_flange_w, sg90_body_d, sg90_flange_h + 0.4], center = true);
  // Two M2 pilot screw holes
  for (sx = [-1, 1]) {
    translate([sx * sg90_hole_span / 2, 0, 0])
      cylinder(h = sg90_body_h + 12, d = sg90_m2_pilot_d, center = true);
  }
  // Wire exit channel
  translate([cable_dir * (sg90_body_w / 2 + 4), 0, -sg90_body_h / 4])
    cube([10, sg90_cable_w, sg90_cable_h], center = true);
}

// Positive SG90 cradle mount block sitting on z = 0 (vertical servo orientation)
module sg90_cradle_block(wall = 2.8) {
  bw = sg90_flange_w + 2 * wall;
  bd = sg90_body_d + 2 * wall;
  bh = sg90_flange_z + sg90_flange_h;
  difference() {
    chamfer_box(bw, bd, bh, r = 2.0, ch_bot = 0.6, ch_top = 0.6);
    // Body slot
    translate([0, 0, bh / 2 + 1.6])
      cube([sg90_body_w, sg90_body_d, bh], center = true);
    // Ear recess at top
    translate([0, 0, bh - sg90_flange_h / 2 + 0.1])
      cube([sg90_flange_w, sg90_body_d, sg90_flange_h + 0.2], center = true);
    // M2 screw pilot holes
    for (sx = [-1, 1]) {
      translate([sx * sg90_hole_span / 2, 0, bh - 10])
        cylinder(h = 11, d = sg90_m2_pilot_d);
    }
    // Side wire exit channel
    translate([bw / 2 - wall / 2, 0, 6])
      cube([wall + 2, sg90_cable_w, 9], center = true);
  }
}

// Dovetail male tenon along Z axis (height h, neck n_w, flare f_w, depth d_len)
module dovetail_tenon(h, n_w = 6.0, f_w = 8.4, d_len = 4.0, ch = 0.4) {
  linear_extrude(height = h)
    polygon(points = [
      [-n_w/2, 0],
      [ n_w/2, 0],
      [ f_w/2, d_len - ch],
      [ f_w/2 - ch, d_len],
      [-f_w/2 + ch, d_len],
      [-f_w/2, d_len - ch]
    ]);
}

// Dovetail female mortise slot with 0.3 mm clearance
module dovetail_mortise(h, n_w = 6.0, f_w = 8.4, d_len = 4.0, clr = clear_move) {
  translate([0, -0.05, -0.05])
    linear_extrude(height = h + 0.1)
      polygon(points = [
        [-(n_w/2 + clr), 0],
        [ (n_w/2 + clr), 0],
        [ (f_w/2 + clr), d_len + clr + 0.05],
        [-(f_w/2 + clr), d_len + clr + 0.05]
      ]);
}

// Decorative plank groove lines on a vertical wall (width w, at z heights)
module plank_grooves_x(w, groove_d = 0.8, groove_h = 1.0) {
  rotate([45, 0, 0])
    cube([w, groove_d, groove_h], center = true);
}
