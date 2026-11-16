// Hauntology Tabletop Print Kit — Prop #12: Rattle Prop (Option C: Tim Burton Stitched Rag Doll)
// Colour: Bone (#e9e4d8, warm white)
// Size: ~45 W x 65 H x 5.8 D mm (weight < 30 g)
// Sticker details: Recessed 16.2 mm circular face sticker pocket on head
// Print orientation: Flat on back (Z = 0), zero supports (1 connected component).

include <_common.scad>

module prop_12_doll() {
  head_c = [1.5, 47.8];

  difference() {
    union() {
      // 1. Slender elongated leaning neck uniting bodice and crooked head (flush Z = 4.8)
      hull() {
        translate([-0.4, 32.0, 0]) cylinder(h = 4.8, d = 6.8);
        translate([head_c[0], head_c[1] - 7.5, 0]) cylinder(h = 4.8, d = 6.2);
      }

      // 2. Narrow Corset Bodice & Asymmetric Tattered Skirt (Y = 7..34, Z = 0..4.8)
      hull() {
        translate([-1.0, 32.0, 0]) cylinder(h = 4.8, d = 10.6);
        translate([-0.6, 25.0, 0]) cylinder(h = 5.0, d = 8.4);
      }
      hull() {
        translate([-0.6, 25.5, 0]) cylinder(h = 4.8, d = 8.4);
        translate([-13.8, 10.2, 0]) cylinder(h = 4.6, d = 4.2);
        translate([ 12.6, 11.4, 0]) cylinder(h = 4.6, d = 4.2);
      }
      // Jagged uneven hanging cloth hem tatters along skirt bottom (Y = 5..12)
      for (t = [
        [-11.8, 10.2, -13.0, 6.2],
        [ -4.2, 11.0,  -4.8, 7.0],
        [  3.5, 11.2,   4.2, 6.4],
        [ 10.5, 11.6,  11.8, 7.6]
      ]) {
        hull() {
          translate([t[0], t[1], 0]) cylinder(h = 4.2, d = 4.4);
          translate([t[2], t[3], 0]) cylinder(h = 3.8, d = 1.6);
        }
      }

      // Raised sewn patchwork apron square on right hip (Z = 4.6..5.4)
      translate([3.2, 16.5, 4.4])
        rotate([0, 0, -12])
          chamfer_box(7.8, 7.2, 1.0, r = 0.8, ch_bot = 0.1, ch_top = 0.25);

      // Raised round stitched rag-button over chest heart
      translate([-2.8, 28.0, 4.6])
        cylinder(h = 0.8, d1 = 3.6, d2 = 3.2);

      // 3. Spindly Articulated Rag Arms with Bent Elbows & Curled Fingertips
      // Left drooping arm
      for (seg = [
        [[-5.2, 31.5], [-13.0, 27.5], 4.2],
        [[-13.0, 27.5], [-17.2, 18.2], 3.4],
        [[-17.2, 18.2], [-19.4, 15.0], 2.0]
      ]) {
        hull() {
          translate([seg[0][0], seg[0][1], 0]) cylinder(h = 4.0, d = seg[2]);
          translate([seg[1][0], seg[1][1], 0]) cylinder(h = 4.0, d = max(1.8, seg[2] - 0.6));
        }
      }
      // Right crooked raised-elbow arm
      for (seg = [
        [[4.8, 31.8], [13.2, 30.2], 4.2],
        [[13.2, 30.2], [17.8, 21.8], 3.4],
        [[17.8, 21.8], [19.2, 18.0], 2.0]
      ]) {
        hull() {
          translate([seg[0][0], seg[0][1], 0]) cylinder(h = 4.0, d = seg[2]);
          translate([seg[1][0], seg[1][1], 0]) cylinder(h = 4.0, d = max(1.8, seg[2] - 0.6));
        }
      }

      // 4. Mismatched Gangly Rag Legs & Pointed Curling-Toe Burton Boots (Y = 0..12)
      // Left leg (longer, drooping toe outward)
      hull() {
        translate([-5.2, 12.0, 0]) cylinder(h = 3.8, d = 3.8);
        translate([-6.2,  2.2, 0]) cylinder(h = 3.8, d = 3.4);
      }
      hull() {
        translate([-6.2,  2.2, 0]) cylinder(h = 4.0, d = 3.8);
        translate([-10.5, 0.8, 0]) cylinder(h = 3.8, d = 1.8);
      }
      // Right leg (slightly bowed, pointed boot curling up)
      hull() {
        translate([5.2, 12.2, 0]) cylinder(h = 3.8, d = 3.8);
        translate([6.4,  3.2, 0]) cylinder(h = 3.8, d = 3.4);
      }
      hull() {
        translate([6.4,  3.2, 0]) cylinder(h = 4.0, d = 3.8);
        translate([11.0, 4.4, 0]) cylinder(h = 3.8, d = 1.8);
      }

      // 5. Tilted Stitch-Head with Uneven Ragged Yarn Hair Tufts (Y ~ 44.5)
      translate([head_c[0], head_c[1], 0])
        cylinder(h = 5.8, d1 = 22.0, d2 = 20.6);

      // Spiky uneven cloth-doll hair locks framing the crooked skull
      for (tuft = [
        [-8.0, head_c[1] + 3.5, -14.8, head_c[1] + 7.0],
        [-9.2, head_c[1] - 2.0, -13.8, head_c[1] - 3.5],
        [ 9.4, head_c[1] + 4.0,  15.6, head_c[1] + 8.5],
        [ 9.8, head_c[1] - 1.5,  14.2, head_c[1] - 4.0]
      ]) {
        hull() {
          translate([tuft[0], tuft[1], 0]) cylinder(h = 4.4, d = 4.2);
          translate([tuft[2], tuft[3], 0]) cylinder(h = 3.8, d = 1.8);
        }
      }

      // 6. Crown Wrought-Button Suspension Loop (Y = 58..61)
      translate([head_c[0] + 0.6, head_c[1] + 13.0, 0])
        cylinder(h = 4.2, d = 8.4);
    }

    // 7. Recessed 0.4 mm Circular Face Sticker Pocket (16.2 mm dia, preserved 1:1)
    translate([head_c[0], head_c[1], 5.8 - sticker_depth])
      cylinder(h = sticker_depth + 0.6, d = 16.2);

    // 8. Signature Sally-style Stitched Seam V-Grooves across neck (clear of head!), bodice & hip patch
    translate([0.2, 35.0, 4.8]) rotate([0, 0, -10]) burton_stitch_groove_z(len = 4.2, teeth = 3, cut_w = 0.75, cut_d = 0.65);
    translate([-0.8, 21.5, 4.8]) rotate([0, 0, 8])  burton_stitch_groove_z(len = 8.4, teeth = 4, cut_w = 0.85, cut_d = 0.70);
    translate([3.2, 16.5, 5.4]) rotate([0, 0, 78]) burton_stitch_groove_z(len = 5.6, teeth = 3, cut_w = 0.70, cut_d = 0.55);

    // Tiny twin button thread dimples on chest button
    for (dx = [-0.65, 0.65])
      translate([-2.8 + dx, 28.0, 5.05]) cylinder(h = 0.6, d = 0.8);

    // 9. Crown Thread Tie Hole (2.4 mm ID)
    translate([head_c[0] + 0.6, head_c[1] + 13.7, -0.5])
      cylinder(h = 6.0, d = 2.4);
  }
}

color(col_bone) prop_12_doll();
