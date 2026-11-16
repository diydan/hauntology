include <_common.scad>;

// #1 Ghost in the Box — 2D Layered Hero Ghost Figure (Ectoplasm Mint #9fe8d0)
// Silhouette & pleated sheet drapery adapted into 2D relief from the landing-page Hero ghost.
// Prints flat on back (Z = 0, zero supports). Side wing edges (|X|=34, Z=0..4.0) glide in
// prop-01-chest-body U-tracks (68.0 mm width), while Y=7.5 follower pin & Y=-2.5 tie tab match chest mechanics.

$fa = 3;
$fs = 0.25;

module bevel_layer_2d(h, bev = 0.30, z0 = 0, steps = 2) {
  // Concave-preserving chamfered extrusion with clean Z overlap & no self-intersecting offsets.
  h_flat = max(0.15, h - bev);
  translate([0, 0, z0]) {
    linear_extrude(height = h_flat + 0.02)
      children();
    if (bev > 0 && steps > 0) {
      dz = bev / steps;
      for (i = [1 : steps]) {
        translate([0, 0, h_flat + (i - 1) * dz - 0.02])
          linear_extrude(height = dz + 0.04)
            offset(delta = -bev * i / steps)
              children();
      }
    }
  }
}

module hero_ghost_base_2d() {
  // Exact 68.0 mm outer track span (X = -34.0 .. +34.0), rounded shroud head + pinched neck +
  // sloping cloaked sleeves riding 20 mm along chest U-tracks (Y = 12..32), ragged asymmetric tails.
  polygon(points = [
    [  0.0, 68.0], [  3.8, 67.6], [  7.2, 66.0], [  9.8, 63.0],
    [ 11.2, 59.0], [ 11.4, 54.6], [ 11.0, 50.8], [ 13.6, 48.0],
    [ 18.8, 44.8], [ 24.4, 41.2], [ 29.8, 36.8], [ 34.0, 32.2],
    [ 34.0, 12.0],
    [ 31.4, 10.6], [ 28.4, 12.0], [ 24.8, 16.0], [ 21.8, 17.6],
    [ 19.2, 15.0], [ 16.4,  6.8], [ 14.0,  1.2], [ 12.5,  0.0],
    [ 10.8,  0.8], [  8.2,  4.4], [  5.4,  6.4],
    [  3.6,  5.0], [  0.0,  4.4], [ -3.6,  5.0], [ -5.4,  6.6],
    [ -8.0,  4.0], [-10.0,  1.2], [-11.4,  0.8], [-13.4,  2.8],
    [-16.4,  8.6], [-19.4, 15.4], [-22.2, 17.8], [-25.6, 15.6],
    [-29.0, 11.8], [-31.8, 10.6], [-34.0, 12.0],
    [-34.0, 32.2], [-29.8, 36.8], [-24.4, 41.2], [-18.8, 44.8],
    [-13.6, 48.0], [-11.0, 50.8], [-11.4, 54.6], [-11.2, 59.0],
    [ -9.8, 63.0], [ -7.2, 66.0], [ -3.8, 67.6]
  ]);
}

module hero_ghost_mantle_2d() {
  // Layer 2 (+1.0 mm proud drape): broad folded sheet mantle clear of |X| >= 30.2 track zone
  difference() {
    polygon(points = [
      [  0.0, 66.8], [  4.4, 65.8], [  8.4, 62.6], [ 10.2, 56.0],
      [ 10.2, 49.6], [ 16.0, 44.6], [ 23.0, 39.0], [ 29.2, 31.4],
      [ 29.0, 15.2], [ 25.0, 16.4], [ 22.0, 19.6], [ 18.4, 14.0],
      [ 14.8,  3.8], [ 12.5,  1.8], [  9.8,  3.8], [  6.2,  8.6],
      [  2.8,  9.8], [ -2.8,  9.8], [ -6.2,  8.4], [ -9.6,  3.8],
      [-11.4,  2.4], [-14.2,  5.6], [-18.4, 15.2], [-22.0, 19.6],
      [-25.4, 16.4], [-29.0, 15.2], [-29.2, 31.4], [-23.0, 39.0],
      [-16.0, 44.6], [-10.2, 49.6], [-10.2, 56.0], [ -8.4, 62.6],
      [ -4.4, 65.8]
    ]);
    // Deep diagonal sheet fold channels framing sleeves without touching face plateau
    for (sx = [-1, 1]) {
      hull() { translate([sx * 12.5, 41.5]) circle(d = 2.6); translate([sx * 18.6, 17.5]) circle(d = 2.8); }
    }
    // Central sunken cloth furrow strictly below Layer-3 cowl skirt (Y <= 36)
    hull() { translate([0, 35.0]) circle(d = 3.2); translate([0, 15.0]) circle(d = 3.2); }
  }
}

