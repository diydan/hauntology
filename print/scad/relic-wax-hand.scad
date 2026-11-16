// Hauntology Tabletop Print Kit — Relic r2: Spirit Medium's Wax Hand
// Colour: Bone (#e9e4d8)
// Size: ~28.5 W x 18.0 D x 51.5 H mm (Ø14.6 mm foot with Ø6.1 mm centre socket)
// Sticker details: Recessed circular palm eye medallion pocket (11.2 mm dia)
// Print orientation: Flat on pedestal base (Z = 0), zero supports (all upward slopes <= 42 deg).
// No modelled wax drips: drip real candle wax after printing if desired.

include <_common.scad>

// Anatomical oval knuckle node (wider mediolaterally than dorsovolarly)
module hand_node(p, rx, ry, rz, rot_z = 0, rot_x = 0) {
  translate(p)
    rotate([rot_x, 0, rot_z])
      scale([rx, ry, rz])
        sphere(r = 1.0);
}

// Tapered anatomical phalanx segment between two elliptical joint cross-sections
module phalanx_seg(p0, rx0, ry0, p1, rx1, ry1, rz_join = 0.72, rot_z = 0) {
  hull() {
    hand_node(p0, rx0, ry0, max(rx0, ry0) * rz_join, rot_z);
    hand_node(p1, rx1, ry1, max(rx1, ry1) * rz_join, rot_z);
  }
}

// Articulated anatomical finger (metacarpal knuckle -> proximal -> middle -> distal phalanx + fingernail)
module anatomical_finger(pts, radii, rot_z = 0) {
  // pts: [p_mcp, p_pip, p_dip, p_tip]
  // radii: [[rx0,ry0], [rx1,ry1], [rx2,ry2], [rx3,ry3]]
  // Subtle dorsal knuckle ridges & fuller volar finger pads
  for (i = [0 : 2]) {
    p_a = pts[i];
    p_b = pts[i + 1];
    p_mid = [(p_a[0] + p_b[0]) * 0.5, (p_a[1] + p_b[1]) * 0.5, (p_a[2] + p_b[2]) * 0.5];
    // Slight waisted pinch before next joint, slight bulge mid-phalanx
    rx_m = (radii[i][0] + radii[i + 1][0]) * 0.49;
    ry_m = (radii[i][1] + radii[i + 1][1]) * 0.48;
    hull() {
      hand_node(p_a, radii[i][0], radii[i][1], radii[i][0] * 0.75, rot_z);
      hand_node(p_mid, rx_m * 0.96, ry_m * 0.94, rx_m * 0.72, rot_z);
    }
    hull() {
      hand_node(p_mid, rx_m * 0.96, ry_m * 0.94, rx_m * 0.72, rot_z);
      hand_node(p_b, radii[i + 1][0], radii[i + 1][1], radii[i + 1][0] * 0.75, rot_z);
    }
  }
  // Distal fingertip pad tapering smoothly + subtle dorsal fingernail plate (+Y side)
  p_d = pts[2];
  p_t = pts[3];
  hull() {
    hand_node(p_d, radii[2][0] * 0.98, radii[2][1] * 0.95, radii[2][0] * 0.7, rot_z);
    hand_node(p_t, radii[3][0], radii[3][1], radii[3][0] * 0.95, rot_z);
  }
  // Raised fingernail cuticle rim on dorsal (+Y) side of fingertip
  nail_pos = [
    p_d[0] * 0.32 + p_t[0] * 0.68,
    p_d[1] * 0.32 + p_t[1] * 0.68 + radii[3][1] * 0.72,
    p_d[2] * 0.32 + p_t[2] * 0.68
  ];
  hull() {
    hand_node(nail_pos, radii[3][0] * 0.68, 0.35, radii[3][0] * 0.85, rot_z, -10);
    hand_node([p_t[0], p_t[1] + radii[3][1] * 0.55, p_t[2] - 0.25], radii[3][0] * 0.55, 0.32, radii[3][0] * 0.5, rot_z, -10);
  }
}

module relic_wax_hand() {
  // 1. Flat 14.6 mm foot with 6.1 mm centre socket (z = 0..4.5)
  relic_pedestal_base(h = 4.5, top_d = 17.6);

