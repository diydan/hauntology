// Hauntology Tabletop Print Kit — Prop #20: Cut Wires Board (5 Resistor-Cavity Plug Heads & Caps)
// Colour: Tarnished Silver (#c9c9d4)
// Size: 116 W x 44 D x 22 H mm (5 plug barrels + 5 snap-in resistor caps)
// Mechanism: Each plug head has a 5.0 x 14.5 mm internal cavity for a 1/4W axial resistor (1k, 2.2k, 4.7k, 10k, 22k)
// Print orientation: Flat on grip flange (Z = 0), zero supports.

include <_common.scad>

module single_plug_barrel() {
  difference() {
    union() {
      // 1. Octagonal gothic coffin-knurled grip flange at Z = 0..10.5 (18.2 mm OD, lengthened for full resistor + solder clearance!)
      cylinder(h = 10.5, d1 = 18.2, d2 = 17.6, $fn = 8);
      for (ang = [0 : 45 : 315]) {
        rotate([0, 0, ang])
          translate([8.8, 0, 0])
            cylinder(h = 10.2, d1 = 2.4, d2 = 1.8);
      }
      // 2. Tapered shoulder (Z = 10.5..16.0, 16.2 -> 10.6 mm OD so wall around resistor cavity is >= 2.7 mm thick!)
      translate([0, 0, 10.5])
        cylinder(h = 5.5, d1 = 16.2, d2 = 10.6);
      // 3. Nose plug stem (6.0 mm OD for 6.25 mm terminal socket shroud, Z = 16.0..25.0; 2.8 mm ID -> 1.6 mm wall!)
      translate([0, 0, 16.0])
        cylinder(h = 9.0, d1 = 6.0, d2 = 5.85);
    }

    // 4. Cap counterbore (Z = 0..2.3, 12.2 mm ID) tapering at 45 deg (Z = 2.3..5.8) into spacious 9.5 mm x Ø5.2 mm 1/4W resistor cavity
    //    (13.0 mm total axial room above cap for resistor + solder joint, and ZERO mid-air counterbore bridge!)
    translate([0, 0, -0.2])
      cylinder(h = 2.55, d = 12.2);
    translate([0, 0, 2.3])
      cylinder(h = 3.55, d1 = 12.2, d2 = 5.2);
    translate([0, 0, 5.8])
      cylinder(h = 9.6, d = 5.2);
    translate([0, 0, 15.3])
      cylinder(h = 1.3, d1 = 5.2, d2 = 2.8);
    // Contact lead / 2 mm pin / folded-lead bore through nose tip (2.8 mm ID from Z = 16.5..26 -> 1.6 mm wall thickness!)
    translate([0, 0, 16.5])
      cylinder(h = 9.5, d = 2.8);
  }
}

module single_plug_cap() {
  // Printed press-fit-boss-DOWN on Z = 0, flaring outward at 45 deg to the 15.6 mm cap flange with the 0.40 mm sticker pocket
  // facing UP on +Z (eliminates both the upside-down Z = 0 bridge and the mid-air Ø2.8 mm wire hole!).
  difference() {
    union() {
      // Press-fit plug boss on bed (12.05 mm OD + 4 crush ribs = 12.35 mm across ribs for 12.2 mm barrel counterbore!)
      cylinder(h = 2.2, d = 12.05);
      for (ang = [45, 135, 225, 315]) {
        rotate([0, 0, ang])
          hull() {
            translate([5.95, 0, 0.2]) cylinder(h = 0.2, d = 0.3);
            translate([6.0,  0, 0.6]) cylinder(h = 1.6, d = 0.4);
          }
      }
      // 45-deg self-supporting outward flare into outer cap disc (Z = 2.2..4.6, 15.6 mm OD)
      translate([0, 0, 2.2])
        cylinder(h = 1.8, d1 = 12.05, d2 = 15.6);
      translate([0, 0, 4.0])
        cylinder(h = 0.6, d1 = 15.6, d2 = 15.2);
    }
    // Upward-facing (+Z) 0.40 mm colour/value sticker pocket on top cap face (Z = 4.2..4.6, 9.6 mm dia)
    translate([0, 0, 4.6 - sticker_depth])
      cylinder(h = sticker_depth + 0.5, d = 9.6);
    // Center wire pass-through hole straight through from Z = 0 (2.8 mm ID)
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

color(col_silver) prop_20_plug_heads();
