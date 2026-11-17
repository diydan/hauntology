// Hauntology Tabletop Print Kit — Suspect Standee (Tim Burton Crooked Graveyard Tombstone)
// Colour: Ink (#0b0d10, matte black)
// Size: ~41 W x 15 D mm plinth, 70 mm tall, 3.4 mm headstone blade
// Sticker details: Front portrait sticker pocket (30 x 46 mm gothic arch) + plinth nameplate (34 x 5.6 mm)
// Print orientation: Flat on base (Z = 0), zero supports.

include <_common.scad>

standee_w      = 40.0;
standee_d      = 15.0;
standee_h      = 70.0;
blade_t        = 3.4;
plinth_h       = 9.5;

module gothic_arch_2d(w, h) {
  r_arch = w / 2;
  rect_h = max(1, h - r_arch);
  union() {
    translate([0, rect_h / 2])
      square([w, rect_h], center = true);
    translate([0, rect_h])
      hull() {
        circle(r = r_arch);
        translate([0, r_arch * 0.22]) circle(r = 1.6);
      }
  }
}

// Crooked Tim Burton Tombstone Outer Silhouette framing the exact 30x46 portrait arch inside
module burton_tombstone_outer_2d(w, h) {
  rect_h = max(1, h - w / 2);
  union() {
    // Tapered coffin-like headstone body flaring crookedly upward
    polygon(points = [
      [-w * 0.43, 0],
      [ w * 0.43, 0],
      [ w * 0.56, rect_h * 0.94],
      [ w * 0.36, rect_h * 1.15],
      [ 3.2,      h + 3.8],
      [-w * 0.28, rect_h * 1.05],
      [-w * 0.52, rect_h * 0.85]
    ]);
    // Ensure solid backing behind entire 30x46 sticker pocket + generous margin
    gothic_arch_2d(w, h);
    // Flanking crooked iron corner ear lugs (45-deg corbelled into blade so no floating bottom tangent!)
    hull() {
      translate([-w * 0.52, rect_h * 0.72]) circle(r = 3.0);
      translate([-w * 0.38, rect_h * 0.72 - 6.2]) circle(r = 1.5);
    }
    hull() {
      translate([ w * 0.55, rect_h * 0.80]) circle(r = 3.2);
      translate([ w * 0.40, rect_h * 0.80 - 6.6]) circle(r = 1.5);
    }
  }
}

module standee_blank() {
  difference() {
    union() {
      // 1. Shared Crooked Victorian Graveyard Plinth Base
      burton_standee_plinth_solid(standee_w, standee_d, plinth_h, blade_t, skew = 1.4);

      // 2. Crooked Gothic Tombstone Portrait Blade (Z = 6.0..71.5, 3.4 mm thick)
      translate([0, 0.8, 6.0])
        rotate([90, 0, 0])
          linear_extrude(height = blade_t, center = true)
            burton_tombstone_outer_2d(35.6, standee_h - 8.2);
    }

    // 3. Recessed 0.4 mm Portrait Sticker Pocket on Front of Blade (exact 30 x 46 mm arch preserved!)
    translate([0, 0.8 - blade_t / 2 + sticker_depth, 11.5])
      rotate([90, 0, 0])
        linear_extrude(height = sticker_depth + 0.5)
          gothic_arch_2d(30.0, 46.0);

    // 4. Recessed 0.4 mm Name Strip Sticker Pocket + Graveyard Cracks
    burton_standee_plinth_cuts(standee_w, standee_d, plinth_h, skew = 1.4);
  }
}

color(col_ink) standee_blank();
