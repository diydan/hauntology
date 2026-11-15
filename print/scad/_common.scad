// Hauntology Tabletop Print Kit — Shared Parametric Header (_common.scad)
// Ground rules (3D_BRIEF.md):
//   - Bed limit: 180 x 180 mm
//   - Layer height: 0.2 mm, nozzle: 0.4 mm, walls >= 1.6 mm
//   - Moving clearance: 0.3 mm; press/snap clearance: 0.15 mm
//   - Sticker pockets: 0.4 mm recessed with raised chamfered frame
//   - SG90 servo: 23 x 12.2 x 29 mm body, 32.5 mm flange, two M2 screws (27.5 mm c-c)
//   - ESP32 dev board: 55 x 28 mm footprint, USB cable exit

$fa = 4;
$fs = 0.35;

// --- Standard tolerances and print parameters ---
layer_h          = 0.2;
nozzle_d         = 0.4;
min_wall         = 1.6;
clear_move       = 0.3;
clear_fit        = 0.15;
sticker_depth    = 0.4;

// --- Relic Token interface dimensions ---
token_side_mm    = 40.0;
token_height_mm  = 6.0;
token_qr_mm      = 36.4; // 36 x 36 mm sticker + 0.2 mm margin per side
relic_base_d     = 33.0;
relic_Boss_d     = 23.4; // Underside boss on relic miniature
token_socket_d   = 24.0; // Matching 0.3 mm clearance socket on token top
token_socket_h   = 1.6;

// --- SG90 Micro Servo dimensions (including fit clearance) ---
sg90_body_w      = 23.2;
sg90_body_d      = 12.5;
sg90_body_h      = 22.5;
sg90_flange_w    = 32.8;
sg90_flange_h    = 2.6;
sg90_flange_z    = 16.0; // Distance from bottom of servo to underside of ears
sg90_hole_span   = 27.5;
sg90_m2_pilot_d  = 1.7;
sg90_shaft_off_x = -5.5; // Output shaft offset from body centre
sg90_boss_d      = 12.2;
sg90_cable_w     = 4.6;
sg90_cable_h     = 6.0;

// --- ESP32 DevKitC dimensions ---
esp32_w          = 55.6;
esp32_d          = 28.6;
esp32_h          = 14.0;
esp32_usb_w      = 12.0;
esp32_usb_h      = 7.0;

// --- Colour palette (from design/tokens.json) for preview ---
col_ink          = [11/255, 13/255, 16/255];
col_leather      = [107/255, 77/255, 51/255];
col_bone         = [233/255, 228/255, 216/255];
col_lantern      = [224/255, 164/255, 58/255];
col_ghost        = [159/255, 232/255, 208/255];
col_alarm        = [212/255, 96/255, 74/255];
col_silver       = [201/255, 201/255, 212/255];

// ============================================================================
// Geometric & Ornamental Primitives (Print-safe <= 45 deg overhangs)
// ============================================================================

// Rounded rectangle in 2D centered at origin
module rrect2d(w, d, r=2.0) {
  rc = min(r, min(w, d) / 2 - 0.05);
  offset(r = rc) square([w - 2*rc, d - 2*rc], center = true);
}

// Chamfered & rounded tabletop box sitting on z = 0 (prevents elephant's foot)
module chamfer_box(w, d, h, r=2.5, ch_bot=0.8, ch_top=0.8) {
  hull() {
    translate([0, 0, ch_bot])
      linear_extrude(height = max(0.2, h - ch_bot - ch_top))
        rrect2d(w, d, r);
    if (ch_bot > 0)
      linear_extrude(height = 0.05)
        rrect2d(w - 2*ch_bot, d - 2*ch_bot, max(0.4, r - ch_bot));
    if (ch_top > 0)
      translate([0, 0, h - 0.05])
        linear_extrude(height = 0.05)
          rrect2d(w - 2*ch_top, d - 2*ch_top, max(0.4, r - ch_top));
  }
}

// Recessed 0.4 mm rectangular sticker pocket (subtract from top/front face)
module sticker_pocket_rect(w, d, r=1.2, depth=sticker_depth) {
  translate([0, 0, -depth])
    linear_extrude(height = depth + 0.5)
      rrect2d(w, d, r);
}

// Recessed 0.4 mm circular/oval sticker pocket
module sticker_pocket_oval(rx, ry, depth=sticker_depth) {
  translate([0, 0, -depth])
    linear_extrude(height = depth + 0.5)
      scale([rx, ry]) circle(r = 1);
}

// Stepped circular tabletop miniature pedestal base that locks into a Relic Token
// Print-safe: underside uses a chamfered annular ring sitting flat on z = 0
// with an outer 33 mm skirt and inner 23.4 mm ring that mates with the Token top groove.
module relic_pedestal_base(h = 6.5) {
  difference() {
    union() {
      // Lower plinth ring with 45-deg elephant-foot bevel
      cylinder(h = 1.2, d1 = relic_base_d - 1.2, d2 = relic_base_d);
      translate([0, 0, 1.2])
        cylinder(h = 1.8, d = relic_base_d);
      // 45-degree ogee step taper
      translate([0, 0, 3.0])
        cylinder(h = 1.6, d1 = relic_base_d, d2 = relic_base_d - 3.2);
      // Upper collar bead
      translate([0, 0, 4.6])
        cylinder(h = 1.0, d = relic_base_d - 2.4);
      translate([0, 0, 5.6])
        cylinder(h = max(0.6, h - 5.6), d1 = relic_base_d - 2.4, d2 = relic_base_d - 4.0);
    }
    // Underside annular alignment groove (leaves a flat z=0 outer rim AND inner plug so zero supports are needed!)
    translate([0, 0, -0.05])
      difference() {
        cylinder(h = 1.25, d = relic_base_d - 4.4);
        cylinder(h = 1.30, d = relic_Boss_d);
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
