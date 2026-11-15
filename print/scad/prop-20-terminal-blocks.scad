// Hauntology Tabletop Print Kit — Prop #20: Cut Wires Board (5 Terminal Sockets, 5 Wire Anchors & SET Bezel)
// Colour: Ink (#0b0d10, matte black)
// Size: 124 W x 56 D x 14 H mm (11 pieces arranged on one print bed)
// Mechanism: Press-fit into the Cut Wires Board panel; terminals receive the 5 resistor plug heads
// Print orientation: Flat on flange base (Z = 0), zero supports.

include <_common.scad>

module single_terminal_socket() {
  difference() {
    union() {
      // Top bevelled flange (18 mm OD x 3.2 mm)
      cylinder(h = 3.2, d1 = 18.0, d2 = 16.8);
      // Press-fit barrel stem (14.0 mm OD for 14.3 mm panel hole)
      translate([0, 0, 3.2])
        cylinder(h = 10.8, d1 = 14.0, d2 = 13.6);
    }
    // Central plug receptacle bore (6.4 mm ID with chamfered entry mouth)
    translate([0, 0, -0.5])
      cylinder(h = 2.2, d1 = 8.4, d2 = 6.4);
    translate([0, 0, 1.5])
      cylinder(h = 14.0, d = 6.4);
    // Side contact wire slot
    translate([0, 0, 11.0])
      cube([16.0, 2.2, 7.0], center = true);
  }
}

module single_wire_anchor() {
  difference() {
    union() {
      // Square anchor flange (13.6 x 13.6 x 3.2 mm)
      chamfer_box(13.6, 13.6, 3.2, r = 2.0, ch_bot = 0.4, ch_top = 0.4);
      // Square press-fit stem (10.1 x 10.1 x 9.0 mm for 10.4 mm panel well)
      translate([0, 0, 3.2])
        chamfer_box(10.1, 10.1, 9.0, r = 1.2, ch_bot = 0, ch_top = 0.4);
    }
    // Central jumper-wire strain-relief bore (3.4 mm ID)
    translate([0, 0, -0.5])
      cylinder(h = 14.0, d = 3.4);
  }
}

module prop_20_terminal_blocks() {
  // 1. Five Right-Side Terminal Socket Collars (Y = -14, X = -48..48)
  for (i = [0 : 4]) {
    translate([-48.0 + i * 24.0, -14.0, 0])
      single_terminal_socket();
  }

  // 2. Five Left-Side Wire Anchor Blocks (Y = 12, X = -48..32)
  for (i = [0 : 4]) {
    translate([-48.0 + i * 20.0, 12.0, 0])
      single_wire_anchor();
  }

  // 3. SET Pushbutton Trim Bezel Ring (at X = 44, Y = 12; 24 mm OD, 16.4 mm ID)
  translate([44.0, 12.0, 0])
  difference() {
    cylinder(h = 3.6, d1 = 24.0, d2 = 21.6);
    translate([0, 0, -0.5])
      cylinder(h = 5.0, d = 16.4);
  }
}

color(col_ink) prop_20_terminal_blocks();
