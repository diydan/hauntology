// Hauntology Tabletop Print Kit — Suspect Standee (Gothic Arch Tabletop Pawn)
// Colour: Ink (#0b0d10, matte black)
// Size: 40 W x 15 D mm base, 70 mm tall, 3.2 mm blade thickness
// Sticker details: Front portrait sticker pocket (30 x 46 mm arch) + plinth nameplate strip (34 x 7 mm)
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

module standee_blank() {
  difference() {
    union() {
      // 1. Stepped Tabletop Plinth Base (40 x 15 x 9.5 mm) with angled front nameplate face
      hull() {
        chamfer_box(standee_w, standee_d, 3.2, r = 2.4, ch_bot = 0.6, ch_top = 0.2);
        translate([0, 0.8, 3.2])
          chamfer_box(standee_w - 2.0, standee_d - 2.4, plinth_h - 3.2, r = 2.0, ch_bot = 0.2, ch_top = 0.6);
      }

      // 2. Gothic-Arched Portrait Blade (z = 6.0..70.0, 3.4 mm thick)
      translate([0, 0.8, 6.0])
        rotate([90, 0, 0])
          linear_extrude(height = blade_t, center = true)
            gothic_arch_2d(35.6, standee_h - 8.2);

      // 3. Decorative side buttress fillets uniting plinth and blade
      for (sx = [-1, 1]) {
        hull() {
          translate([sx * 16.5, 0.8, plinth_h - 1.0])
            cube([2.4, standee_d - 4.0, 1.0], center = true);
          translate([sx * 16.5, 0.8, plinth_h + 7.5])
            cube([2.4, blade_t, 1.0], center = true);
        }
      }
    }

    // 4. Recessed 0.4 mm Portrait Sticker Pocket on Front of Blade (30 x 46 mm gothic arch)
    translate([0, 0.8 - blade_t / 2 + sticker_depth, 11.5])
      rotate([90, 0, 0])
        linear_extrude(height = sticker_depth + 0.5)
          gothic_arch_2d(30.0, 46.0);

    // 5. Recessed 0.4 mm Name Strip Sticker Pocket on Front of Plinth (34 x 6.5 mm)
    translate([0, -standee_d / 2 + 1.25, 5.2])
      rotate([78, 0, 0])
        linear_extrude(height = sticker_depth + 0.8, center = true)
          rrect2d(34.0, 5.6, r = 0.8);
  }
}

color(col_ink) standee_blank();