module hero_ghost_crown_folds_2d() {
  // Layer 3 (+2.0 mm proud foreground relief): shrouded face dome + flowing drapery ribs
  union() {
    // Hooded crown cowl flowing gently into front pleats
    polygon(points = [
      [  0.0, 65.4], [  4.4, 64.2], [  7.8, 60.8], [  9.2, 55.2],
      [  9.2, 47.0], [  7.6, 39.0], [  4.4, 39.0], [  0.0, 41.0],
      [ -4.4, 39.0], [ -7.6, 39.0], [ -9.2, 47.0], [ -9.2, 55.2],
      [ -7.8, 60.8], [ -4.4, 64.2]
    ]);
    // Right bold Hero chest/tail vertical fold ridge
    hull() { translate([ 6.6, 40.5]) circle(d = 4.2); translate([ 9.4, 22.5]) circle(d = 4.2); }
    hull() { translate([ 9.4, 22.5]) circle(d = 4.2); translate([12.4,  3.8]) circle(d = 2.6); }
    // Left draped vertical fold ridge
    hull() { translate([-6.6, 40.5]) circle(d = 4.0); translate([-9.2, 23.5]) circle(d = 3.8); }
    hull() { translate([-9.2, 23.5]) circle(d = 3.8); translate([-11.2, 4.4]) circle(d = 2.4); }
    // Flanking shoulder cape pleats
    hull() { translate([ 16.5, 40.5]) circle(d = 3.2); translate([ 23.6, 20.0]) circle(d = 3.0); }
    hull() { translate([-16.5, 40.5]) circle(d = 3.2); translate([-23.6, 20.0]) circle(d = 3.0); }
  }
}

module prop_01_ghost_figure() {
  color(col_ghost)
  difference() {
    union() {
      // 1a. Full 4.0 mm flat-back Hero Ghost silhouette (side wing rails ride smoothly in 4.8 mm U-tracks)
      bevel_layer_2d(h = 4.0, bev = 0.0, z0 = 0.0, steps = 0)
        hero_ghost_base_2d();

      // 1b. Secondary draped mantle relief (Z = 3.8..4.6, sculpted fold valleys clear of tracks)
      bevel_layer_2d(h = 0.8, bev = 0.0, z0 = 3.8, steps = 0)
        hero_ghost_mantle_2d();

      // 1c. Foreground hooded shroud cowl & bold drapery ribs (Z = 4.4..5.4)
      bevel_layer_2d(h = 1.0, bev = 0.0, z0 = 4.4, steps = 0)
        hero_ghost_crown_folds_2d();

      // 2. Forward Cam Follower Pin at (X = 0, Y_stl = +7.5) projecting along +Z_stl to Z = 16.6 (with 45-deg root fillet clear of fork!)
      translate([0, 7.5, 3.6]) {
        cylinder(h = 13.0, d = 3.8);
        translate([0, 0, 0.35]) cylinder(h = 1.4, d1 = 6.6, d2 = 3.8);
      }

      // 3. Lower rubber-band return tie tab (Y_stl = -5.5..+6.5): bridged continuously into body arch
      translate([0, 0.5, 0])
        chamfer_box(8.0, 12.0, 3.2, r = 0.8, ch_bot = 0.2, ch_top = 0.3);
    }

    // 4. Rubber-band tie hole in bottom tab
    translate([0, -2.5, -0.5])
      cylinder(h = 5.0, d = 2.6);

    // 5. Recessed 0.40 mm Hero Ghost Eyes & Mouth pockets on Layer-3 face plateau (Z = 5.40 mm)
    for (sx = [-1, 1]) {
      translate([sx * 4.4, 57.2, 5.40 - sticker_depth])
        scale([1, 1.58, 1])
          cylinder(h = sticker_depth + 0.6, d = 4.8);
    }
    translate([0, 49.0, 5.40 - sticker_depth])
      scale([1, 1.72, 1])
        cylinder(h = sticker_depth + 0.6, d = 4.4);
  }
}

prop_01_ghost_figure();
