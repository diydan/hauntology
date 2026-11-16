// Hauntology Tabletop Print Kit — Prop #20: Cut Wires Board (5 Terminal Sockets, 5 Wire Anchors & SET Bezel)
// Colour: Tarnished Silver (#c9c9d4)
// Size: 138 W x 48 D x 14 H mm (11 separate pieces arranged on one print bed with zero overlap)
// Mechanism: Press-fit into the Cut Wires Board panel; terminals receive the 5 resistor plug heads
// Print orientation: Flat on flange base (Z = 0), zero supports (11 connected components).

include <_common.scad>

module single_terminal_socket() {
  difference() {
    union() {
      // Top bevelled flange (18 mm OD x 3.2 mm)
      cylinder(h = 3.2, d1 = 18.0, d2 = 16.8);
      // Press-fit barrel stem (14.15 mm OD + 4 crush ribs = 14.45 mm across ribs for snug press-fit into 14.3 mm panel well!)
      translate([0, 0, 3.2]) {
        cylinder(h = 10.8, d1 = 14.15, d2 = 13.95);
        for (ang = [45, 135, 225, 315]) {
          rotate([0, 0, ang])
            hull() {
              translate([7.0, 0, 0]) cylinder(h = 8.4, d = 0.45);
              translate([6.8, 0, 10.4]) cylinder(h = 0.2, d = 0.3);
            }
        }
      }
    }
    // Central plug shroud bore (6.25 mm ID) stepping at 45 deg to 4.15 mm standard banana-jack / contact-pin seat at bottom
    translate([0, 0, -0.5])
      cylinder(h = 2.2, d1 = 8.4, d2 = 6.25);
    translate([0, 0, 1.5])
      cylinder(h = 8.6, d = 6.25);
    translate([0, 0, 10.0])
      cylinder(h = 1.2, d1 = 6.25, d2 = 4.15);
    translate([0, 0, 11.1])
      cylinder(h = 4.0, d = 4.15);
    // Side contact wire / solder-tab slot
    translate([0, 0, 11.5])
      cube([16.0, 2.2, 6.0], center = true);
  }
}

module single_wire_anchor() {
  difference() {
    union() {
      // Square anchor flange (13.6 x 13.6 x 3.2 mm)
      chamfer_box(13.6, 13.6, 3.2, r = 2.0, ch_bot = 0.4, ch_top = 0.4);
      // Square press-fit stem (10.2 x 10.2 x 9.0 mm + 4 side crush ribs for snug fit in 10.4 mm panel well)
      translate([0, 0, 3.2]) {
        chamfer_box(10.2, 10.2, 9.0, r = 1.2, ch_bot = 0, ch_top = 0.4);
        for (ang = [0, 90, 180, 270]) {
          rotate([0, 0, ang])
            hull() {
              translate([5.05, 0, 0]) cylinder(h = 7.0, d = 0.45);
              translate([4.9, 0, 8.6]) cylinder(h = 0.2, d = 0.3);
            }
        }
      }
    }
    // Central jumper-wire strain-relief bore (3.4 mm ID)
    translate([0, 0, -0.5])
      cylinder(h = 14.0, d = 3.4);
  }
}

module prop_20_terminal_blocks() {
  // 1. Five Right-Side Terminal Socket Collars (Y = -14, X = -54..42)
  for (i = [0 : 4]) {
    translate([-54.0 + i * 24.0, -14.0, 0])
      single_terminal_socket();
  }

  // 2. Five Left-Side Wire Anchor Blocks (Y = 12, X = -54..26)
  for (i = [0 : 4]) {
    translate([-54.0 + i * 20.0, 12.0, 0])
      single_wire_anchor();
  }

  // 3. SET Pushbutton Trim Bezel Ring (at X = 54, Y = 12; 24 mm OD -> X = 42..66, 9.2 mm clear of 5th wire anchor at X = 26!)
  translate([54.0, 12.0, 0])
  difference() {
    cylinder(h = 3.6, d1 = 24.0, d2 = 21.6);
    translate([0, 0, -0.5])
      cylinder(h = 5.0, d = 16.4);
  }
}

color(col_silver) prop_20_terminal_blocks();
