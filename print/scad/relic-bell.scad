// Hauntology Tabletop Print Kit — Relic r6: Séance Hand-Bell
// Colour: Lantern (#e0a43a, amber/matte gold)
// Height: ~51 mm on 33 mm stepped token base
// Sticker details: Recessed inscription band pocket on front of bell waist (14 x 6 mm)
// Print orientation: Flat on pedestal base (Z = 0). No supports: every downward-facing slope is <= 45 deg from vertical.

include <_common.scad>

module relic_bell() {
  // 1. Compact centre connector plug (z = 0..4.5, no wide circular base plate)
  relic_pedestal_base(h = 4.5, top_d = 18.8);

  // 2. Acoustic Arch Cradle & Visible Clapper Sphere (z = 4.5..12.0)
  translate([0, 0, 4.5]) {
    cylinder(h = 2.2, d1 = 18.8, d2 = 21.6);
    // Four gothic arch pillars supporting the bell sound bow at z = 10.5 (angled <= 45 deg)
    for (ang = [45, 135, 225, 315]) {
      rotate([0, 0, ang])
        hull() {
          translate([8.0, 0, 1.6]) cylinder(h = 1.0, d = 3.8);
          translate([10.8, 0, 6.2]) cylinder(h = 1.0, d = 3.4);
        }
    }
    // Central clapper post & sphere visible beneath the bell mouth (100% supported from centre connector!)
    cylinder(h = 6.5, d1 = 4.6, d2 = 2.8);
    translate([0, 0, 5.8])
      sphere(d = 6.8);
    translate([0, 0, 6.5])
      cylinder(h = 5.0, d = 2.8);
  }

  // 3. Flared Acoustic Bell Body (z = 10.5..31.0)
  translate([0, 0, 10.5])
  difference() {
    union() {
      // One turned outer profile (rotate_extrude): no stacked touching cylinders and no flat ledges. The sound bow flares
      // out from the mouth at 43 deg (it used to start as a flat 3.2 mm underside ledge), the waist and shoulder taper
      // inward as they rise, and the cordon ring steps out at 45 deg, so nothing faces down at more than 45 deg.
      rotate_extrude()
        polygon([
          [0, 0], [11.6, 0], [14.0, 2.6],     // mouth rim, flaring out to the sound bow
          [13.4, 3.4],                        // rounded lip
          [11.8, 4.6],                        // lower waist
          [9.8, 10.1],                        // waist, tapering in
          [10.25, 10.6], [9.6, 11.3],         // sound cordon ring (rises out at 42 deg, then in)
          [7.0, 17.3],                        // upper shoulder dome
          [4.2, 20.1],                        // neck, meeting the handle
          [0, 20.1]
        ]);

      // Front raised cartouche plaque for inscription sticker
      translate([0, -10.2, 7.2])
        rotate([80, 0, 0])
          chamfer_box(15.6, 7.6, 1.4, r = 1.4, ch_bot = 0.4, ch_top = 0.3);
    }

    // Conical interior acoustic hollow (45-deg self-supporting roof, leaving central clapper stem solid)
    translate([0, 0, -0.1])
      difference() {
        cylinder(h = 9.5, d1 = 21.6, d2 = 3.6);
        cylinder(h = 10.0, d = 4.2);
      }

    // Front 0.4 mm recessed sticker pocket on cartouche (14 x 6 mm)
    translate([0, -11.05, 7.35])
      rotate([80, 0, 0])
        linear_extrude(height = sticker_depth + 0.6)
          rrect2d(14.0, 6.0, r = 0.8);
  }

  // 4. Turned Baluster Handle & Finial (z = 30.5..49.0)
  translate([0, 0, 30.5]) {
    cylinder(h = 2.2, d1 = 8.4, d2 = 6.2);
    translate([0, 0, 2.2]) cylinder(h = 3.8, d1 = 5.2, d2 = 7.8);
    translate([0, 0, 6.0]) cylinder(h = 4.5, d1 = 7.8, d2 = 5.0);
    translate([0, 0, 10.5]) cylinder(h = 2.0, d1 = 5.0, d2 = 7.2);
    translate([0, 0, 12.5]) cylinder(h = 2.2, d1 = 7.2, d2 = 3.6);
    translate([0, 0, 15.8]) sphere(d = 5.4);
  }
}

color(col_lantern) relic_bell();
