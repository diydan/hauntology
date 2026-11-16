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
relic_peg_d   = 5.6;   // Generic centre peg on the Relic Token. Small on purpose: the QR sticker gets a 6 mm hole punched for it and still scans.
relic_peg_h   = 3.0;   // How far the peg stands above the token's top face
relic_sock_d  = relic_peg_d + 0.5;  // 6.1 mm socket in the bottom of every Relic
relic_sock_h  = relic_peg_h + 0.3;  // 3.3 mm deep
relic_foot_d  = 14.6;  // Flat foot of every Relic at z = 0 (14.6 mm foot minus the socket and bevels = over 100 mm^2 of bed contact)

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

// Relic foot (no wide base plate): a flat 14.6 mm foot at z = 0 with a 6.1 mm centre socket that drops onto the
// 5.6 mm peg of `relic-token-pocket.stl`, then a short 45-degree corbel into the Relic body. Printing the socket
// (a blind hole open to the bed) keeps the 100+ mm^2 of bed contact that a 6 mm plug could not give.
module relic_pedestal_base(h = 4.5, top_d = 18.0) {
  cone_h = max(0.8, (top_d - relic_foot_d) / 2);
  cyl_h  = max(1.2, h - cone_h);
  difference() {
    union() {
      cylinder(h = 0.4, d1 = relic_foot_d - 0.8, d2 = relic_foot_d);
      translate([0, 0, 0.4]) cylinder(h = cyl_h - 0.4, d = relic_foot_d);
      translate([0, 0, cyl_h]) cylinder(h = h - cyl_h, d1 = relic_foot_d, d2 = min(top_d, relic_foot_d + 2 * (h - cyl_h)));
    }
    // Centre socket, open to the bed, with a small lead-in
    translate([0, 0, -0.01]) cylinder(h = relic_sock_h + 0.01, d = relic_sock_d);
    translate([0, 0, -0.01]) cylinder(h = 0.5, d1 = relic_sock_d + 1.0, d2 = relic_sock_d);
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

// Dovetail mortise cut to fit a given tenon (same n_w, f_w, d_len and ch as the dovetail_tenon it receives). It flares at the
// tenon's own slope with `clr` of clearance all round. The older dovetail_mortise flares less than the tenon it receives (for the
// plinth: 0.296 against 0.354 per mm), so the two touched deep in the slot whatever the pitch. `inset` is how far the tenon's base
// sits inside its own segment (the plinth's tenon starts 0.4 mm inside), so the neighbour's wall meets the tenon at depth `inset`.
module dovetail_mortise_fit(h, n_w = 6.0, f_w = 8.4, d_len = 4.0, ch = 0.4, inset = 0.0, clr = clear_move) {
  s  = (f_w - n_w) / 2 / (d_len - ch);
  y0 = -0.05;                     // start a hair outside the wall so the cut is clean
  y1 = d_len - inset + clr;       // the tenon's tip is at d_len - inset; leave clr beyond it
  translate([0, 0, -0.05])
    linear_extrude(height = h + 0.1)
      polygon(points = [
        [-(n_w / 2 + clr + s * (y0 + inset)), y0],
        [ (n_w / 2 + clr + s * (y0 + inset)), y0],
        [ (n_w / 2 + clr + s * (y1 + inset)), y1],
        [-(n_w / 2 + clr + s * (y1 + inset)), y1]
      ]);
}

// Decorative plank groove lines on a vertical wall (width w, at z heights)
module plank_grooves_x(w, groove_d = 0.8, groove_h = 1.0) {
  rotate([45, 0, 0])
    cube([w, groove_d, groove_h], center = true);
}

// ---------------------------------------------------------------------------
// Tim Burton / Gothic Expressionist Shared Geometry Helpers (all 45-deg print-safe)
// ---------------------------------------------------------------------------

// Wrought-iron Archimedean spiral scroll in 2D.
module burton_spiral_2d(turns = 1.15, r0 = 0.9, r1 = 6.2, w = 1.6, dir = 1, steps = 22) {
  for (i = [0 : steps - 1]) {
    t0 = i / steps;
    t1 = (i + 1) / steps;
    a0 = dir * t0 * turns * 360;
    a1 = dir * t1 * turns * 360;
    rad0 = r0 + (r1 - r0) * t0;
    rad1 = r0 + (r1 - r0) * t1;
    hull() {
      translate([rad0 * cos(a0), rad0 * sin(a0)]) circle(d = w);
      translate([rad1 * cos(a1), rad1 * sin(a1)]) circle(d = w);
    }
  }
}

// Organic gnarled branch / skeletal rib 2D path from point/radius pairs.
module burton_gnarled_path_2d(pts, radii) {
  for (i = [0 : len(pts) - 2]) {
    hull() {
      translate(pts[i])     circle(r = radii[i]);
      translate(pts[i + 1]) circle(r = radii[i + 1]);
    }
  }
}

// 45-deg safe crooked gothic iron spire / fence finial starting at local Z = 0.
module burton_gothic_spire_3d(h = 7.0, d = 3.2, skew_x = 0.6, skew_y = 0.0) {
  union() {
    hull() {
      cylinder(h = 0.6, d = d);
      translate([skew_x * 0.45, skew_y * 0.45, h * 0.42]) cylinder(h = 0.5, d = d * 1.15);
    }
    hull() {
      translate([skew_x * 0.45, skew_y * 0.45, h * 0.42]) cylinder(h = 0.5, d = d * 1.15);
      translate([skew_x, skew_y, h]) cylinder(h = 0.2, d = 0.7);
    }
  }
}

// Stitched / crooked tomb V-groove cut on horizontal top surfaces (Z axis down).
module burton_stitch_groove_z(len = 8.0, teeth = 4, cut_w = 0.9, cut_d = 0.75) {
  step = len / max(1, teeth);
  // Central seam cut
  translate([0, 0, -cut_d / 2])
    rotate([45, 0, 0])
      cube([len, cut_w, cut_w], center = true);
  // Cross-stitch tick cuts angled asymmetrically
  for (i = [0 : teeth - 1]) {
    tx = -len / 2 + (i + 0.5) * step;
    ang = (i % 2 == 0) ? 14 : -11;
    translate([tx, 0, -cut_d / 2])
      rotate([0, 0, ang])
        rotate([0, 45, 0])
          cube([cut_w * 0.9, 3.2, cut_w * 0.9], center = true);
  }
}

// Shared crooked Victorian graveyard plinth (positive solid) for Standees & Blank Arch.
// Keeps front nameplate slope (78 deg at Y ~ -6.2) flat & unobstructed while adding skewed
// tombstone ledges, gnarled buttresses, and flanking gothic iron fence bollards.
module burton_standee_plinth_solid(
  standee_w = 40.0,
  standee_d = 15.0,
  plinth_h  = 9.5,
  blade_t   = 3.4,
  skew      = 1.2
) {
  // Base graveyard curb slab (flat Z = 0, skewed upper crown shoulder)
  hull() {
    chamfer_box(standee_w + 1.0, standee_d, 3.6, r = 2.6, ch_bot = 0.8, ch_top = 0.3);
    translate([0, 0.8, 3.6])
      chamfer_box(standee_w - 2.4, standee_d - 2.6, plinth_h - 3.6, r = 2.0, ch_bot = 0.2, ch_top = 0.7);
  }
  // Crooked outer tomb-curb shoulders (clear of X = [-17..+17] nameplate pocket)
  for (sx = [-1, 1]) {
    dh = (sx * skew > 0) ? 1.6 : -0.4;
    hull() {
      translate([sx * (standee_w / 2 - 1.2), 1.4, 0])
        cylinder(h = 3.2, d = 5.4);
      translate([sx * (standee_w / 2 - 0.3), 1.8, plinth_h + dh])
        cylinder(h = 0.8, d = 4.2);
    }
    // Flanking miniature gothic iron graveyard fence posts rising gently along blade flanks
    translate([sx * (standee_w / 2 - 1.2), 1.8, plinth_h + dh - 0.5])
      burton_gothic_spire_3d(h = 5.2 + (sx > 0 ? 1.0 : -0.4), d = 3.0, skew_x = sx * 0.55, skew_y = 0.2);
  }
  // Asymmetric crooked gothic buttresses uniting tombstone plinth and standee blade
  for (sx = [-1, 1]) {
    bh_top = plinth_h + (sx * skew > 0 ? 9.0 : 6.4);
    hull() {
      translate([sx * 12.6, 0.8, plinth_h - 1.2])
        chamfer_box(3.2, standee_d - 4.4, 1.4, r = 0.9, ch_bot = 0.2, ch_top = 0.2);
      translate([sx * 11.4, 0.8, bh_top])
        chamfer_box(2.5, blade_t, 1.2, r = 0.7, ch_bot = 0.2, ch_top = 0.2);
    }
  }
}

// Shared subtractive cuts for standee plinth: exact 34 x 5.6 mm nameplate pocket + graveyard cracks.
module burton_standee_plinth_cuts(standee_w = 40.0, standee_d = 15.0, plinth_h = 9.5, skew = 1.2) {
  // Exact 0.4 mm Name Strip Sticker Pocket on Front of Plinth (34 x 5.6 mm)
  translate([0, -standee_d / 2 + 1.3, 5.2])
    rotate([78, 0, 0])
      linear_extrude(height = sticker_depth + 0.8, center = true)
        rrect2d(34.0, 5.6, r = 1.0);
  // Chiseled tombstone cracks on rear plinth wall (45-deg safe V-notches)
  for (cx = [-10.5 * sign(skew), 7.5 * sign(skew)]) {
    translate([cx, standee_d / 2 - 0.2, plinth_h * 0.65])
      rotate([0, cx > 0 ? 18 : -16, 45])
        cube([1.1, 1.1, 4.8], center = true);
  }
}
