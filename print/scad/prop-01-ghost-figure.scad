// Hauntology Tabletop Print Kit — Prop #1: Ghost in the Box (Ghost Figure on Slider Stick)
// Colour: Ghost glow (#9fe8d0, glow-in-the-dark green)
// Size: ~70 mm tall ghost silhouette + 52 mm integrated slider stick (total 122 mm H x 72 mm W)
// Sticker details: Recessed black eye ovals (10 x 16 mm) and mouth oval (14 x 20 mm)
// Print orientation: Flat on back (Z = 0), zero supports.

include <_common.scad>

module ghost_silhouette_2d() {
  union() {
    // Upper domed head & torso (radius 34 mm)
    translate([0, 34.0])
      circle(r = 34.0);
    translate([0, 19.0])
      square([68.0, 30.0], center = true);
    // Five billowing wavy hem lobes along bottom edge (Y = 0..8)
    for (lx = [-27.2, -13.6, 0, 13.6, 27.2]) {
      translate([lx, 4.0])
        circle(r = 6.8);
    }
  }
}

module prop_01_ghost_figure() {
  difference() {
    union() {
      // 1. Sculpted sheet-ghost body (4.2 mm thick, Y = 0..68)
      linear_extrude(height = 4.2)
        ghost_silhouette_2d();

      // Raised drapery contour ribs on front
      for (lx = [-20.4, -6.8, 6.8, 20.4]) {
        hull() {
          translate([lx, 6.0, 4.0]) sphere(r = 1.2);
          translate([lx * 0.7, 32.0, 4.0]) sphere(r = 0.8);
        }
      }

      // 2. Integrated 6.0 x 3.2 mm vertical guide stick extending 52 mm below the ghost hem
      translate([0, -24.0, 1.6])
        chamfer_box(6.0, 52.0, 3.2, r = 0.8, ch_bot = 0.3, ch_top = 0.3);

      // 3. Cam follower pin projecting from stick to engage the servo lever fork
      translate([0, -28.0, 3.2]) {
        cylinder(h = 4.8, d1 = 4.2, d2 = 3.2);
      }

      // 4. Rubber-band return notch tab at bottom of stick
      translate([0, -47.0, 1.6])
        chamfer_box(10.0, 4.0, 3.2, r = 0.8, ch_bot = 0.3, ch_top = 0.3);
    }

    // 5. Recessed 0.4 mm Sticker Pockets for Left Eye, Right Eye, and Mouth
    // Left eye (10 x 16 mm oval)
    translate([-13.0, 42.0, 4.2 - sticker_depth])
      linear_extrude(height = sticker_depth + 1.0)
        scale([5.0, 8.0]) circle(r = 1.0);

    // Right eye (10 x 16 mm oval)
    translate([13.0, 42.0, 4.2 - sticker_depth])
      linear_extrude(height = sticker_depth + 1.0)
        scale([5.0, 8.0]) circle(r = 1.0);

    // Mouth (14 x 20 mm oval)
    translate([0, 22.0, 4.2 - sticker_depth])
      linear_extrude(height = sticker_depth + 1.0)
        scale([7.0, 10.0]) circle(r = 1.0);

    // Flatten Z < 0 from drapery spheres
    translate([0, 0, -5.0])
      cube([200, 200, 10.0], center = true);
  }
}

color(col_ghost) prop_01_ghost_figure();