  // 2. Sculpted anatomical wrist with flexor tendon ridges & radial/ulnar styloid taper (z = 4.5..14.0)
  translate([0, 0, 4.5]) {
    hull() {
      cylinder(h = 0.6, d = 17.4);
      // Mid-wrist narrow waist (flattened anteroposteriorly like a real wrist)
      translate([0, 0.2, 5.5])
        scale([7.6, 5.2, 1.0])
          cylinder(h = 0.6, r = 1.0);
    }
    // Wrist carpal base flaring smoothly into radial/ulnar styloid bones & palm heel
    hull() {
      translate([0, 0.2, 5.5])
        scale([7.6, 5.2, 1.0])
          cylinder(h = 0.8, r = 1.0);
      translate([-5.6,  0.3, 9.5]) sphere(r = 3.1); // radial styloid flare
      translate([ 5.8,  0.4, 9.2]) sphere(r = 2.9); // ulnar styloid flare
      translate([-1.6, -3.5, 9.6]) sphere(r = 2.6); // volar scaphoid heel
      translate([ 2.6, -3.3, 9.6]) sphere(r = 2.5); // volar pisiform heel
      translate([ 0.0,  2.8, 9.6]) scale([5.6, 2.2, 1.2]) sphere(r = 1.0);
    }
    // Twin subtle palmar flexor tendon chords rising smoothly from inside wrist heel (-Y face)
    for (tx = [-1.2, 1.0]) {
      hull() {
        translate([tx * 0.85, -3.0, 1.0]) sphere(r = 0.60);
        translate([tx * 0.95, -3.65, 3.8]) sphere(r = 0.68);
        translate([tx, -2.6, 7.6]) sphere(r = 0.60);
      }
    }
  }

