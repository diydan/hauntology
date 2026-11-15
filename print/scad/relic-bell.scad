// Hauntology Tabletop Print Kit — Relic r6: Séance Hand-Bell
// Colour: Lantern (#e0a43a, amber/matte gold)
// Height: ~51 mm on 33 mm stepped token base
// Sticker details: Recessed inscription band pocket on front of bell waist (14 x 6 mm)
// Print orientation: Flat on pedestal base (Z = 0), zero supports.

include <_common.scad>

module relic_bell() {
  // 1. Stepped circular token pedestal base (z = 0..6.5)
  relic_pedestal_base(h = 6.5);

  // 2. Acoustic Arch Cradle & Visible Clapper Sphere (z = 6.5..14.0)
  translate([0, 0, 6.5]) {
    cylinder(h = 2.0, d1 = 26, d2 = 24);
    // Four gothic arch pillars supporting the bell sound bow at z = 12.5
    for (ang = [45, 135, 225, 315]) {
      rotate([0, 0, ang])
        hull() {
          translate([9.8, 0, 1.5]) cylinder(h = 1.0, d = 3.8);
          translate([10.8, 0, 6.2]) cylinder(h = 1.0, d = 3.4);
        }
    }
    // Central clapper post & sphere visible beneath the bell mouth (100% supported from base!)
    cylinder(h = 6.5, d1 = 4.6, d2 = 2.8);
    translate([0, 0, 5.8])
      sphere(d = 6.8);
    translate([0, 0, 6.5])
      cylinder(h = 5.0, d = 2.8);
  }

  // 3. Flared Acoustic Bell Body (z = 12.5..33.0)
  translate([0, 0, 12.5])
  difference() {
    union() {
      // Sound bow lip (flared rim)
      cylinder(h = 2.2, d1 = 28.0, d2 = 26.8);
      translate([0, 0, 2.2])
        cylinder(h = 1.4, d1 = 26.8, d2 = 23.6);
      // Lower waist
      translate([0, 0, 3.6])
        cylinder(h = 6.5, d1 = 23.6, d2 = 19.6);
      // Sound cordon rings
      translate([0, 0, 10.1])
        cylinder(h = 1.2, d1 = 20.6, d2 = 19.2);
      // Upper shoulder dome
      translate([0, 0, 11.3])
        cylinder(h = 6.0, d1 = 19.2, d2 = 14.0);
      translate([0, 0, 17.3])
        cylinder(h = 2.8, d1 = 14.0, d2 = 8.4);

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

  // 4. Turned Baluster Handle & Finial (z = 32.5..51.0)
  translate([0, 0, 32.5]) {
    cylinder(h = 2.2, d1 = 8.4, d2 = 6.2);
    translate([0, 0, 2.2]) cylinder(h = 3.8, d1 = 5.2, d2 = 7.8);
    translate([0, 0, 6.0]) cylinder(h = 4.5, d1 = 7.8, d2 = 5.0);
    translate([0, 0, 10.5]) cylinder(h = 2.0, d1 = 5.0, d2 = 7.2);
    translate([0, 0, 12.5]) cylinder(h = 2.2, d1 = 7.2, d2 = 3.6);
    translate([0, 0, 15.8]) sphere(d = 5.4);
  }
}

color(col_lantern) relic_bell();
