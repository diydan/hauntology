// Hauntology Tabletop Print Kit — Prop #20: Cut Wires Board (5 Resistor-Cavity Plug Heads & Caps)
// Colour: One per wire colour (red, blue, green, yellow, violet) or Bone with colour-disc stickers
// Size: 116 W x 44 D x 22 H mm (5 plug barrels + 5 snap-in resistor caps)
// Mechanism: Each plug head has a 5.0 x 14.5 mm internal cavity for a 1/4W axial resistor (1k, 2.2k, 4.7k, 10k, 22k)
// Print orientation: Flat on grip flange (Z = 0), zero supports.

include <_common.scad>

module single_plug_barrel() {
  difference() {
    union() {
      // 1. Knurled ergonomic grip flange at Z = 0..7.0 (18 mm OD)
      cylinder(h = 7.0, d1 = 17.6, d2 = 18.0);
      for (ang = [0 : 30 : 330]) {
        rotate([0, 0, ang])
          translate([8.8, 0, 3.5])
            cylinder(h = 6.2, d = 1.8, center = true);
      }
      // 2. Tapered shoulder (Z = 7.0..11.0)
      translate([0, 0, 7.0])
        cylinder(h = 4.0, d1 = 16.0, d2 = 9.0);
      // 3. Nose plug stem (6.0 mm OD for 6.4 mm terminal socket bore = 0.2 mm radial clearance, Z = 11.0..22.0)
      translate([0, 0, 11.0])
        cylinder(h = 11.0, d1 = 6.0, d2 = 5.6);
    }

    // 4. Internal Axial Resistor Cavity (5.0 mm dia x 14.5 mm deep from Z = 0..14.5, fits 1/4W resistor body)
    translate([0, 0, -0.5])
      cylinder(h = 15.0, d = 5.0);
    // Cap counterbore at Z = 0..2.4 (12.2 mm ID)
    translate([0, 0, -0.2])
      cylinder(h = 2.6, d = 12.2);
    // Contact lead / pin exit bore through nose tip (2.4 mm ID from Z = 14..23)
    translate([0, 0, 14.0])
      cylinder(h = 9.0, d = 2.4);
  }
}

module single_plug_cap() {
  difference() {
    union() {
      // Outer cap disc (15.6 mm OD x 2.0 mm)
      cylinder(h = 2.0, d1 = 15.6, d2 = 14.8);
      // Press-fit plug boss (11.9 mm OD for 12.2 mm counterbore)
      translate([0, 0, 2.0])
        cylinder(h = 2.2, d1 = 11.9, d2 = 11.5);
    }
    // Recessed 0.4 mm colour/value sticker pocket on cap face (Z = 0..0.4, 9.6 mm dia)
    translate([0, 0, -0.1])
      cylinder(h = sticker_depth + 0.5, d = 9.6);
    // Side wire exit groove & center wire pass-through hole (2.8 mm ID)
    translate([0, 0, -0.5])
      cylinder(h = 6.0, d = 2.8);
  }
}

module prop_20_plug_heads() {
  // Five Resistor Plug Barrels (Y = -11, X = -48..48)
  for (i = [0 : 4]) {
    translate([-48.0 + i * 24.0, -11.0, 0])
      single_plug_barrel();
  }

  // Five Matching Strain-Relief Caps (Y = 12, X = -48..48)
  for (i = [0 : 4]) {
    translate([-48.0 + i * 24.0, 12.0, 0])
      single_plug_cap();
  }
}

color(col_alarm) prop_20_plug_heads();