  // 3. Sculpted Anatomical Palm & Five Articulated Fingers (Z = 14.0..51.8)
  translate([0, 0, 14.0])
  difference() {
    union() {
      // Main metacarpal palm frame: slender sculpted dorsal arch (+Y) + arched MCP knuckle ridge
      hull() {
        // Carpal heel
        translate([-4.2,  0.2, 0.2]) scale([3.6, 4.2, 1.6]) sphere(r = 1.0);
        translate([ 4.4,  0.2, 0.2]) scale([3.4, 4.0, 1.6]) sphere(r = 1.0);
        // Mid-metacarpal palm width (natural palm flare)
        translate([-6.4,  0.2, 7.6]) scale([3.0, 3.6, 3.2]) sphere(r = 1.0);
        translate([ 6.5,  0.2, 7.0]) scale([2.8, 3.4, 3.0]) sphere(r = 1.0);
        translate([ 0.0,  2.2, 7.2]) scale([5.8, 2.4, 3.6]) sphere(r = 1.0);
        // Arched MCP knuckle heads (index highest->middle peak->ring->pinky drop)
        hand_node([-6.5, 0.2, 13.8], 2.55, 2.45, 2.2);
        hand_node([-2.1, 0.5, 15.1], 2.60, 2.50, 2.2);
        hand_node([ 2.4, 0.4, 14.2], 2.45, 2.40, 2.1);
        hand_node([ 6.6, 0.0, 12.0], 2.25, 2.20, 2.0);
      }

      // Prominent Thenar Eminence (thumb muscle mound, -X/-Y front side)
      hull() {
        translate([-3.4, -2.5,  0.8]) scale([2.8, 2.8, 1.8]) sphere(r = 1.0);
        translate([-6.0, -2.7,  5.0]) scale([3.3, 3.2, 3.0]) sphere(r = 1.0);
        translate([-7.2, -2.2,  8.6]) scale([2.9, 2.7, 2.4]) sphere(r = 1.0);
      }

      // Sculpted Thumb Purlicue Web (concave saddle bridging thumb base & index MCP)
      hull() {
        translate([-6.4, -0.4,  8.4]) sphere(r = 2.0);
        translate([-6.6,  0.1, 12.2]) sphere(r = 2.1);
        translate([-9.0, -2.0,  8.8]) sphere(r = 2.2);
      }

      // Hypothenar Eminence (outer ulnar palm cushion, +X/-Y front side)
      hull() {
        translate([3.8, -2.3,  0.8]) scale([2.4, 2.6, 1.6]) sphere(r = 1.0);
        translate([6.0, -2.0,  5.8]) scale([2.5, 2.8, 2.8]) sphere(r = 1.0);
        translate([6.8, -1.0, 10.6]) scale([2.3, 2.4, 2.2]) sphere(r = 1.0);
      }

      // Dorsal Extensor Tendons on back of hand (+Y): 4 continuous arched wrist-to-knuckle cords
      for (cord = [
        [[-1.2, 2.5, 1.2], 0.55, [-3.9, 3.65, 7.6], 0.68, [-6.4, 2.4, 13.5], 0.78],
        [[-0.3, 2.6, 1.2], 0.55, [-1.2, 3.90, 8.0], 0.72, [-2.1, 2.8, 14.9], 0.82],
        [[ 0.6, 2.6, 1.2], 0.55, [ 1.5, 3.85, 7.8], 0.68, [ 2.4, 2.7, 14.0], 0.78],
        [[ 1.5, 2.4, 1.2], 0.55, [ 4.1, 3.45, 6.8], 0.65, [ 6.5, 2.1, 11.8], 0.75]
      ]) {
        hull() {
          translate(cord[0]) sphere(r = cord[1]);
          translate(cord[2]) sphere(r = cord[3]);
        }
        hull() {
          translate(cord[2]) sphere(r = cord[3]);
          translate(cord[4]) sphere(r = cord[5]);
        }
      }

      // Articulated Opposable Thumb (left radial side, <= 38 deg overhang)
      anatomical_finger(
        [[-7.8, -2.3,  7.4],
         [-10.2, -2.9, 12.4],
         [-12.2, -2.9, 17.0],
         [-12.0, -2.1, 21.4]],
        [[2.9, 2.7], [2.45, 2.25], [2.2, 1.95], [1.75, 1.55]],
        rot_z = -28
      );

      // Index Finger (slender, gently splayed and poised)
      anatomical_finger(
        [[-6.5,  0.2, 13.8],
         [-7.6, -0.5, 22.0],
         [-8.1, -1.8, 28.0],
         [-8.2, -3.2, 32.4]],
        [[2.45, 2.25], [2.15, 1.95], [1.85, 1.65], [1.45, 1.28]],
        rot_z = -6
      );

      // Middle Finger (tallest central finger, slight natural forward poise)
      anatomical_finger(
        [[-2.1,  0.5, 15.1],
         [-2.2, -0.1, 24.4],
         [-2.1, -1.4, 31.0],
         [-1.9, -2.8, 36.0]],
        [[2.55, 2.35], [2.25, 2.02], [1.92, 1.72], [1.50, 1.32]],
        rot_z = 0
      );

      // Ring Finger (graceful medium inward curl)
      anatomical_finger(
        [[ 2.4,  0.4, 14.2],
         [ 2.9, -0.4, 22.6],
         [ 3.2, -1.9, 28.4],
         [ 3.3, -3.6, 32.4]],
        [[2.38, 2.20], [2.10, 1.88], [1.80, 1.60], [1.40, 1.25]],
        rot_z = 5
      );

      // Little Finger / Pinky (petite, lightly abducted & curled)
      anatomical_finger(
        [[ 6.6,  0.0, 12.0],
         [ 8.1, -0.8, 18.4],
         [ 8.7, -2.3, 23.0],
         [ 8.9, -3.8, 26.4]],
        [[2.12, 1.96], [1.85, 1.68], [1.58, 1.42], [1.22, 1.10]],
        rot_z = 11
      );

      // Subtle sculpted occult palm medallion bezel nestled in the palmar cup (-Y)
      translate([0.0, -2.85, 8.7])
        rotate([86, 0, 0])
          cylinder(h = 1.45, d1 = 13.2, d2 = 12.4);
    }

    // Recessed 0.4 mm circular palm medallion sticker pocket (11.2 mm dia for 10.6 mm palm sticker)
    translate([0.0, -2.85, 8.7])
      rotate([86, 0, 0])
        translate([0, 0, 1.45 - sticker_depth])
          cylinder(h = sticker_depth + 0.8, d = 11.2);
  }
}

color(col_bone) relic_wax_hand();
